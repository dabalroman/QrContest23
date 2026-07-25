// Admin force-recheck / repair (task #77). recheckAchievementsHandle rebuilds a player's
// collectedPinsByScope from source-of-truth (their collectedPins joined against `pins`) and grants any
// badge the reconciled counters now satisfy - repairing drift left by a photo approval that failed to
// increment the scope counter. Same e2e idiom as the other suites: real tokens, real callables, real
// transactions. The reconciliation is the point: a pure achievement re-run against a broken counter
// would grant nothing, so these tests seed collectedPins WITHOUT the matching scope counter.

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';

import {
    db, assertEmulatorReachable, resetEmulator, createAuthUserToken, callCallable
} from './emulator.mjs';
import {
    seedFixture, seedUser, seedScopedAchievement, seedLocationScopePins,
    GUILD_UID, ROUND_UID, PIN_PHOTO_UID, PIN_PHOTO_VALUE,
    LOC_SCOPE_MAP_ID, LOC_SCOPE_GROUP_UID, LOC_PIN_A_UID, LOC_PIN_B_UID
} from './fixtures.mjs';

import recomputeAchievementTargetsMod from '../lib/actions/recomputeAchievementTargets.js';
const recomputeAchievementTargets = recomputeAchievementTargetsMod.default ?? recomputeAchievementTargetsMod;

const { FieldValue } = admin.firestore;

const userDoc = (uid) => db.collection('users').doc(uid).get().then((s) => s.data());
const roundUser = (uid) => db.collection('ranking').doc(ROUND_UID).get().then((s) => s.data().users[uid]);
const guildDoc = () => db.collection('guilds').doc(GUILD_UID).get().then((s) => s.data());
const achievementDoc = (uid) => db.collection('achievements').doc(uid).get().then((s) => s.data());

async function registerAdmin (uid, username) {
    const token = await createAuthUserToken(uid);
    await seedUser(uid, username, { role: 'admin' });
    return token;
}

// Seed a collectedPins snapshot directly (as a collect/approve would leave it), so a test can present
// a player who HOLDS the pin while their scope counter lags behind.
async function seedCollectedPin (uid, pinUid, { type = 'visit', value = 5, awardedPoints = 5 } = {}) {
    await db.collection('users').doc(uid).collection('collectedPins').doc(pinUid).set({
        uid: pinUid, name: pinUid, description: '', value, type,
        collectedAt: FieldValue.serverTimestamp(), awardedPoints
    });
}

before(async () => {
    await assertEmulatorReachable();
});

beforeEach(async () => {
    await resetEmulator();
    await seedFixture();
});

test('reconciles an understated scope counter and grants the missing badge, fanning it out', async () => {
    const playerUid = 'recheck-fix';
    const playerToken = await createAuthUserToken(playerUid);
    const adminToken = await registerAdmin('recheck-admin-1', 'RecheckAdmin1');

    await seedLocationScopePins();
    const def = await seedScopedAchievement(`map:${LOC_SCOPE_MAP_ID}`);
    await recomputeAchievementTargets(db);
    assert.equal((await achievementDoc(def.uid)).target, 2, 'two pins in scope');

    // The player HOLDS both pins, but the scope counter drifted to 1 (the #77 bug: the second
    // increment was lost), so the badge never unlocked.
    await seedUser(playerUid, 'RecheckFix', {
        score: 10,
        collectedPinsByScope: {
            [`map:${LOC_SCOPE_MAP_ID}`]: 1, [`group:${LOC_SCOPE_GROUP_UID}`]: 1, 'type:visit': 1
        }
    });
    await callCallable('joinGuildHandle', { guild: GUILD_UID }, playerToken);
    await seedCollectedPin(playerUid, LOC_PIN_A_UID);
    await seedCollectedPin(playerUid, LOC_PIN_B_UID);

    const res = await callCallable('recheckAchievementsHandle', { uid: playerUid }, adminToken);

    assert.equal(res.totalGranted, 1, 'one badge granted');
    assert.deepEqual(res.grants[playerUid], [{
        uid: def.uid, name: def.name, icon: def.icon, bonus: def.bonus
    }]);

    const user = await userDoc(playerUid);
    assert.equal(user.collectedPinsByScope[`map:${LOC_SCOPE_MAP_ID}`], 2, 'scope reconciled to 2');
    assert.ok(user.achievements[def.uid], 'badge stamped');
    assert.equal(user.score, 10 + def.bonus, 'bonus added; base score preserved (not recomputed)');

    assert.equal((await roundUser(playerUid)).score, user.score, 'bonus fanned to the round');
    assert.equal((await guildDoc()).members[playerUid].score, user.score, 'and to the guild member copy');
});

