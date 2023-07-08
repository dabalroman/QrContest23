import { firestore } from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Timestamp = firestore.Timestamp;

export type GuildUid = 'gildia-otchlani' | 'gildia-pustyni' | 'gildia-slonca' | 'gildia-stali';

export type GuildMember = {
    username: string,
    score: number,
    joinedAt: Timestamp | FieldValue | Date;
}

export type Guild = {
    uid: GuildUid;
    name: string;
    score: number | FieldValue;
    amountOfMembers: number | FieldValue;
    amountOfCollectedCards: number | FieldValue;
    amountOfAnsweredQuestions: number | FieldValue;
    members: {
        [uid: string]: GuildMember
    }
    updatedAt: Timestamp | FieldValue;
}
