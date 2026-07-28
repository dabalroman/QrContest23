import {User, USER_COUNTER_DEFAULTS} from '../types/user';
import {logger} from 'firebase-functions';
import {HttpsError} from 'firebase-functions/v2/https';
import {DocumentData, DocumentReference, Transaction} from "firebase-admin/firestore";

function hydrate(data: DocumentData): User {
    return {
        pendingScore: 0, achievements: {}, collectedPinsByScope: {}, scoreUpdatedAt: null,
        ...USER_COUNTER_DEFAULTS, ...data
    } as User;
}

export default async function getCurrentUser(
    db: FirebaseFirestore.Firestore,
    uid: string
): Promise<[userRef: DocumentReference<User, User>, user: User]> {
    const userRef = db.collection('users')
        .doc(uid);
    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
        logger.error('getCurrentUser', 'user uid does not exist');
        throw new HttpsError('not-found', 'user uid does not exist');
    }

    return [
        userRef as DocumentReference<User, User>,
        hydrate(userSnapshot.data() as DocumentData)
    ];
}

// Transactional re-read of the user doc. Its point is the READ-SET: the getCurrentUser read above runs
// before any transaction, so concurrent same-user awards share no read on the user doc and don't
// serialize - two awards crossing one achievement threshold would each fold the bonus into their own
// increment (a permanent double-count). Reading the user inside the transaction makes overlapping awards
// conflict and retry against fresh state. MUST be the first op in the transaction callback, before any
// transaction write - Firestore forbids a read after a write.
export async function readUserInTransaction(
    transaction: Transaction,
    userRef: DocumentReference<User>
): Promise<User> {
    const snapshot = await transaction.get(userRef);

    if (!snapshot.exists) {
        logger.error('readUserInTransaction', 'user uid does not exist');
        throw new HttpsError('not-found', 'user uid does not exist');
    }

    return hydrate(snapshot.data() as DocumentData);
}
