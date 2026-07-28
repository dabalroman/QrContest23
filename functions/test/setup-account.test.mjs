// Account setup: the created user doc, and role assignment by email (task #62).
//
// This is the only account-creation path in the app - if it breaks, nobody can register and the
// whole game is down - so the suite asserts the ENTIRE created doc, not just the new role field.
// That matters more than it looks: getCurrentUser spreads USER_COUNTER_DEFAULTS on every hydration,
// so a counter dropped from setupAccountHandle's literal would leave every other suite green while
// updateRanking silently copies `undefined` into the round doc and aborts awards days later.
//
// The listed-address cases read functions/.env - the same file the emulator loads into the functions
// runtime - so both sides agree by construction and the suite exercises the ACTUAL configured path
// rather than a parallel fake config that could silently drift.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';

import {
    db, assertEmulatorReachable, resetEmulator, createAuthUserToken, callCallable
} from './emulator.mjs';
import { seedFixture, ROUND_UID } from './fixtures.mjs';
import parseEnvFile, { splitList } from '../scripts/parseEnvFile.mjs';

const { Timestamp } = admin.firestore;

const UNLISTED_EMAIL = 'nobody@example.test';

function configuredEmails (key) {
    const parsed = parseEnvFile();
    const entries = parsed === null ? [] : splitList(parsed.values[key]);

    if (entries.length === 0) {
        throw new Error(`functions/.env has no value for ${key} - the prebuild gate should have caught this`);
    }

    return entries;
}

async function setupAccount (uid, username, options, payload = {}) {
    const token = await createAuthUserToken(uid, options);
    const result = await callCallable('setupAccountHandle', { username, ...payload }, token);
    const stored = (await db.collection('users').doc(uid).get()).data();

    return { result, stored };
}

async function roleOf (uid, username, options, payload = {}) {
    return (await setupAccount(uid, username, options, payload)).stored.role;
}

before(async () => {
    await assertEmulatorReachable();
});

beforeEach(async () => {
    await resetEmulator();
    await seedFixture();
});

test('registration creates a complete user doc, username reservation and ranking entry', async () => {
    const uid = 'fresh-player';
    const username = 'FreshPlayer';
    const { result, stored } = await setupAccount(
        uid, username, { email: UNLISTED_EMAIL, emailVerified: true }
    );

    const { updatedAt, lastGuildChangeAt, ...fields } = stored;

    assert.deepEqual(fields, {
        uid,
        username,
        score: 0,
        pendingScore: 0,
        amountOfCollectedCards: 0,
        amountOfAnsweredQuestions: 0,
        amountOfCorrectAnswers: 0,
        amountOfCollectedPins: 0,
        collectedPinsByScope: {},
        achievements: {},
        role: 'user',
        isReturningPlayer: false,
        memberOf: null,
        winnerInRound: null,
        // No score yet, so the leaderboard tie-break basis is unset - awardPoints stamps it on the first
        // award that actually changes the score.
        scoreUpdatedAt: null
    }, 'the persisted user doc');

    assert.ok(updatedAt instanceof Timestamp, 'updatedAt resolved to a real Timestamp');
    assert.ok(lastGuildChangeAt instanceof Timestamp, 'lastGuildChangeAt resolved to a real Timestamp');

    const reservation = await db.collection('users-usernames').doc(username.toLowerCase()).get();
    assert.deepEqual(reservation.data(), { uid }, 'the username reservation');

    const collectedQuestions = await db
        .collection('users').doc(uid)
        .collection('collectedQuestions').doc('collectedQuestions')
        .get();
    assert.ok(collectedQuestions.exists, 'the collectedQuestions doc answerQuestionHandle needs');

    // updateRanking copies six user fields straight through with no ?? 0 guard - an undefined here
    // makes the admin SDK throw mid-transaction and aborts the award.
    const roundUser = (await db.collection('ranking').doc(ROUND_UID).get()).data().users[uid];
    assert.equal(roundUser.score, 0, 'ranking round copy score');
    for (const field of [
        'username', 'amountOfCollectedCards', 'amountOfAnsweredQuestions',
        'amountOfCorrectAnswers', 'amountOfCollectedPins'
    ]) {
        assert.notEqual(roundUser[field], undefined, `ranking round copy ${field}`);
    }

    assert.equal(result.user.uid, uid, 'the returned user uid');
    assert.equal(result.user.username, username, 'the returned username');
    assert.equal(result.user.role, stored.role, 'the returned role matches the persisted one');
});

