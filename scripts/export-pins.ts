/* eslint-disable no-console */
// Merges the pins authored in the map editor (live emulator `pins` collection) with the existing seed and
// writes a REVIEW COPY - functions/src/seeds/pinsSeed.generated.ts. It never touches the real pinsSeed.ts;
// diff the copy and promote it by hand. Run via `npx tsx scripts/export-pins.ts` with `npm run emulators` up.
// `--prod <dump-dir>` instead rebuilds the seed from a scripts/dump-prod.ts archive, FULL REPLACE, no merge.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { Pin, PinType } from '../functions/src/types/pin';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seedRel = 'functions/src/seeds/pinsSeed.ts';
const defaultOutRel = 'functions/src/seeds/pinsSeed.generated.ts';

// The canonical seed-literal field order (from pinsSeed.ts.dist). Keys not listed are appended in their
// own order, so a new plain field on `Pin` still serializes without touching this script.
const KEY_ORDER = [
    'uid', 'name', 'description', 'clue', 'type', 'groups', 'mapId', 'coords', 'hintRadius', 'clueImage',
    'value', 'withQuestion', 'availableFrom', 'availableTo', 'isActive', 'code', 'collectedBy'
];

const PIN_TYPE_MEMBER: Record<string, string> = Object.fromEntries(
    Object.entries(PinType).map(([member, value]) => [value, member])
);

// Required (non-optional) Pin fields - every merged pin must carry them or the generated seed will not
// compile. `collectedBy` is forced in by serializePin and `clueImage` is optional, so both are absent here.
const REQUIRED_KEYS = [
    'uid', 'name', 'description', 'clue', 'type', 'groups', 'mapId', 'coords', 'hintRadius', 'value',
    'withQuestion', 'availableFrom', 'availableTo', 'isActive', 'code'
];

// The types the global scanner cross-looks-up by code (mirrors upsertPinHandle + collectPinHandle), so a
// code must be unique across them - a duplicate makes which pin a printed QR collects a coin toss.
const GLOBALLY_LOOKED_UP_TYPES: PinType[] = [PinType.CODE, PinType.GHOST, PinType.GEOCACHING];

async function main(): Promise<void> {
    const dumpDir = readFlag('--prod');
    const outRel = positionalArg() ?? defaultOutRel;
    const outPath = path.resolve(repoRoot, outRel);

    if (dumpDir !== null) {
        await exportFromDump(dumpDir, outPath, outRel);
        return;
    }

    const existing = await loadExistingSeed();
    const existingByUid = new Map(existing.map((p) => [p.uid, p]));

    const live = await readLivePins();

    const merged = new Map<string, Pin>(existingByUid);
    let created = 0;
    let updated = 0;
    let unchanged = 0;
    const liveUids = new Set<string>();
    for (const pin of live) {
        liveUids.add(pin.uid);
        const prev = existingByUid.get(pin.uid);
        if (!prev) {
            created += 1;
        } else if (canonical(prev) === canonical(pin)) {
            unchanged += 1;
        } else {
            updated += 1;
        }
        merged.set(pin.uid, pin);
    }

    const pins = Array.from(merged.values()).sort((a, b) => a.uid.localeCompare(b.uid));

    assertRequiredKeys(pins);
    assertUniqueCodes(pins);

    await fs.writeFile(outPath, render(pins), 'utf8');

    const absent = existing.filter((p) => !liveUids.has(p.uid)).map((p) => p.uid);
    console.log(`Merged ${pins.length} pins: ${created} new, ${updated} updated, ${unchanged} unchanged.`);
    console.log(`${absent.length} seed pins NOT present in the emulator (preserved): [${absent.join(', ')}]`);
    console.log(`\nWrote review copy: ${outRel}`);
    console.log(`Review:  git diff --no-index ${seedRel} ${outRel}`);
    console.log('Then replace pinsSeed.ts manually if the diff looks right.');
}

async function readLivePins(): Promise<Pin[]> {
    // Point the admin SDK at the local emulator BEFORE any Firestore call, and only on this path - the
    // --prod branch must never inherit it. Same port as firebase.json; the project id is the real one
    // `npm run emulators` uses (the demo-* id is a tests-only concern).
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    initializeApp({ projectId: 'qrcontest2023' });
    const snapshot = await getFirestore().collection('pins').get();
    return snapshot.docs.map((doc) => {
        const { collectedBy, ...rest } = doc.data() as Pin;
        return { ...rest, uid: doc.id } as Pin;
    });
}

