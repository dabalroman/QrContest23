import { FieldValue, getFirestore, UpdateData } from 'firebase-admin/firestore';
import { PhotoSubmission, PhotoSubmissionStatus } from './types/photoSubmission';
import { Pin, PinCollectedBy } from './types/pin';
import { User } from './types/user';
import { AchievementGrant } from './types/achievement';
import getCurrentUser, { readUserInTransaction } from './actions/getCurrentUser';
import awardPoints from './actions/awardPoints';
import scopeKeys from './actions/pinScopeKeys';
import assertAdmin from './actions/assertAdmin';
import { photoBucket } from './actions/photoStorage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

// Admin review of a pending photo submission (#19). Idempotent: the pending-status check is a
// TRANSACTIONAL read, so a double-click or a second admin can never double-award or double-reopen.
// Uses the SNAPSHOTTED sub.value / sub.scopeKeys - it never re-reads the pin, so a mid-event pin
// edit/deletion cannot change what gets awarded.
//
//  - approve → award sub.value through the shared awardPoints (real score + 4-place fan-out +
//    achievements + location scope counters); clear pendingScore.
//  - reject  → REOPEN the pin: delete the collectedPins snapshot + the pin's collectedBy entry so the
//    marker un-greys and the dup guard clears, letting the player upload a new photo. Clear pendingScore.
export const reviewPhotoHandle = onCall(async (req): Promise<{ status: string, achievements: AchievementGrant[] }> => {
    const data = req.data;
    const auth = req.auth;
    if (!auth || !auth.uid) {
        logger.error('reviewPhotoHandle', 'permission denied');
        throw new HttpsError('permission-denied', 'permission denied');
    }

    const db = getFirestore();
    await assertAdmin(db, auth.uid);

    const submissionUid: string | null = typeof data.submissionUid === 'string' ? data.submissionUid : null;
    const decision: string | null = typeof data.decision === 'string' ? data.decision : null;
    if (!submissionUid || (decision !== 'approve' && decision !== 'reject')) {
        logger.error('reviewPhotoHandle', 'invalid arguments', { submissionUid, decision });
        throw new HttpsError('invalid-argument', 'invalid arguments');
    }

    const submissionRef = db.collection('photoSubmissions').doc(submissionUid);
    const submissionDoc = await submissionRef.get();
    if (!submissionDoc.exists) {
        logger.error('reviewPhotoHandle', 'submission not found', submissionUid);
        throw new HttpsError('not-found', 'submission not found');
    }

    const sub = submissionDoc.data() as PhotoSubmission;
    const [userRef] = await getCurrentUser(db, sub.userUid);
    const collectedPinRef = userRef.collection('collectedPins').doc(sub.pinUid);
    const pinRef = db.collection('pins').doc(sub.pinUid);

    try {
        const grants = await db.runTransaction<AchievementGrant[]>(async (transaction) => {
            // Idempotency guard - a TRANSACTIONAL read, so a concurrent review forces a retry that sees
            // the now-non-pending status and throws below.
            const freshSub = (await transaction.get(submissionRef)).data() as PhotoSubmission;
            if (freshSub.status !== PhotoSubmissionStatus.PENDING) {
                throw new HttpsError('failed-precondition', 'submission is not pending');
            }

            // Both reads (submission above, user here) precede every write below - the read-set on the
            // user doc serializes concurrent same-user awards (see readUserInTransaction).
            const user = await readUserInTransaction(transaction, userRef);

            // Resolve the scope keys to award BEFORE any write (Firestore forbids a read after a write).
            // Prefer the snapshotted sub.scopeKeys, but fall back to recomputing from the live pin for
            // submissions written before submitPhotoHandle persisted them (or by an older deploy) - an
            // empty list would otherwise silently skip the location-scope increment.
            let awardScopeKeys: string[] = sub.scopeKeys ?? [];
            if (decision === 'approve' && awardScopeKeys.length === 0) {
                const pinSnapshot = await transaction.get(pinRef);
                awardScopeKeys = pinSnapshot.exists ? scopeKeys(pinSnapshot.data() as Pin) : [];
            }

            transaction.update<User, User>(userRef, {
                pendingScore: FieldValue.increment(-sub.value)
            } as UpdateData<User>);

            if (decision === 'approve') {
                transaction.update(submissionRef, {
                    status: PhotoSubmissionStatus.APPROVED,
                    reviewedAt: FieldValue.serverTimestamp(),
                    reviewedBy: auth.uid
                });
                transaction.update(collectedPinRef, { awardedPoints: sub.value });

                // Route through the shared action - real score + 4-place fan-out + achievements +
                // location scope counters. Never hand-roll the fan-out.
                return await awardPoints(
                    db, transaction, userRef, user, sub.value, { amountOfCollectedPins: 1 }, awardScopeKeys
                );
            }

            // reject - REOPEN the pin for retry.
            transaction.update(submissionRef, {
                status: PhotoSubmissionStatus.REJECTED,
                reviewedAt: FieldValue.serverTimestamp(),
                reviewedBy: auth.uid
            });
            transaction.delete(collectedPinRef);
            transaction.update<PinCollectedBy, PinCollectedBy>(pinRef, {
                [`collectedBy.${sub.userUid}`]: FieldValue.delete()
            } as UpdateData<PinCollectedBy>);

            return [];
        });

        // Best-effort Storage hygiene on reject - outside the transaction (Storage is not transactional).
        // A failure here is logged, never fatal: the game state is already correct.
        if (decision === 'reject') {
            try {
                await photoBucket().file(sub.storagePath).delete({ ignoreNotFound: true });
            } catch (error) {
                logger.warn('reviewPhotoHandle', 'could not delete rejected photo object: ' + error);
            }
        }

        logger.log('reviewPhotoHandle', `submission ${submissionUid} ${decision}d`);
        const status = decision === 'approve' ? PhotoSubmissionStatus.APPROVED : PhotoSubmissionStatus.REJECTED;
        return { status, achievements: grants };
    } catch (error) {
        if (error instanceof HttpsError) {
            throw error;
        }
        logger.error('reviewPhotoHandle', 'error while reviewing submission: ' + error);
        throw new HttpsError('aborted', 'error while reviewing submission');
    }
});