test('registering the same uid twice is rejected', async () => {
    await setupAccount('dup-uid', 'DupUidOne', { email: UNLISTED_EMAIL, emailVerified: true });

    await assert.rejects(
        () => setupAccount('dup-uid', 'DupUidTwo', { email: UNLISTED_EMAIL, emailVerified: true }),
        /user uid exist already/
    );
});

// #63. The flag is a post-event stat, not a gate, so the handler coerces instead of throwing: a
// player on a cached bundle that predates the field must still be able to register at the door.
test('the returning-player flag is persisted as sent', async () => {
    for (const [index, sent] of [true, false].entries()) {
        const { stored } = await setupAccount(
            `veteran-${index}`, `Veteran${index}`,
            { email: `veteran-${index}@example.test`, emailVerified: true },
            { isReturningPlayer: sent }
        );

        assert.equal(stored.isReturningPlayer, sent, `isReturningPlayer sent as ${sent}`);
    }
});

test('a payload with no returning-player field still registers, defaulting to false', async () => {
    const { stored } = await setupAccount(
        'veteran-absent', 'VeteranAbsent', { email: UNLISTED_EMAIL, emailVerified: true }
    );

    assert.equal(stored.isReturningPlayer, false);
});

test('a junk returning-player value is coerced to false and never rejects the registration', async () => {
    const junk = ['true', 1, 0, null, {}, [], 'yes'];

    for (const [index, sent] of junk.entries()) {
        const { stored } = await setupAccount(
            `veteran-junk-${index}`, `VeteranJunk${index}`,
            { email: `veteran-junk-${index}@example.test`, emailVerified: true },
            { isReturningPlayer: sent }
        );

        assert.equal(stored.isReturningPlayer, false, `isReturningPlayer sent as ${JSON.stringify(sent)}`);
    }
});

test('the returning-player flag does not contaminate the rest of the user doc', async () => {
    const uid = 'veteran-clean';
    const { stored } = await setupAccount(
        uid, 'VeteranClean',
        { email: configuredEmails('ADMIN_EMAILS')[0], emailVerified: true },
        { isReturningPlayer: true }
    );

    const { updatedAt, lastGuildChangeAt, isReturningPlayer, ...fields } = stored;

    assert.equal(isReturningPlayer, true, 'the flag itself');
    assert.deepEqual(fields, {
        uid,
        username: 'VeteranClean',
        score: 0,
        pendingScore: 0,
        amountOfCollectedCards: 0,
        amountOfAnsweredQuestions: 0,
        amountOfCorrectAnswers: 0,
        amountOfCollectedPins: 0,
        collectedPinsByScope: {},
        achievements: {},
        role: 'admin',
        memberOf: null,
        winnerInRound: null,
        scoreUpdatedAt: null
    }, 'every other field, including the role, is unaffected by the flag');
});

test('the returning-player flag cannot be flipped by re-registering', async () => {
    await setupAccount(
        'veteran-reflip', 'VeteranReflip',
        { email: UNLISTED_EMAIL, emailVerified: true },
        { isReturningPlayer: false }
    );

    await assert.rejects(
        () => setupAccount(
            'veteran-reflip', 'VeteranReflipTwo',
            { email: UNLISTED_EMAIL, emailVerified: true },
            { isReturningPlayer: true }
        ),
        /user uid exist already/
    );

    const stored = (await db.collection('users').doc('veteran-reflip').get()).data();
    assert.equal(stored.isReturningPlayer, false, 'the original value survived the rejected call');
});

test('registering a username someone already took is rejected', async () => {
    await setupAccount('name-owner', 'TakenName', { email: UNLISTED_EMAIL, emailVerified: true });

    await assert.rejects(
        () => setupAccount('name-thief', 'TakenName', { email: 'thief@example.test', emailVerified: true }),
        /nickname already taken/
    );
});

// Uniqueness is the users-usernames doc id, so it is only as case-insensitive as the key is. Before
// the fold, Joe/JOE/joe were three ids, every one of which passed the pre-check AND won its own
// transaction.create - two players walked away holding the same name.
test('a username taken in a different case or padding is rejected', async () => {
    await setupAccount('case-owner', 'Joe', { email: UNLISTED_EMAIL, emailVerified: true });

    for (const [index, variant] of ['JOE', 'joe', 'jOe', '  Joe  ', ' joe'].entries()) {
        await assert.rejects(
            () => setupAccount(
                `case-thief-${index}`, variant,
                { email: `case-thief-${index}@example.test`, emailVerified: true }
            ),
            /nickname already taken/,
            `variant ${JSON.stringify(variant)}`
        );
    }
});

