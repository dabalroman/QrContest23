// Photo-proof pins (#19). Mirrors pins.test.mjs: mints real ID tokens, POSTs to the actual callables,
// and asserts against real Firestore documents. The narrow owner-only storage.rules make the upload leg
// emulator-testable, so these seed a real Storage object (as the client's uploadBytes would) before a
// submit. The load-bearing assertions: submit awards NOTHING (only pending); approve is just another
// awardPoints (score fans out); reject REOPENS the pin for retry.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    db, assertEmulatorReachable, resetEmulator, createAuthUserToken, callCallable
} from './emulator.mjs';
import {
    seedFixture, seedUser, seedPhotoObject, ROUND_UID,
    PIN_PHOTO_UID, PIN_PHOTO_VALUE, PIN_VISIT_UID
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

// Written straight through the admin SDK (bypasses setupAccountHandle) - assertAdmin only needs a user
// doc with role: 'admin'. Same idiom as admin-pins.test.mjs.
async function registerAdmin (uid, username) {
    const token = await createAuthUserToken(uid);
    await seedUser(uid, username, { role: 'admin' });
    return token;
}

async function collectedPinDoc (uid, pinUid) {
    return (await db.collection('users').doc(uid).collection('collectedPins').doc(pinUid).get());
}

// --- submit ---

test('submit marks the pin pending, awards NOTHING, greys the marker', async () => {
    const uid = 'photo-submit-1';
    const token = await registerPlayer(uid, 'PhotoSubmit1');
    await seedPhotoObject(uid, PIN_PHOTO_UID);

    const result = await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token);
    assert.equal(result.status, 'pending');
    assert.ok(result.submissionUid, 'a submission uid is returned');

    const user = (await db.collection('users').doc(uid).get()).data();
    assert.equal(user.pendingScore, PIN_PHOTO_VALUE, 'pendingScore holds the value');
    assert.equal(user.score, 0, 'score untouched while pending');
    assert.equal(user.amountOfCollectedPins, 0, 'counter untouched while pending');

    const round = (await db.collection('ranking').doc(ROUND_UID).get()).data();
    assert.equal(round.users[uid].score, 0, 'no fan-out while pending');

    const collected = await collectedPinDoc(uid, PIN_PHOTO_UID);
    assert.equal(collected.exists, true, 'collectedPins snapshot written (greys the marker)');
    assert.equal(collected.data().awardedPoints, 0, 'awardedPoints 0 while pending');

    const pin = (await db.collection('pins').doc(PIN_PHOTO_UID).get()).data();
    assert.ok(pin.collectedBy[uid], 'pin collectedBy records the submitter');

    const submission = (await db.collection('photoSubmissions').doc(result.submissionUid).get()).data();
    assert.equal(submission.status, 'pending');
    assert.equal(submission.value, PIN_PHOTO_VALUE, 'value snapshotted onto the submission');
    assert.equal(submission.userUid, uid);
    assert.equal(submission.pinUid, PIN_PHOTO_UID);
});

test('submit with no uploaded object is rejected', async () => {
    const uid = 'photo-noobject-1';
    const token = await registerPlayer(uid, 'PhotoNoObject1');

    await assert.rejects(
        () => callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token),
        /not uploaded|precondition/i
    );

    const user = (await db.collection('users').doc(uid).get()).data();
    assert.equal(user.pendingScore, 0, 'no pendingScore on a rejected submit');
    assert.equal((await collectedPinDoc(uid, PIN_PHOTO_UID)).exists, false, 'no snapshot on a rejected submit');
});

test('submit against a non-photo pin is rejected', async () => {
    const uid = 'photo-wrongtype-1';
    const token = await registerPlayer(uid, 'PhotoWrongType1');
    await seedPhotoObject(uid, PIN_VISIT_UID);

    await assert.rejects(
        () => callCallable('submitPhotoHandle', { pinUid: PIN_VISIT_UID }, token),
        /not a photo/i
    );
});

test('submit against an inactive photo pin is rejected', async () => {
    const uid = 'photo-inactive-1';
    const token = await registerPlayer(uid, 'PhotoInactive1');

    await db.collection('pins').doc('test-photo-inactive').set({
        uid: 'test-photo-inactive', name: 'Inactive photo', description: 'x', clue: '',
        type: 'photo', groups: ['test'], mapId: 'test-map', coords: { x: 0, y: 0 }, hintRadius: null,
        value: 5, withQuestion: false, availableFrom: null, availableTo: null,
        isActive: false, code: null, collectedBy: {}
    });

    await assert.rejects(
        () => callCallable('submitPhotoHandle', { pinUid: 'test-photo-inactive' }, token),
        /not active/i
    );
});

