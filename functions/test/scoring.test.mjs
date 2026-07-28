// Critical-path test: register → join guild → collect a card → answer its question,
// then assert the score is identical in all four places it gets denormalized to.
//
// This is the regression net for the leaderboard. Any change to how points are awarded
// (task #3 unify-scoring, new quest/achievement point sources) must keep this green.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    db, assertEmulatorReachable, resetEmulator, createAuthUserToken, callCallable
} from './emulator.mjs';
import {
    seedFixture, CARD_CODE, CARD_VALUE, GUILD_UID, ROUND_UID,
    QUESTION_CORRECT, EXPECTED_TOTAL
} from './fixtures.mjs';

/** Any answer key that is not QUESTION_CORRECT - graded wrong, burns the question, awards 0. */
const QUESTION_WRONG = 'b';

before(async () => {
    await assertEmulatorReachable();
});

beforeEach(async () => {
    await resetEmulator();
    await seedFixture();
});

test('score stays consistent across user, round and guild after collect + answer', async () => {
    const uid = 'player-1';
    const token = await createAuthUserToken(uid);

    // Register + join a guild so the guild fan-out path is exercised.
    await callCallable('setupAccountHandle', { username: 'TestPlayer' }, token);
    await callCallable('joinGuildHandle', { guild: GUILD_UID }, token);

    // Collect the card - awards CARD_VALUE and hands back a question.
    const collect = await callCallable('collectCardHandle', { code: CARD_CODE }, token);
    assert.ok(collect.question, 'expected the card to carry a question');

    // Answer it correctly - awards QUESTION_VALUE.
    const answer = await callCallable(
        'answerQuestionHandle',
        { uid: collect.question.uid, answer: QUESTION_CORRECT },
        token
    );
    assert.equal(answer.correct, true);

    // --- the actual invariant: the same number in four places ---
    const user = (await db.collection('users').doc(uid).get()).data();
    const round = (await db.collection('ranking').doc(ROUND_UID).get()).data();
    const guild = (await db.collection('guilds').doc(GUILD_UID).get()).data();

    assert.equal(user.score, EXPECTED_TOTAL, 'user.score');
    assert.equal(round.users[uid].score, EXPECTED_TOTAL, 'ranking round copy');
    assert.equal(guild.members[uid].score, EXPECTED_TOTAL, 'guild member copy');
    assert.equal(guild.score, EXPECTED_TOTAL, 'guild aggregate (single member)');

    // counters should agree too
    assert.equal(user.amountOfCollectedCards, 1);
    assert.equal(user.amountOfAnsweredQuestions, 1);
    assert.equal(round.users[uid].amountOfCollectedCards, 1);
    assert.equal(round.users[uid].amountOfAnsweredQuestions, 1);
});

// scoreUpdatedAt is the leaderboard's tie-break basis (older score wins), so it must track score CHANGES,
// not writes. Zero-point awards come through awardPoints too - a wrong answer here, and
// recheckAchievementsHandle for every player it repairs - and if they moved it, staying active or an admin
// running a repair would silently reorder tied players at a round close.
test('a zero-point award leaves the tie-break timestamp untouched', async () => {
    const uid = 'player-zero-award';
    const token = await createAuthUserToken(uid);
    await callCallable('setupAccountHandle', { username: 'ZeroAward' }, token);

    const collect = await callCallable('collectCardHandle', { code: CARD_CODE }, token);
    assert.ok(collect.question, 'expected the card to carry a question');

    const roundUserAfterCollect = async () =>
        (await db.collection('ranking').doc(ROUND_UID).get()).data().users[uid];

    const afterCollect = await roundUserAfterCollect();
    assert.ok(afterCollect.scoreUpdatedAt, 'a real award must stamp scoreUpdatedAt');

    const answer = await callCallable(
        'answerQuestionHandle',
        { uid: collect.question.uid, answer: QUESTION_WRONG },
        token
    );
    assert.equal(answer.correct, false);

    const afterAnswer = await roundUserAfterCollect();

    assert.equal(afterAnswer.score, CARD_VALUE, 'a wrong answer awards nothing');
    assert.equal(
        afterAnswer.scoreUpdatedAt.toMillis(),
        afterCollect.scoreUpdatedAt.toMillis(),
        'scoreUpdatedAt must not move when the score did not change'
    );
    assert.ok(
        afterAnswer.updatedAt.toMillis() >= afterCollect.updatedAt.toMillis(),
        'updatedAt still marks the write'
    );
});

test('a card cannot be collected twice', async () => {
    const uid = 'player-2';
    const token = await createAuthUserToken(uid);
    await callCallable('setupAccountHandle', { username: 'SecondPlayer' }, token);

    await callCallable('collectCardHandle', { code: CARD_CODE }, token);
    await assert.rejects(
        () => callCallable('collectCardHandle', { code: CARD_CODE }, token),
        /already/i,
        'second collect of the same card should be rejected'
    );
});
