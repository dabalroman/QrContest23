/* eslint-disable no-console */
// Read-only archive of the LIVE project into ./.prod-dump/<YYYY-MM-DD>/ - Firestore (recursive), the
// user-submitted Storage photos, the Auth user list and the function logs. Everything downstream (the
// postmortem, `export-pins.ts --prod`) reads the archive, never Firestore. Run with a VIEWER-ONLY service
// account: `GOOGLE_APPLICATION_CREDENTIALS=~/…json npx tsx scripts/dump-prod.ts`.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import {
    CollectionReference, DocumentReference, GeoPoint, getFirestore, QueryDocumentSnapshot, Timestamp
} from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const PROJECT_ID = 'qrcontest2023';
// Probed against the live project - the newer `.firebasestorage.app` host 404s here. Same convention as
// functions/src/actions/photoStorage.ts.
const BUCKET = `${PROJECT_ID}.appspot.com`;

// scripts/export-pins.ts defaults FIRESTORE_EMULATOR_HOST when it is unset, and a shell that has one
// exported would send this script at an empty emulator and report a confident, empty archive. Refuse.
const EMULATOR_VARS = [
    'FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST', 'STORAGE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_EMULATOR_HUB'
];

const PHOTO_PREFIX = 'users/';
const DEFAULT_LOG_LINES = 20000;
// The 2026 edition. Used only to report whether `functions:log` reached back far enough.
const EVENT_START_ISO = '2026-07-24T00:00:00.000Z';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type Json = unknown;
type DumpRecord = { [key: string]: Json };

async function main(): Promise<void> {
    assertNoEmulator();
    assertCredentials();

    const logLines = readNumberFlag('--log-lines') ?? DEFAULT_LOG_LINES;
    const outDir = path.join(repoRoot, '.prod-dump', localDateStamp());
    await fs.mkdir(path.join(outDir, 'firestore'), { recursive: true });
    await fs.mkdir(path.join(outDir, 'photos'), { recursive: true });
    await fs.mkdir(path.join(outDir, 'auth'), { recursive: true });
    await fs.mkdir(path.join(outDir, 'logs'), { recursive: true });

    console.log(`Dumping ${PROJECT_ID} -> ${path.relative(repoRoot, outDir)}`);
    console.log(`Credentials: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}\n`);

    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID, storageBucket: BUCKET });

    const collections = await dumpFirestore(outDir);
    const photos = await dumpPhotos(outDir, collections.get('photoSubmissions') ?? []);

    // Both legs below shell out to the CLI login rather than the service account, so a stale `firebase
    // login` must not throw away a completed Firestore + photo dump. Report and carry on.
    const auth = await runSoftly('auth', () => dumpAuth(outDir));
    const logs = await runSoftly('logs', () => dumpLogs(outDir, logLines));

    const counts: { [collection: string]: number } = {};
    Array.from(collections.keys()).sort().forEach((key) => {
        counts[key] = (collections.get(key) as DumpRecord[]).length;
    });

    await writeJson(path.join(outDir, 'meta.json'), {
        projectId: PROJECT_ID,
        bucket: BUCKET,
        dumpedAt: new Date().toISOString(),
        firestore: counts,
        photos: photos,
        auth: auth,
        logs: logs
    });

    console.log(`\nDone: ${path.relative(repoRoot, outDir)}`);
}

function assertNoEmulator(): void {
    const set = EMULATOR_VARS.filter((name) => process.env[name]);
    if (set.length === 0) {
        return;
    }
    console.error('ERROR: emulator environment detected - this script must only ever read PRODUCTION.');
    set.forEach((name) => console.error(`       ${name}=${process.env[name]}`));
    console.error('       Unset them (a fresh shell is easiest) and re-run.');
    process.exit(1);
}

function assertCredentials(): void {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        return;
    }
    console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS is not set.');
    console.error('       Point it at the READ-ONLY service-account key (roles/datastore.viewer +');
    console.error('       roles/storage.objectViewer), stored OUTSIDE this repo - it is public:');
    console.error('         export GOOGLE_APPLICATION_CREDENTIALS=$HOME/<key>.json');
    console.error('       Do NOT use the default Firebase Admin SDK key; it can write to the live game.');
    process.exit(1);
}

