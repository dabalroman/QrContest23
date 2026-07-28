// Regression net for task #4: a round-1 winner used to keep appearing in round 2's
// leaderboard until they scored again, because updateRoundsProcessor only stamped
// winnerInRound on the closing round's own copy and the master user doc - never on the
// denormalized copies living in other, still-open rounds. RoundRankingTable.tsx filters
// on that per-round copy, so inactive winners lingered indefinitely.
//
// These tests seed the `ranking/{round}.users` maps directly via the admin SDK (not
// through collect/answer) because they exercise updateRoundsProcessor's transaction in
// isolation, not the scoring fan-out (that's scoring.test.mjs's job).

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';

import {
    db, assertEmulatorReachable, resetEmulator, createAuthUserToken, callCallable
} from './emulator.mjs';

const { Timestamp, FieldValue } = admin.firestore;

before(async () => {
    await assertEmulatorReachable();
});

beforeEach(async () => {
    await resetEmulator();
});

/** A minimal `users/{uid}` doc - required because the transaction updates it directly. */
async function seedUser (uid, username, overrides = {}) {
    await db.collection('users').doc(uid).set({
        uid,
        username,
        score: 0,
        amountOfCollectedCards: 0,
        amountOfAnsweredQuestions: 0,
        role: 'user',
        memberOf: null,
        winnerInRound: null,
        updatedAt: FieldValue.serverTimestamp(),
        lastGuildChangeAt: FieldValue.serverTimestamp(),
        ...overrides
    });
}

/**
 * Matches the shape of RankingRoundUser (functions/src/types/rankingRound.ts). `scoreUpdatedAt` defaults
 * to null, i.e. a record written before that field existed - so every test that does not set it also
 * exercises the fallback to `updatedAt`.
 */
function roundUser (username, score, {
    winnerInRound = null,
    updatedAt = FieldValue.serverTimestamp(),
    scoreUpdatedAt = null
} = {}) {
    return {
        username,
        score,
        amountOfCollectedCards: 0,
        amountOfAnsweredQuestions: 0,
        memberOf: null,
        winnerInRound,
        updatedAt,
        scoreUpdatedAt
    };
}

async function seedRound (uid, name, {
    from = Timestamp.fromMillis(Date.now() - 48 * 60 * 60 * 1000),
    to,
    finished = false,
    users = {}
}) {
    await db.collection('ranking').doc(uid).set({
        uid,
        name,
        finished,
        from,
        to,
        users,
        guilds: {}
    });
}

/**
 * An INDEPENDENT restatement of the ordering rule: score desc, then the score's own timestamp asc (older
 * wins), then uid asc. Deliberately not imported from ../lib/actions/rankingOrder.js - this is the oracle
 * the invariant test checks the shipped comparator against, and importing the thing under test would
 * make it vacuous.
 */
function byRankingOrder (a, b) {
    if (a.score !== b.score) {
        return b.score - a.score;
    }

    const aMillis = (a.scoreUpdatedAt ?? a.updatedAt).toMillis();
    const bMillis = (b.scoreUpdatedAt ?? b.updatedAt).toMillis();

    if (aMillis !== bMillis) {
        return aMillis - bMillis;
    }

    return a.uid < b.uid ? -1 : 1;
}

/** `ranking/{uid}.users` as a uid-keyed array, the shape both the client sort and the oracle work on. */
function roundEntries (round) {
    return Object.entries(round.users).map(([uid, user]) => ({uid, ...user}));
}

async function callUpdateRounds () {
    await seedUser('caller', 'Caller', { role: 'admin' });
    const token = await createAuthUserToken('caller');
    return callCallable('updateRoundsHandle', {}, token);
}

