import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { RankingRound, RankingRoundUser } from './types/rankingRound';
import { firestore } from 'firebase-admin';
import Timestamp = firestore.Timestamp;

type RankingRoundUserWithUid = RankingRoundUser & { uid: string };

export default async function updateRoundsProcessor(): Promise<string | void> {
    const db = getFirestore();

    const roundsSnapshot = await db.collection('ranking')
        .orderBy('from', 'asc')
        .get();

    if (roundsSnapshot.docs.length == 0) {
        logger.error('processUpdateRounds', 'No rounds found. Seed the database.');
        return 'No rounds found. Seed the database.';
    }

    const rankingRoundSnapshots = roundsSnapshot.docs
        .filter((roundSnapshot) => {
            const rankingRound: RankingRound = roundSnapshot.data() as RankingRound;
            const roundToTime: number = (rankingRound.to as Timestamp).toDate().getTime();
            const nowTime: number = (new Date()).getTime();

            return !rankingRound.finished && roundToTime <= nowTime;
        });

    if (rankingRoundSnapshots.length === 0) {
        logger.log('processUpdateRounds', 'Nothing to do, no rounds to finish.');
        return 'Nothing to do, no rounds to finish.';
    }

    await db.runTransaction(async (transaction) => {
        rankingRoundSnapshots.forEach((roundSnapshot) => {
            transaction.update(roundSnapshot.ref, { finished: true });

            const rankingRound: RankingRound = roundSnapshot.data() as RankingRound;
            const users: RankingRoundUserWithUid[] = Object.entries(rankingRound.users)
                .map(([uid, user]): RankingRoundUserWithUid => ({ uid, ...user }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map((user) => ({
                    ...user,
                    winnerInRound: rankingRound.uid
                }));

            users.forEach((user) => {
                transaction.update(roundSnapshot.ref, {
                    [`users.${user.uid}`]: user
                });

                const userRef = db.collection('users')
                    .doc(user.uid);

                transaction.update(userRef, { winnerInRound: user.winnerInRound });
            });
        });
    });

    logger.log('processUpdateRounds', 'Rounds updated successfully.');
    return 'Rounds updated successfully.';
}
