import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { PinType } from './types/pin';
import {
    CollectedCardQuestion, CollectedQuestions, Question, QuestionAnswers, QuestionAnswerValue, QuestionsDoc
} from './types/question';
import assertAdmin from './actions/assertAdmin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

type UserDetailsPinRow = {
    uid: string,
    name: string,
    type: PinType,
    value: number,
    awardedPoints: number,
    collectedAt: Timestamp
};

// `question`/`answers` are null when the uid no longer exists in questions/questions - a seed edited
// after the draw. `given` is null for a question drawn but never answered, which can sit that way
// indefinitely (there is no time limit), so `isCorrect: false` alone never means "answered wrong".
type UserDetailsQuestionRow = {
    uid: string,
    question: string | null,
    answers: QuestionAnswers | null,
    given: QuestionAnswerValue,
    correct: QuestionAnswerValue,
    isCorrect: boolean,
    value: number,
    collectedAt: Timestamp | null
};

// Admin-only read path for the per-player drill-down (#79). Exists because neither collection below is
// reachable from any client: collectedPins is owner-only in firestore.rules, and collectedQuestions /
// questions have no rule at all.
//
// ⚠️ This is the ONE place a question's `correct` key crosses to a client, and only assertAdmin stands
// between it and the whole quiz. It is minimised to questions the player has already answered (burned
// for them anyway) - a question still in play returns `correct: null`.
export const getUserDetailsHandle = onCall(async (req): Promise<{
    pins: UserDetailsPinRow[],
    questions: UserDetailsQuestionRow[]
}> => {
    const auth = req.auth;
    if (!auth || !auth.uid) {
        logger.error('getUserDetailsHandle', 'permission denied');
        throw new HttpsError('permission-denied', 'permission denied');
    }

    const db = getFirestore();
    await assertAdmin(db, auth.uid);

    const uid: string | any = req.data?.uid;

    if (typeof uid !== 'string' || uid.length === 0) {
        logger.error('getUserDetailsHandle', 'uid is missing');
        throw new HttpsError('invalid-argument', 'uid is missing');
    }

    const userRef = db.collection('users').doc(uid);

    const collectedPinsSnapshot = await userRef.collection('collectedPins').get();

    const pins: UserDetailsPinRow[] = collectedPinsSnapshot.docs.map((doc) => {
        const data = doc.data();

        return {
            uid: data.uid,
            name: data.name,
            type: data.type,
            value: data.value,
            awardedPoints: data.awardedPoints,
            collectedAt: data.collectedAt as Timestamp
        };
    });

    pins.sort((a, b) => (b.collectedAt?.toMillis() ?? 0) - (a.collectedAt?.toMillis() ?? 0));

    const collectedQuestionsDoc = await userRef.collection('collectedQuestions').doc('collectedQuestions').get();
    const collectedQuestions = (collectedQuestionsDoc.data() ?? {}) as CollectedQuestions;

    const questionsDoc = await db.collection('questions').doc('questions').get();
    const questionsData = (questionsDoc.data() ?? {}) as QuestionsDoc;

    const questions: UserDetailsQuestionRow[] = Object.entries(collectedQuestions)
        .map(([questionUid, entry]: [string, CollectedCardQuestion]): UserDetailsQuestionRow => {
            const question = questionsData[questionUid] as Question | undefined;
            const answered = entry.answer !== null;

            return {
                uid: questionUid,
                question: question?.question ?? null,
                answers: question?.answers ?? null,
                given: entry.answer,
                correct: answered ? (question?.correct ?? null) : null,
                isCorrect: entry.correct,
                value: entry.value,
                collectedAt: (entry.collectedAt as Timestamp) ?? null
            };
        });

    questions.sort((a, b) => (b.collectedAt?.toMillis() ?? 0) - (a.collectedAt?.toMillis() ?? 0));

    return { pins, questions };
});