// Rebuilds the seed from a scripts/dump-prod.ts archive. FULL REPLACE - prod is the source of truth for
// pins (they are authored in the live map editor), so the local seed's history is deliberately dropped:
// no loadExistingSeed, no merge. The hand-promote of the review copy is the only diff gate left.
async function exportFromDump(dumpDir: string, outPath: string, outRel: string): Promise<void> {
    const source = path.resolve(repoRoot, dumpDir, 'firestore', 'pins.json');
    const raw = JSON.parse(await fs.readFile(source, 'utf8')) as Record<string, unknown>[];
    const pins = raw
        .map((record) => {
            const { _id, _parentPath, collectedBy, ...rest } = record;
            return { ...(reviveTimestamps(rest) as object), uid: _id } as Pin;
        })
        .sort((a, b) => a.uid.localeCompare(b.uid));

    assertRequiredKeys(pins);
    assertUniqueCodes(pins);

    await fs.writeFile(outPath, render(pins), 'utf8');

    console.log(`Rebuilt ${pins.length} pins from ${path.relative(repoRoot, source)} (full replace, no merge).`);
    console.log(`\nWrote review copy: ${outRel}`);
    console.log(`Review:  git diff --no-index ${seedRel} ${outRel}`);
    console.log('Then replace pinsSeed.ts manually if the diff looks right.');
}

// dump-prod.ts writes every Timestamp as `{ __ts__: millis, iso }`; fromMillis restores it exactly.
function reviveTimestamps(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(reviveTimestamps);
    }
    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (typeof record.__ts__ === 'number') {
            return Timestamp.fromMillis(record.__ts__);
        }
        return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, reviveTimestamps(v)]));
    }
    return value;
}

function readFlag(name: string): string | null {
    const index = process.argv.indexOf(name);
    return index === -1 ? null : (process.argv[index + 1] ?? null);
}

// The out path stays a bare positional, so `--prod <dir>` and its value must not be mistaken for one.
function positionalArg(): string | null {
    const args = process.argv.slice(2);
    const index = args.indexOf('--prod');
    const skipped = index === -1 ? [] : [index, index + 1];
    return args.find((_, i) => !skipped.includes(i)) ?? null;
}

async function loadExistingSeed(): Promise<Pin[]> {
    try {
        const mod = await import('../functions/src/seeds/pinsSeed');
        return (mod.default as Pin[]) ?? [];
    } catch {
        // A bare checkout has only pinsSeed.ts.dist - start from nothing rather than crash.
        return [];
    }
}

// Guards a required Pin field from being silently dropped (as `collectedBy` was) - the generated seed
// would fail to compile. Fails loud before writing so a broken file never reaches the review diff.
function assertRequiredKeys(pins: Pin[]): void {
    const problems: string[] = [];
    for (const pin of pins) {
        const record = pin as unknown as Record<string, unknown>;
        const missing = REQUIRED_KEYS.filter((key) => !(key in record));
        if (missing.length > 0) {
            problems.push(`${(record.uid as string) ?? '<no uid>'}: missing [${missing.join(', ')}]`);
        }
    }
    if (problems.length > 0) {
        console.error('ERROR: merged pins are missing required Pin fields (the seed would not compile):');
        problems.forEach((p) => console.error('       ' + p));
        process.exit(1);
    }
}

// upsertPinHandle enforces code-uniqueness only against LIVE Firestore, so a merge that preserves a
// seed-only pin (deleted live) can reintroduce a duplicate code invisibly. Cross-check the merged set.
function assertUniqueCodes(pins: Pin[]): void {
    const byCode = new Map<string, string[]>();
    for (const pin of pins) {
        if (!GLOBALLY_LOOKED_UP_TYPES.includes(pin.type) || pin.code == null) {
            continue;
        }
        byCode.set(pin.code, [...(byCode.get(pin.code) ?? []), pin.uid]);
    }
    const collisions = Array.from(byCode.entries()).filter(([, uids]) => uids.length > 1);
    if (collisions.length > 0) {
        console.error('ERROR: duplicate code across code/ghost pins - a printed QR would collect a coin-toss pin:');
        collisions.forEach(([code, uids]) => console.error(`       ${code}: [${uids.join(', ')}]`));
        process.exit(1);
    }
}