test('a second submit while pending is rejected (dup guard bounds pending to one)', async () => {
    const uid = 'photo-dup-1';
    const token = await registerPlayer(uid, 'PhotoDup1');
    await seedPhotoObject(uid, PIN_PHOTO_UID);

    await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token);
    await assert.rejects(
        () => callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token),
        /already/i
    );
});

test('submit requires auth', async () => {
    await assert.rejects(
        () => callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, null),
        /permission/i
    );
});

// --- approve ---

test('approve awards the value, fans out, clears pendingScore', async () => {
    const uid = 'photo-approve-1';
    const token = await registerPlayer(uid, 'PhotoApprove1');
    const adminToken = await registerAdmin('photo-admin-1', 'PhotoAdmin1');
    await seedPhotoObject(uid, PIN_PHOTO_UID);

    const { submissionUid } = await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token);
    await callCallable('reviewPhotoHandle', { submissionUid, decision: 'approve' }, adminToken);

    const user = (await db.collection('users').doc(uid).get()).data();
    assert.equal(user.score, PIN_PHOTO_VALUE, 'score awarded on approve');
    assert.equal(user.pendingScore, 0, 'pendingScore cleared');
    assert.equal(user.amountOfCollectedPins, 1, 'counter bumped on approve');

    const round = (await db.collection('ranking').doc(ROUND_UID).get()).data();
    assert.equal(round.users[uid].score, PIN_PHOTO_VALUE, 'ranking round copy fanned out');
    assert.equal(round.users[uid].amountOfCollectedPins, 1, 'round copy counter fanned out');

    const collected = await collectedPinDoc(uid, PIN_PHOTO_UID);
    assert.equal(collected.data().awardedPoints, PIN_PHOTO_VALUE, 'awardedPoints set on approve');

    const submission = (await db.collection('photoSubmissions').doc(submissionUid).get()).data();
    assert.equal(submission.status, 'approved');
    assert.equal(submission.reviewedBy, 'photo-admin-1');
});

// The bug behind task #77: approval must move the location-scope numerator, or a pinsInScope badge
// whose last pin is a photo can never complete. The fixture photo pin sits in groups ['test'] / mapId
// 'test-map', so approval increments its group/map/type scope keys - and NOT before, while pending.
test('approve increments the scope counters (nothing while pending)', async () => {
    const uid = 'photo-scope-1';
    const token = await registerPlayer(uid, 'PhotoScope1');
    const adminToken = await registerAdmin('photo-admin-scope', 'PhotoAdminScope');
    await seedPhotoObject(uid, PIN_PHOTO_UID);

    const { submissionUid } = await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token);

    const pending = (await db.collection('users').doc(uid).get()).data();
    assert.equal(pending.collectedPinsByScope['map:test-map'], undefined, 'no scope counter while pending');

    await callCallable('reviewPhotoHandle', { submissionUid, decision: 'approve' }, adminToken);

    const user = (await db.collection('users').doc(uid).get()).data();
    assert.equal(user.collectedPinsByScope['group:test'], 1, 'group scope incremented on approve');
    assert.equal(user.collectedPinsByScope['map:test-map'], 1, 'map scope incremented on approve');
    assert.equal(user.collectedPinsByScope['type:photo'], 1, 'type scope incremented on approve');
});

// --- reject ---

test('reject clears pendingScore, awards nothing, and REOPENS the pin', async () => {
    const uid = 'photo-reject-1';
    const token = await registerPlayer(uid, 'PhotoReject1');
    const adminToken = await registerAdmin('photo-admin-2', 'PhotoAdmin2');
    await seedPhotoObject(uid, PIN_PHOTO_UID);

    const { submissionUid } = await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token);
    await callCallable('reviewPhotoHandle', { submissionUid, decision: 'reject' }, adminToken);

    const user = (await db.collection('users').doc(uid).get()).data();
    assert.equal(user.score, 0, 'no score on reject');
    assert.equal(user.pendingScore, 0, 'pendingScore cleared');
    assert.equal(user.amountOfCollectedPins, 0, 'no counter bump on reject');

    assert.equal((await collectedPinDoc(uid, PIN_PHOTO_UID)).exists, false, 'collectedPins snapshot deleted');
    const pin = (await db.collection('pins').doc(PIN_PHOTO_UID).get()).data();
    assert.equal(pin.collectedBy[uid], undefined, 'pin collectedBy entry deleted (reopened)');

    const submission = (await db.collection('photoSubmissions').doc(submissionUid).get()).data();
    assert.equal(submission.status, 'rejected');
});

