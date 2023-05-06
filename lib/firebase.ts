import { FirebaseApp, getApp, initializeApp } from 'firebase/app';
import { Auth, getAuth, GoogleAuthProvider } from '@firebase/auth';
import {
    collection, DocumentData,
    DocumentSnapshot,
    Firestore,
    getDocs,
    getFirestore,
    limit,
    orderBy,
    Query,
    query,
    QueryDocumentSnapshot, Timestamp,
    where
} from '@firebase/firestore';
import { FirebaseStorage, getStorage } from '@firebase/storage';
import configuration from '@/configuration';

function createFirebaseApp (config: {}) {
    try {
        return getApp();
    } catch {
        return initializeApp(config);
    }
}

export const firebaseApp: FirebaseApp = createFirebaseApp(configuration.firebase);

export const auth: Auth = getAuth(firebaseApp);
export const googleAuthProvider: GoogleAuthProvider = new GoogleAuthProvider();
export const firestore: Firestore = getFirestore(firebaseApp);
export const storage: FirebaseStorage = getStorage(firebaseApp);
export const STATE_CHANGED= 'state_changed';


//// Helper functions
export async function getUserWithUsername (username: string): Promise<QueryDocumentSnapshot> {
    const q: Query = query(
        collection(firestore, 'users'),
        where('username', '==', username),
        limit(1)
    );

    return (await getDocs(q)).docs[0];
}

export async function getUserPosts (userDoc: QueryDocumentSnapshot): Promise<Post[]> {
    const q: Query = query(
        collection(firestore, userDoc.ref.path, 'posts'),
        where('published', '==', true),
        orderBy('createdAt', 'desc'),
        limit(5)
    );

    return (await getDocs(q)).docs.map(postToJSON);
}

export function postToJSON (doc: DocumentSnapshot) {
    const data = doc.data();

    if (data === undefined) {
        throw new Error('Empty document!');
    }

    return {
        ...data,
        createdAt: data?.createdAt.toMillis() || 0,
        updatedAt: data?.updatedAt.toMillis() || 0
    } as Post;
}

export interface AppUser {
    displayName: string,
    username: string,
    photoURL: string
}

export interface Post extends DocumentData{
    title: string,
    slug: string,
    uid: string,
    username: string,
    published: boolean,
    content: string,
    createdAt: number | Timestamp,
    updatedAt: number | Timestamp,
    heartCount: number
}