test('closing a round propagates winnerInRound into other still-open rounds', async () => {
    const now = Date.now();

    // Five players carried over into both round 1 (closing) and round 2 (open).
    // Top-3 by score in round 1: p1 (100), p2 (90), p3 (80). p4/p5 are not winners.
    await Promise.all([
        seedUser('p1', 'Player1'),
        seedUser('p2', 'Player2'),
        seedUser('p3', 'Player3'),
        seedUser('p4', 'Player4'),
        seedUser('p5', 'Player5')
    ]);

    const round1Users = {
        p1: roundUser('Player1', 100),
        p2: roundUser('Player2', 90),
        p3: roundUser('Player3', 80),
        p4: roundUser('Player4', 70),
        p5: roundUser('Player5', 60)
    };
    const round2Users = {
        p1: roundUser('Player1', 100),
        p2: roundUser('Player2', 90),
        p3: roundUser('Player3', 80),
        p4: roundUser('Player4', 70),
        p5: roundUser('Player5', 60)
    };

    await seedRound('1', 'pierwsza', {
        to: Timestamp.fromMillis(now - 60 * 60 * 1000), // in the past -> about to close
        finished: false,
        users: round1Users
    });
    await seedRound('2', 'druga', {
        to: Timestamp.fromMillis(now + 24 * 60 * 60 * 1000), // in the future -> stays open
        finished: false,
        users: round2Users
    });

    await seedUser('caller', 'Caller', { role: 'admin' });
    const token = await createAuthUserToken('caller');
    await callCallable('updateRoundsHandle', {}, token);

    const round1 = (await db.collection('ranking').doc('1').get()).data();
    const round2 = (await db.collection('ranking').doc('2').get()).data();

    assert.equal(round1.finished, true, 'round 1 should be marked finished');
    assert.equal(round2.finished, false, 'round 2 should remain open');

    // Round 1's own copy: top-3 stamped, as before.
    assert.equal(round1.users.p1.winnerInRound, '1');
    assert.equal(round1.users.p2.winnerInRound, '1');
    assert.equal(round1.users.p3.winnerInRound, '1');

    // The fix: round 2's (still-open) copy is propagated too, without any further action.
    assert.equal(round2.users.p1.winnerInRound, '1', 'winner propagated into open round');
    assert.equal(round2.users.p2.winnerInRound, '1', 'winner propagated into open round');
    assert.equal(round2.users.p3.winnerInRound, '1', 'winner propagated into open round');

    // Non-winners are untouched everywhere.
    assert.equal(round1.users.p4.winnerInRound, null);
    assert.equal(round2.users.p4.winnerInRound, null, 'non-winner unaffected in round 2');
    assert.equal(round1.users.p5.winnerInRound, null);
    assert.equal(round2.users.p5.winnerInRound, null, 'non-winner unaffected in round 2');
});

