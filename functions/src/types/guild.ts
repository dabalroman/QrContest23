import { firestore } from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import Timestamp = firestore.Timestamp;

export type GuildUid = 'guild-water' | 'guild-desert' | 'guild-steel' | 'guild-void';

export type GuildMember = {
    username: string,
    score: number,
    amountOfCollectedCards: number,
    amountOfAnsweredQuestions: number,
    joinedAt: Timestamp | FieldValue | Date
}

export type GuildMembers = {
    [uid: string]: GuildMember
}

export type Guild = {
    uid: GuildUid;
    name: string;
    description: string;
    score: number | FieldValue;
    amountOfMembers: number | FieldValue;
    amountOfCollectedCards: number | FieldValue;
    amountOfAnsweredQuestions: number | FieldValue;
    members: GuildMembers;
    updatedAt: Timestamp | FieldValue;
}
