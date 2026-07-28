import {User, UserCounterKey} from '../types/user';
import {logger} from 'firebase-functions';
import {DocumentReference, FieldPath, FieldValue, Firestore, Transaction, UpdateData} from 'firebase-admin/firestore';
import updateRanking from './updateRanking';
import updateGuild from './updateGuild';
import evaluateAchievements from '../achievements/evaluateAchievements';
import loadDefinitions from '../achievements/loadDefinitions';
import applyGrant from '../achievements/applyGrant';
import {AchievementGrant} from '../types/achievement';

/**
 * The single transactional writer of a score change. Increments the user doc's score (and any
 * counters), mutates the in-memory `user` in place so the fan-out helpers read post-award values,
 * evaluates + auto-grants achievements (whose bonus feeds the same fan-out), then fans the change out
 * to every open ranking round and the user's guild.
 *
 * Every point source - card collect, question answer, pin collect - must go through here so the
 * leaderboard cannot silently desync. Reads the `ranking` collection exactly once per award. Returns
 * the achievements granted this award, so the caller can surface them in its callable response (#30).
 *
 * `scopeCounters` increments `user.collectedPinsByScope[key]` for each key (task #37's location
 * achievements) - it is deliberately NOT fanned out to RankingRoundUser/GuildMember, unlike the flat
 * `counters` map, since no leaderboard surfaces per-scope pin counts.
 */
export default async function awardPoints(
    db: Firestore,
    transaction: Transaction,
    userRef: DocumentReference<User>,
    user: User,
    points: number,
    counters: Partial<Record<UserCounterKey, number>> = {},
    scopeCounters: string[] = []
): Promise<AchievementGrant[]> {
    const counterKeys = Object.keys(counters) as UserCounterKey[];

    // Apply the base award to the in-memory user FIRST, so achievement predicates evaluate against
    // post-award values (a collect that crosses a point cup unlocks it in the same transaction, and a
    // scope-completing pin collect can unlock a `pinsInScope` achievement the same way).
    user.score += points;
    counterKeys.forEach((key) => {
        user[key] += counters[key] as number;
    });
    scopeCounters.forEach((key) => {
        user.collectedPinsByScope[key] = (user.collectedPinsByScope[key] ?? 0) + 1;
    });

    // Evaluate achievements. Definitions are data (cached, last-known-good on failure) but the
    // evaluation itself is PURE - no reads/writes, does not mutate `user`. A bug here must never kill
    // scoring (it runs on the hot path event-wide), so swallow and log with a stable, alertable
    // prefix; the badge self-heals on the next award.
    let grants: AchievementGrant[] = [];
    try {
        const definitions = await loadDefinitions(db);
        grants = evaluateAchievements(user, definitions);
    } catch (error) {
        logger.error('ACHIEVEMENTS_EVAL_FAILED', error);
    }

    // Fold the achievement bonus into the in-memory user so the fan-out copies a bonus-inclusive score.
    const bonus = grants.reduce((sum, grant) => sum + grant.bonus, 0);
    user.score += bonus;

    const counterIncrements: UpdateData<User> = {};
    counterKeys.forEach((key) => {
        counterIncrements[key] = FieldValue.increment(counters[key] as number);
    });

    // The leaderboard breaks a tie on the OLDER score, so its basis must move only when the score really
    // changed. A wrong answer and recheckAchievementsHandle both come through here with a zero delta and
    // must leave it alone - `updatedAt` below cannot serve, it marks every write. Set on the in-memory
    // user too, so updateRanking's copy carries the same commit timestamp.
    const scoreDelta = points + bonus;

    if (scoreDelta !== 0) {
        user.scoreUpdatedAt = FieldValue.serverTimestamp();
    }

    // Single user-doc write: base points + achievement bonus + counters.
    transaction.update<User, User>(userRef, ({
        score: FieldValue.increment(scoreDelta),
        ...counterIncrements,
        ...(scoreDelta !== 0 ? {scoreUpdatedAt: FieldValue.serverTimestamp()} : {}),
        updatedAt: FieldValue.serverTimestamp()
    } as UpdateData<User>));

    // Scope counters go in a SEPARATE update call using FieldPath objects, not dotted strings - a
    // scope key like `map:mok-parter` contains a `:`, which is unambiguous as a FieldPath segment but
    // would raise an escaping question as part of a dotted path string.
    if (scopeCounters.length > 0) {
        const scopeFieldsAndValues = scopeCounters.flatMap((key) => [
            new FieldPath('collectedPinsByScope', key),
            FieldValue.increment(1)
        ]);

        transaction.update(
            userRef,
            scopeFieldsAndValues[0] as FieldPath,
            scopeFieldsAndValues[1],
            ...scopeFieldsAndValues.slice(2)
        );
    }

    // Applier - the only achievements writer, OUTSIDE the eval try (purity contract).
    grants.forEach((grant) => applyGrant(transaction, userRef, grant));

    // Fan out - read the ranking collection once and hand it to both helpers
    const rounds = await db.collection('ranking')
        .orderBy('from', 'asc')
        .get();

    if (rounds.docs.length == 0) {
        logger.error('No rounds found. Seed the database.');
    }

    updateRanking(rounds, transaction, user);
    await updateGuild(db, rounds, transaction, user);

    return grants;
}