test('two rounds closing in the same pass do not cross-contaminate each other', async () => {
    const now = Date.now();

    // shared1 wins round 1 but is also present (non-winning) in round 2.
    // shared2 wins round 2 but is also present (non-winning) in round 1.
    // Both are carried over into round 3, which stays open.
    await Promise.all([
        seedUser('shared1', 'Shared1'),
        seedUser('shared2', 'Shared2'),
        seedUser('r1b', 'Round1B'),
        seedUser('r1c', 'Round1C'),
        seedUser('r2b', 'Round2B'),
        seedUser('r2c', 'Round2C')
    ]);

    const round1Users = {
        shared1: roundUser('Shared1', 100), // top-3 winner of round 1
        r1b: roundUser('Round1B', 90),      // top-3 winner of round 1
        r1c: roundUser('Round1C', 80),      // top-3 winner of round 1
        shared2: roundUser('Shared2', 10)   // present, not a round-1 winner
    };
    const round2Users = {
        shared2: roundUser('Shared2', 100), // top-3 winner of round 2
        r2b: roundUser('Round2B', 90),      // top-3 winner of round 2
        r2c: roundUser('Round2C', 80),      // top-3 winner of round 2
        shared1: roundUser('Shared1', 95)   // 2nd by score, but already crowned by round 1
    };
    const round3Users = {
        shared1: roundUser('Shared1', 5),
        shared2: roundUser('Shared2', 5)
    };

    // Distinct `from` values: forward-only propagation is defined by round order, so leaving them tied
    // would make this test depend on Firestore's document-name tiebreak.
    await seedRound('1', 'pierwsza', {
        from: Timestamp.fromMillis(now - 72 * 60 * 60 * 1000),
        to: Timestamp.fromMillis(now - 60 * 60 * 1000), // closes this pass
        finished: false,
        users: round1Users
    });
    await seedRound('2', 'druga', {
        from: Timestamp.fromMillis(now - 48 * 60 * 60 * 1000),
        to: Timestamp.fromMillis(now - 30 * 60 * 1000), // closes this pass too
        finished: false,
        users: round2Users
    });
    await seedRound('3', 'trzecia', {
        from: Timestamp.fromMillis(now - 24 * 60 * 60 * 1000),
        to: Timestamp.fromMillis(now + 24 * 60 * 60 * 1000), // stays open
        finished: false,
        users: round3Users
    });

    await seedUser('caller', 'Caller', { role: 'admin' });
    const token = await createAuthUserToken('caller');
    await callCallable('updateRoundsHandle', {}, token);

    const round1 = (await db.collection('ranking').doc('1').get()).data();
    const round2 = (await db.collection('ranking').doc('2').get()).data();
    const round3 = (await db.collection('ranking').doc('3').get()).data();

    assert.equal(round1.finished, true);
    assert.equal(round2.finished, true);
    assert.equal(round3.finished, false);

    // Each round's own top-3 stamp is correct.
    assert.equal(round1.users.shared1.winnerInRound, '1');
    assert.equal(round2.users.shared2.winnerInRound, '2');

    // Propagation runs FORWARD only. shared1 is 2nd by score in round 2, but round 1 already crowned
    // them, so round 2 must skip them AND record the round-1 stamp - otherwise they would show up in
    // round 2's visible ranking while missing from its winners list, which is the contradiction
    // players see on screen (both tables render the same array).
    assert.equal(round2.users.shared1.winnerInRound, '1', 'round 1 winner is hidden in the later round');
    assert.equal(round2.users.r2c.winnerInRound, '2', 'the next eligible player takes the freed slot');

    // Backward stays forbidden: round 1 is closed and its leaderboard is history, so round 2's winner
    // must never be stamped into it.
    assert.equal(round1.users.shared2.winnerInRound, null, 'round 2 winner must not leak into round 1');

    // Round 3 (still open, not part of the closing set) receives both propagations correctly.
    assert.equal(round3.users.shared1.winnerInRound, '1', 'round 1 winner propagated into open round 3');
    assert.equal(round3.users.shared2.winnerInRound, '2', 'round 2 winner propagated into open round 3');
});

test('a tie on score is broken by the older updatedAt', async () => {
    const now = Date.now();

    await Promise.all([
        seedUser('p1', 'Player1'),
        seedUser('p2', 'Player2'),
        seedUser('newer', 'Newer'),
        seedUser('older', 'Older')
    ]);

    // p1 and p2 take the first two slots outright; `newer` and `older` are tied on 80 for the third.
    // `newer` sorts first by uid, so an implementation with no tie-break at all picks it.
    await seedRound('1', 'pierwsza', {
        to: Timestamp.fromMillis(now - 60 * 60 * 1000),
        users: {
            p1: roundUser('Player1', 100),
            p2: roundUser('Player2', 90),
            newer: roundUser('Newer', 80, {updatedAt: Timestamp.fromMillis(now - 10 * 60 * 1000)}),
            older: roundUser('Older', 80, {updatedAt: Timestamp.fromMillis(now - 30 * 60 * 1000)})
        }
    });

    await callUpdateRounds();

    const round1 = (await db.collection('ranking').doc('1').get()).data();

    assert.equal(round1.users.older.winnerInRound, '1', 'the older score takes the tied slot');
    assert.equal(round1.users.newer.winnerInRound, null, 'the newer score loses the tie');

    const olderUser = (await db.collection('users').doc('older').get()).data();
    const newerUser = (await db.collection('users').doc('newer').get()).data();
    assert.equal(olderUser.winnerInRound, '1');
    assert.equal(newerUser.winnerInRound, null);
});

