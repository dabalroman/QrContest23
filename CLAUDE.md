# QrContest — Fantasmagoria

A mobile-first web game played during the **Fantasmagoria** fantasy convention in Gniezno, Poland. Players
explore an in-app map, find **pins** (scan a hidden QR, solve a riddle, visit a place, rate a talk, photograph
something), answer quiz questions, unlock achievements, and climb a live leaderboard. Runs ~3 days a year,
~150 players, 100k+ Firestore ops — there is no calm redeploy window mid-event. **Task #9 in the task manager
is the live status board; this file is the reference.**

⚠️ **The 2025 card game and the club/guild system are RETIRED but still in the codebase** — see §7f.

⚠️ **The entire UI is in Polish.** Never introduce English user-facing copy.

⚠️ **The user-facing name is "Gra Konwentowa"** — "QrContest" is only the repo/package/project id. It is a
declinable Polish phrase and **must inflect**: nom. `Gra Konwentowa`, loc. (after `w/o`) `Grze Konwentowej`,
gen. `Gry Konwentowej`. A find-replace that ignores this produces broken grammar (`Nagrody w Gra Konwentowa`).
The `QrContestSplash` identifier, `/dashboard/qrContest.webp`, the npm name and the `qrcontest2023` project id
deliberately keep the old name.

---

## 1. Stack

Next.js 13.5 (**pages router**) · React 18 · TS 5.8 · Tailwind 3.4 + CSS custom properties ·
FontAwesome · `react-hook-form` · `react-hot-toast` · `qr-scanner` · Firebase JS SDK **v9 modular**.
Backend: Cloud Functions **v2** (`firebase-functions` v6), Node 20, `firebase-admin` 12, Firestore, Firebase
Auth (Google popup + email/password), Hosting with `frameworksBackend` (Next.js SSR on Cloud Functions).

- Project id **`qrcontest2023`** (historical name, still live). Hosting site **`fantas`**.
- Region **`europe-west1`** for both, set via `setGlobalOptions` in `functions/src/index.ts` and read
  client-side from `NEXT_PUBLIC_FIREBASE_REGION`. If those disagree every callable fails with a CORS/404.
- ⚠️ **Off-season the project runs on Spark**, so Gen-2 callables 503, surfacing as *"CORS header … missing"*.
  Real cause is in `npx firebase functions:log` ("billing is disabled"). Fix = re-enable **Blaze**, no
  redeploy. **Check billing before debugging CORS.**

---

## 2. Commands

```bash
npm run dev                            # FE dev server (binds 0.0.0.0 so a LAN phone can reach it)
npm run lint                           # = next lint — does NOT cover functions/, never linted .tsx
npx tsc --noEmit                       # fast client-tree typecheck
npm run verify                         # the FULL pre-commit pipeline (~50-70s). Needs the emulator ports free.

npm run emulators                      # functions, firestore, auth, storage, pubsub; imports/exports ./.emulators
cd functions && npm run build          # or build:watch — REQUIRED before the emulator sees any change
cd functions && rm -rf lib && npm run build   # REQUIRED after renaming/deleting a source file

firebase deploy --only hosting,firestore,functions

npm run emulators:test                 # hermetic emulator on the demo-qrcontest project (terminal 1)
cd functions && npm test               # node:test suite against the real callables (terminal 2)
./scripts/emu-test.sh [cmd...]         # one-shot: builds, waits, tears down, propagates exit code
```

- **The emulator loads `functions/lib/index.js`, never the TS source.** Build first.
- **`tsc` never deletes outputs for renamed/removed sources** — the stale `lib/*.js` survives and a running
  emulator keeps answering `500` on the dead route. `rm -rf lib`, rebuild, restart.
- **The pre-commit hook runs the full pipeline** — it fails while a manual emulator holds the ports (§9a) or
  `npm run dev` holds `.next`.
- `firebase` is a local devDependency → **`npx firebase …`**, starting unauthenticated. Deploy `401` →
  `firebase login --reauth`. Weird deploy failures → stale `firebase-tools`.
- One-time per machine: `npx firebase experiments:enable webframeworks` (the emulator won't boot without it,
  even with `--only functions,firestore`). The Firestore emulator is a JVM app — **needs Java**, or it
  silently fails to start. Ready signal `✔ All emulators ready`; UI `:4000`, hub `:4400`.

### First-time setup on a bare checkout

`npm install` at the **root and in `functions/`** (two separate trees), then three gitignored prerequisites:

1. **`functions/src/seeds/*.ts`** — shipped in a password-protected zip; only `*.ts.dist` placeholders are in
   git. `seedDatabaseHandle` imports five (rankingRounds, questions, pins, pinGroups, achievements) and `tsc`
   fails without those. ⚠️ The four retired ones are imported nowhere, so **a green build does not mean the
   seed set is complete.**
2. **`functions/.env`** — copy `.env.dist`, fill `ADMIN_EMAILS`/`DASHBOARD_EMAILS`, or the `prebuild` hook
   fails the functions build, `npm run verify`, the hook and every deploy.
3. **`.env.development`** — copy `.env.dist`, set `NEXT_PUBLIC_EMULATOR=true`.

`configuration.ts` is the single place that reads `process.env`. Notable vars beyond the standard Firebase set:

- `NEXT_PUBLIC_EMULATOR=true` — makes `utils/firebase.ts` call `connect*Emulator` on all four SDKs.
- `NEXT_PUBLIC_CODE_COLLECT_URL` — the prefix baked into printed QR codes; `CodeScanner` strips it to recover
  the raw code. ⚠️ **If wrong, the scanner silently ignores every valid code.**
- `NEXT_PUBLIC_DASHBOARD_API_URL` — Fantasmagoria's JSON-RPC endpoint for the TV dashboard.
- `NEXT_PUBLIC_APPCHECK_*` — **declared but never used.** Dead config.

