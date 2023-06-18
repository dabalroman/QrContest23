import { logger } from 'firebase-functions';
import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Card, Question, User } from './firestoreTypes';
import questionsSeed from './seeds/questions';
import cardsSeed from './seeds/cards';

export default async function seedDatabaseHandle (request: CallableRequest) {
    if (!request.auth || !request.auth.uid) {
        logger.error('seedDatabaseHandle', 'permission denied');
        throw new HttpsError('permission-denied', 'permission denied');
    }

    const uid: string = request.auth.uid;

    const db = getFirestore();
    const userRef = db.collection('users')
        .doc(uid);
    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists || (userSnapshot.data() as User).role !== 'admin') {
        logger.error('seedDatabaseHandle', 'permission denied');
        throw new HttpsError('permission-denied', 'permission denied');
    }

    await seedQuestions(db);
    await seedCards(db);

    return {
        status: 'ok'
    };
};

async function seedQuestions (db: FirebaseFirestore.Firestore) {
    logger.log('seedDatabaseHandle', 'seeding questions');
    questionsSeed.forEach((question: Question) => {
        db.collection('questions')
            .doc(question.uid)
            .set(question);
    });
    logger.log('seedDatabaseHandle', 'seeding questions done');
}

async function seedCards (db: FirebaseFirestore.Firestore) {
    logger.log('seedDatabaseHandle', 'seeding questions');
    cardsSeed.forEach((card: Card) => {
        db.collection('cards')
            .doc(card.uid)
            .set(card);
    });
    logger.log('seedDatabaseHandle', 'seeding questions done');
}