test('a tie is broken by when the score changed, not by the last write', async () => {
    const now = Date.now();

    await Promise.all([
        seedUser('p1', 'Player1'),
        seedUser('p2', 'Player2'),
        seedUser('scored-first', 'ScoredFirst'),
        seedUser('scored-later', 'ScoredLater')
    ]);

    // Both tied on 80. `scored-first` got there earliest but kept playing afterwards - a wrong answer or
    // an achievements recheck moves `updatedAt` without changing a score, and must not cost them the tie.
    await seedRound('1', 'pierwsza', {
        to: Timestamp.fromMillis(now - 60 * 60 * 1000),
        users: {
            p1: roundUser('Player1', 100),
            p2: roundUser('Player2', 90),
            'scored-first': roundUser('ScoredFirst', 80, {
                scoreUpdatedAt: Timestamp.fromMillis(now - 50 * 60 * 1000),
                updatedAt: Timestamp.fromMillis(now - 5 * 60 * 1000)
            }),
            'scored-later': roundUser('ScoredLater', 80, {
                scoreUpdatedAt: Timestamp.fromMillis(now - 20 * 60 * 1000),
                updatedAt: Timestamp.fromMillis(now - 20 * 60 * 1000)
            })
        }
    });

    await callUpdateRounds();

    const round1 = (await db.collection('ranking').doc('1').get()).data();

    assert.equal(round1.users['scored-first'].winnerInRound, '1', 'the earlier SCORE takes the slot');
    assert.equal(round1.users['scored-later'].winnerInRound, null, 'a later write must not win the tie');
});

test('a tie on both score and updatedAt is broken by uid', async () => {
    const now = Date.now();
    const tiedAt = Timestamp.fromMillis(now - 30 * 60 * 1000);

    await Promise.all([
        seedUser('p1', 'Player1'),
        seedUser('p2', 'Player2'),
        seedUser('aaa', 'AAA'),
        seedUser('mmm', 'MMM'),
        seedUser('zzz', 'ZZZ')
    ]);

    // Three players tied on score AND on updatedAt, one slot left. Without the uid fallback the winner
    // is whatever order Firestore happens to hand back the map in.
    await seedRound('1', 'pierwsza', {
        to: Timestamp.fromMillis(now - 60 * 60 * 1000),
        users: {
            p1: roundUser('Player1', 100),
            p2: roundUser('Player2', 90),
            zzz: roundUser('ZZZ', 80, {updatedAt: tiedAt}),
            mmm: roundUser('MMM', 80, {updatedAt: tiedAt}),
            aaa: roundUser('AAA', 80, {updatedAt: tiedAt})
        }
    });

    await callUpdateRounds();

    const round1 = (await db.collection('ranking').doc('1').get()).data();

    assert.equal(round1.users.aaa.winnerInRound, '1', 'lowest uid takes the tied slot');
    assert.equal(round1.users.mmm.winnerInRound, null);
    assert.equal(round1.users.zzz.winnerInRound, null);
});

test('a player who won an earlier round cannot win a later one', async () => {
    const now = Date.now();

    await Promise.all([
        seedUser('veteran', 'Veteran', { winnerInRound: '1' }),
        seedUser('p1', 'Player1'),
        seedUser('p2', 'Player2'),
        seedUser('p3', 'Player3'),
        seedUser('p4', 'Player4')
    ]);

    await seedRound('1', 'pierwsza', {
        from: Timestamp.fromMillis(now - 72 * 60 * 60 * 1000),
        to: Timestamp.fromMillis(now - 24 * 60 * 60 * 1000),
        finished: true,
        users: { veteran: roundUser('Veteran', 200, {winnerInRound: '1'}) }
    });

    // Points carry over between rounds, so the round-1 winner tops round 2's raw score list. They are
    // hidden from round 2's ranking screen and must be skipped for its prizes too.
    await seedRound('2', 'druga', {
        from: Timestamp.fromMillis(now - 24 * 60 * 60 * 1000),
        to: Timestamp.fromMillis(now - 60 * 60 * 1000),
        users: {
            veteran: roundUser('Veteran', 200, {winnerInRound: '1'}),
            p1: roundUser('Player1', 100),
            p2: roundUser('Player2', 90),
            p3: roundUser('Player3', 80),
            p4: roundUser('Player4', 70)
        }
    });

    await callUpdateRounds();

    const round2 = (await db.collection('ranking').doc('2').get()).data();

    assert.equal(round2.users.veteran.winnerInRound, '1', 'a previous winner is not crowned again');
    assert.equal(round2.users.p1.winnerInRound, '2');
    assert.equal(round2.users.p2.winnerInRound, '2');
    assert.equal(round2.users.p3.winnerInRound, '2', 'the next eligible player takes the freed slot');
    assert.equal(round2.users.p4.winnerInRound, null);

    const veteran = (await db.collection('users').doc('veteran').get()).data();
    assert.equal(veteran.winnerInRound, '1', 'the master user doc keeps the original round');
});