---

## 3. Directory layout

Mostly self-evident from `ls`; the parts that aren't:

- `models/` = **client** domain classes; `functions/src/types/` = the **admin** mirror (§4).
- `functions/src/` — handlers at the root, `actions/` for shared transaction helpers, `achievements/` for the
  grant engine, `seeds/`, `data/forbiddenPhrases.ts`.
- `utils/functions.ts` is the single declaration site for every typed callable; `utils/maps.ts` is the map
  registry (§7e); `configuration.ts` (repo root) is the only reader of `process.env`.
- `public/maps/` — the 9 map images. **Filenames must match the registry in `utils/maps.ts`.**
- `helpers/` — XnConvert batch scripts and LLM prompt starters. **Not code.**

---

## 4. The two parallel type worlds ⚠️

The most important architectural quirk. **Every domain concept is defined twice:**

| | Client | Cloud Functions |
|---|---|---|
| Location | `models/*.ts` | `functions/src/types/*.ts` |
| Shape | **Classes** extending `FirebaseModel` with `toFirestore`/`fromFirestore` | **Plain types** using admin `Timestamp`/`FieldValue` |
| Dates | `Date` | `Timestamp \| FieldValue` |
| Collections-as-maps | **arrays** after `fromFirestore` | **maps keyed by uid** |

The client uses `withConverter(Model.getConverter())` everywhere, so snapshots come back as class instances.
`FirebaseModel.toFirestore` throws by default and `User`, `Guild`, `Question`, `RankingRound`, `CardClue` and
`Card` keep it throwing — **the client never writes them.** The editor flags their unused `data` param as TS
`[6133]`; spurious (`noUnusedParameters` is off), match the signature rather than "fixing" it.

The two worlds are **not** generated from each other. Type-only cross-imports are fine and get elided
(`import { CardTier } from '@/functions/src/types/card'` — `@/*` maps to the repo root).

⚠️ **`functions/src/actions/rankingOrder.ts` crosses the boundary with real RUNTIME code** — it is the one
ordering both worlds sort by (§7b), so it is bundled into the browser. It **must not import `firebase-admin`**
(nor `firebase-functions/logger`; it uses `console.warn`), and takes timestamps as `unknown` narrowed by a
structural `{ toDate(): Date } | Date | number` duck-type, since `updatedAt`/`scoreUpdatedAt` are
`Timestamp | FieldValue | number` server-side and `Date` client-side. Any future shared runtime helper
inherits this rule.

**Consequence:** a new field or entity means editing *both* sides, plus the rules, plus the seed (§10).

---

## 5. Firestore data model

Collection names live in `Enum/FireDoc.ts` — **but that enum is incomplete.** The real set:

| Path | Written by | Read by |
|---|---|---|
| `users/{uid}` | functions | owner + admins |
| `users/{uid}/collectedCards/{cardUid}` · `collectedPins/{pinUid}` | functions | owner |
| `users/{uid}/collectedQuestions/collectedQuestions` ❌ | functions | **nobody** (no rule → denied) |
| `users-usernames/{username}` | functions | any authed user (uniqueness check) |
| `cards/{cardUid}` | functions | admins |
| `pins/{pinUid}` | functions + seed | **admins only** — the `code` is inline |
| `pinGroups/{groupUid}` | seed | any authed user (taxonomy, nothing secret) |
| `photoSubmissions/{subUid}` | functions | **own only** (`resource.data.userUid == uid`); admins via callable |
| `cardSets` · `clues` · `guilds` · `ranking` · `achievements` | seed / functions | any authed user |
| `questions/questions` ❌ | seed | **nobody** (no rule → denied) |

❌ = missing from `FireDoc`; those paths are string literals in the functions.

1. **`questions` is a single document** holding all questions keyed by uid *including `correct`* — unreachable
   from the client by design, so the answer never leaves the server. `collectedQuestions` is likewise one doc
   per user. Both are deliberately absent from `firestore.rules`.
2. **`collectedCards`/`collectedPins` are per-user snapshot copies, not references.** For pins that is a hard
   requirement, not an optimisation: `pins` is admin-only read, so the snapshot is the *only* way a player's
   client learns what it found. It omits `code` and `collectedBy` (asserted in `pins.test.mjs`).
3. `photoSubmissions` is the **only** collection whose read rule is a field filter rather than an owner
   subcollection or a flat allow.

**Fan-out.** Score is duplicated in four places, kept in sync inside transactions (§7c):

```
users/{uid}.score
  → ranking/{round}.users[uid].score   (actions/updateRanking.ts — only rounds whose `to` is future)
  → guilds/{guild}.members[uid].score  (actions/updateGuild.ts)
  → guilds/{guild}.score               (recomputed by summing members each time, to self-heal drift)
```

---

## 6. Security model — **all client writes are denied**

`firestore.rules` is **`allow write: if false`** on every collection, no exception. **No new feature may open
a client write path to game state, and anything awarding points must be transactional.** Every mutation goes
through an authenticated callable, declared once in `utils/functions.ts`:

