import { GuildUid } from './guild';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

export type RankingRoundUser = {
    username: string,
    score: number,
    amountOfCollectedCards: number,
    amountOfAnsweredQuestions: number,
    amountOfCorrectAnswers: number,
    amountOfCollectedPins: number,
    memberOf: GuildUid | null,
    winnerInRound: string | null,
    updatedAt: Timestamp | FieldValue | number,
    // Copied from User.scoreUpdatedAt - the tie-break basis, moved only by a real score change. See the
    // comment there, and actions/rankingOrder.ts for the ordering that reads it.
    scoreUpdatedAt: Timestamp | FieldValue | number | null,
}

export type RankingRoundGuild = {
    name: string,
    score: number,
    amountOfAnsweredQuestions: number,
    amountOfCollectedCards: number,
    amountOfMembers: number,
    updatedAt: Timestamp | FieldValue | number,
}

export type RankingRoundUsers = {
    [uid: string]: RankingRoundUser
}

export type RankingRoundGuilds = {
    [uid: string]: RankingRoundGuild
}

export type RankingRound = {
    uid: string,
    name: string,
    finished: boolean,
    from: Timestamp | FieldValue | Date,
    to: Timestamp | FieldValue | Date,
    users: RankingRoundUsers,
    guilds: RankingRoundGuilds
}
