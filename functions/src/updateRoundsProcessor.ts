import {logger} from 'firebase-functions';
import {DocumentReference, getFirestore, Timestamp, UpdateData} from 'firebase-admin/firestore';
import {RankingRound, RankingRoundUser} from './types/rankingRound';
import {User} from "./types/user";
import {orderRankingEntries, isVisibleInRound} from './actions/rankingOrder';

type RankingRoundUserWithUid = RankingRoundUser & { uid: string };

const WINNERS_PER_ROUND = 3;

function isDue(round: RankingRound): boolean {
    return !round.finished && (round.to as Timestamp).toDate()
        .getTime() <= Date.now();
}

export default async function updateRoundsProcessor(): Promise<string | void> {
    const db = getFirestore();

    const roundsSnapshot = await db.collection('ranking')
        .orderBy('from', 'asc')
        .get();

    if (roundsSnapshot.docs.length == 0) {
        logger.error('processUpdateRounds', 'No rounds found. Seed the database.');
        return 'No rounds found. Seed the database.';
    }

    const dueRoundsExist = roundsSnapshot.docs
        .some((roundSnapshot) => isDue(roundSnapshot.data() as RankingRound));

    if (!dueRoundsExist) {
        logger.log('processUpdateRounds', 'Nothing to do, no rounds to finish.');
        return 'Nothing to do, no rounds to finish.';
    }

    // Only unfinished rounds are ever written, so only they go into the transaction's read-set. Already
    // finished rounds are history - never re-read, never rewritten.
    const unfinishedRefs = roundsSnapshot.docs
        .filter((roundSnapshot) => !(roundSnapshot.data() as RankingRound).finished)
        .map((roundSnapshot) => roundSnapshot.ref);

    const finishedRoundsCount = await db.runTransaction(async (transaction) => {
        // Every read first - Firestore forbids a read after a write. Re-reading the rounds HERE rather than
        // reusing the query above is the whole point: without an in-transaction read the transaction holds
        // no read-set on them, so it never serializes against a concurrent award and can stamp winners from
        // a snapshot that a boundary collect has already moved past (task #55, CLAUDE.md 12.2).
        const roundSnapshots = await transaction.getAll(...unfinishedRefs);

        const rounds = roundSnapshots
            .filter((roundSnapshot) => roundSnapshot.exists)
            .map((roundSnapshot) => ({
                ref: roundSnapshot.ref,
                data: roundSnapshot.data() as RankingRound
            }));

        // Re-verified against the fresh read: the cron and the admin button share this processor, so another
        // pass may have closed the same round between the query above and this transaction.
        const closingIndexes = rounds
            .map((round, index) => (isDue(round.data) ? index : -1))
            .filter((index) => index !== -1);

        if (closingIndexes.length === 0) {
            return 0;
        }

        // A player crowned by an earlier round in this pass is no longer eligible for a later one. Each round
        // is judged against its own snapshot, where the earlier round's stamp is not yet visible, so without
        // this two rounds closing together would crown the same player twice.
        const crownedThisPass = new Set<string>();

        closingIndexes.forEach((closingIndex) => {
            const closingRound = rounds[closingIndex];
            const roundUid = closingRound.data.uid;

            const winners: RankingRoundUserWithUid[] = Object.entries(closingRound.data.users)
                .map(([uid, user]): RankingRoundUserWithUid => ({uid, ...user}))
                .filter((user) => isVisibleInRound(user, roundUid) && !crownedThisPass.has(user.uid))
                .sort(orderRankingEntries)
                .slice(0, WINNERS_PER_ROUND);

            const closingRoundUpdate: Record<string, unknown> = {finished: true};

            winners.forEach((winner) => {
                crownedThisPass.add(winner.uid);

                // The winnerInRound path only. Writing the whole record back would replay score and counters
                // from this transaction's read over anything that landed since - and that read is the
                // pre-close snapshot, so a boundary award to a winner would be silently rolled back.
                closingRoundUpdate[`users.${winner.uid}.winnerInRound`] = roundUid;

                const userRef = db.collection('users').doc(winner.uid) as DocumentReference<User, User>;

                transaction.update<User, Partial<User>>(userRef,
                    {winnerInRound: roundUid} as UpdateData<User>
                );
            });

            transaction.update(closingRound.ref, closingRoundUpdate);

            // Forward only. A later round must hide this winner or its visible ranking would disagree with
            // its own winners list; an earlier, already-closed round is history and must never be rewritten
            // by a round that ended after it.
            rounds.slice(closingIndex + 1).forEach((laterRound) => {
                const laterRoundUpdate: Record<string, unknown> = {};

                winners.forEach((winner) => {
                    // A field-path write would otherwise conjure a record holding nothing but winnerInRound,
                    // which RankingRound.fromFirestore cannot hydrate.
                    if (!laterRound.data.users[winner.uid]) {
                        return;
                    }

                    laterRoundUpdate[`users.${winner.uid}.winnerInRound`] = roundUid;
                });

                if (Object.keys(laterRoundUpdate).length === 0) {
                    return;
                }

                transaction.update(laterRound.ref, laterRoundUpdate);
            });
        });

        return closingIndexes.length;
    });

    if (finishedRoundsCount === 0) {
        logger.log('processUpdateRounds', 'Nothing to do, no rounds to finish.');
        return 'Nothing to do, no rounds to finish.';
    }

    logger.log('processUpdateRounds', 'Rounds updated successfully.');
    return 'Rounds updated successfully.';
}