| Callable | What it does |
|---|---|
| `setupAccountHandle` | Creates the user doc + username reservation + empty `collectedQuestions`. Validates username (3–20 chars, regex allowlist, `forbiddenPhrases` blocklist). Assigns `role` from `functions/.env` via `actions/roleForEmail.ts` — **the only place `role` is ever written** (§9). |
| `collectPinHandle` | The 2026 collect path — **fork THIS for any new pin flow.** Three entry shapes: `{code}` (global scanner, cross-pin lookup filtered to the code-entering types), `{pinUid, answer}` (map sheet), `{pinUid, rating, talkName}` (feedback, skips the question draw). Rejects `photo`. |
| `getPinsHandle` | **Read-only.** The map's pin feed and the client's only way into `pins`. Strips `code` + `collectedBy` via an explicit whitelist (`actions/toPublicPin.ts`), filters `isActive` + the availability window. |
| `upsertPinHandle` / `deletePinHandle` | **Admin-only.** Map-native editor. Upsert is always the complete authored field set, never a partial patch; validates `groups[]` against `pinGroups`. Both then run `recomputeAchievementTargets`. |
| `submitPhotoHandle` | Photo-proof pins. Client uploads to Storage first; this marks the pin **pending** — `collectedPins` with `awardedPoints: 0`, a `photoSubmissions` doc, `user.pendingScore += value`. **No points, no fan-out.** |
| `reviewPhotoHandle` | **Admin-only, idempotent.** Approve → awards via `awardPoints` from the snapshotted `sub.value`/`sub.scopeKeys` (never re-reads the pin). Reject → deletes `collectedPins` + the pin's `collectedBy` entry so the pin **reopens**. Both clear `pendingScore`. |
| `getPhotoSubmissionsHandle` | **Admin-only, read-only.** The review queue; photos as server-built download-token URLs (no signBlob). |
| `answerQuestionHandle` | Grades server-side, awards `value` or `0`, fans out. Rejects re-answering. Shared by cards and pins. |
| `collectCardHandle` · `joinGuildHandle` | Retired (§7f) — still deployed, nothing in the UI calls them. |
| `seedDatabaseHandle` | Admin-only + **hardcoded password `'4064'`**. Seeds questions, rounds, pins, pinGroups, achievements, then `recomputeAchievementTargets` (§9). |
| `updateRoundsHandle` / `autoUpdateRounds` | Manual admin trigger, and the **scheduled** hourly `0 * * * *` job that closes rounds and stamps winners (§7b). |

**Storage** is `allow read, write: if false` except **`/users/{uid}/photos/{pinUid}`** (owner + `<10MB` +
`image/*`, overwrite allowed) — the only place a client writes directly to Firebase infrastructure. Overwrite
rather than create-only is deliberate: create-only orphans an object when a `submitPhotoHandle` call drops.

### Auth flow

`hooks/useUserData.ts` subscribes to `onSnapshot(users/{authUid})` and exposes `{ authUser, authLoading, user,
userLoading, userReady }` via `UserContext`. `userReady` = "a user doc with a username exists".

`components/AuthCheck.tsx` wraps every page in `_app.tsx` with a hard-coded `publicRoutes` allowlist (main,
login/register + email variants, account-setup, collect, rulebook, faq). A visitor with no user doc on any
other known route is `router.replace`d to the landing page (`replace`, not `push`, or Back re-redirects); only
an unknown URL gets `Custom404`. **`/collect` is intentionally public** so a first-time scanner lands somewhere
sane; it stashes the code (`utils/pendingCode.ts`, sessionStorage, single-use, cleared inside
`destinationAfterAuth()`) so registration ends back on `/collect/:code` prefilled.

⚠️ **`AuthCheck` must never render `children` while `user` is unresolved.** `useAdminOnly` bounces to
`/collect` on `!user` and only stays out of the way because the admin page never mounts — rendering
optimistically to "avoid the loader flash" throws **legitimate admins** off every admin page.

⚠️ **`hasAccount` is in the effect's dep list on purpose** — losing the account is itself the trigger, and
nothing else in the deps changes at that moment.

⚠️ **`userLoading`/`userReady` are DERIVED, never `useState` + effect** (`userLoading = !!authUid &&
loadedForUid !== authUid`). Effect-set state is stale on the render `authUser` first appears, reporting
"resolved, no account" — and every consumer routes on it. Two further traps: the **`!authUid` branch must
resolve to not-loading**, or a signed-out visitor never gets a snapshot and the whole app pins on `<Loader/>`
for 100% of players; and the subscription must key on the **uid string**, not the `authUser` object, or
identity churn flips `userLoading` into a full-screen Loader mid-game.

**Roles** (`Enum/UserRole.ts`): `user`, `admin` (unlocks `/admin/*` via `useAdminOnly`), `dashboard`
(force-redirected to `/dashboard` and kept there — the TV account, not a player).

---

## 7. Game mechanics

### 7a. Pins — the 2026 collectible

`functions/src/types/pin.ts`. Each `PinType` has its own flow, colour (`--color-pin-*`) and icon
(`utils/getPinIcon.ts`):

| Type | How it's collected | Entry point |
|---|---|---|
| `code` | scan/enter a printed QR code | `/collect/:code` **and** the map sheet |
| `riddle` | type the answer to a riddle | map sheet only |
| `visit` | be there and tap collect | map sheet only |
| `feedback` | rate a room's talk (`rating` 1–5 + `talkName`) | map sheet only |
| `photo` | upload a photo, admin approves | map sheet only, via `submitPhotoHandle` |
| `ghost` | type a code hidden in the app's own copy | `/collect/:code` **and** the map sheet |
| `geocaching` | find a physical cache, enter the code inside | `/collect/:code` **and** the map sheet |

⚠️ **`code`, `ghost` and `geocaching` are the ONLY types the global `/collect` input resolves.** `riddle` is
deliberately excluded — its free-text answer would be brute-forceable across every pin. That holds only
because all three are 10-char `[A-Z0-9]` (one shared `CODE_PATTERN`, codes must not collide) and the length
check runs *before* the query.

**`entersCode()` in `Enum/PinType.ts`** is the predicate for those three, driving the code label, the
`ABCDEFGHIJ` placeholder, `maxLength`, the 10-char submit gate and the camera button. It was copy-pasted into
`PinEditorForm` and `PinSheet` once; keep it single. ⚠️ Not the same as `needsCode` (adds `riddle`,
editor-local) — a riddle has an answer to validate but nothing to scan.