// Stable comparison for the new/updated/unchanged tally: drop the runtime `collectedBy`, fold any
// Timestamp to millis, and sort keys so seed field order vs Firestore field order is not a false diff.
function canonical(pin: Pin): string {
    const { collectedBy, ...rest } = pin;
    // Drop null/undefined-valued keys so an absent optional field (e.g. clueImage on legacy seed entries)
    // compares equal to the explicit `null` the editor writes - otherwise every such pin is a false "updated".
    const defined = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== null && v !== undefined));
    return JSON.stringify(sortDeep(normalizeTimestamps(defined)));
}

function normalizeTimestamps(value: unknown): unknown {
    if (value instanceof Timestamp) {
        return value.toMillis();
    }
    if (Array.isArray(value)) {
        return value.map(normalizeTimestamps);
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeTimestamps(v)]));
    }
    return value;
}

function sortDeep(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(sortDeep);
    }
    if (value && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>).sort().reduce((acc, key) => {
            acc[key] = sortDeep((value as Record<string, unknown>)[key]);
            return acc;
        }, {} as Record<string, unknown>);
    }
    return value;
}

export function render(pins: Pin[]): string {
    // The Timestamp import is emitted only when some pin actually carries a window, so a null-only seed
    // stays free of an unused import.
    const needsTimestamp = pins.some((p) => p.availableFrom instanceof Timestamp || p.availableTo instanceof Timestamp);
    const header = '/* eslint-disable max-len */\n'
        + (needsTimestamp ? "import { Timestamp } from 'firebase-admin/firestore';\n" : '')
        + "import { Pin, PinType } from '../types/pin';\n\n"
        + 'const pinsSeed: Pin[] = [\n';
    const body = pins.map(serializePin).join(',\n');
    return header + body + '\n];\n\nexport default pinsSeed;\n';
}

function serializePin(pin: Pin): string {
    const record = pin as unknown as Record<string, unknown>;
    // `collectedBy` is stripped on read but is a required Pin field, so force it in (serializeField always
    // renders it `{}`). `clueImage` is omitted when null so the editor's explicit null does not churn the
    // legacy seed entries that authored it as absent. Every other key is emitted when present.
    const ordered = [
        ...KEY_ORDER.filter((k) => {
            if (k === 'collectedBy') {
                return true;
            }
            if (k === 'clueImage') {
                return record[k] != null;
            }
            return k in record;
        }),
        ...Object.keys(record).filter((k) => !KEY_ORDER.includes(k))
    ];
    const lines = ordered.map((key) => `        ${key}: ${serializeField(key, record[key])}`);
    return '    {\n' + lines.join(',\n') + '\n    }';
}

function serializeField(key: string, value: unknown): string {
    if (key === 'collectedBy') {
        return '{}'; // runtime finder map - the seed always carries it empty.
    }
    if (key === 'type') {
        const member = PIN_TYPE_MEMBER[value as string];
        if (!member) {
            throw new Error(`unknown PinType value: ${String(value)}`);
        }
        return `PinType.${member}`;
    }
    return serializeInline(value);
}

// Everything nested inside a pin renders on one line (coords, groups, primitives), matching the seed style.
function serializeInline(value: unknown): string {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (value instanceof Timestamp) {
        return `Timestamp.fromMillis(${value.toMillis()})`;
    }
    if (typeof value === 'string') {
        return toSingleQuoted(value);
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map(serializeInline).join(', ') + ']';
    }
    if (typeof value === 'object') {
        // Only plain objects (coords, collectedBy) render generically. A Firestore class instance -
        // GeoPoint, DocumentReference, a stray FieldValue - would otherwise dump garbage internal keys.
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
            throw new Error(`cannot serialize non-plain object: ${value.constructor?.name ?? 'unknown'}`);
        }
        const entries = Object.entries(value as Record<string, unknown>);
        if (entries.length === 0) {
            return '{}';
        }
        return '{ ' + entries.map(([k, v]) => `${k}: ${serializeInline(v)}`).join(', ') + ' }';
    }
    throw new Error(`cannot serialize value of type ${typeof value}`);
}

// JSON.stringify does all the hard escaping (backslashes, quotes, control chars, non-ASCII); we only remap
// the quote characters to produce a valid SINGLE-quoted literal, matching the seed's style.
function toSingleQuoted(text: string): string {
    const json = JSON.stringify(text);
    return "'" + json.slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'") + "'";
}

const invokedDirectly = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
