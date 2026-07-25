import { DocumentReference, getFirestore, UpdateData } from 'firebase-admin/firestore';
import { CollectedPin, Pin, PinType } from './types/pin';
import { User } from './types/user';
import { AchievementGrant } from './types/achievement';
import { readUserInTransaction } from './actions/getCurrentUser';
import awardPoints from './actions/awardPoints';
import scopeKeys from './actions/pinScopeKeys';
import assertAdmin from './actions/assertAdmin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

// Admin-only repair for players whose `collectedPinsByScope` numerator drifted below the pins they
// actually hold - e.g. a photo approval that failed to increment the scope counter left a location
// badge stuck at N-1/N. A pure achievement re-run cannot fix that: the counter itself is wrong, so the
// threshold is never reached. So we FIRST rebuild the scope map from source-of-truth (the player's
// collectedPins joined against `pins`, through the same scopeKeys() the award path uses and the same
// active-only rule recomputeAchievementTargets uses for the denominator), then re-run the grant path.
//
// { uid } repairs one player; {} repairs everyone. Bonuses are folded in through the shared awardPoints
// (0 base points, so the base score is never recomputed - only missing badge bonuses are added), which
// fans out to ranking/guild and stamps each grant exactly once via the users/{uid}.achievements guard.
// Idempotent: a second run recomputes the same map and finds every badge already granted.
export const recheckAchievementsHandle = onCall(
    { timeoutSeconds: 540 },
    async (req): Promise<{
        usersProcessed: number,
        usersFailed: number,
        totalGranted: number,
        grants: Record<string, AchievementGrant[]>
    }> => {
        const auth = req.auth;
        if (!auth || !auth.uid) {
            logger.error('recheckAchievementsHandle', 'permission denied');
            throw new HttpsError('permission-denied', 'permission denied');
        }

        const db = getFirestore();
        await assertAdmin(db, auth.uid);

        const targetUid: string | null = typeof req.data.uid === 'string' ? req.data.uid : null;

        // Pins are stable for the run; read them once and share the map across every user transaction.
        // Same set recomputeAchievementTargets tallies, so numerator and denominator stay in lockstep.
        const pinsSnapshot = await db.collection('pins').get();
        const pinsByUid = new Map<string, Pin>(
            pinsSnapshot.docs.map((doc) => [doc.id, doc.data() as Pin])
        );

        const uids = targetUid
            ? [targetUid]
            : (await db.collection('users').get()).docs.map((doc) => doc.id);

        const grants: Record<string, AchievementGrant[]> = {};
        let usersProcessed = 0;
        let usersFailed = 0;
        let totalGranted = 0;

        // Sequential on purpose: updateRanking writes the same ranking/{round} docs for every user, so
        // parallel transactions would contend and thrash on retries. A one-shot admin repair can wait.
        for (const uid of uids) {
            const userRef = db.collection('users').doc(uid) as DocumentReference<User, User>;

            try {
                const userGrants = await db.runTransaction<AchievementGrant[]>(async (transaction) => {
                    // Reads first (Firestore forbids a read after a write). The user read serializes
                    // concurrent same-user awards; the collectedPins read is the reconciliation source.
                    const user = await readUserInTransaction(transaction, userRef);
                    const collectedSnapshot = await transaction.get(userRef.collection('collectedPins'));

                    const freshScope: Record<string, number> = {};
                    collectedSnapshot.docs.forEach((doc) => {
                        const collected = doc.data() as CollectedPin;
                        const pin = pinsByUid.get(collected.uid);

                        // Mirror recomputeAchievementTargets: only active pins count. A pending photo
                        // (awardedPoints still 0) has not been approved, so it counts towards nothing yet.
                        if (!pin || !pin.isActive) {
                            return;
                        }
                        if (pin.type === PinType.PHOTO && collected.awardedPoints === 0) {
                            return;
                        }

                        scopeKeys(pin).forEach((key) => {
                            freshScope[key] = (freshScope[key] ?? 0) + 1;
                        });
                    });

                    // Overwrite the whole field (update, not set-merge) so stale keys are dropped, and
                    // put it on the in-memory user so awardPoints' achievement eval reads the fresh map.
                    user.collectedPinsByScope = freshScope;
                    transaction.update<User, User>(
                        userRef,
                        { collectedPinsByScope: freshScope } as UpdateData<User>
                    );

                    // 0 base points, no flat counters: grants only the badges the reconciled counters
                    // now satisfy, folding each bonus into a single score write plus the fan-out.
                    return awardPoints(db, transaction, userRef, user, 0, {}, []);
                });

                usersProcessed += 1;
                if (userGrants.length > 0) {
                    grants[uid] = userGrants;
                    totalGranted += userGrants.length;
                }
            } catch (error) {
                usersFailed += 1;
                logger.error('RECHECK_USER_FAILED', uid, error);
            }
        }

        logger.log('recheckAchievementsHandle',
            `processed ${usersProcessed}, failed ${usersFailed}, granted ${totalGranted}`);

        return { usersProcessed, usersFailed, totalGranted, grants };
    }
);
