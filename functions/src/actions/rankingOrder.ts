// The SINGLE ordering shared by both type worlds: updateRoundsProcessor picks a round's winners with it and
// models/RankingRound sorts the displayed leaderboard with it. The two tables sit on screen together for a
// finished round, so any drift between them is visible next to a physical prize.
// Keep this module import-free - it is bundled into the browser, so `firebase-admin` (even in type position)
// or `firebase-functions/logger` would break the client build.

export type RankableEntry = {
    uid: string,
    score: number,
    scoreUpdatedAt: unknown,
    updatedAt: unknown,
}

// `updatedAt` arrives as a Timestamp server-side, a Date client-side and occasionally a raw number, hence
// `unknown` plus this narrowing. An unrecognized shape must never yield NaN: NaN compares false in both
// directions, which hands ordering straight back to array order - the exact bug this module exists to kill,
// only silent. +Infinity sorts last under older-wins so a broken record can never take a prize; 0 would sort
// it first and hand it the win.
export function toRankingMillis(value: unknown): number {
    if (value instanceof Date) {
        return value.getTime();
    }

    if (typeof value === 'number') {
        return value;
    }

    if (typeof (value as { toDate?: unknown })?.toDate === 'function') {
        return (value as { toDate(): Date }).toDate().getTime();
    }

    console.warn('RANKING_ORDER_BAD_TIMESTAMP', value);

    return Number.POSITIVE_INFINITY;
}

export function orderRankingEntries(a: RankableEntry, b: RankableEntry): number {
    if (a.score !== b.score) {
        return b.score - a.score;
    }

    // `scoreUpdatedAt` moves only on a real score change, which is what "the older score wins" means.
    // Records written before the field existed carry null and fall back to `updatedAt` - the old, looser
    // behaviour, which self-corrects on that player's next scoring award.
    const aMillis = toRankingMillis(a.scoreUpdatedAt ?? a.updatedAt);
    const bMillis = toRankingMillis(b.scoreUpdatedAt ?? b.updatedAt);

    // Older score wins the tie. Guarded by the equality check above: two +Infinity values would subtract
    // to NaN.
    if (aMillis !== bMillis) {
        return aMillis - bMillis;
    }

    if (a.uid === b.uid) {
        return 0;
    }

    return a.uid < b.uid ? -1 : 1;
}

// Also the server's prize-eligibility test. Before a round is stamped nothing carries its own uid yet, so it
// reduces to `!winnerInRound` - but sharing the predicate is the point: winners are picked from exactly the
// set the ranking screen shows.
export function isVisibleInRound(record: { winnerInRound: string | null }, roundUid: string): boolean {
    return !record.winnerInRound || record.winnerInRound === roundUid;
}