// Root listCollections(), then listCollections() on every document. A hardcoded list would miss the
// per-user subcollections (collectedPins/collectedCards/collectedQuestions) and anything undocumented.
// Records group by COLLECTION-ID path, so users/a/collectedPins and users/b/collectedPins share one file.
async function dumpFirestore(outDir: string): Promise<Map<string, DumpRecord[]>> {
    const db = getFirestore();
    const byPath = new Map<string, DumpRecord[]>();

    let level: CollectionReference[] = await db.listCollections();
    while (level.length > 0) {
        const next: CollectionReference[] = [];
        for (const collection of level) {
            const key = collectionKey(collection.path);
            const snapshot = await collection.get();
            const bucket = byPath.get(key) ?? [];
            snapshot.docs.forEach((doc) => bucket.push(toRecord(doc)));
            byPath.set(key, bucket);

            const children = await chunkedMap(snapshot.docs, 10, (doc) => doc.ref.listCollections());
            children.forEach((refs) => next.push(...refs));
        }
        level = next;
    }

    const keys = Array.from(byPath.keys()).sort();
    for (const key of keys) {
        const records = byPath.get(key) as DumpRecord[];
        await writeJson(path.join(outDir, 'firestore', `${key}.json`), records);
        console.log(`  firestore/${key}.json  ${records.length}`);
    }
    return byPath;
}

function collectionKey(collectionPath: string): string {
    return collectionPath.split('/').filter((_, index) => index % 2 === 0).join('__');
}

function toRecord(doc: QueryDocumentSnapshot): DumpRecord {
    const parent = doc.ref.parent.parent;
    return {
        _id: doc.id,
        _parentPath: parent ? parent.path : null,
        ...(serializeValue(doc.data(), doc.ref.path) as DumpRecord)
    };
}

