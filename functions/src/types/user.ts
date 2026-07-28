import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { GuildUid } from './guild';
import { UserAchievement } from './achievement';

export enum UserRole {
    ADMIN = 'admin',
    USER = 'user',
    DASHBOARD = 'dashboard'
}

// A player's unlocked achievements, keyed by the achievement's uid. Presence IS the exactly-once dup
// guard (see functions/src/achievements). Kept a map on the user doc, not a subcollection: it is
// already loaded by getCurrentUser on every award (zero extra reads on the hot path) and already
// live-synced to the client. There is deliberately no per-user clone of the definitions - those live
// in the readable `achievements` collection, so the UI joins the two instead.
export type UserAchievements = {
    [achievementUid: string]: UserAchievement
};

export type User = {
    uid: string,
    username: string,
    score: number,
    // Points from photo submissions awaiting admin review (#19). A score SIBLING, not a leaderboard
    // field: it never fans out to ranking/guilds and never affects sort - the ranking header shows it
    // only on the player's OWN row. Deliberately NOT a UserCounterKey (see USER_COUNTER_DEFAULTS),
    // so it is hydrated separately in getCurrentUser, the way collectedPinsByScope is.
    pendingScore: number,
    amountOfCollectedCards: number,
    amountOfAnsweredQuestions: number,
    amountOfCorrectAnswers: number,
    amountOfCollectedPins: number,
    // Per-scope pin collect counter, keyed by a pinScopeKeys.ts key (e.g. `map:mok-parter`,
    // `group:mok`). Feeds the `pinsInScope` achievement type only - it is NOT a UserCounterKey/
    // USER_COUNTER_DEFAULTS member (that Record is total over a fixed key set; this is an open map),
    // so it is hydrated separately in getCurrentUser.
    collectedPinsByScope: Record<string, number>,
    achievements: UserAchievements,
    role: UserRole,
    isReturningPlayer: boolean,
    memberOf: GuildUid | null,
    winnerInRound: string | null
    updatedAt: Timestamp | FieldValue | number,
    scoreUpdatedAt: Timestamp | FieldValue | number | null,
    lastGuildChangeAt: Timestamp | FieldValue | number,
}

export type UserUsername = {
    uid: string,
}

export type UserCounterKey =
    | 'amountOfCollectedCards'
    | 'amountOfAnsweredQuestions'
    | 'amountOfCorrectAnswers'
    | 'amountOfCollectedPins';

// User docs written before a counter existed simply lack that field, so `User` only holds true once
// these are applied - see getCurrentUser. Typed as a total Record: a new UserCounterKey without a
// default here is a compile error.
export const USER_COUNTER_DEFAULTS: Record<UserCounterKey, number> = {
    amountOfCollectedCards: 0,
    amountOfAnsweredQuestions: 0,
    amountOfCorrectAnswers: 0,
    amountOfCollectedPins: 0
};