import { https, logger } from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { User, UserRole } from './types/user';
import updateRanking from './actions/updateRanking';
import forbiddenPhrases from './data/forbiddenPhrases';

function checkForForbiddenPhrases (username: string): boolean {
    const text = username.toLowerCase();
    return forbiddenPhrases.some((phrase) => text.includes(phrase));
}

export default async function setupAccountHandle (
    data: any,
    context: https.CallableContext
): Promise<{ user: User }> {
    if (!context.auth || !context.auth.uid) {
        logger.error('setupAccountHandle', 'permission denied');
        throw new https.HttpsError('permission-denied', 'permission denied');
    }

    // Does username look right?
    const uid: string = context.auth.uid;
    let username: string | null = data.username.trim() ?? null;

    if (
        typeof username !== 'string'
        || username.length < 3 || username.length > 20
        || username.match(/^[A-z0-9ąćęłóśźż\-\s&$#@.<>(){}:;+]+$/i) === null
    ) {
        logger.error('setupAccountHandle', 'username does not meet requirements');
        throw new https.HttpsError('invalid-argument', 'username does not meet requirements');
    }

    if (checkForForbiddenPhrases(username)) {
        logger.error('setupAccountHandle', 'username does not meet requirements - bad words');
        throw new https.HttpsError('invalid-argument', 'username does not meet requirements');
    }

    // Does user exist?
    const db = getFirestore();
    const userRef = db.collection('users')
        .doc(uid);
    const userExist = (await userRef.get()).exists;

    if (userExist) {
        logger.error('setupAccountHandle', 'user uid exist already');
        throw new https.HttpsError('invalid-argument', 'user uid exist already');
    }

    // Is username free to take?
    const usernameRef = db.collection('users-usernames')
        .doc(username);
    const usernameTaken = (await usernameRef.get()).exists;

    if (usernameTaken) {
        logger.error('setupAccountHandle', 'nickname already taken');
        throw new https.HttpsError('invalid-argument', 'nickname already taken');
    }

    const user: User = {
        uid: uid,
        username: username,
        score: 0,
        amountOfCollectedCards: 0,
        amountOfAnsweredQuestions: 0,
        role: UserRole.USER,
        memberOf: null,
        winnerInRound: null,
        updatedAt: FieldValue.serverTimestamp(),
        lastGuildChangeAt: new Date('2020/01/01') as any
    };

    let collectedQuestionsRef: FirebaseFirestore.DocumentReference = db.collection('users')
        .doc(uid)
        .collection('collectedQuestions')
        .doc('collectedQuestions');

    try {
        await db.runTransaction(async (transaction) => {
            transaction.create(userRef, user);

            transaction.create(usernameRef, { uid: uid });

            transaction.create(collectedQuestionsRef, {});

            await updateRanking(db, transaction, user);
        });

        logger.log('setupAccountHandle', `User ${user.username} registered.`);
        return { user };
    } catch (error) {
        logger.error('setupAccountHandle', 'error while registering the user: ' + error);
        throw new https.HttpsError('aborted', 'error while registering the user');
    }
};