// The fold decides the KEY only. Display casing is the player's, and it is what the leaderboard and
// every ranking round copy render - folding it into the doc too would silently lowercase every nick.
test('the display username keeps the casing and loses only the padding', async () => {
    const { stored } = await setupAccount(
        'case-display', '  MiXeDcAsE  ', { email: UNLISTED_EMAIL, emailVerified: true }
    );

    assert.equal(stored.username, 'MiXeDcAsE', 'the persisted display name');

    const reservation = await db.collection('users-usernames').doc('mixedcase').get();
    assert.deepEqual(reservation.data(), { uid: 'case-display' }, 'reserved under the folded key');

    const roundUser = (await db.collection('ranking').doc(ROUND_UID).get()).data().users['case-display'];
    assert.equal(roundUser.username, 'MiXeDcAsE', 'the ranking round copy');
});

// Padding is stripped before the length rule, matching the client - otherwise spaces pad a 1-char
// nick past the minimum and the reservation lands under a 1-char key.
test('a username that is only long enough before trimming is rejected', async () => {
    await assert.rejects(
        () => setupAccount('pad-short', '  a  ', { email: UNLISTED_EMAIL, emailVerified: true }),
        /username does not meet requirements/
    );
});

test('a configured admin email with a verified address is granted the admin role', async () => {
    const role = await roleOf(
        'role-admin', 'RoleAdmin',
        { email: configuredEmails('ADMIN_EMAILS')[0], emailVerified: true }
    );

    assert.equal(role, 'admin');
});

test('a configured dashboard email with a verified address is granted the dashboard role', async () => {
    const role = await roleOf(
        'role-dashboard', 'RoleDashboard',
        { email: configuredEmails('DASHBOARD_EMAILS')[0], emailVerified: true }
    );

    assert.equal(role, 'dashboard');
});

// The TV account registers by email/password, which never verifies the address. Dashboard grants no
// data access (firestore.rules keys off role == 'admin' only), so it carries no verification gate -
// unlike admin, one line below. Deleting this asymmetry locks the projector out of its own screen.
test('a configured dashboard email is granted the role even while unverified', async () => {
    const role = await roleOf(
        'role-dashboard-unverified', 'RoleDashUnver',
        { email: configuredEmails('DASHBOARD_EMAILS')[0], emailVerified: false }
    );

    assert.equal(role, 'dashboard');
});

// There is deliberately no "matches regardless of case" test: Firebase Auth stores emails
// lowercased, so a token can never carry an uppercase address and such a test passes even with
// roleForEmail's toLowerCase deleted - verified. The fold that does work is on the env side
// (parseList), and the emulator injects functions/.env once at startup, so e2e cannot vary it.

test('every configured admin entry is matched, not just the first', async (t) => {
    const entries = configuredEmails('ADMIN_EMAILS');

    if (entries.length < 2) {
        t.skip('only one address configured in ADMIN_EMAILS');
        return;
    }

    const role = await roleOf(
        'role-admin-last', 'RoleAdminLast',
        { email: entries[entries.length - 1], emailVerified: true }
    );

    assert.equal(role, 'admin');
});

test('a configured ADMIN email is NOT granted admin while the address is unverified', async () => {
    const role = await roleOf(
        'role-unverified', 'RoleUnverified',
        { email: configuredEmails('ADMIN_EMAILS')[0], emailVerified: false }
    );

    assert.equal(role, 'user');
});

test('an unlisted email stays a regular user', async () => {
    const role = await roleOf(
        'role-unlisted', 'RoleUnlisted',
        { email: UNLISTED_EMAIL, emailVerified: true }
    );

    assert.equal(role, 'user');
});

test('addresses that merely resemble a configured one stay regular users', async () => {
    const adminEmail = configuredEmails('ADMIN_EMAILS')[0];
    const nearMisses = [adminEmail.replace('@', '@x'), `x${adminEmail}`, `${adminEmail}.evil.test`];

    for (const [index, email] of nearMisses.entries()) {
        const role = await roleOf(`role-near-${index}`, `RoleNear${index}`, { email, emailVerified: true });

        assert.equal(role, 'user', email);
    }
});

test('a role stuffed into the payload cannot promote the caller', async () => {
    const role = await roleOf(
        'role-injection', 'RoleInjection',
        { email: UNLISTED_EMAIL, emailVerified: true },
        { role: 'admin' }
    );

    assert.equal(role, 'user');
});

test('an account with no email at all stays a regular user', async () => {
    const role = await roleOf('role-no-email', 'RoleNoEmail');

    assert.equal(role, 'user');
});