// Lossless and explicit: `__ts__` millis rebuild a Timestamp exactly (export-pins --prod does), `iso`
// keeps the files readable. Anything unrecognized THROWS naming its path rather than dumping garbage.
function serializeValue(value: unknown, at: string): Json {
    if (value === null || value === undefined) {
        return null;
    }
    if (value instanceof Timestamp) {
        return { __ts__: value.toMillis(), iso: value.toDate().toISOString() };
    }
    if (value instanceof DocumentReference) {
        return { __ref__: value.path };
    }
    if (value instanceof GeoPoint) {
        return { __geo__: [value.latitude, value.longitude] };
    }
    if (Buffer.isBuffer(value)) {
        return { __bytes__: value.toString('base64') };
    }
    if (Array.isArray(value)) {
        return value.map((entry, index) => serializeValue(entry, `${at}[${index}]`));
    }
    if (typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
            const name = (value as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
            throw new Error(`cannot serialize ${name} at ${at}`);
        }
        const out: DumpRecord = {};
        Object.entries(value as DumpRecord).forEach(([key, entry]) => {
            out[key] = serializeValue(entry, `${at}.${key}`);
        });
        return out;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    throw new Error(`cannot serialize value of type ${typeof value} at ${at}`);
}

type PhotoManifestEntry = {
    objectPath: string;
    localFile: string;
    contentType: string | null;
    size: number | null;
    updated: string | null;
    submissionUid: string | null;
};

// Downloads every object under users/, not just the ones a submission doc points at. An object with no
// submission means the upload landed but submitPhotoHandle never completed - a drop-off signal that
// exists nowhere in Firestore. The reverse (a submission whose object is gone) is recorded too.
async function dumpPhotos(outDir: string, submissions: DumpRecord[]): Promise<Json> {
    const uidByPath = new Map<string, string>();
    submissions.forEach((sub) => {
        if (typeof sub.storagePath === 'string') {
            uidByPath.set(sub.storagePath, String(sub._id));
        }
    });

    const [files] = await getStorage().bucket(BUCKET).getFiles({ prefix: PHOTO_PREFIX });
    console.log(`\n  ${files.length} storage objects under ${PHOTO_PREFIX}`);

    const entries: PhotoManifestEntry[] = [];
    let done = 0;
    await chunkedMap(files, 6, async (file) => {
        const contentType = file.metadata.contentType ?? null;
        const localFile = `${file.name.split('/').join('__')}${extensionFor(contentType)}`;
        await file.download({ destination: path.join(outDir, 'photos', localFile) });
        entries.push({
            objectPath: file.name,
            localFile,
            contentType,
            size: file.metadata.size == null ? null : Number(file.metadata.size),
            updated: file.metadata.updated ?? null,
            submissionUid: uidByPath.get(file.name) ?? null
        });
        done += 1;
        if (done % 25 === 0 || done === files.length) {
            console.log(`  downloaded ${done}/${files.length}`);
        }
    });

    entries.sort((a, b) => a.objectPath.localeCompare(b.objectPath));
    const objectPaths = new Set(entries.map((entry) => entry.objectPath));
    const missing = submissions
        .filter((sub) => typeof sub.storagePath === 'string' && !objectPaths.has(sub.storagePath))
        .map((sub) => ({ submissionUid: String(sub._id), storagePath: String(sub.storagePath) }));
    const orphans = entries.filter((entry) => entry.submissionUid === null).map((entry) => entry.objectPath);

    const summary = {
        bucket: BUCKET,
        objectCount: entries.length,
        submissionCount: submissions.length,
        orphanCount: orphans.length,
        missingObjectCount: missing.length
    };
    await writeJson(path.join(outDir, 'photos', 'manifest.json'), {
        ...summary,
        objects: entries,
        orphans,
        missingObjects: missing
    });
    console.log(`  photos/manifest.json  ${orphans.length} orphaned, ${missing.length} missing object(s)`);
    return summary;
}

function extensionFor(contentType: string | null): string {
    // Storage paths are users/{uid}/photos/{pinUid} - no extension at all (photoStoragePath).
    const known: { [type: string]: string } = {
        'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic'
    };
    return known[contentType ?? ''] ?? '.bin';
}

async function dumpAuth(outDir: string): Promise<Json> {
    const target = path.join(outDir, 'auth', 'users.json');
    firebaseCli(['auth:export', target, '--project', PROJECT_ID, '--format=json']);
    const parsed = JSON.parse(await fs.readFile(target, 'utf8')) as { users?: unknown[] };
    const count = parsed.users?.length ?? 0;
    console.log(`\n  auth/users.json  ${count}`);
    return { userCount: count };
}

// Cloud Logging's _Default bucket retains 30 days, so the event's function logs are the one leg of this
// archive with an expiry. `functions:log` has no time filter, only -n, so pull a large window and REPORT
// the oldest entry actually captured - a silently truncated window would look like a complete archive.
async function dumpLogs(outDir: string, lines: number): Promise<Json> {
    let raw: string;
    let format: string;
    try {
        raw = firebaseCli(['functions:log', '-n', String(lines), '--project', PROJECT_ID, '--json']);
        format = 'json';
    } catch {
        raw = firebaseCli(['functions:log', '-n', String(lines), '--project', PROJECT_ID]);
        format = 'text';
    }
    await fs.writeFile(path.join(outDir, 'logs', `functions-raw.${format === 'json' ? 'json' : 'log'}`), raw, 'utf8');

    const stamps = (raw.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g) ?? []).sort();
    const oldest = stamps[0] ?? null;
    const newest = stamps[stamps.length - 1] ?? null;
    const reachedEventStart = oldest !== null && oldest <= EVENT_START_ISO;

    console.log(`\n  logs/functions-raw.${format === 'json' ? 'json' : 'log'}  oldest=${oldest} newest=${newest}`);
    if (!reachedEventStart) {
        console.log(`  WARNING: the log window does not reach ${EVENT_START_ISO}.`);
        console.log(`  Re-run with a larger --log-lines, or pull the rest via the Cloud Logging API`);
        console.log('  (entries.list) after granting the read-only service account roles/logging.viewer.');
    }
    return { format, requestedLines: lines, oldest, newest, reachedEventStart };
}

function firebaseCli(args: string[]): string {
    return execFileSync('npx', ['firebase', ...args], {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 512 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'inherit']
    });
}

async function runSoftly(label: string, leg: () => Promise<Json>): Promise<Json> {
    try {
        return await leg();
    } catch (error) {
        console.error(`\n  WARNING: the ${label} leg failed - the rest of the dump is intact.`);
        console.error(`  ${error instanceof Error ? error.message : String(error)}`);
        console.error(`  Fix it (usually \`npx firebase login --reauth\`) and re-run to refill ${label}/.`);
        return { failed: true, error: error instanceof Error ? error.message : String(error) };
    }
}

async function chunkedMap<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = [];
    for (let index = 0; index < items.length; index += size) {
        const chunk = await Promise.all(items.slice(index, index + size).map(fn));
        results.push(...chunk);
    }
    return results;
}

function readNumberFlag(name: string): number | null {
    const index = process.argv.indexOf(name);
    if (index === -1) {
        return null;
    }
    const value = Number(process.argv[index + 1]);
    return Number.isFinite(value) ? value : null;
}

function localDateStamp(): string {
    const now = new Date();
    const pad = (value: number): string => String(value).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function writeJson(target: string, value: Json): Promise<void> {
    await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
