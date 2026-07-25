import { HttpsCallable, httpsCallable } from '@firebase/functions';
import { functions } from '@/utils/firebase';
import {
    RawAchievementGrant, RawCard, RawCollectedPin, RawPhotoSubmission, RawPin, RawPinAuthoredFields,
    RawQuestion
} from '@/models/Raw';
import { QuestionAnswerValue } from '@/functions/src/types/question';

export const collectCardFunction: HttpsCallable<
    { code: string },
    { card: RawCard, question: RawQuestion | null, achievements: RawAchievementGrant[] }
> = httpsCallable(functions, 'collectCardHandle');

export const collectPinFunction: HttpsCallable<
    { code?: string, pinUid?: string, answer?: string, rating?: number, talkName?: string },
    { pin: RawCollectedPin, question: RawQuestion | null, achievements: RawAchievementGrant[] }
> = httpsCallable(functions, 'collectPinHandle');

// Read-only: the map's pin feed. Returns PublicPins (code + collectedBy stripped server-side).
export const getPinsFunction: HttpsCallable<
    {},
    { pins: RawPin[] }
> = httpsCallable(functions, 'getPinsHandle');

// Admin-only: create/update a pin from the map-native editor (#14). Always the complete authored
// field set, never a partial patch. Returns the same PublicPin shape getPins does.
export const upsertPinFunction: HttpsCallable<
    { pinUid: string | null, fields: RawPinAuthoredFields },
    { pin: RawPin }
> = httpsCallable(functions, 'upsertPinHandle');

// Admin-only: delete a pin from the map-native editor (#14). Not transactional - no invariant to protect.
export const deletePinFunction: HttpsCallable<
    { pinUid: string },
    { status: string }
> = httpsCallable(functions, 'deletePinHandle');

// Photo-proof pins (#19). The client uploads the downscaled blob to Storage FIRST (Firebase Storage
// SDK, narrow owner-only rule), then calls this to mark the pin pending - no points yet.
export const submitPhotoFunction: HttpsCallable<
    { pinUid: string },
    { submissionUid: string, status: string }
> = httpsCallable(functions, 'submitPhotoHandle');

// Admin-only: approve (awards points) or reject (reopens the pin for retry) a pending submission.
export const reviewPhotoFunction: HttpsCallable<
    { submissionUid: string, decision: 'approve' | 'reject' },
    { status: string, achievements: RawAchievementGrant[] }
> = httpsCallable(functions, 'reviewPhotoHandle');

// Admin-only: the pending photo-review queue. Photos come as server-built download-token URLs.
export const getPhotoSubmissionsFunction: HttpsCallable<
    {},
    { submissions: RawPhotoSubmission[] }
> = httpsCallable(functions, 'getPhotoSubmissionsHandle');

// Admin-only repair: rebuild collectedPinsByScope from source-of-truth and grant any missing badges.
// { uid } fixes one player; {} fixes everyone. See recheckAchievementsHandle.
export const recheckAchievementsFunction: HttpsCallable<
    { uid?: string },
    {
        usersProcessed: number,
        usersFailed: number,
        totalGranted: number,
        grants: Record<string, RawAchievementGrant[]>
    }
> = httpsCallable(functions, 'recheckAchievementsHandle');

export const answerQuestionFunction: HttpsCallable<
    { uid: string, answer: string },
    { correct: boolean, correctAnswer: QuestionAnswerValue, achievements: RawAchievementGrant[] }
> = httpsCallable(functions, 'answerQuestionHandle');

export const setupAccountFunction: HttpsCallable<
    { username: string, isReturningPlayer: boolean },
    {}
> = httpsCallable(functions, 'setupAccountHandle');

export const joinGuildFunction: HttpsCallable<
    { guild: string },
    {}
> = httpsCallable(functions, 'joinGuildHandle');

export const seedDatabaseFunction: HttpsCallable<
    { password: string },
    {}
> = httpsCallable(functions, 'seedDatabaseHandle');

export const updateRoundsFunction: HttpsCallable<
    {},
    { result: string }
> = httpsCallable(functions, 'updateRoundsHandle');
