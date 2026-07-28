import FirebaseModel from '@/models/FirebaseModel';
import { DocumentSnapshot, SnapshotOptions } from '@firebase/firestore';
import { Uid } from '@/types/global';
import { GuildUid } from '@/models/Guild';
import {
    orderRankingEntries,
    isVisibleInRound as isVisibleInRoundRule
} from '@/functions/src/actions/rankingOrder';

export type UserRankingRecord = {
    uid: Uid,
    username: string,
    score: number,
    amountOfCollectedCards: number,
    amountOfCollectedPins: number,
    amountOfAnsweredQuestions: number,
    amountOfCorrectAnswers: number,
    memberOf: GuildUid | null,
    winnerInRound: string | null,
    updatedAt: Date,
    // Null on records written before the field existed; the ordering falls back to `updatedAt` there.
    scoreUpdatedAt: Date | null,
}

export type GuildRankingRecord = {
    uid: GuildUid,
    name: string,
    score: number,
    power: number,
    amountOfAnsweredQuestions: number,
    amountOfCollectedCards: number,
    amountOfMembers: number,
    updatedAt: Date,
}

export default class RankingRound extends FirebaseModel {
    uid: Uid;
    name: string;
    finished: boolean;
    from: Date;
    to: Date;
    users: UserRankingRecord[];
    guilds: GuildRankingRecord[];

    constructor (
        uid: Uid,
        name: string,
        finished: boolean,
        from: Date,
        to: Date,
        users: UserRankingRecord[],
        guilds: GuildRankingRecord[]
    ) {
        super();

        this.uid = uid;
        this.name = name;
        this.finished = finished;
        this.from = from;
        this.to = to;
        this.users = users;
        this.guilds = guilds;
    }

    protected static toFirestore (data: RankingRound): object {
        throw new Error('Ranking is immutable.');
    }

    static isVisibleInRound (record: UserRankingRecord, roundUid: Uid): boolean {
        return isVisibleInRoundRule(record, roundUid);
    }

    protected static fromFirestore (
        snapshot: DocumentSnapshot,
        options: SnapshotOptions
    ): RankingRound {
        const data = snapshot.data(options);

        if (data === undefined) {
            throw new Error('Data undefined');
        }

        const rankingEntries: UserRankingRecord[] = Object.entries(data.users)
            .map(([uid, record]: [string, any]): UserRankingRecord => {
                return {
                    uid,
                    username: record.username,
                    amountOfCollectedCards: record.amountOfCollectedCards,
                    amountOfCollectedPins: record.amountOfCollectedPins ?? 0,
                    amountOfAnsweredQuestions: record.amountOfAnsweredQuestions,
                    amountOfCorrectAnswers: record.amountOfCorrectAnswers ?? 0,
                    memberOf: record.memberOf,
                    score: record.score,
                    winnerInRound: record.winnerInRound,
                    updatedAt: record.updatedAt.toDate(),
                    scoreUpdatedAt: record.scoreUpdatedAt ? record.scoreUpdatedAt.toDate() : null
                };
            })
            .sort(orderRankingEntries);

        const guildEntries: GuildRankingRecord[] = Object.entries(data.guilds)
            .map(([uid, record]: [string, any]): GuildRankingRecord => {
                return <GuildRankingRecord>{
                    uid,
                    name: record.name,
                    amountOfCollectedCards: record.amountOfCollectedCards,
                    amountOfAnsweredQuestions: record.amountOfAnsweredQuestions,
                    amountOfMembers: record.amountOfMembers,
                    score: record.score,
                    power: record.amountOfMembers !== 0 ? Math.round(record.score / record.amountOfMembers) : 0,
                    updatedAt: record.updatedAt.toDate()
                };
            })
            .sort((a: GuildRankingRecord, b: GuildRankingRecord) => {
                if (a.power > b.power) {
                    return -1;
                }

                if (a.power < b.power) {
                    return 1;
                }

                if (a.updatedAt > b.updatedAt) {
                    return -1;
                }

                if (a.updatedAt < b.updatedAt) {
                    return 1;
                }

                return 0;
            });

        return new RankingRound(
            data.uid,
            data.name,
            data.finished,
            data.from.toDate(),
            data.to.toDate(),
            rankingEntries,
            guildEntries
        );
    }
}


