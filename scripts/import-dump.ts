/* eslint-disable no-console */
// Loads a scripts/dump-prod.ts archive INTO THE LOCAL EMULATOR, so the app can be run against real event
// data. Reverses the `__ts__`/`__ref__`/`__geo__`/`__bytes__` sentinels and rebuilds subcollections from
// each record's `_parentPath`. Run with `npm run emulators` up:
//   npx tsx scripts/import-dump.ts .prod-dump/<date> [--activate-pins] [--fresh pins,ranking]
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { Firestore, GeoPoint, getFirestore, Timestamp } from 'firebase-admin/firestore';

const EMULATOR_HOST = '127.0.0.1:8080';
const BATCH_LIMIT = 500;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
    const dumpDir = process.argv[2];
    if (!dumpDir || dumpDir.startsWith('--')) {
        console.error('usage: npx tsx scripts/import-dump.ts <dump-dir> [--activate-pins] [--fresh a,b]');
        process.exit(1);
    }

    // The mirror image of dump-prod.ts's guard. That script refuses to touch an emulator; this one refuses
    // to touch anything else. Writing an archive back over the live game would be unrecoverable.
    assertEmulatorTarget();

    const activatePins = process.argv.includes('--activate-pins');
    const fresh = (readFlag('--fresh') ?? '').split(',').map((s) => s.trim()).filter(Boolean);

    initializeApp({ projectId: 'qrcontest2023' });
    const db = getFirestore();

    const sourceDir = path.resolve(repoRoot, dumpDir, 'firestore');
    const files = (await fs.readdir(sourceDir)).filter((f) => f.endsWith('.json')).sort();

    for (const name of fresh) {
        const removed = await deleteCollection(db, name);
        console.log(`  cleared ${name} (${removed} docs)`);
    }

    let total = 0;
    for (const file of files) {
        const key = file.replace(/\.json$/, '');
        const leaf = key.split('__').pop() as string;
        const records = JSON.parse(await fs.readFile(path.join(sourceDir, file), 'utf8')) as Record<string, unknown>[];

        let batch = db.batch();
        let pending = 0;
        for (const record of records) {
            const { _id, _parentPath, ...rest } = record;
            const data = revive(rest) as Record<string, unknown>;
            if (activatePins && key === 'pins') {
                data.isActive = true;
            }
            const parent = typeof _parentPath === 'string' ? `${_parentPath}/${leaf}` : leaf;
            batch.set(db.doc(`${parent}/${_id}`), data);
            pending += 1;
            if (pending === BATCH_LIMIT) {
                await batch.commit();
                batch = db.batch();
                pending = 0;
            }
        }
        if (pending > 0) {
            await batch.commit();
        }
        total += records.length;
        console.log(`  ${key.padEnd(26)} ${records.length}`);
    }

    console.log(`\nImported ${total} documents into the emulator${activatePins ? ' (all pins forced active)' : ''}.`);
}

function assertEmulatorTarget(): void {
    process.env.FIRESTORE_EMULATOR_HOST ??= EMULATOR_HOST;
    const host = process.env.FIRESTORE_EMULATOR_HOST;
    const local = /^(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\]):\d+$/.test(host);
    if (local && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return;
    }
    console.error('ERROR: refusing to run - this script WRITES, and the target does not look like an emulator.');
    console.error(`       FIRESTORE_EMULATOR_HOST=${host}`);
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.error('       GOOGLE_APPLICATION_CREDENTIALS is set; unset it so no real project can be reached.');
    }
    process.exit(1);
}

function revive(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(revive);
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.__ts__ === 'number') {
            return Timestamp.fromMillis(record.__ts__);
        }
        if (typeof record.__ref__ === 'string') {
            return getFirestore().doc(record.__ref__);
        }
        if (Array.isArray(record.__geo__)) {
            const [lat, lng] = record.__geo__ as number[];
            return new GeoPoint(lat, lng);
        }
        if (typeof record.__bytes__ === 'string') {
            return Buffer.from(record.__bytes__, 'base64');
        }
        const out: Record<string, unknown> = {};
        Object.entries(record).forEach(([key, entry]) => {
            out[key] = revive(entry);
        });
        return out;
    }
    return value;
}

async function deleteCollection(db: Firestore, name: string): Promise<number> {
    const snapshot = await db.collection(name).get();
    let batch = db.batch();
    let pending = 0;
    for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        pending += 1;
        if (pending === BATCH_LIMIT) {
            await batch.commit();
            batch = db.batch();
            pending = 0;
        }
    }
    if (pending > 0) {
        await batch.commit();
    }
    return snapshot.size;
}

function readFlag(name: string): string | null {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : (process.argv[index + 1] ?? null);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