Ghosts are **omitted from `PinTypeLegend`** (finding one is a surprise); geocaching is **shown**, and its
`PinSheet` renders a "Czym jest Geocaching?" explainer — the one type-specific card in the sheet.

Points are per-pin (`value`), not tiered. `withQuestion: true` draws a quiz question on top (never for
`feedback`). ⚠️ **Riddle answers are matched with `trim()` + `toUpperCase()` only** — no diacritic folding, no
inner-whitespace collapse. Author them short, single-token, ASCII-safe.

**Questions.** Values `0 | 5 | 10 | 15`. Draws a random question the user has *not seen yet* from a global,
not per-pin, pool. A wrong answer still burns the question and still increments `amountOfAnsweredQuestions`.
No time limit — a drawn question sits with `answer: null` indefinitely. ⚠️ **Every seeded question puts the
correct answer in slot `a` with `correct: 'a'`**, without exception. Not a leak, and must not be "fixed" by
scattering answers across b/c/d: `QuestionPinView` shuffles before rendering and `correct` never leaves the
server. Authoring the key elsewhere buys nothing and breaks the one invariant that makes the pool skimmable.

### 7b. Rounds and ranking

`ranking/{uid}` docs with `from`/`to`. Points **carry over** between rounds. The hourly `autoUpdateRounds`
marks a round `finished` and stamps `winnerInRound` on the top 3; a stamped user is excluded from later
rounds' prizes but keeps playing.

⚠️ **Author every round's `to` one second before the hour, never on it.** `updateRoundsProcessor` filters
`!finished && to <= now` and the cron fires `0 * * * *`, so a `to` of exactly `12:00:00` ties the tick and the
round can wait a full extra hour. The admin's *"Sprawdź i zamknij rundy"* runs the same processor on demand
and is the only in-policy recovery if the cron misses; it **cannot** force a round closed early, so
`"Nothing to do, no rounds to finish."` is a normal result. Its three return strings are deliberately
**English** (admin-only, identical to the logs) — do not translate them.

⚠️ **The winners list and the live ranking are ONE ordering, and must stay one.** For a finished round
`pages/ranking.tsx` renders *"Mistrzowie rundy"* and *"Ranking rundy"* as two filters over the **same** sorted
array, so any disagreement is visible in one glance next to a physical prize:

```
users.filter(isVisibleInRound).slice(0, 3)  ===  users.filter(r => r.winnerInRound === round.uid)
```

Both sides go through **`actions/rankingOrder.ts`** — `orderRankingEntries` (score desc → `scoreUpdatedAt`
asc, older score wins → `uid` asc) and `isVisibleInRound`, which doubles as the server's prize-eligibility
filter. The `uid` key stops anything falling back to Firestore map key order. **Never re-implement either on
one side.** Three consequences in `updateRoundsProcessor`: it reads round docs **inside** the transaction (for
the read-set, §7c) and stamps **only the `users.<uid>.winnerInRound` field path**, since writing the record
back would replay a pre-close snapshot over a boundary award; `crownedThisPass` stops two rounds closing
together from crowning the same player twice; propagation is **forward only** — a closed round's leaderboard
is history.

### 7c. The point-award contract — **binds every point-granting feature**

- **`actions/awardPoints.ts` owns the four-place fan-out.** `awardPoints(db, tx, userRef, user, points,
  counters?)` increments the user doc, mutates the in-memory `user`, and fans out to `updateRanking` +
  `updateGuild` (reading `ranking` once for both). `counters` is a `Partial<Record<UserCounterKey, number>>`
  delta map. **Route every award through it; never hand-roll the fan-out.**
- ⚠️ **Every award transaction must open with `readUserInTransaction(transaction, userRef)`** (from
  `actions/getCurrentUser.ts`) and pass THAT user to `awardPoints`. `getCurrentUser` reads *before* the
  transaction, so without an in-tx read there is no read-set on the user doc: concurrent same-user awards
  don't serialize, each judges an achievement threshold newly crossed, and each folds the bonus into its own
  `increment` — a permanent, non-self-healing double-count. It **must be the first op, before any
  `set/update/create`** (Firestore forbids a read after a write), which is why it lives in the callers.
- **Counters are normalized on hydration, not per-award.** `getCurrentUser` spreads `USER_COUNTER_DEFAULTS`
  (`functions/src/types/user.ts`) over the doc, so `awardPoints` can use a plain `user[key] += …`. Without it
  `updateRanking` copies `undefined` into the round and the admin SDK **throws mid-transaction**, aborting the
  award. The defaults are typed `Record<UserCounterKey, number>`, so a new counter without a default is a
  compile error — add it to the union, `User`, *and* the defaults.
- ⚠️ **`user.scoreUpdatedAt` is the tie-break basis, and is NOT `updatedAt`.** `updateRanking` stamps
  `updatedAt` on every write, including many that change no score (a wrong answer, an admin recheck repairing
  a player, a zero-value pin, account creation) — tie-breaking on it would let mere activity, or an admin
  repair near a round close, silently reorder who wins a prize. So `awardPoints` moves `scoreUpdatedAt` **only
  when `points + bonus !== 0`**, setting it on the in-memory user; `updateRanking` only ever **copies**, never
  stamps. It is a score **sibling** like `pendingScore`, not a `UserCounterKey`, hydrated separately to
  `null`; records predating it fall back to `updatedAt` and self-correct on the next scoring award.
- **Naming rule: pins say `collect`, never `complete`.** No `complete*` identifier exists anywhere in source,
  rules, tests or seeds. Do not introduce one.

### 7d. Achievements

They award points, so grants route through `awardPoints`. The split that matters: **definitions are DATA,
logic is CODE.**