test('closing a round stamps winnerInRound without rewriting the rest of the record', async () => {
    const now = Date.now();
    const scoredAt = Timestamp.fromMillis(now - 30 * 60 * 1000);

    await seedUser('p1', 'Player1');
    await seedRound('1', 'pierwsza', {
        to: Timestamp.fromMillis(now - 60 * 60 * 1000),
        users: { p1: roundUser('Player1', 100, {updatedAt: scoredAt}) }
    });

    await callUpdateRounds();

    const winner = (await db.collection('ranking').doc('1').get()).data().users.p1;

    // Writing the whole record back replays this transaction's pre-close read over anything a boundary
    // award landed since. The give-away is the `uid` key: it lives on the array element the processor
    // sorts, never on the stored map value, so its presence means the record was rewritten wholesale.
    assert.equal(winner.uid, undefined, 'winnerInRound must be stamped by field path, not by record');
    assert.equal(winner.score, 100);
    assert.equal(winner.updatedAt.toMillis(), scoredAt.toMillis(), 'updatedAt must survive the close');
});

test('a closed round\'s winners are exactly the top three of its visible ranking', async () => {
    const now = Date.now();

    await Promise.all([
        seedUser('veteran', 'Veteran', { winnerInRound: '1' }),
        seedUser('a', 'PlayerA'),
        seedUser('b', 'PlayerB'),
        seedUser('c', 'PlayerC'),
        seedUser('d', 'PlayerD'),
        seedUser('e', 'PlayerE')
    ]);

    await seedRound('1', 'pierwsza', {
        from: Timestamp.fromMillis(now - 72 * 60 * 60 * 1000),
        to: Timestamp.fromMillis(now - 24 * 60 * 60 * 1000),
        finished: true,
        users: { veteran: roundUser('Veteran', 500, {winnerInRound: '1'}) }
    });

    // A previous winner on top, a tie on score and a tie on both score and updatedAt - every branch of
    // the comparator, in one round.
    await seedRound('2', 'druga', {
        from: Timestamp.fromMillis(now - 24 * 60 * 60 * 1000),
        to: Timestamp.fromMillis(now - 60 * 60 * 1000),
        users: {
            veteran: roundUser('Veteran', 500, {winnerInRound: '1'}),
            a: roundUser('PlayerA', 120, {updatedAt: Timestamp.fromMillis(now - 5 * 60 * 1000)}),
            b: roundUser('PlayerB', 120, {updatedAt: Timestamp.fromMillis(now - 45 * 60 * 1000)}),
            c: roundUser('PlayerC', 90, {updatedAt: Timestamp.fromMillis(now - 20 * 60 * 1000)}),
            d: roundUser('PlayerD', 90, {updatedAt: Timestamp.fromMillis(now - 20 * 60 * 1000)}),
            e: roundUser('PlayerE', 10)
        }
    });

    await callUpdateRounds();

    const round2 = (await db.collection('ranking').doc('2').get()).data();
    const entries = roundEntries(round2);

    // What the ranking screen renders: RankingRound.fromFirestore sorts, then the table filters with
    // isVisibleInRound. The winners panel filters the SAME array on winnerInRound === round.uid.
    const visibleTopThree = entries
        .filter((entry) => !entry.winnerInRound || entry.winnerInRound === '2')
        .sort(byRankingOrder)
        .slice(0, 3)
        .map((entry) => entry.uid);

    const stamped = entries
        .filter((entry) => entry.winnerInRound === '2')
        .sort(byRankingOrder)
        .map((entry) => entry.uid);

    assert.deepEqual(stamped, visibleTopThree, 'winners panel must equal the top of the ranking panel');
    assert.deepEqual(visibleTopThree, ['b', 'a', 'c'], 'older score wins the 120 tie, lower uid the 90 tie');
});

test('updateRoundsHandle requires auth', async () => {
    await assert.rejects(
        () => callCallable('updateRoundsHandle', {}, null),
        /permission/i
    );
});

test('updateRoundsHandle rejects a non-admin', async () => {
    await seedUser('plain', 'Plain');
    const token = await createAuthUserToken('plain');
    await assert.rejects(
        () => callCallable('updateRoundsHandle', {}, token),
        /permission/i
    );
});