test('a second recheck is a no-op (idempotent)', async () => {
    const playerUid = 'recheck-idem';
    const adminToken = await registerAdmin('recheck-admin-2', 'RecheckAdmin2');

    await seedLocationScopePins();
    const def = await seedScopedAchievement(`map:${LOC_SCOPE_MAP_ID}`);
    await recomputeAchievementTargets(db);

    await seedUser(playerUid, 'RecheckIdem', { score: 0 });
    await seedCollectedPin(playerUid, LOC_PIN_A_UID);
    await seedCollectedPin(playerUid, LOC_PIN_B_UID);

    const first = await callCallable('recheckAchievementsHandle', { uid: playerUid }, adminToken);
    assert.equal(first.totalGranted, 1, 'first pass grants the badge');
    const scoreAfterFirst = (await userDoc(playerUid)).score;

    const second = await callCallable('recheckAchievementsHandle', { uid: playerUid }, adminToken);
    assert.equal(second.totalGranted, 0, 'nothing to grant on the second pass');

    const user = await userDoc(playerUid);
    assert.equal(user.score, scoreAfterFirst, 'score unchanged by the idempotent re-run');
    assert.equal(Object.keys(user.achievements).length, 1, 'still exactly one badge');
    assert.ok(def.uid, 'def used');
});

test('recheck with no uid processes every user and repairs each', async () => {
    const adminToken = await registerAdmin('recheck-admin-3', 'RecheckAdmin3');

    await seedLocationScopePins();
    const def = await seedScopedAchievement(`map:${LOC_SCOPE_MAP_ID}`);
    await recomputeAchievementTargets(db);

    for (const uid of ['recheck-all-a', 'recheck-all-b']) {
        await seedUser(uid, uid, { score: 0 });
        await seedCollectedPin(uid, LOC_PIN_A_UID);
        await seedCollectedPin(uid, LOC_PIN_B_UID);
    }

    const res = await callCallable('recheckAchievementsHandle', {}, adminToken);

    assert.ok(res.usersProcessed >= 3, 'processed both players and the admin');
    assert.equal(res.usersFailed, 0, 'no failures');
    assert.equal(res.totalGranted, 2, 'both players get the badge; the admin (no pins) gets nothing');

    for (const uid of ['recheck-all-a', 'recheck-all-b']) {
        const user = await userDoc(uid);
        assert.equal(user.collectedPinsByScope[`map:${LOC_SCOPE_MAP_ID}`], 2, `${uid} scope reconciled`);
        assert.ok(user.achievements[def.uid], `${uid} badge stamped`);
    }
});

test('a pending photo (awardedPoints 0) is not counted toward the scope', async () => {
    const playerUid = 'recheck-pending-photo';
    const adminToken = await registerAdmin('recheck-admin-4', 'RecheckAdmin4');

    // The fixture seeds exactly one active photo pin (PIN_PHOTO), so type:photo derives target 1.
    const def = await seedScopedAchievement('type:photo', { uid: 'test-type-photo' });
    await recomputeAchievementTargets(db);
    assert.equal((await achievementDoc(def.uid)).target, 1, 'one active photo pin in the fixture');

    await seedUser(playerUid, 'RecheckPendingPhoto', { score: 0 });
    // A pending submission: the collectedPins snapshot exists but awardedPoints is still 0.
    await seedCollectedPin(playerUid, PIN_PHOTO_UID, { type: 'photo', value: PIN_PHOTO_VALUE, awardedPoints: 0 });

    const res = await callCallable('recheckAchievementsHandle', { uid: playerUid }, adminToken);
    assert.equal(res.totalGranted, 0, 'a pending photo grants nothing');

    const user = await userDoc(playerUid);
    assert.equal(user.collectedPinsByScope['type:photo'] ?? 0, 0, 'pending photo not counted');
    assert.ok(!(def.uid in (user.achievements ?? {})), 'no badge from a pending photo');
});

test('recheckAchievementsHandle rejects a non-admin', async () => {
    const uid = 'recheck-nonadmin';
    const token = await createAuthUserToken(uid);
    await seedUser(uid, 'RecheckNonAdmin');

    await assert.rejects(
        () => callCallable('recheckAchievementsHandle', {}, token),
        /permission/i
    );
});

test('recheckAchievementsHandle requires auth', async () => {
    await assert.rejects(
        () => callCallable('recheckAchievementsHandle', {}, null),
        /permission/i
    );
});