- `achievements/{uid}` is readable (`{name, description, icon, group, type, target, bonus, order, scope?}`)
  and seeded from `achievementsSeed.ts`, so a threshold is retuned by editing the seed and re-seeding, no
  redeploy. ⚠️ **Never hand-edit these in the Firestore console** — the seed is the source of truth and a
  console edit is invisible to git and lost on the next seed.
- **Logic lives only in `functions/src/achievements/typePredicates.ts`** — `TYPE_COUNTERS`, one accessor per
  `AchievementType`. Unlock is always `counter(user) >= target`, so the unlock and the progress bar read the
  same number. **Adding an achievement = one Firestore doc; adding a TYPE = code.** Never `switch (uid)`;
  never let a predicate read Firestore or touch the tx.
- **Location and per-type badges are the `pinsInScope` type.** Counter is `user.collectedPinsByScope[scope]`,
  a **map-valued** counter fed by `actions/pinScopeKeys.ts` (`group:<g>` + `map:<mapId>` + `type:<pinType>`);
  it does **not** join the flat `UserCounterKey` machinery and hydrates to `{}` separately. Unlike every other
  type, **`target` is DERIVED** — `recomputeAchievementTargets` recounts pins per scope on every
  seed/upsert/delete, so authoring `target` on these is pointless.
- ⚠️ **EVERY active pin type counts toward a `pinsInScope` target.** `recomputeAchievementTargets` filters on
  `isActive` alone, matching the award path, which calls `scopeKeys(pin)` for every type. Filtering by type on
  **one side only** is what made badges unlock early before this was fixed. The deliberate exceptions live
  *inside* `scopeKeys` so both sides drop them together: **`ghost` and `geocaching` omit their `map:<mapId>`
  key** (each sits on a map only because a marker needs coordinates) while still counting toward `group:` and
  `type:`. `photo` is excluded from per-type badges — it can't self-complete.
- Authoring consequences: a `feedback` pin in a scope means its badge needs the talk rated, and a **`photo`
  pin means the badge cannot complete until an admin approves** — keep photo pins out of any scope that must
  stay self-serve. Both `loadDefinitions` and the client (`useAchievements`) drop a `pinsInScope` def with
  `target < 1`, so an empty scope neither auto-grants nor dilutes the completion-%.
- **`order`** is the display sort key (lower first, then `target`), authored in blocks of 100 per category so
  a new badge slots in without a renumber. **Display-only — the server never reads it.**
- ⚠️ **A bug here must never kill scoring** — it runs inside *every* `awardPoints` transaction, event-wide.
  `evaluateAchievements` is pure (no writes, no mutation, returns a grant LIST) and wrapped in try/catch;
  `applyGrant` — the only writer — runs **outside** the try, so a mid-loop throw cannot half-apply. Greppable
  log prefixes: **`ACHIEVEMENTS_EVAL_FAILED`**, **`ACHIEVEMENTS_DEF_INVALID`** (a malformed doc is skipped
  *and* logged, never a silent no-op). `loadDefinitions` caches 60s (0 under `FUNCTIONS_EMULATOR`) and serves
  last-known-good on a failed fetch, so scoring never blocks on it.
- **Exactly-once guard = `users/{uid}.achievements[uid] = {grantedAt, bonus}`** — a map on the user doc, not a
  subcollection. `bonus` records what was *actually* awarded, so editing a definition later cannot rewrite
  history. There is deliberately **no `collectedAchievements` clone**: definitions are public, so the screen
  shows all achievements (locked included) by joining definitions × that map × live counters.
- ⚠️ `awardPoints` returns `AchievementGrant[]`, which **must be the return value of the `runTransaction`
  callback** — an outer closure array yields phantom grants and phantom toasts when Firestore retries a
  contended tx.
- `User.fromFirestore` **skips achievement entries it cannot parse** rather than throwing — `useUserData`
  subscribes to that doc, so one malformed entry would otherwise brick the app for that player.
- Accepted risk: a swallowed eval error on a player's *final* award loses that badge, with no next award to
  self-heal on. Mitigation is the log prefix, not machinery.

### 7e. The map

- **Plain `.webp` images, Leaflet + `CRS.Simple`. No GPS, ever** — rejected twice: it cannot distinguish MOK's
  floors indoors, and a misfiring geofence is unfixable mid-event.
- ⚠️ **The map set is NINE images, and it is NOT "each building has 3 floors."** **Dwór** is a standalone city
  map belonging to no building; **MOK** has 5 levels (Piwnica, Parter, Piętro 1, **Piętro 1.5**, Piętro 2);
  **2LO** has 3. `utils/maps.ts` is canonical — the `mapId` → area/floor/image/dims registry plus the
  coordinate convention (`coords{x,y}` = pixels from the image top-left, y down; the sole `[-y, x]` swap into
  Leaflet space).
- Swapping in real art is **overwriting files in `public/maps/`, no code change**, as long as filenames match.
  ⚠️ **But then re-run `scripts/generate-low-maps.sh`** — the "Niska" toggle serves half-res copies from
  `public/maps/low/`, so skipping it leaves every player on "Niska" seeing the *previous* edition's map, with
  no error anywhere.
- `hintRadius` makes a marker an *area* hint rather than a precise dot (`null` = precise). ⚠️ Authored in
  **map-relative units, not pixels**: 1 unit = 1% of the map's shorter side, converted by `hintRadiusToPixels`
  — so values are single digits, the same value means the same share of every floor, and higher-resolution art
  doesn't shrink every circle. Unlike `coords`, which stay absolute pixels.

### 7f. Retired mechanics — code present, UI gone