test('after a reject the player can resubmit (a fresh pending submission)', async () => {
    const uid = 'photo-resubmit-1';
    const token = await registerPlayer(uid, 'PhotoResubmit1');
    const adminToken = await registerAdmin('photo-admin-3', 'PhotoAdmin3');
    await seedPhotoObject(uid, PIN_PHOTO_UID);

    const first = await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token);
    await callCallable('reviewPhotoHandle', { submissionUid: first.submissionUid, decision: 'reject' }, adminToken);

    // reject deleted the Storage object; the retry re-uploads (overwrite allowed), so seed it again.
    await seedPhotoObject(uid, PIN_PHOTO_UID);
    const second = await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token);

    assert.notEqual(second.submissionUid, first.submissionUid, 'a new submission doc is created');
    assert.equal(second.status, 'pending');

    const user = (await db.collection('users').doc(uid).get()).data();
    assert.equal(user.pendingScore, PIN_PHOTO_VALUE, 'pendingScore holds the resubmitted value');
});

// --- idempotency ---

test('reviewing a non-pending submission throws (idempotent)', async () => {
    const uid = 'photo-idem-1';
    const token = await registerPlayer(uid, 'PhotoIdem1');
    const adminToken = await registerAdmin('photo-admin-4', 'PhotoAdmin4');
    await seedPhotoObject(uid, PIN_PHOTO_UID);

    const { submissionUid } = await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token);
    await callCallable('reviewPhotoHandle', { submissionUid, decision: 'approve' }, adminToken);

    await assert.rejects(
        () => callCallable('reviewPhotoHandle', { submissionUid, decision: 'approve' }, adminToken),
        /pending|precondition/i
    );

    // The double-approve must not have double-awarded.
    const user = (await db.collection('users').doc(uid).get()).data();
    assert.equal(user.score, PIN_PHOTO_VALUE, 'still a single award');
});

// --- admin gates ---

test('reviewPhotoHandle rejects a non-admin', async () => {
    const uid = 'photo-nonadmin-1';
    const token = await registerPlayer(uid, 'PhotoNonAdmin1');
    await seedPhotoObject(uid, PIN_PHOTO_UID);
    const { submissionUid } = await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, token);

    await assert.rejects(
        () => callCallable('reviewPhotoHandle', { submissionUid, decision: 'approve' }, token),
        /permission/i
    );
});

test('getPhotoSubmissionsHandle rejects a non-admin', async () => {
    const token = await registerPlayer('photo-nonadmin-2', 'PhotoNonAdmin2');
    await assert.rejects(
        () => callCallable('getPhotoSubmissionsHandle', {}, token),
        /permission/i
    );
});

// --- queue ---

test('getPhotoSubmissions returns only pending rows with a resolvable photo url', async () => {
    const pendingUid = 'photo-queue-1';
    const approvedUid = 'photo-queue-2';
    const pendingToken = await registerPlayer(pendingUid, 'PhotoQueue1');
    const approvedToken = await registerPlayer(approvedUid, 'PhotoQueue2');
    const adminToken = await registerAdmin('photo-admin-5', 'PhotoAdmin5');

    await seedPhotoObject(pendingUid, PIN_PHOTO_UID);
    await seedPhotoObject(approvedUid, PIN_PHOTO_UID);
    const pending = await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, pendingToken);
    const approved = await callCallable('submitPhotoHandle', { pinUid: PIN_PHOTO_UID }, approvedToken);
    await callCallable('reviewPhotoHandle', { submissionUid: approved.submissionUid, decision: 'approve' }, adminToken);

    const { submissions } = await callCallable('getPhotoSubmissionsHandle', {}, adminToken);
    const uids = submissions.map((entry) => entry.submissionUid);

    assert.ok(uids.includes(pending.submissionUid), 'pending submission listed');
    assert.ok(!uids.includes(approved.submissionUid), 'approved submission not listed');

    const row = submissions.find((entry) => entry.submissionUid === pending.submissionUid);
    assert.equal(row.username, 'PhotoQueue1', 'denormalized username present');
    assert.equal(row.pinName, 'Test pin (photo)', 'denormalized pin name present');
    assert.equal(typeof row.photoUrl, 'string', 'a photo url was built');
    assert.ok(row.photoUrl.includes('token=test-token'), 'photo url carries the download token');
});
