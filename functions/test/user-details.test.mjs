// Admin per-player drill-down (#79) - getUserDetailsHandle. Read-only, so the assertions are about
// what the payload exposes rather than about state changes. The load-bearing one is the admin gate:
// this callable is the only path by which a question's `correct` key reaches a client.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    db, assertEmulatorReachable, resetEmulator, createAuthUserToken, callCallable
} from './emulator.mjs';
import {
    seedFixture, seedUser,
    PIN_CODE_UID, PIN_CODE_CODE, PIN_CODE_VALUE, PIN_CODE_NAME,
    PIN_VISIT_UID, PIN_VISIT_VALUE,
    QUESTION_CORRECT
} from './fixtures.mjs';

before(async () => {
    await assertEmulatorReachable();
});

beforeEach(async () => {
    await resetEmulator();
    await seedFixture();
});

async function registerPlayer (uid, username) {
    const token = await createAuthUserToken(uid);
    await callCallable('setupAccountHandle', { username }, token);
    return token;
}

async function registerAdmin (uid, username) {
    const token = await createAuthUserToken(uid);
    await seedUser(uid, username, { role: 'admin' });
    return token;
}

// --- auth / admin guard ---

test('getUserDetailsHandle requires auth', async () => {
    await assert.rejects(
        () => callCallable('getUserDetailsHandle', { uid: 'someone' }, null),
        /permission/i
    );
});

test('getUserDetailsHandle rejects a non-admin player', async () => {
    const token = await registerPlayer('player-1', 'Gracz');

    // A player asking about their OWN uid is still denied - the quiz key must not leak to a client
    // that could be looking at questions it has not drawn yet.
    await assert.rejects(
        () => callCallable('getUserDetailsHandle', { uid: 'player-1' }, token),
        /permission/i
    );
});

test('getUserDetailsHandle rejects a missing uid', async () => {
    const adminToken = await registerAdmin('admin-1', 'Admin');

    await assert.rejects(
        () => callCallable('getUserDetailsHandle', {}, adminToken),
        /uid/i
    );
});

// --- pins ---

test('collected pins come back with awardedPoints and the collect timestamp', async () => {
    const playerToken = await registerPlayer('player-1', 'Gracz');
    const adminToken = await registerAdmin('admin-1', 'Admin');

    await callCallable('collectPinHandle', { pinUid: PIN_VISIT_UID }, playerToken);
    await callCallable('collectPinHandle', { code: PIN_CODE_CODE }, playerToken);

    const { pins } = await callCallable('getUserDetailsHandle', { uid: 'player-1' }, adminToken);

    assert.equal(pins.length, 2);

    const codePin = pins.find((pin) => pin.uid === PIN_CODE_UID);
    assert.equal(codePin.name, PIN_CODE_NAME);
    assert.equal(codePin.type, 'code');
    assert.equal(codePin.value, PIN_CODE_VALUE);
    assert.equal(codePin.awardedPoints, PIN_CODE_VALUE);
    assert.ok(codePin.collectedAt._seconds > 0);

    const visitPin = pins.find((pin) => pin.uid === PIN_VISIT_UID);
    assert.equal(visitPin.awardedPoints, PIN_VISIT_VALUE);
});

// --- questions ---

test('a drawn but unanswered question exposes neither the answer nor the key', async () => {
    const playerToken = await registerPlayer('player-1', 'Gracz');
    const adminToken = await registerAdmin('admin-1', 'Admin');

    const collected = await callCallable('collectPinHandle', { code: PIN_CODE_CODE }, playerToken);
    assert.ok(collected.question, 'the code pin must draw a question for this test to mean anything');

    const { questions } = await callCallable('getUserDetailsHandle', { uid: 'player-1' }, adminToken);

    assert.equal(questions.length, 1);
    assert.equal(questions[0].uid, collected.question.uid);
    assert.equal(questions[0].given, null);
    // The whole point: a question still in play must not hand its key to anyone.
    assert.equal(questions[0].correct, null);
    assert.equal(questions[0].isCorrect, false);
    assert.equal(questions[0].value, 0);
    assert.equal(questions[0].question, 'Test question?');
});

test('a correctly answered question joins to its text and exposes the key', async () => {
    const playerToken = await registerPlayer('player-1', 'Gracz');
    const adminToken = await registerAdmin('admin-1', 'Admin');

    const collected = await callCallable('collectPinHandle', { code: PIN_CODE_CODE }, playerToken);
    await callCallable(
        'answerQuestionHandle',
        { uid: collected.question.uid, answer: QUESTION_CORRECT },
        playerToken
    );

    const { questions } = await callCallable('getUserDetailsHandle', { uid: 'player-1' }, adminToken);

    assert.equal(questions[0].given, QUESTION_CORRECT);
    assert.equal(questions[0].correct, QUESTION_CORRECT);
    assert.equal(questions[0].isCorrect, true);
    assert.ok(questions[0].value > 0);
    assert.deepEqual(questions[0].answers, { a: 'right', b: 'wrong', c: 'wrong', d: 'wrong' });
});

test('a wrongly answered question reports the pick and the key separately', async () => {
    const playerToken = await registerPlayer('player-1', 'Gracz');
    const adminToken = await registerAdmin('admin-1', 'Admin');

    const collected = await callCallable('collectPinHandle', { code: PIN_CODE_CODE }, playerToken);
    await callCallable('answerQuestionHandle', { uid: collected.question.uid, answer: 'b' }, playerToken);

    const { questions } = await callCallable('getUserDetailsHandle', { uid: 'player-1' }, adminToken);

    assert.equal(questions[0].given, 'b');
    assert.equal(questions[0].correct, QUESTION_CORRECT);
    assert.notEqual(questions[0].given, questions[0].correct);
    assert.equal(questions[0].isCorrect, false);
    assert.equal(questions[0].value, 0);
});

test('a collected question missing from the questions doc does not throw', async () => {
    await registerPlayer('player-1', 'Gracz');
    const adminToken = await registerAdmin('admin-1', 'Admin');

    // What an edited seed leaves behind: the player's entry outlives the definition it points at.
    await db.collection('users').doc('player-1')
        .collection('collectedQuestions').doc('collectedQuestions')
        .set({
            'question-that-no-longer-exists': {
                answer: 'a',
                correct: true,
                value: 10,
                collectedAt: new Date()
            }
        });

    const { questions } = await callCallable('getUserDetailsHandle', { uid: 'player-1' }, adminToken);

    assert.equal(questions.length, 1);
    assert.equal(questions[0].uid, 'question-that-no-longer-exists');
    assert.equal(questions[0].question, null);
    assert.equal(questions[0].answers, null);
    assert.equal(questions[0].correct, null);
    assert.equal(questions[0].given, 'a');
});