**Cards** and **clubs/guilds** still compile and still have handlers deployed, but **neither is reachable by a
2026 player** and neither is seeded — on a fresh database `cards`, `cardSets`, `guilds` and `clues` stay
**empty** (`seed.test.mjs`'s `RETIRED_COLLECTIONS` fails if a seeder is re-added without intent). Do not build
on them; those surfaces render empty rather than broken.

- **Cards**: 5 tiers with fixed values (`Enum/CardTier.ts`, duplicated in `functions/src/types/card.ts`).
  ⚠️ Card QRs encode `NEXT_PUBLIC_CODE_COLLECT_URL + code` — **the same prefix and `/collect/:code` route the
  live `code` pins use**, so that env var still matters.
- **Clubs** (grep marker `CLUBS-DISABLED-2026`): *guilds* in code, *kluby* in the UI. ⚠️ **The `updateGuild`
  fan-out still runs on every award** — write-only, never read by the client; it early-returns on `memberOf`,
  which `setupAccountHandle` always sets to `null`. Re-enabling is a diff-revert of the commented UI **plus**
  re-adding the theme switcher by hand (the theme was deleted, not commented).

---

## 8. Frontend conventions

- **Path alias `@/*` → repo root.** Always `@/components/...`, never relative `../../`.
- **4-space indent, single quotes, semicolons, `max-len: 120`** (same in `functions/`). Long copy blocks (faq,
  rulebook) opt out with `/* eslint-disable max-len */`.
- **Uids are kebab-case**, via `lodash.kebabcase` from the name.
- **Reuse-first.** Fork the nearest existing handler/model and match its idioms; never hand-roll what a shared
  action already does.
- ⚠️ **Inside a bottom drawer use `SheetSection`, never `Panel`.** `Panel` is a 30%-alpha grey that needs the
  background *image* behind it; on a drawer's solid fill it lands within 6/255 of its own surface and reads as
  a doubled border + broken shadow. `SheetSection` keeps `Panel`'s `loading` contract.
- ⚠️ **Comments: default to NONE.** A comment earns its place only by explaining something a competent reader
  would still get wrong — a surprising constraint, or a footgun a plausible "cleanup" would silently break.
  **Never** a header block saying what a file is, a restatement of structure the code already shows, or any
  changelog narration — git holds that. **The test:** delete the comment and reread the code; if the reader
  still lands right, leave it deleted.

### Routing & rewrites

Pretty URLs come from rewrites in `next.config.js` — there are **no** `[param].tsx` files:

```js
/collect/:code  → /collect        /collection/:cardId → /collection        /clue/:cardId → /clue
```

The page reads the value off `router.query`. **Any new dynamic route must be added there**, plus a constant in
`Enum/Page.ts`.

⚠️ **Never navigate to `Page.MAIN` while the user is still signed in.** `_app.tsx` bounces a `userReady`
visitor off `/` to `/map`, so a sign-out that pushes first and calls `auth.signOut()` after dumps the
now-anonymous visitor on a screen they cannot use. Sign out **first**, then navigate.

⚠️ **A redirect effect with `router` in its deps fires AGAIN after its own `push`** — the router identity
changes, the page is still mounted, the effect re-runs. Harmless when the destination is constant, but a real
bug the moment it has a **single-use side effect**: the second run found `destinationAfterAuth()`'s stash
already spent and overwrote `/collect/:code` with `/map`. All four auth pages guard with a `redirectedRef`.
Ref-guard any new one.

### Navbar

`components/Navbar/Navbar.tsx` is a fixed bottom bar: **4 side buttons** (Skanuj=`/collect` / Osiągnięcia /
Ranking / Konto) around a large circular **super button** in the middle whose icon + action are *per-page*,
defaulting to **Map**. Pages override it declaratively:

```ts
useDynamicNavbar({ icon: faArrowLeft, onClick: () => router.back() });
```

Config lives in `NavbarConfigContext` and resets to Map on unmount. Flags: `disabled`, `disabledCenter`,
`disabledSides`, `onlyCenter`, `animate`, `animatePointsAdded` (the `+points` animation, next to Ranking).
**Only the centre is dynamic — the 4 side tabs are hardcoded with fixed hrefs.** The grid is
`repeat(2, 1fr) 120px repeat(2, 1fr)`, so a 5th tab means changing that **and** `NavbarConfig`.

### Scanning — one overlay, three surfaces

**There is no scanner page** (`pages/scanner.tsx` and `Page.SCANNER` are deleted). Every scan happens in
**`components/CodeScannerOverlay.tsx`**, mounted behind a local `scanning` boolean by `LookForCodeView`,
`PinSheet` and `PinEditorForm`. **Fork nothing here — mount the overlay.**

- **The contract is scan → fill → the surface's own confirm.** The overlay never submits; it writes that
  surface's input and closes. Do not reintroduce an intermediate confirm step.
- ⚠️ **`z-[60]`, the app's only z-index above 50.** Everything else tops out at `z-50` (navbar), with the map
  drawer at `z-30`/`z-40` *below* it because the drawer's confirm IS the navbar centre button. The overlay
  must cover the navbar **by value** — never by equal `z-50` + DOM order (`_app.tsx` renders `<Navbar>` first).
- ⚠️ **`allowBareCode` is admin-only** — a player's scan must carry the `NEXT_PUBLIC_CODE_COLLECT_URL` prefix
  so a stray convention QR can never register. Only `PinEditorForm` passes it (sticker sheets hold bare codes).
- Printed QR codes encode `/collect/:code`, a route — native camera-app scans are unaffected.
- `CodeScanner` calls `.start()` with no `.catch()`, so a denied permission is an unhandled rejection with no
  error state. The overlay's standing hint copy is the mitigation.
- **`hooks/useTypingAnimation.ts`** types a code in character by character (150ms/char) for both player
  surfaces and `/collect/:code` deep links; the admin editor fills instantly. `onType` is held in a ref so the
  re-render each tick cannot restart the interval.

### Caching

- `useCollectedCards` fetches `collectedCards`/`cardSets`/`clues` **once** into `CardsCacheContext` — a plain
  in-memory `getDocs`, not a subscription. Invalidate with `setCards(null)`.
- `ranking`, `guilds`, the user doc and the admin lists use **live `onSnapshot`** — that's what makes the
  leaderboard feel instant.
- The **pins cache (`usePinsData`) is a hybrid**, because the map both collects and views at once: `pins`
  comes from the **`getPins` callable** (admin-only read, so it can't be a client listener without leaking the
  inline `code`) on a **15-min poll + tab-focus refetch**, while `collectedPins` is a **live `onSnapshot`** so
  a player's own collect greys its marker instantly. There is deliberately **no `setCollectedPins(null)`** —
  refetch is freshness/retry only, never coupled to a collect. Mirror `useUserData`, not `useCollectedCards`.

### Theming & styling traps

The per-club theme switcher was **removed** — `Enum/AppTheme.ts`, `hooks/useTheme.ts` and `ThemeContext` are
deleted and `_app.tsx` sets no theme class. The app always renders the base `:root` palette (accent
`--color-primary: #9D2F00`). The `--color-guild-*` tokens stay, since the commented-out guild UI references them.

⚠️ **Tailwind safelist.** Class names are built dynamically in several places (`` `border-${guild.uid}` ``,
`` `bg-card-${tier}` ``, `` `bg-pin-${pin.type}` ``), which Tailwind cannot see — `tailwind.config.js` carries
an explicit **`safelist`** of plain string literals. **Any new dynamically-composed class must be added there
or it will silently not exist in prod.** Dev looks fine either way; the only honest check is
`npm run build && grep -o '\.bg-pin-code' .next/static/css/*.css`. Note the prefix asymmetry: `GuildUid`
values embed their prefix (`'guild-desert'`) while `CardTier`/`PinType` are bare. Also `content` only scans
`./pages`, `./components` and `./layouts` (**which does not exist**) — classes written in `utils/` or
`models/` are invisible to Tailwind.

⚠️ **Never size a FontAwesome icon with `w-*` / `h-*`.** FA sets `.svg-inline--fa { height: 1em }` and
`_app.tsx` imports it **after** `globals.css`; equal specificity → source order wins → every `h-*` on an icon
is dead, and `w-*` is undone by `preserveAspectRatio`. **Size icons by font-size** — `text-3xl` on the
wrapper, or FA's `size` prop. Margins/colour are unaffected.

⚠️ **Opacity modifiers need channel vars.** `bg-text-accent/20` works only because `--color-primary-rgb: 157
47 0` exists alongside `--color-primary`. A bare `var()` cannot take alpha and Tailwind drops such variants
**silently, generating no rule at all.** Any new palette entry needing `/N` must be declared as channels.

---

## 9. Seeding

`functions/src/seeds/*.ts.dist` are templates in git with placeholder data; the real seeds are gitignored
(§2). Procedure: fill `ADMIN_EMAILS` in `functions/.env` **before anyone registers** and deploy → register
that address **with the Google popup** → *"Seed database"* in the profile tab → password `4064`.

⚠️ **`role` is written once, at account creation**, and `users`/`users-usernames` are `allow write: if false`,
so there is **no in-app recovery** from either of these:

- **A pre-event wipe takes the admin account with it.** `seedDatabaseHandle` requires an existing user doc
  with `role: admin`, so wiping `users` (and `users-usernames`, or the reservation collides) means
  re-registering the admin **with Google** *before* seeding. Verify `ADMIN_EMAILS` on the **deployed**
  function first.
- **The admin address must register with Google, never email+password.** That branch additionally requires
  `email_verified`, and the app never sends a verification mail — so email/password silently lands the admin a
  plain `user`. Greppable in the logs as **`ROLE_LISTED_BUT_UNVERIFIED`**; recovery = delete both docs and
  re-register.
- **`DASHBOARD_EMAILS` deliberately has no such gate** — a plain email match is enough, because the
  `dashboard` role grants no data access at all (rules key off `admin` only). It just pins the account to
  `/dashboard`. Do not "harden" this into symmetry: it would lock the projector out.

⚠️ **Re-seeding must not wipe live gameplay state.** `seedWithPreservedFields(db, collection, docs, keys)`
omits the listed keys from the payload entirely for an existing doc (merge then leaves those paths untouched)
and writes the doc whole on first creation. Preserved: `pins` → `collectedBy`, `ranking` → `users` +
`finished`; `from`/`to`/`name` stay overwritable so a boundary edit still lands. **`{merge: true}` alone does
NOT fix this** — a field being *present in the payload at all* means "overwrite this path", so a literal
carrying `collectedBy: {}` still wipes existing finders under merge.

**Editor → seed round-trip (`scripts/export-pins.ts`).** `upsertPinHandle` writes pins only to the emulator's
`pins` collection (the gitignored `.emulators` dump), so authoring is lost on a wipe. With the emulator up,
`npx tsx scripts/export-pins.ts` reads live `pins`, **merges** by uid with `pinsSeed.ts` and writes a review
copy `pinsSeed.generated.ts` — it **never overwrites** the real seed. Diff and promote by hand. Merge appends
new uids, replaces edited ones, and **preserves seed-only entries** (a hard `deletePinHandle` delete does NOT
propagate — retire via `isActive: false`). Output is uid-sorted, strips `collectedBy`, serializes availability
`Timestamp`s, and **fails loud** on a missing required field or a duplicate code — an invariant
`upsertPinHandle` only checks against *live* Firestore, so a merge can reintroduce it.

### 9a. Testing (Cloud Functions, e2e)

Integration/e2e only — no per-function unit tests, no cosmetic/UI assertions. `functions/test/`
(`emulator.mjs`, `fixtures.mjs`, `*.test.mjs`), plain ESM + `node:test`, **no new deps**. Tests mint a real ID
token from the Auth emulator and POST to the actual callables, so real transactions and the score fan-out run
— nothing is mocked. The harness resets Firestore + Auth and re-seeds a minimal fixture before each test.

- ⚠️ **A `demo-` project id is mandatory.** Under the real id the admin SDK inside each function tries to
  reach the GCE metadata server and every in-function Firestore call **hangs ~60s then 500s**.
  `npm run emulators:test` forces `demo-qrcontest`; `npm run emulators` keeps the real id for manual app
  testing (it imports/exports `.emulators` and must match the app config).
- ⚠️ **The suite cannot share ports with — or run against — a manual `npm run emulators`.** Stop it before
  running the suite **or committing**. Stop with **SIGINT to the `firebase` node process**
  (`pgrep -f "bin/firebase emulators:start"`) and wait for `✔ Export complete`. Never `pkill` the java
  children — that loses the `.emulators` dump. Target the **node** process, not the `sh -c` wrapper above it:
  the wrapper does not forward SIGINT, so it looks like it worked and the emulator keeps running.
- ⚠️ **The suites share one emulator and each `beforeEach` wipes it**, so `npm test` passes
  `--test-concurrency=1`. Hand-running `node --test fileA fileB` drops that flag and produces spurious
  cross-file failures — pass one file, or use `npm test` / `scripts/emu-test.sh`.
- ⚠️ **ALWAYS falsify a concurrency test**: restore the pre-fix file, rebuild, run just that test and confirm
  it **FAILS**. Whether two `Promise.all` calls actually overlap in the emulator is **not reliable** — racing
  a callable against *itself* sometimes serializes, so the test passes against unfixed code. Both outcomes are
  on record in `award-concurrency.test.mjs`. **Racing two DIFFERENT callables is the reliable shape.**
- The canonical test asserts the score is identical in all four denormalized places after a collect + answer.
  **Every new point-granting feature must extend the suite** — it is the only safety net.

---

## 10. Reference

### The TV dashboard

`pages/dashboard.tsx` is a full-screen kiosk view gated to `UserRole.DASHBOARD`, cycling weighted-randomly
between screen types every 60s and re-fetching the convention program hourly. The JSON-RPC method is a
**hardcoded, year-stamped literal** (`GetKonwent2026Program`) — bump each edition.
`NEXT_PUBLIC_DASHBOARD_API_URL` must be set in `.env.production` at build time or the fetch silently resolves
to `''`. `AgendaScreen` drops entries longer than 6h (permanent all-day booths). The `Reminder` pool
partitions on `(reminder.nightOnly ?? false) === isDarkAlready` (21:00-06:00).

⚠️ **The screen, the billboard, the reminder line and the colour theme are all drawn in the cycle effect,
never inline in the JSX** — the 1s colour transition re-renders the page, so an inline draw swaps artwork and
text mid-display. The cycle is a self-rescheduling `setTimeout` keyed on a `cycle` counter, not an interval,
so tap-to-advance restarts the full minute.

⚠️ **`QrContestSplash`'s two MOK billboards have a live 10-char pin code and its QR baked into the art** —
`1MB2C1F9WG` (Parter) and `1DLDL9NRT8` (Piwnica). The pins must match the billboards, never the other way
round; a re-export that alters either string breaks a scannable code with no in-app fix.

### Checklist for adding any new entity

1. `Enum/FireDoc.ts` — the collection name.
2. `firestore.rules` — a `match` block. **Default to `allow read: if request.auth != null; allow write: if
   false;`** with mutation behind a callable. If the client must never see part of the doc, keep it in a
   server-only collection with *no* rule, the way `questions` does.
3. `models/<Entity>.ts` — client class + converter (throw in `toFirestore` if immutable).
4. `functions/src/types/<entity>.ts` — admin-side type.
5. `functions/src/seeds/<entity>Seed.ts.dist` + wire into `seedDatabaseHandle.ts`.
6. `Enum/Page.ts` + `next.config.js` rewrites — if it gets a route.
7. `components/Navbar/Navbar.tsx` — if it gets a tab (mind the hardcoded grid + hrefs).
8. `tailwind.config.js` `safelist` — if it introduces dynamically-built class names.
9. `firestore.indexes.json` — if it needs a composite query. Currently **empty**: every query today is
   single-field or equality+equality, served by automatic indexes.
10. `User` in **both** type worlds if it adds a counter, plus `USER_COUNTER_DEFAULTS` (compile-enforced), plus
    `RankingRoundUser`/`GuildMember` if it should reach a leaderboard.
11. **Route every point award through `awardPoints`** (§7c). Never hand-roll the fan-out.
12. Extend `functions/test/` (§9a).

**Worked example:** pins did every step of this — copy that shape.

### Known cruft

- `NEXT_PUBLIC_APPCHECK_*` exist but App Check is never initialized.
- `seedDatabaseHandle`'s password `'4064'` is a hardcoded literal.
- `FireDoc` is missing `questions` and `collectedQuestions`.
- `TIME_BETWEEN_GUILD_CHANGES_MS` is defined twice and can drift.
- Feedback-pin data (`rating`, `talkName`) is **written and never read** — the admin view is still open work.
- ⚠️ **`pages/rulebook.tsx` and `pages/faq.tsx` still describe the retired card game**, but the two reward
  codes in their copy are **live `ghost` pins** — a rewrite must not drop or alter them: rulebook carries
  `PB944GH25M` as-is; faq prints `9DG76W9SGN` whose pin stores the **reverse**, `NGS9W67GD9` (the inversion is
  the joke; the seed is the source of truth). A rewrite must also reuse `components/PinTypeLegend.tsx` rather
  than restating the mechanics by hand, must not tell players to "go to the scanner screen" (there isn't one),
  and must phrase the ghost-code instruction so a reader typing a non-QR code into a screen labelled "KODY QR"
  still knows they are in the right place.
