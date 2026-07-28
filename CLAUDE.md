# QrContest — Fantasmagoria

A mobile-first web game played during the **Fantasmagoria** fantasy convention in Gniezno, Poland.
Players explore an in-app map of the convention grounds, find **pins** (scan a hidden QR, solve a riddle,
visit a place, rate a talk, photograph something), answer quiz questions, unlock achievements, and climb a
live leaderboard. Runs for ~3 days a year, ~150 players, 100k+ Firestore reads/writes over the event.

⚠️ **The 2025 card game and the club/guild system are RETIRED but still in the codebase** — see §7a before
assuming a card or guild file is live.

**The entire UI is in Polish.** All user-facing strings, toasts, panel titles, and error messages are Polish.
Keep it that way — do not introduce English UI copy.

⚠️ **The game's user-facing name is "Gra Konwentowa" (2026, task #35) — "QrContest" is only the repo/package/
project id.** Never print "QrContest" in UI copy. Unlike the old indeclinable brand, "Gra Konwentowa" is a
declinable Polish phrase and **must inflect by case** — nominative `Gra Konwentowa`, locative (after `w/o`)
`Grze Konwentowej`, genitive `Gry Konwentowej`. A find-replace that ignores this produces broken grammar
(`Nagrody w Gra Konwentowa`). The `QrContestSplash` identifier, `/dashboard/qrContest.webp`, the npm name and
the `qrcontest2023` project id deliberately keep the old name.

---

## 1. Stack & versions

| Layer | Tech |
|---|---|
| Frontend | Next.js 13.5 (**pages router**, not app router), React 18, TypeScript 5.8 |
| Styling | Tailwind CSS 3.4 + CSS custom properties in `styles/globals.css` |
| Icons | FontAwesome (`@fortawesome/free-solid-svg-icons`) |
| Forms | `react-hook-form` |
| Toasts | `react-hot-toast` |
| QR scanning | `qr-scanner` (camera-based, client-side) |
| Client SDK | Firebase JS SDK **v9 modular** — imported as `@firebase/auth`, `@firebase/firestore`, … |
| Backend | Firebase Cloud Functions **v2 API** (`firebase-functions` v6), Node **20**, `firebase-admin` 12 |
| Database | Cloud Firestore |
| Auth | Firebase Auth — Google popup + email/password |
| Hosting | Firebase Hosting with `frameworksBackend` (Next.js SSR runs on Cloud Functions) |

Root `package.json` is at version `6.0.0` (the 2025 / 15th-edition release).

### Firebase project facts

- Project id: **`qrcontest2023`** (`.firebaserc`) — the name is historical, it is still the live project.
- Hosting site: **`fantas`** → https://fantas.web.app
- Region: **`europe-west1`** for both functions and the Next.js `frameworksBackend`.
- `setGlobalOptions({region: 'europe-west1'})` is set in `functions/src/index.ts` — every function inherits it.
- The client resolves the callable region from `NEXT_PUBLIC_FIREBASE_REGION`. If those two disagree,
  every callable fails with a CORS/404 — check both when callables mysteriously break.
- Off-season the project runs on the **Spark plan**; Gen-2 callables then return **503**, surfacing in the browser
  as *"CORS header … missing"*. Real cause shows in `npx firebase functions:log` ("billing is disabled"). Fix =
  re-enable **Blaze** (no redeploy). **Check billing before debugging CORS.**

---

## 2. Commands

```bash
# Frontend dev server (binds 0.0.0.0 so a phone on the LAN can reach it)
npm run dev

# Lint / build
npm run lint
npm run build
npx tsc --noEmit                       # fast client-tree typecheck (skips the full Next build)
npm run verify                         # = scripts/hooks/pre-commit: the FULL pipeline (FE lint+typecheck+build,
                                       #   BE lint+build+e2e, ~50-70s). Same ports as the emulator — see §9a.

# Emulators (functions, firestore, auth, storage, pubsub) — imports/exports ./.emulators
npm run emulators

# Cloud Functions MUST be compiled before the emulator picks them up
cd functions && npm run build          # or: npm run build:watch
cd functions && rm -rf lib && npm run build   # REQUIRED after renaming/deleting a source file

# Deploy
firebase deploy --only hosting,firestore,functions
firebase deploy --only functions

# Cloud Functions e2e tests (two terminals)
npm run emulators:test      # hermetic emulator on the demo-qrcontest project
cd functions && npm test    # node:test suite hitting the real callables
```

Gotchas (from `Setup.md`, all real):
- **Functions must be built (`tsc` → `functions/lib/`) before running the emulator.** The emulator loads
  `functions/lib/index.js` (`"main"` in `functions/package.json`), never the TypeScript source.
- **`tsc` never deletes outputs for renamed/removed sources.** Rename `fooHandle.ts` → `barHandle.ts` and
  `lib/fooHandle.js` survives; a running emulator also keeps the dead route registered (it answers `500`)
  until restarted. After any rename: `rm -rf lib && npm run build`, then restart the emulator.
- **`npm run lint` is `next lint` — it does NOT cover `functions/`, and it never linted `.tsx`.** Components
  and the whole backend are effectively checked only by `tsc` and the pre-commit hook.
- **A pre-commit hook runs the full pipeline** (FE lint + typecheck + build, BE lint + build + e2e, ~50-70s) — see
  `scripts/hooks/pre-commit`. It **fails while a manual emulator is running**, because the e2e leg needs the
  same ports (see §9a).
- Half-baked or weird deploy failures are almost always a stale `firebase-tools` — `npm i -g firebase-tools`.
- Deploy failing with `401` → `firebase login --reauth`.
- **The emulator won't boot until you run `npx firebase experiments:enable webframeworks`** (per-machine, one-time).
  Hosting uses Next.js `frameworksBackend`, so even `--only functions,firestore,…` errors out without it.
- **The Firestore emulator is a JVM app — it needs Java** (`openjdk-21-jre-headless` or similar) or it silently fails to start.
- `firebase` is a **local devDependency**, not global → invoke as **`npx firebase …`**. It starts **unauthenticated**;
  `npx firebase login` is interactive (run it in a real terminal). Emulators run fully offline and need no login.
- Emulator ready signal: `✔ All emulators ready`; UI on `:4000`, hub on `:4400`.

### First-time setup on a bare checkout

`npm install` at the **root and in `functions/`** (two separate trees). Then, before `functions/` will compile:
the real seed files (`functions/src/seeds/*.ts`) must exist — they're **gitignored** (`src/seeds/*.ts`) and shipped
separately in a password-protected zip; only `*.ts.dist` placeholder templates are in git. `seedDatabaseHandle.ts`
imports five of the nine (rankingRounds, questions, pins, pinGroups, achievements), so `tsc` fails outright
without **those**; the four retired ones (cards, cardSets, guilds, clues) are no longer imported anywhere, so a
missing `cardsSeed.ts` now compiles clean instead of erroring — a trap if you conclude from a green build that
the seed set is complete. **`functions/.env` is the second gitignored prerequisite** — copy
`functions/.env.dist` and fill in `ADMIN_EMAILS` / `DASHBOARD_EMAILS`, or the `prebuild` hook
(`functions/scripts/checkEnv.mjs`) fails the functions build, and with it `npm run verify`, the pre-commit
hook and `firebase deploy`. `.env.development` is also gitignored — copy `.env.dist` and
set `NEXT_PUBLIC_EMULATOR=true`.

### Environment

Copy `.env.dist` → `.env.development` / `.env.production`. `configuration.ts` is the single place that
reads `process.env`; everything else imports `configuration`. Notable vars:

- `NEXT_PUBLIC_FIREBASE_*` — standard Firebase web config + `NEXT_PUBLIC_FIREBASE_REGION`.
- `NEXT_PUBLIC_EMULATOR=true` — makes `utils/firebase.ts` call `connect*Emulator` for auth/firestore/functions/storage.
- `NEXT_PUBLIC_CODE_COLLECT_URL` — the URL prefix printed into the QR codes (e.g. `https://fantas.web.app/collect/`).
  `components/CodeScanner.tsx` strips this prefix from the scanned string to recover the raw code. **If this
  is wrong, the scanner silently ignores every valid code** — a player's scan is *required* to carry the
  prefix (`allowBareCode` is admin-only), so a mismatch rejects everything.
- `NEXT_PUBLIC_DASHBOARD_API_URL` — Fantasmagoria's JSON-RPC endpoint the TV dashboard polls for the program.
- `NEXT_PUBLIC_APPCHECK_KEY` / `NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN` — **declared but never used.**
  App Check is not wired into `utils/firebase.ts`. Dead config.

---

## 3. Directory layout

```
pages/            Next.js pages router. Top-level = player screens; auth/ and admin/ are sub-routes.
components/       Shared UI (Panel, Button, LinkButton, Loader, ScreenTitle, Metatags, AuthCheck, Navbar/)
                  plus per-feature folders: collect/, collection/, account/, ranking/, dashboard/,
                  pin/, map/, achievements/, admin/
models/           CLIENT-side domain classes. Extend FirebaseModel, carry Firestore converters.
Enum/             CardTier, UserRole, FireDoc (collection names), Page (routes)
hooks/            useUserData, useCollectedCards, usePinsData, useAchievements, useDynamicNavbar,
                  useAdminOnly
utils/            firebase.ts (SDK init), functions.ts (typed callables), context.ts (React contexts),
                  date.ts (Polish pluralization + formatting), maps.ts (map registry), mapView.ts,
                  downscaleImage.ts, collectErrors.ts, scheduleAchievementToasts.tsx,
                  getGuildIcon.ts, getPinIcon.ts, getAchievementIcon.ts, randomArrayElement.ts
types/            global.ts — Uid, StringMap
functions/src/    Cloud Functions. Handlers at the root, actions/ for shared transaction helpers,
                  achievements/ for the grant engine, types/ for the ADMIN-side types, seeds/ for the
                  seed data, data/forbiddenPhrases.ts
public/maps/      The 9 map images (see §12.1). Filenames must match the registry in utils/maps.ts.
public/           Static assets: cards/, cards-thumbnails/, cards-reverse/, guilds/,
                  guilds-thumbnails/, clues/, backgrounds/, dashboard/, ico/
styles/globals.css  CSS variables + the guild theme classes
helpers/          XnConvert batch scripts (card → webp / thumbnails) and LLM prompt starters. Not code.
```

---

## 4. The two parallel type worlds ⚠️

This is the single most important architectural quirk. **Every domain concept is defined twice:**

| | Client | Cloud Functions |
|---|---|---|
| Location | `models/*.ts` | `functions/src/types/*.ts` |
| Shape | **Classes** extending `FirebaseModel`, with static `toFirestore` / `fromFirestore` converters | **Plain types** using `firebase-admin/firestore` `Timestamp` / `FieldValue` |
| Dates | `Date` (converted via `.toDate()`) | `Timestamp \| FieldValue` |
| Collections-as-maps | Converted to **arrays** in `fromFirestore` (e.g. `Guild.members`, `RankingRound.users`) | Stay as **maps keyed by uid** |

The client uses `withConverter(Model.getConverter())` on every query so Firestore snapshots come back as
real class instances. `FirebaseModel.toFirestore` throws by default; several models deliberately keep it
throwing (`User`, `Guild`, `Question`, `RankingRound`, `CardClue` all throw *"X is immutable"*), because
**the client is never allowed to write them.** (The editor flags the unused `data` param on these
`toFirestore(data: X)` throwers as TS `[6133]` — spurious; the real `tsc`/build doesn't enforce
`noUnusedParameters`, so match the existing signature, don't "fix" it.)

The two worlds are **not** generated from each other and there is no compile-time link. Some client files
even reach across the boundary and import the admin types directly:

```ts
import { CardTier } from '@/functions/src/types/card';   // models/CardClue.ts, models/CardSet.ts
```

(This works because `tsconfig.json` sets `baseUrl: "."` with `"@/*": ["./*"]`, so `@/` is the repo root.)

⚠️ **`functions/src/actions/rankingOrder.ts` crosses that boundary with real RUNTIME code**, not just a
type — it is the one ordering both worlds sort by (§7), so it is bundled into the browser. It therefore
**must not import `firebase-admin`** (nor `firebase-functions/logger`; it logs with `console.warn`), and
takes its timestamps as `unknown`, narrowed by a structural `{ toDate(): Date } | Date | number` duck-type —
`updatedAt`/`scoreUpdatedAt` are `Timestamp | FieldValue | number` server-side and `Date` client-side, and
`FieldValue` is assignable to neither. Type-only cross-imports like `CardTier` above get elided and are
exempt; this one would not be. Any future shared runtime helper inherits the same rule.

**Consequence for any new feature:** adding a field or an entity means editing *both* sides, plus the
Firestore rules, plus the seed. Grep for every enumeration site before declaring done.

---

## 5. Firestore data model

Collection names live in `Enum/FireDoc.ts` — **but that enum is incomplete.** The real set:

| Path | In `FireDoc`? | Written by | Read by |
|---|---|---|---|
| `users/{uid}` | ✅ `USERS` | functions only | owner + admins |
| `users/{uid}/collectedCards/{cardUid}` | ✅ `USERS__COLLECTED_CARDS` | functions only | owner |
| `users/{uid}/collectedPins/{pinUid}` | ✅ `USERS__COLLECTED_PINS` | functions only | owner |
| `users/{uid}/collectedQuestions/collectedQuestions` | ❌ | functions only | **nobody** (no rule → denied) |
| `users-usernames/{username}` | ✅ `USERS_USERNAMES` | functions only | any authed user (uniqueness check) |
| `cards/{cardUid}` | ✅ `CARDS` | functions only | admins only |
| `pins/{pinUid}` | ✅ `PINS` | functions + seed | **admins only** — the `code` is inline |
| `pinGroups/{groupUid}` | ✅ `PIN_GROUPS` | seed only | any authed user — taxonomy, nothing secret |
| `photoSubmissions/{subUid}` | ✅ `PHOTO_SUBMISSIONS` | functions only | **own submissions only** (`resource.data.userUid == uid`); admins go through the callable |
| `cardSets/{setUid}` | ✅ `CARD_SET` | seed only | any authed user |
| `clues/{clueUid}` | ✅ `CLUES` | seed only | any authed user |
| `ranking/{roundUid}` | ✅ `RANKING` | functions only | any authed user |
| `guilds/{guildUid}` | ✅ `GUILDS` | functions only | any authed user |
| `achievements/{uid}` | ✅ `ACHIEVEMENTS` | seed (+ `recomputeAchievementTargets`) | any authed user — definitions are public |
| `questions/questions` | ❌ | seed only | **nobody** (no rule → denied) |

⚠️ `photoSubmissions` is the **only** collection whose read rule is neither "owner" via a `users/{uid}`
subcollection nor a flat allow — it is a top-level collection filtered by a `userUid` field.

Two things worth internalising:

1. **`questions` is a single document** (`questions/questions`) holding a map of *all* questions keyed by uid,
   including the `correct` answer. It is unreachable from the client by design — the correct answer never leaves
   the server. `collectedQuestions` is likewise a single doc per user holding a map. Both are deliberately
   absent from `firestore.rules`, and Firestore denies anything not explicitly allowed.
2. **`collectedCards` is a per-user snapshot copy of the card**, not a reference. It duplicates
   `name`/`image`/`description`/`tier`/`value`. That is what the collection screen renders.
   **`collectedPins` does the same for pins** (`name`/`description`/`value`) — and there it is not an
   optimisation but a hard requirement: `pins` is admin-only read, so a snapshot is the *only* way the
   player's client can ever learn what it just found. The snapshot deliberately omits `code` and
   `collectedBy`; `functions/test/pins.test.mjs` asserts it.

### Denormalization / fan-out

Scores are duplicated in four places and kept in sync inside transactions:

```
users/{uid}.score
  → ranking/{round}.users[uid].score      (via actions/updateRanking.ts)
  → guilds/{guild}.members[uid].score     (via actions/updateGuild.ts)
  → guilds/{guild}.score  (recomputed by summing all members, for consistency)
```

`updateRanking` only touches rounds whose `to` is still in the future. `updateGuild` recomputes the guild
aggregate from scratch over all members each time rather than incrementing — deliberately, to self-heal drift.

---

## 6. Security model — **all client writes are denied**

`firestore.rules` grants **`allow write: if false`** on every collection — with no exception since task
#43 retired the card editor (`Card.toFirestore` throws *"Card is immutable"* like the other read-only
models).

Every mutation goes through an authenticated **callable Cloud Function**. They are declared once in
`utils/functions.ts` as typed `httpsCallable` wrappers:

| Callable | File | What it does |
|---|---|---|
| `setupAccountHandle` | `setupAccountHandle.ts` | Creates the user doc + username reservation + empty `collectedQuestions`. Validates username (3–20 chars, a regex allowlist, and a `forbiddenPhrases` blocklist). Assigns `role` from `ADMIN_EMAILS`/`DASHBOARD_EMAILS` in `functions/.env` (`actions/roleForEmail.ts`) — the only place `role` is ever written. Admin additionally requires a **verified** token email; dashboard does not. See §9. |
| `collectCardHandle` | `collectCardHandle.ts` | Validates a 10-char code against `cards` (`isActive == true`), rejects already-collected, optionally draws a random **unanswered** question, writes `collectedCards`, increments score, fans out to ranking + guild. **Cards are retired for 2026** — still deployed, but nothing in the UI calls it (see §12). |
| `collectPinHandle` | `collectPinHandle.ts` | The 2026 replacement for `collectCardHandle` — **fork THIS for any new pin flow.** Three entry shapes: `{code}` (global scanner/manual entry, cross-pin lookup filtered to `type == 'code'`), `{pinUid, answer}` (the map's pin UI, validated against that one pin), and `{pinUid, rating, talkName}` (feedback pins, #12 — skips the question draw entirely). Writes `collectedPins` + the pin's `collectedBy`, awards via `awardPoints`. Rejects `photo` (that routes through `submitPhotoHandle`). |
| `getPinsHandle` | `getPinsHandle.ts` | **Read-only.** The map's pin feed — `pins` is admin-only read, so this is the client's only way in. Strips `code` + `collectedBy` via an explicit whitelist (`actions/toPublicPin.ts`), filters `isActive` + the `availableFrom/To` window. |
| `upsertPinHandle` | `upsertPinHandle.ts` | **Admin-only.** Create/update a pin from the map-native editor (#14). Always the complete authored field set, never a partial patch. Validates `groups[]` against `pinGroups`, then runs `recomputeAchievementTargets`. |
| `deletePinHandle` | `deletePinHandle.ts` | **Admin-only.** Deletes a pin, then `recomputeAchievementTargets`. Not transactional — no invariant to protect. |
| `submitPhotoHandle` | `submitPhotoHandle.ts` | Photo-proof pins (#19). Client uploads to Storage first; this marks the pin **pending** — `collectedPins` with `awardedPoints: 0`, a `photoSubmissions` doc, `user.pendingScore += value`. **No points, no fan-out.** |
| `reviewPhotoHandle` | `reviewPhotoHandle.ts` | **Admin-only.** Approve → awards via `awardPoints`; reject → deletes `collectedPins` + the pin's `collectedBy` entry so the pin **reopens**. Both clear `pendingScore`. Idempotent. |
| `getPhotoSubmissionsHandle` | `getPhotoSubmissionsHandle.ts` | **Admin-only, read-only.** The pending review queue; photos come back as server-built download-token URLs (no signBlob). |
| `answerQuestionHandle` | `answerQuestionHandle.ts` | Grades an answer server-side, awards `value` or `0`, fans out. Rejects re-answering. **Shared by cards and pins, unchanged.** |
| `joinGuildHandle` | `joinGuildHandle.ts` | Moves the user between guilds, enforces the **4-hour cooldown**, moves the score contribution from the old guild to the new one. |
| `seedDatabaseHandle` | `seedDatabaseHandle.ts` | Admin-only + **hardcoded password `'4064'`**. Seeds questions, ranking rounds, **pins**, **pinGroups**, **achievements**, then `recomputeAchievementTargets`. **Cards, cardSets, guilds and clues are no longer seeded** (retired, §7a) — their seed files and types still exist but nothing imports them. |
| `updateRoundsHandle` | `index.ts` → `updateRoundsProcessor.ts` | Manual "force round update" from the admin panel. |
| `autoUpdateRounds` | `index.ts` | **Scheduled**, cron `0 * * * *` (hourly). Marks finished rounds, stamps the top 3 users with `winnerInRound`. |

**Storage is locked down except one narrow match.** `storage.rules` is `allow read, write: if false;`
everywhere EXCEPT `/users/{uid}/photos/{pinUid}` (owner + `<10MB` + `image/*`, overwrite allowed) — the
photo-proof upload path (#19, §12.4). `getStorage()` is client-wired in `utils/firebase.ts` and used
server-side via `functions/src/actions/photoStorage.ts`.

### Auth flow

`hooks/useUserData.ts` subscribes to `onSnapshot(users/{authUid})` and exposes
`{ authUser, authLoading, user, userLoading, userReady }` through `UserContext`. `userReady` means
"a Firestore user doc with a username exists" — i.e. account setup is complete.

`components/AuthCheck.tsx` wraps every page in `_app.tsx`. It hard-codes a `publicRoutes` allowlist
(main, login/register + email variants, account-setup, collect, rulebook, faq). A visitor with **no
Firestore user doc** on any *other* route in `Enum/Page.ts` — `/admin/*`, `/guild` and `/dashboard`
included, deliberately no exclusion list — is `router.replace`d to the landing page (a `<Loader/>`
renders meanwhile, never a 404 frame); only a genuinely unknown URL still gets `Custom404`. `replace`,
not `push`, or Back re-enters the route and re-redirects. **`/collect` is intentionally public** so a
first-time scanner lands somewhere sane and gets funneled into registration; its branch also stashes
the scanned code (`utils/pendingCode.ts`, sessionStorage, single-use — cleared inside
`destinationAfterAuth()`) so registration ends back on `/collect/:code` with it prefilled.

⚠️ **`AuthCheck` must never render `children` while `user` is unresolved.** `hooks/useAdminOnly.ts`
bounces to `/collect` on `!user`, and it only stays out of the redirect's way because the admin page
never mounts. An "avoid the loader flash" change that renders optimistically would throw **legitimate
admins** off every admin page. Nothing else in the codebase enforces this.

⚠️ **`hasAccount` is in the effect's dep list on purpose.** Losing the account — signing out, an
expired session — is itself the trigger; `authLoading`/`userLoading`/`pathname` are all unchanged at
that moment, so without it a session expiring mid-page hangs on the Loader forever.

Roles (`Enum/UserRole.ts`): `user`, `admin`, `dashboard`.
- `admin` → unlocks the admin panel in `/account` and the `/admin/*` pages (guarded by `useAdminOnly`).
- `dashboard` → `_app.tsx` force-redirects this role to `/dashboard` and keeps it there. It's the TV/projector
  account, not a player.

---

## 7. Game mechanics

**Pins are the 2026 collectible** (`functions/src/types/pin.ts`). Each `PinType` has its own collect
flow, colour (`--color-pin-*`) and icon (`utils/getPinIcon.ts`):

| Type | How it's collected | Entry point |
|---|---|---|
| `code` | scan/enter a printed QR code | `/collect/:code` **and** the map sheet |
| `riddle` | type the answer to a riddle | map sheet only |
| `visit` | just be there and tap collect | map sheet only |
| `feedback` | rate a room's talk (`rating` 1–5 + `talkName`) | map sheet only |
| `photo` | upload a photo, admin approves (#19) | map sheet only, via `submitPhotoHandle` |
| `ghost` | type a 10-char code hidden in the app's own copy (#60) | `/collect/:code` **and** the map sheet |
| `geocaching` | find a physical cache, enter the 10-char code inside it (#75) | `/collect/:code` **and** the map sheet |

⚠️ **`code`, `ghost` and `geocaching` are the ONLY types the global `/collect` input resolves** — the scanner
path queries `type in [code, ghost, geocaching]`, deliberately excluding `riddle`, whose free-text answer would
otherwise be brute-forceable across every pin. That holds only because every one of those three codes is a
10-char `[A-Z0-9]` string (`upsertPinHandle` enforces the same `CODE_PATTERN` across all of them, and their
codes must not collide) — the length check runs *before* the query. Ghosts are deliberately **omitted from
`PinTypeLegend`** (finding one is a surprise); geocaching is **shown** (players should know to look for caches),
so `ghost` is the only type the legend filters out.

**"Enters a code" (`code` + `ghost` + `geocaching`) is `entersCode()` in `Enum/PinType.ts`** — the predicate
that drives the code label, the `ABCDEFGHIJ` placeholder, `maxLength`, the 10-char submit gate and the camera
button. It used to be copy-pasted into `PinEditorForm` and `PinSheet`; keep it single. ⚠️ It is **not** the
same question as `needsCode` (adds `riddle`, admin-editor-local) — a riddle has an answer to validate but
nothing to scan. ⚠️ **`geocaching`'s `PinSheet` also renders a "Czym jest Geocaching?" explainer card** (concept
+ `/geocaching.webp`), the one type-specific card in the sheet.

Points are per-pin (`value`), not tiered. `withQuestion: true` draws a quiz question on top (never for
`feedback`). ⚠️ **Riddle answers are matched with `trim()` + `toUpperCase()` only** — no diacritic folding,
no inner-whitespace collapse. Author answers short, single-token and ASCII-safe.

**Achievements** award bonus points on top; see §12.3.

**Questions.** Values `0 | 5 | 10 | 15`. Draws a *random question the user has not seen yet*; the pool is
global, not per-pin. A wrong answer still burns the question (score 0) and still increments
`amountOfAnsweredQuestions`. Shared by cards and pins.

⚠️ **Every question in the seed is authored with the correct answer in slot `a` and `correct: 'a'`**, without
exception. This is not a leak and must not be "fixed" by scattering correct answers across b/c/d:
`components/collect/QuestionPinView.tsx` shuffles the four entries before rendering, and `correct` never
leaves the server anyway (`questions/questions` has no client rule). Authoring the key anywhere but `a`
buys nothing and breaks the one invariant that makes the pool skimmable. **There is no time limit on
answering** — a drawn question sits in `collectedQuestions` with `answer: null` indefinitely, and
`answerQuestionHandle` never compares timestamps.

**Rounds.** `ranking/{uid}` docs with `from`/`to`. Points **carry over** between rounds. The hourly
`autoUpdateRounds` marks a round `finished` and stamps `winnerInRound` on the top 3. A user with
`winnerInRound` set is excluded from later rounds' prizes (but keeps playing).

⚠️ **Author every round's `to` one second before the hour, never on it.** `updateRoundsProcessor` filters
`!finished && to <= now` and the cron fires `0 * * * *`, so a `to` of exactly `12:00:00` ties the tick — if
the tick lands marginally early nothing is due and the round waits a full hour. Both rounds now end at
`:59:59` (task #58). The admin's *"Sprawdź i zamknij rundy"* button runs the same processor on demand and is
the only in-policy recovery if the cron misses; it **cannot** force a round closed early, so a
`"Nothing to do, no rounds to finish."` toast is a normal result, not a failure. Its three return strings
are deliberately **English** (admin-only, identical to the function logs) — do not translate them.

⚠️ **The winners list and the live ranking are ONE ordering, and must stay one** (task #80). For a finished
round `pages/ranking.tsx` renders both panels at once — *"Mistrzowie rundy"* (`winnersOnly`) and *"Ranking
rundy"* — as two filters over the **same** sorted `users` array, so any disagreement is visible in a single
glance next to a physical prize. The binding invariant:

```
users.filter(isVisibleInRound).slice(0, 3)  ===  users.filter(r => r.winnerInRound === round.uid)
```

Both sides therefore go through **`functions/src/actions/rankingOrder.ts`** — `orderRankingEntries`
(score desc → `scoreUpdatedAt` asc, older score wins → `uid` asc) and `isVisibleInRound`, which doubles as
the server's prize-eligibility filter so winners are picked from exactly the set the screen shows. The `uid`
key exists so nothing ever falls back to Firestore map key order. **Never re-implement either on one side.**

Three non-obvious consequences in `updateRoundsProcessor`:
- It reads the round docs **inside** the transaction (`transaction.getAll`), for the read-set — the §12.2
  rule. It stamps **only the `users.<uid>.winnerInRound` field path**; writing the record back would replay
  the pre-close snapshot over a boundary award.
- `crownedThisPass` — each closing round is judged against its own snapshot, so without a pass-level set two
  rounds closing together crown the same player twice.
- Propagation is **forward only**: a winner's stamp lands in every round ordered after the crowning one
  (still-open *and* later-closing), never backward — a closed round's leaderboard is history.

### 7a. Retired mechanics — code still present, UI gone

Both of these still compile, still have handlers deployed, and still appear all over the repo. **Neither is
reachable by a 2026 player.** Do not build on them; do not assume a change here affects the live game.

⚠️ **As of task #58 they are no longer SEEDED either** — `seedDatabaseHandle` stopped writing `cards`,
`cardSets`, `guilds` and `clues`, so on a fresh database those four collections stay **empty**. The seed
files, types, models and handlers all survive, so re-enabling is just re-adding the seeder + its import.
Consequence: any card/club/clue surface you open will render empty rather than broken, and
`seed.test.mjs`'s `RETIRED_COLLECTIONS` assertion will fail if a seeder is re-added without intent.
`updateGuild` is unaffected — it early-returns on `memberOf`, which `setupAccountHandle` always sets to
`null`, so no award ever reads a guild doc.

**Cards** (retired 2026 — no navbar tab, nothing calls `collectCardFunction`). 5 tiers, fixed point values
(`Enum/CardTier.ts` — duplicated in `functions/src/types/card.ts`):

| Tier | Points | Polish name |
|---|---|---|
| `common` | 10 | Zwykły |
| `rare` | 15 | Rzadki |
| `epic` | 20 | Epicki |
| `legendary` | 30 | Legendarny |
| `mythical` | 50 | Mityczny |

Card codes are **exactly 10 chars**, `[A-Z0-9]`, uppercased server-side, unique across `cards`,
and gated by `isActive`. The QR code encodes `NEXT_PUBLIC_CODE_COLLECT_URL + code` — **the same prefix and
the same `/collect/:code` route the live `code` pins use**, so this env var still matters.

**Card sets** (`cardSets`) group cards for the collection screen and declare how many of each tier they contain,
so the UI can render grey "not yet found" placeholders. The set with `uid === 'secret'` is special-cased in
`components/collection/CardsSetComponent.tsx`: instead of anonymous placeholders it renders **clues**
(`clues` collection) linking to `/clue/:cardId`, each a riddle pointing at a hidden mythical/legendary card.

**Clubs** (dropped from the UI for 2026 — task #32, grep marker `CLUBS-DISABLED-2026`). Called *guilds* in
code, *kluby* in the UI. Four fixed uids: `guild-desert`, `guild-steel`, `guild-water`, `guild-void`.
- Guild **power** = `round(score / amountOfMembers)` — the guild leaderboard sorted by power, not raw score.
- Changing clubs had a **4-hour cooldown** (`TIME_BETWEEN_GUILD_CHANGES_MS`, defined **twice**:
  `models/Guild.ts` and `functions/src/joinGuildHandle.ts`).
- ⚠️ **The `updateGuild` fan-out still runs on every award** — write-only, never read by the client.
  Re-enabling clubs is a diff-revert of the commented UI **plus** re-adding the theme switcher by hand
  (theme was deleted, not commented).

---

## 8. Frontend conventions

- **Path alias `@/*` → repo root.** Always import as `@/components/...`, `@/models/...`, never relative `../../`.
- **4-space indent, single quotes, semicolons required, `max-len: 120`** (`.eslintrc.json`). Same in `functions/`.
- Long copy blocks (faq, rulebook) opt out with `/* eslint-disable max-len */` at the top of the file.
- **Uids are kebab-case**, generated with `lodash.kebabcase` from the name (see `models/Card.ts` constructor).
- **Reuse-first — don't reinvent.** Fork the nearest existing handler/model and match its idioms rather than
  inventing new patterns; never hand-roll what a shared action already does (route every point award through
  `functions/src/actions/awardPoints.ts`). Keeps the two type worlds + fan-out consistent.
- ⚠️ **Inside a bottom drawer use `SheetSection`, never `Panel`.** `Panel` is a 30%-alpha grey that needs
  the background *image* behind it; a drawer is a solid fill, so a `Panel` there lands within 6/255 of its
  own surface and reads as a doubled border + broken shadow. `SheetSection` keeps `Panel`'s `loading`
  contract (blurs + blocks pointer events). Both drawers — `PinSheet` and `PinEditorForm` — use it.
- ⚠️ **Comments: default to NONE.** A comment earns its place only by explaining something a competent reader
  would still get wrong — a surprising constraint or a footgun a plausible "cleanup" would silently break.
  Specifically **never**: a header/banner block on a new file or component saying what it is; a restatement of
  structure the code already shows; a contrast with the previous implementation ("replaces the old X hack") or
  any other conversation/changelog narration — git holds that. **The test:** delete the comment and reread the
  code; if the reader still lands right, leave it deleted. One line where one line does.

### Routing & rewrites

Pretty URLs are produced by rewrites in `next.config.js` (there are **no** `[param].tsx` files):

```js
/collect/:code        → /collect
/collection/:cardId   → /collection
/clue/:cardId         → /clue
```

The page then reads the value off `router.query`. **Any new dynamic route must be added here**, and its path
constant added to `Enum/Page.ts`.

⚠️ **Never navigate to `Page.MAIN` while the user is still signed in.** `_app.tsx` bounces a `userReady`
visitor off `/` to `/map`, so a sign-out that pushes first and calls `auth.signOut()` after dumps the
now-anonymous visitor on `/map` — no longer the dead `Custom404` it used to be (`AuthCheck` now bounces
them back to the landing page), but still a pointless round trip through a screen they cannot use. Sign out
**first**, then navigate (`pages/account.tsx`). `pages/auth/account-setup.tsx` keeps the opposite order
safely only because its error path has no user doc, so `userReady` is already false.

⚠️ **A redirect effect with `router` in its deps fires AGAIN after its own `push`.** The router identity
changes on navigation, the page is still mounted, the effect re-runs. Harmless when the destination is
constant (both pushes go to the same route), which is why the four auth pages got away with it for
years — but the moment the destination has a **single-use side effect** it is a real bug: the second
run found `destinationAfterAuth()`'s stash already spent and overwrote `/collect/:code` with `/map`.
All four (`login`, `login-email`, `register`, `register-email`) now guard with a `redirectedRef`, the
same idiom as `account-setup.tsx`'s `registeringRef`. Ref-guard any new one.

⚠️ **`userLoading` / `userReady` in `hooks/useUserData.ts` are DERIVED, never `useState` + effect.**
State set inside an effect is still stale on the render `authUser` first appears, so the hook reports
`authLoading:false, userLoading:false, userReady:false` — indistinguishable from "resolved, no
account" — and every consumer routes on it. `userLoading = !!authUid && loadedForUid !== authUid`, with
`loadedForUid` stamped in the `onSnapshot` callback. Two traps if you touch it: the **`!authUid` branch
must resolve to not-loading** (a signed-out visitor never gets a snapshot, so a `true` there pins the
whole app on `<Loader/>` and no public page ever renders — fails closed for 100% of players), and the
subscription effect must be keyed on the **uid string**, not the `authUser` object, or identity churn
resubscribes and flips `userLoading` synchronously into a full-screen Loader mid-game.

### Navbar

`components/Navbar/Navbar.tsx` is a fixed bottom bar with **4 side buttons** (Skanuj=`/collect` /
Osiągnięcia=`/achievements` / Ranking / Konto=`/account`) around a large circular **"super button"** in the
**middle** whose icon + action are *per-page*. The super-button's default is **Map** (`Page.MAP` /
`faMapLocationDot`, in `defaultNavbarConfig` + `useDynamicNavbar`'s fallbacks) — so with no override the
centre is the home/map button; pages override it declaratively for contextual actions:

```ts
useDynamicNavbar({ icon: faArrowLeft, onClick: () => router.back() });
```

The config lives in `NavbarConfigContext` and is reset to the Map default on unmount. Flags: `disabled`,
`disabledCenter`, `disabledSides`, `onlyCenter` (used by public/full-screen pages), `animate`,
`animatePointsAdded`. **Only the centre is dynamic — the 4 side tabs are hardcoded with fixed hrefs.** The
grid is `gridTemplateColumns: 'repeat(2, 1fr) 120px repeat(2, 1fr)'` (centre in the middle) — **adding a 5th
tab or making a side tab swappable means changing that + `NavbarConfig`.** The `+points` animation
(`animatePointsAdded`) renders next to the Ranking button. The old Collection/gallery tab was **retired** from
the nav (route + `collectCardHandle` kept, just no tab). Scanning is demoted to the Skanuj tab; the collect
code-entry screen (`LookForCodeView`) keeps the centre on Map and offers scan/confirm as **in-page buttons**,
so the map is always one tap away.

### Scanning — one overlay, three surfaces

**There is no scanner page.** `pages/scanner.tsx` and `Page.SCANNER` were deleted (#67); every scan happens
in **`components/CodeScannerOverlay.tsx`**, mounted behind a local `scanning` boolean by `LookForCodeView`,
`PinSheet` and `PinEditorForm`. It wraps `CodeScanner` (the `<video>` + qr-scanner wiring) with the
backdrop, the camera-permission copy and Anuluj. **Fork nothing here — mount the overlay.**

- **The contract is scan → fill → the surface's own confirm.** The overlay never submits; it writes that
  surface's input and closes, and the user confirms with `Potwierdź kod` / the navbar centre / navbar save.
  Do not reintroduce an intermediate confirm step: the old `/scanner` had one only because a standalone
  page has nowhere else to put an action and had to survive a route change.
- ⚠️ **`z-[60]`, the app's only z-index above 50.** Everything else tops out at `z-50` (navbar), with the
  map drawer at `z-30` backdrop / `z-40` sheet *below* it, because the drawer's confirm IS the navbar centre
  button. The overlay must cover the navbar, and does so **by value** — never by equal `z-50` + DOM order
  (`_app.tsx` renders `<Navbar>` before `<Component>`), which is what it used to rely on.
- ⚠️ **`allowBareCode` is admin-only.** A player's scan must carry the `NEXT_PUBLIC_CODE_COLLECT_URL`
  prefix, so a stray convention QR can never register as a code. Only `PinEditorForm` passes it (sticker
  sheets hold the bare code).
- **Printed QR codes never pointed at the scanner page** — they encode `/collect/:code`, a route, so
  native camera-app scans are unaffected by its deletion.
- `CodeScanner` calls `.start()` with no `.catch()`, so a denied permission is an unhandled rejection with
  no error state — the overlay's standing hint copy is the mitigation, **task #69** is the fix.

**`hooks/useTypingAnimation.ts`** types a code into a field character by character (150ms/char). Used by
both player surfaces for scans *and* by `/collect/:code` deep links; the admin editor fills instantly.
`onType` is held in a ref so the re-render each tick causes cannot restart the interval.

### Caching

`useCollectedCards` fetches `collectedCards`, `cardSets` and `clues` **once** and parks them in
`CardsCacheContext` (wrapped in a trivial `CollectionCache<T>`). It is a plain in-memory cache — a
one-shot `getDocs`, not a live subscription. Invalidate by calling `setCards(null)`; `collect.tsx` does
exactly that after a successful scan so the collection screen refetches.

By contrast, `ranking`, `guilds`, the user doc, and the admin lists all use **live `onSnapshot`**
subscriptions — that's what makes the leaderboard feel instant.

The **pins cache (`usePinsData` → `PinsCacheContext`) is a hybrid**, because the map both collects and
views at once (scanner↔map has no natural invalidation point): `pins` comes from the **`getPins`
callable** (`pins` is admin-only read, so it can't be a client listener without leaking the inline
`code`) with a **15-min poll + tab-focus refetch**, while `collectedPins` is a **live `onSnapshot`** so a
player's own collect greys its marker instantly. There is deliberately **no `setCollectedPins(null)`** —
refetch is freshness/retry only, never coupled to a collect. Mirror `useUserData`, not `useCollectedCards`.
The map registry (`mapId` → area/floor/image/dims) and the coordinate convention (`coords{x,y}` = pixels
from the image top-left, y down; the sole `[-y, x]` swap into Leaflet space) live in `utils/maps.ts`.

### Theming

**The per-club theme switcher was REMOVED (task #32, 2026 edition)** — clubs are hidden, so `Enum/AppTheme.ts`,
`hooks/useTheme.ts` and `ThemeContext` are deleted and `_app.tsx` no longer sets a theme class. The app now
always renders the base palette from `styles/globals.css` `:root` (accent `--color-primary: #9D2F00`). Tailwind
colors (`text-text-accent`, `border-button-border`, …) are still defined **in terms of those CSS variables**.
The `--color-guild-*` tokens + `{bg,border,text,ring}-guild-*` Tailwind colors/safelist stay — the commented-out
guild UI still references them, so re-enabling clubs is a diff-revert of that UI **plus** re-adding the switcher
by hand (theme was deleted, not commented). See §12 and the `CLUBS-DISABLED-2026` markers.

### ⚠️ Tailwind safelist

Class names are built dynamically in several places (`` `border-${guild.uid}` ``, `` `bg-card-${tier}` ``,
`` `bg-pin-${pin.type}` ``). Tailwind cannot see those, so `tailwind.config.js` carries an explicit
**`safelist`** — plain string literals, no patterns — with every `{border,bg,text,ring}-guild-*`,
`-card-*` and `-pin-*` combination.
**Any new dynamically-composed class must be added to that safelist or it will silently not exist in prod.**
Dev looks fine either way — the only honest check is to grep the built CSS:
`npm run build && grep -o '\.bg-pin-code' .next/static/css/*.css`.
Note the prefix asymmetry: `GuildUid` values already embed their prefix (`'guild-desert'`), while `CardTier`
and `PinType` values are bare (`'common'`, `'code'`) — hence `'card-' + tier` / `'pin-' + pin.type`.
Also note `content` only scans `./pages`, `./components` and `./layouts` (which **does not exist**) — classes
written in `utils/` or `models/` are invisible to Tailwind.

### ⚠️ Never size a FontAwesome icon with `w-*` / `h-*`

FA's stylesheet sets `.svg-inline--fa { height: 1em }` and `_app.tsx` imports it **after** `globals.css`.
Equal specificity → source order wins → every Tailwind `h-*` on an icon is dead. `w-*` does apply, but with
`height: 1em` the SVG's `preserveAspectRatio` scales the glyph to the height anyway, so **the icon always
renders at the inherited font-size** and the class silently does nothing.
**Size icons by font-size** — `text-3xl` on the wrapper (`Navbar.tsx`) or FA's `size` prop (`Loader.tsx`
`size="3x"`, `ranking.tsx` `size="sm"`). Margins/colour utilities are unaffected; only `w-`/`h-` are.

### Accent colour takes opacity modifiers

`text-accent` maps to `rgb(var(--color-primary-rgb) / <alpha-value>)`, so `bg-text-accent/20` and
`border-text-accent/50` work. It needs the **channels** var (`--color-primary-rgb: 157 47 0`) alongside
`--color-primary`; a bare `var()` cannot take alpha and Tailwind drops such variants **silently, generating
no rule at all**. Any new palette entry that needs `/N` opacity must be declared as channels the same way.

---

## 9. Seeding

`functions/src/seeds/*.ts.dist` are **templates checked into git with placeholder data**. The real seeds
(with real codes, real questions, real answers) are gitignored — you must copy `X.ts.dist` → `X.ts` and fill
them before `seedDatabaseHandle` will compile. There's also a `seeds.zip`. Only the five still-imported seeds
gate the build (see §2); the four retired ones can be missing without a compile error.

**Editor → seed round-trip (`scripts/export-pins.ts`).** The map-native pin editor (`upsertPinHandle`)
writes pins only to the emulator's `pins` collection (the gitignored `.emulators` dump), so authoring is lost
on a wipe. With `npm run emulators` up, `npx tsx scripts/export-pins.ts` reads the live `pins`, **merges** them
by uid with the existing `pinsSeed.ts`, and writes a **review copy `pinsSeed.generated.ts`** — it **never
overwrites** the real seed. Diff it (`git diff --no-index functions/src/seeds/pinsSeed.ts …generated.ts`) and
promote by hand. Merge = new uids appended, edited replaced, **seed-only entries preserved** (a hard
`deletePinHandle` delete does NOT propagate — retire via `isActive: false`, which merge captures). Output is
uid-sorted (so the **first** promote is a one-time reorder diff, stable after), strips `collectedBy` (re-emits
`{}`), serializes availability `Timestamp`s, and **fails loud** on a missing required `Pin` field or a
duplicate `code` across `code`/`ghost` pins (the invariant `upsertPinHandle` only checks against *live*
Firestore — a merge can reintroduce it). `pinsSeed.generated.ts` is gitignored (`src/seeds/*.ts`), so it never
shows in `git status`.

Seeding procedure: fill `ADMIN_EMAILS` in `functions/.env` **before anyone registers** and deploy →
register that address **with the Google popup** → use *"Seed database"* in the app's profile tab →
enter password `4064`.

⚠️ **A pre-event wipe takes the admin account with it, and the order is not recoverable.** `role` is written
**once, at account creation**, from `ADMIN_EMAILS`, and `seedDatabaseHandle` requires an existing
`users/{uid}` doc with `role: admin` — so wiping `users` (and `users-usernames`, or the username reservation
collides) means re-registering the admin **with Google** *before* seeding. Verify `ADMIN_EMAILS` on the
**deployed** function first: there is no in-app fix afterwards, only deleting both docs and starting over.

⚠️ **The ADMIN address must register with Google, never email+password.** That branch additionally
requires `email_verified` on the token, and the app never sends a verification mail
(`pages/auth/register-email.tsx` does not call `sendEmailVerification`) — so the email/password route
silently lands the admin a plain `user`. Role is written **once, at creation**, and
`users`/`users-usernames` are `allow write: if false`, so there is no in-app recovery: you must delete
both `users/{uid}` and `users-usernames/{username}` and re-register. The miss is greppable in the logs
as **`ROLE_LISTED_BUT_UNVERIFIED`**.

**`DASHBOARD_EMAILS` deliberately has no such gate** — a plain email match is enough, because the
`dashboard` role grants no data access at all (`firestore.rules` keys off `role == "admin"` only, no
callable reads it). It just pins the account to `/dashboard` and removes the ability to play, so the
TV account registers by email/password like any player. Do not "harden" this into symmetry with
admin: it would lock the projector out of its own screen.

## 9a. Testing (Cloud Functions, e2e)

Integration/e2e only — no per-function unit tests, no cosmetic/UI assertions. The suite lives in
`functions/test/` (`emulator.mjs` helper, `fixtures.mjs`, `*.test.mjs`), plain ESM + `node:test`, **no new deps**.
Tests mint a real ID token from the Auth emulator and POST to the actual callables, so they exercise real
Firestore transactions and the score fan-out — nothing is mocked.

- Run the emulator with **`npm run emulators:test`** (repo root), which forces the **`demo-qrcontest`** project.
  ⚠️ **A `demo-` project id is mandatory for tests.** Under the real project id (`qrcontest2023`) the admin SDK
  inside each function tries to reach the GCE metadata server for credentials and every in-function Firestore
  call **hangs ~60s then 500s**. The `demo-` id forces full offline mode. (`npm run emulators` keeps the real id
  for manual app testing, since it imports/exports `.emulators` and must match the app config.)
- Then `cd functions && npm test`. The harness resets Firestore+Auth and re-seeds a minimal fixture before each
  test; it does **not** use the real 64-card seed.
- **One-shot alternative:** `scripts/emu-test.sh [cmd...]` wraps `firebase emulators:exec` (demo project, builds
  functions first, waits for ready + tears down, propagates the exit code) — no two-terminal dance. Default cmd =
  the functions suite; pass any command (e.g. `node verify.mjs`). Env: `EMU_ONLY`, `EMU_NO_BUILD`, `EMU_PROJECT`.
- ⚠️ **The suite cannot share ports with a manual `npm run emulators`, and it cannot run against it either** —
  the tests REQUIRE the `demo-` project id (under the real id the in-function admin SDK hangs ~60s then 500s).
  So stop the manual emulator before running the suite **or committing** (the pre-commit hook runs it).
  Stop it with **SIGINT to the `firebase` node process** (the one carrying `--export-on-exit`) and wait for
  `✔ Export complete` — never `pkill` the java children, that loses the `.emulators` dump. ⚠️ Target the
  **node** process (`pgrep -f "bin/firebase emulators:start"`), not the `sh -c` wrapper above it — the
  wrapper does not forward SIGINT, so signalling it looks like it worked and the emulator keeps running.
  The pre-commit hook also runs the FE build, so stop `npm run dev` too or the two contend on `.next`.
- ⚠️ **ALWAYS falsify a concurrency test** — restore the pre-fix file (`git checkout HEAD -- <file>`), rebuild,
  run just that test (`./scripts/emu-test.sh node --test functions/test/<x>.test.mjs`) and confirm it **FAILS**
  before trusting it. Whether two `Promise.all` calls actually overlap in the emulator is **not reliable**:
  racing a callable against *itself* sometimes serializes (the second call then reads post-commit state, the
  race never happens, and the test passes against the unfixed code — a false green). Both outcomes are on
  record in `award-concurrency.test.mjs`: #55's `collectPinHandle` against itself serialized and had to be
  rewritten as `reviewPhotoHandle` vs `collectPinHandle`, while #54's `answerQuestionHandle` against itself
  raced fine. **Racing two DIFFERENT callables is the reliable shape** — reach for it when a self-race won't
  reproduce, and never assume either way without the falsification run.
- The canonical test asserts the score is identical in all four denormalized places after a collect + answer.
  **Every new point-granting feature must extend this suite** (see the fan-out warning in §12.2).
- ⚠️ **The suites share one emulator and each `beforeEach` wipes Firestore + Auth**, so they cannot run
  concurrently — `functions/package.json`'s `test` script passes `--test-concurrency=1`. Hand-running
  `node --test fileA fileB` drops that flag and produces spurious cross-file failures; pass one file, or use
  `npm test` / `scripts/emu-test.sh`.
- Current suite: `scoring` (card fan-out, plus the zero-point award leaving `scoreUpdatedAt` alone),
  `rounds` (winner ordering + eligibility + the auth/admin gate on `updateRoundsHandle`), `award-concurrency`
  (overlapping same-user awards
  grant an achievement bonus exactly once, and a double-fired answer awards once — the §12.2 read-set rule),
  `pins` (all three entry shapes, anti-bruteforce, dup guard, availability window, normalization,
  snapshot/secret-stripping), `admin-pins` (upsert/delete gates + validation, re-seed `collectedBy` preservation),
  `photos` (submit → pending → approve/reject, no-points-until-approve, reopen-on-reject, idempotency),
  `counters` (legacy docs missing a counter — the §12.2
  hydration rule), `achievements` (threshold crossing + 4-place fan-out, bonus cascade, exactly-once, response
  payload, eval-throw, malformed definition, location-badge targets counting every pin type) and `seed`
  (drives the REAL `seedDatabaseHandle` + real compiled
  `../lib/seeds/*.js`, guards the task-#5 fire-and-forget: asserts every seeded collection's doc count === seed
  length on a single immediate query with NO settle/retry; also asserts the four retired collections come back
  **empty** (`RETIRED_COLLECTIONS`), and that a re-seed preserves a round's `users`/`finished` while still
  applying an edited `to` — plus the auth→password→admin gates).
- `fixtures.mjs` helpers: `seedFixture` (also seeds the achievement definitions — every suite gets them, and
  fixture awards stay under every threshold so the other suites are unaffected), `seedUser(uid, name, overrides)`
  for presetting counters/score/`achievements`, `seedLegacyUser` for the missing-counter case, and
  `seedInvalidAchievements` for the malformed-definition case.

## 10a. Firestore indexes

`firestore.indexes.json` is **empty**. Every current query is single-field or an equality+equality
(`code == X && isActive == true`) that Firestore serves from automatic indexes. A new composite query
will need an index added here.

---

## 10. The TV dashboard

`pages/dashboard.tsx` is a full-screen kiosk view for a projector/TV, gated to `UserRole.DASHBOARD`.
It cycles randomly (weighted) between screen types every 60s — Agenda, Event, the two splashes and a
`Reminder` — and re-fetches the convention program hourly from Fantasmagoria's
JSON-RPC API (`NEXT_PUBLIC_DASHBOARD_API_URL`, method `GetKonwent2026Program`). The method is a **hardcoded
literal in `pages/dashboard.tsx`** and **year-stamped** — bump each edition. The URL var must be set in
`.env.production` at build time (`NEXT_PUBLIC_`, inlined) or the fetch silently resolves to `''`.
`AgendaScreen` drops entries longer than 6h (`MAX_AGENDA_ENTRY_DURATION_HOURS`) — permanent all-day booths
that would otherwise flood the scroll list.

⚠️ **The screen, the billboard, the reminder line and the colour theme are all drawn in the cycle effect,
never inline in the JSX** — the 1s colour transition re-renders the page, so an inline draw swaps the
artwork and the text mid-display. The cycle is a self-rescheduling `setTimeout` keyed on a `cycle`
counter, not an interval, so the tap-anywhere-to-advance handler restarts the full minute. `ScreenType`
weights need not sum to 1 (`getRandomArrayElementWithWeights` normalizes), but keeping them at 1 is what
makes them readable as percentages.

**`QrContestSplash` renders the two MOK map billboards** (`/dashboard/mok-{parter,piwnica}.webp`, 3840x2160)
picked at random. ⚠️ **Each has a live 10-char pin code and its QR baked into the art** — `1MB2C1F9WG`
(Parter) and `1DLDL9NRT8` (Piwnica). The pins must match the billboards, never the other way round; a
re-export that drops or alters either string breaks a scannable code with no in-app fix.
The `Reminder` pool partitions on `nightOnly` via `(reminder.nightOnly ?? false) === isDarkAlready`
(21:00-06:00), so night entries are the *only* ones eligible after 21:00 — adding a second night line
needs no logic change.

Fetch the live program yourself (no app needed):
`curl -s -X POST "$NEXT_PUBLIC_DASHBOARD_API_URL" -H 'content-type: application/json-rpc' -d '{"id":null,"method":"GetKonwent2026Program"}'`
→ `result[]` of `{id, name, title, description, category, location, date_start, date_end}` (UTC dates).

---

## 11. Known cruft / staleness

Things that are wrong-but-harmless today; fix opportunistically, don't be surprised by them:

- `NEXT_PUBLIC_APPCHECK_*` env vars exist but App Check is never initialized.
- `seedDatabaseHandle`'s password `'4064'` is a hardcoded literal in the source.
- `FireDoc` is missing `questions` and `collectedQuestions`; those paths are string literals in the functions.
- `TIME_BETWEEN_GUILD_CHANGES_MS` is defined twice (client + server) and can drift.
- ✅ **Fixed (task #45): location badges used to unlock early.** `feedback` (since #12) and `photo` (on
  approval) increment a `pinsInScope` numerator whose denominator counted only `code`/`riddle`/`visit`, so a
  badge in a scope holding either type granted before the scope was finished. Both sides now count **every**
  pin type and `COLLECTIBLE_PIN_TYPES` is gone — it was serving two different questions at once, which is
  what let them drift. See §12.3.
- ✅ **Fixed (task #43): the admin screens are pin-era.** `/admin/pins` (list) and
  `/admin/recently-collected` (feed, capped at the newest 500 rows) read `pins` directly — admins may read
  the collection, and `Pin.fromFirestore` hydrates the real `code` + `collectedBy`, so no callable is
  involved. `/admin/cards` + `/admin/edit-card` are deleted; the pin editor gained a scan-to-fill button
  in place of the scanner's old admin shortcut.
- ✅ **Fixed (tasks #14 + #58): re-seeding used to wipe live gameplay state.** `seedPins`/`seedCards` used
  to `.set()` with no `{merge: true}`, so re-seeding reset every pin's/card's `collectedBy` to `{}` while
  `users/{uid}/collectedPins|collectedCards` survived — the two would then disagree and the next collect
  surfaced an opaque `ABORTED` (`assertPinIsNotAlreadyCollected` passes, then `transaction.create` hits
  `ALREADY_EXISTS`). ⚠️ **`{merge: true}` alone does NOT fix this**, and never did — a common
  misconception. Firestore's merge does not skip a field just because its value is `{}`; the field being
  *present in the payload at all* means "overwrite this path", so a seed literal carrying
  `collectedBy: {}` still wipes existing finders even under `merge: true`. The actual fix
  (**`seedWithPreservedFields(db, collection, docs, keys)`** in `seedDatabaseHandle.ts`) omits the listed
  keys from the payload entirely for a doc that already exists (merge then leaves those paths untouched),
  and writes the doc whole on first creation so they are never simply absent. `seedRounds` had the same
  bug and got the same fix in #58 — a re-seed used to blank every round's accumulated `users` map and
  reopen finished rounds, emptying the live leaderboard for everyone. Preserved keys: `pins` →
  `collectedBy`, `ranking` → `users` + `finished`. `from`/`to`/`name` stay overwritable, which is what
  lets a boundary edit land on a re-seed at all. Regression nets: `admin-pins.test.mjs`'s re-seed test
  and `seed.test.mjs`'s round-preservation test.

---

## 12. The 2026 / 16th edition — mostly shipped

Hosting stays on **Firebase**, same as last year. **This section is now mostly history, not a plan** —
the 2026 code core is shipped end-to-end. Read it for the design record and the binding constraints
(§12.0 especially); read **task #9** for what is actually left.

> **The 2026 event goes live around 2026-07-24.** It is a physical convention — the date does not move.
> The app only runs for ~3 days and does 100k+ ops in that window; there is no calm redeploy window
> mid-event. Scope accordingly: fewer features, tested, beats more features, untested.
>
> **Status as of 2026-07-20 — the CODE CORE IS SHIPPED. What remains is content + polish:**
> **#16** (author 50+ real pins, real 9-map art, balance pass — the long pole and #1 risk), **#33/#34**
> (regulamin / FAQ still describe the retired card game — ⚠️ but the two reward codes printed in their copy
> are now LIVE `ghost` pins (#60), so a rewrite must not drop or alter them: `pages/rulebook.tsx` carries
> `PB944GH25M` as-is, and `pages/faq.tsx` prints `9DG76W9SGN` whose pin stores the **reverse**,
> `NGS9W67GD9` — that inversion is the joke and the seed is the source of truth), **#44** (feedback admin
> view), **#42** (dead `w-/h-` icon sizing on three pin components), **#38** (rated-talks achievements).
> #19–#21 deferred; #22/#26 closed won't-do. **#43 shipped** — the admin panel is pin-era (see §11).
> **#36 shipped** — the landing page is pin-era, and it left behind `components/PinTypeLegend.tsx`
> (the pin types, built from `PinMarkerIcon` + `getPinTypeFriendlyName`, with `ghost` filtered out).
> **#33/#34 must reuse it rather than restating the mechanics by hand** — that duplication is exactly how
> the three pages drift. ⚠️ **#66 committed `/collect` to QR framing** ("KODY QR", panel `Przepisz kod QR`),
> overriding that task's own no-`QR` decision — so regulamin/FAQ must phrase the ghost-code instruction so a
> reader typing a non-QR code into a screen labelled QR still knows they are in the right place.
> **#67 shipped** — scanning is one shared overlay on all three surfaces and `/scanner` is gone; ⚠️ regulamin/
> FAQ must not tell players to "go to the scanner screen", there isn't one (see §8 *Scanning*).
>
> - ✅ **12.2 shipped as pins** — the pin model, `collectPinHandle`, the pin visual system and the rewired
>   collect screen are done and manually verified. Cards are retired (handler still deployed, UI orphaned).
>   The **feedback-pin flow (#12)** landed too: `{pinUid, rating, talkName}`, no question draw.
>   ⚠️ Its data is **written and never read** — an admin view is task #44.
> - ✅ **12.1 shipped as the `/map` screen (#13)** — Leaflet `CRS.Simple` over 9 maps, the `getPins`
>   read callable (strips `code` + `collectedBy`), the `hintRadius` field, `usePinsData` (getPins poll +
>   live `collectedPins`), and the per-type pin sheet. `/` stays the public landing.
> - ✅ **12.5 shipped as the navbar/IA rework (#25)** — centre super-button defaults to **Map** (still
>   per-page overridable), side tabs are Skanuj/Osiągnięcia/Ranking/Konto, the Collection tab is retired,
>   signed-in users hitting `/` redirect to `/map` (in `_app.tsx`, not `index.tsx`), and the collect screen
>   moves scan/confirm in-page so the centre stays Map.
> - ✅ **12.3 shipped whole** — the engine (#23: definitions as data, pure type-predicates, auto-grant inside
>   `awardPoints`), the **screen** (#24, `/achievements` + `useAchievements`) and the **unlock toast** (#30,
>   plain `react-hot-toast` via `utils/scheduleAchievementToasts.tsx`). Location badges (#37) shipped as the
>   `pinsInScope` type.
> - ✅ **12.4 shipped as photo-proof pins (#19)** — a `photo`-type pin: client uploads a downscaled image
>   (Storage SDK, narrow owner-only `storage.rules`) → `submitPhotoHandle` marks it **pending, no points**
>   → admin approves/rejects at `/admin/photo-review` → **points only on approve** via `awardPoints`.
>   New `user.pendingScore` (score sibling, NOT a counter). `collectPinHandle` still rejects `photo`.
>   Kill-switch = seed zero photo pins. See §12.4.
> - ✅ **Clubs/guilds DROPPED from the UI for 2026 (task #32).** The guild UI is commented out (grep marker
>   `CLUBS-DISABLED-2026`) and the per-club theme switcher deleted. The backend fan-out (`updateGuild`) still
>   runs but is **write-only / unread** by the client — do not build new guild surfaces without re-enabling first.
> - ✅ **Renamed to "Gra Konwentowa" (#35)** — see the banner at the top of this file for the inflection rule.
>   The rename covered `pages/index.tsx`, `rulebook.tsx` and the footer only; the *game-model* prose was
>   left card-era — fixed on the landing page by #36, still outstanding on regulamin/FAQ (#33/#34).
>
> ⚠️ **The task manager is the live source of truth, not this file.** Task **#9** is the epic/status board
> for the 2026 edition — read it first for current status and the full list of locked decisions.

### 12.0 Non-negotiable design requirement

**All client writes stay denied.** `firestore.rules` remains `allow write: if false` on every collection.
Only Cloud Functions may mutate data, and **anything that awards points must be transactional.**
No new feature may open a client write path to game state. (The one client write surface that *does* open
up is Firebase **Storage**, for photo uploads — see 12.4 — and only under tight constraints.)

### 12.1 Map — the app's main screen

> **✅ SHIPPED (#13).** Mechanics live in §8 (caching, `utils/maps.ts`) and §6 (`getPinsHandle`).
> Only the still-binding decisions are kept here; decisions 24–31 in task #9 are the full spec.

- **Plain `.webp` images, Leaflet + `CRS.Simple`. No GPS, ever.** Geolocation was proposed twice and
  **rejected**: it cannot distinguish MOK's floors indoors, and a misfiring geofence is unfixable mid-event.
- ⚠️ **The map set is NINE images, and it is NOT "each building has 3 floors."** **Dwór** is a standalone
  *city* map belonging to no building; **MOK** has 5 levels (Piwnica, Parter, Piętro 1, **Piętro 1.5**,
  Piętro 2); **2LO** has 3 (Parter, Piętro 1, Piętro 2). `utils/maps.ts` is canonical. Swapping placeholder
  art for real art is **overwriting files in `public/maps/`, no code change**, as long as filenames match.
  ⚠️ **But then re-run `scripts/generate-low-maps.sh` (#56).** The "Niska" quality toggle serves
  half-res copies from `public/maps/low/`; overwriting the full-res art without regenerating leaves every
  player on "Niska" seeing the *previous* edition's map, with no error anywhere.
- `hintRadius` makes a marker an *area* hint rather than a precise dot — used for `code` pins, whose QR is
  hidden "somewhere around here". `null` = precise point. ⚠️ It is authored in **map-relative units, not
  pixels**: 1 unit = 1% of the map's shorter side, converted at render time by `hintRadiusToPixels`
  (`utils/maps.ts`). So typical values are single digits, the same value means the same share of the floor
  on every map, and swapping in higher-resolution art doesn't shrink every hint circle. Unlike `coords`,
  which stay absolute pixels.
- Only `code` pins are reachable from `/collect/:code`. **`riddle` / `visit` / `feedback` / `photo` pins have
  no entry point other than the map's pin sheet.**

### 12.2 The point-award contract (shipped with pins) — **binds every future feature**

> ✅ **This section is now history, not a plan.** "Quests" never shipped as a separate entity — they became
> **pins** (`pins/{pinUid}`, `collectPinHandle`, `users/{uid}/collectedPins`). There is no `questHandle`, no
> `amountOfCompletedQuests`. The counter that shipped is **`amountOfCollectedPins`**.
> **Naming rule: pins say `collect`, never `complete`** — pins mirror cards 1:1, and cards are `collected`
> throughout. No `complete*` **identifier** exists anywhere in the source, rules, tests or seeds; the word
> survives only as ordinary English prose in comments and docs. Do not reintroduce one.
> The paragraphs below are kept because the `awardPoints` contract and the counter-hydration rule they
> describe are still exactly right — and they bind every future point-granting feature (achievements, #23).

- **Collecting a pin grants points.** That is the load-bearing sentence.
- ⚠️ Points fan out to **four** places (user doc, every open ranking round, the guild's member entry, the guild
  aggregate). This is now owned by **`functions/src/actions/awardPoints.ts`** —
  `awardPoints(db, tx, userRef, user, points, counters?)` does the user-doc `score`/counter increment, mutates
  the in-memory `user` in place, and fans out to `updateRanking` + `updateGuild` (reading the `ranking`
  collection once and passing the snapshot to both). `collectCardHandle`, `collectPinHandle` and
  `answerQuestionHandle` all go through it; they keep only their domain writes. `counters` is a generic
  `Partial<Record<UserCounterKey, number>>` delta map — `collectPinHandle` passes `{ amountOfCollectedPins: 1 }`.
  `updateRanking(rounds, tx, user)` / `updateGuild(db, rounds, tx, user)` take the pre-fetched rounds snapshot;
  the two non-award callers (`setupAccountHandle`, `joinGuildHandle`) fetch it inline and pass it.
  → **Route every point award through `awardPoints`, do not hand-roll another copy of the fan-out.**
- ⚠️ **Every award transaction must open with `readUserInTransaction(transaction, userRef)`** (exported from
  `actions/getCurrentUser.ts`) and pass THAT user to `awardPoints` — task #55. `getCurrentUser` reads the doc
  *before* the transaction, so without an in-transaction read the tx has no read-set on the user doc and
  concurrent same-user awards don't serialize: each sees the same pre-award snapshot, each judges an achievement
  threshold newly crossed, and each folds the bonus into its own `increment` — permanent, non-self-healing
  double-count. It **must be the first op in the callback, before any `transaction.set/update/create`**
  (Firestore forbids a read after a write), which is why the domain writes follow it rather than precede it.
  The read lives in the callers, not inside `awardPoints`, for exactly that ordering reason.
- **User counters are normalized on hydration, not per-award.** A user doc written before a counter existed
  lacks that field, and `getCurrentUser` casts `doc.data() as User` — so the type would otherwise lie.
  `getCurrentUser` spreads `USER_COUNTER_DEFAULTS` (`functions/src/types/user.ts`, next to the `UserCounterKey`
  union) over the doc, which is why `awardPoints` can use a plain `user[key] += …` with no `?? 0` guard.
  Without it, `updateRanking` copies `undefined` into the round and the admin SDK **throws mid-transaction**,
  aborting the whole award. `USER_COUNTER_DEFAULTS` is typed `Record<UserCounterKey, number>`, so a new
  counter without a default is a compile error — add every new counter to the union, `User`, *and* the
  defaults. Regression net: `functions/test/counters.test.mjs` (+ `seedLegacyUser` in `fixtures.mjs`).
- ⚠️ **`user.scoreUpdatedAt` is the leaderboard's tie-break basis, and is NOT `updatedAt`** (task #80).
  `updateRanking` stamps `updatedAt` on *every* write, and plenty of those change no score:
  a wrong answer (`answerQuestionHandle` awards 0), `recheckAchievementsHandle` (calls
  `awardPoints(…, 0, {}, [])` for **every player it repairs**), a zero-value pin, account creation.
  Tie-breaking on that would let staying active — or an admin running a repair near a round close — silently
  reorder who wins a prize. So `awardPoints` moves `scoreUpdatedAt` **only when `points + bonus !== 0`** (an
  achievement bonus with no base points does count — the score really changed), setting it on the in-memory
  user so `updateRanking` copies the same commit timestamp; `updateRanking` only ever **copies** it, never
  stamps, so the two non-award callers carry it through untouched. It is a score **sibling** like
  `pendingScore`, not a `UserCounterKey`, so `getCurrentUser` hydrates it separately (to `null`).
  Records predating the field carry `null` and `orderRankingEntries` falls back to `updatedAt` for them,
  self-correcting on that player's next scoring award.
- Points are never awarded client-side. The callable that shipped is `functions/src/collectPinHandle.ts`,
  registered in `functions/src/index.ts`, exported through `utils/functions.ts` as `collectPinFunction`.
  Any further pin flow (talk feedback, #12) forks **it**, not `collectCardHandle`.

### 12.3 Achievements — ✅ FULLY SHIPPED (engine #23, screen #24, unlock toast #30, location badges #37)

They **award points**, so granting routes through `awardPoints` like every other point source. The split
that matters: **definitions are DATA, logic is CODE.**

- `achievements/{uid}` is a readable collection (`{name, description, icon, group, type, target, bonus, order, scope?}`),
  seeded from `achievementsSeed.ts`. Definitions are data so a threshold can be retuned **by editing the seed
  and re-seeding**, with no redeploy of logic. ⚠️ **Do not hand-edit these in the Firestore console** — the
  committed seed is the source of truth and a console edit is invisible to git and silently lost on the next
  seed. (`pinsInScope` targets are additionally overwritten by `recomputeAchievementTargets`.)
- **Logic lives only in `functions/src/achievements/typePredicates.ts`** — `TYPE_COUNTERS`, one counter
  accessor per `AchievementType` (`points` → `score`, `correctAnswers` → `amountOfCorrectAnswers`). Unlock
  is always `counter(user) >= target`, so the unlock and #24's progress bar read the same number.
  **Adding an achievement = one Firestore doc; adding a TYPE = code** (the union makes that compile-enforced).
  Never `switch (uid)`; never let a predicate read Firestore or touch the tx.
- **Location badges (#37) are the `pinsInScope` type** — one per map floor + per building. Counter is
  `user.collectedPinsByScope[def.scope]` (a **map-valued** counter, incremented via `actions/pinScopeKeys.ts` =
  `group:<g>` + `map:<mapId>` + `type:<pinType>`; it does NOT join the flat `UserCounterKey`/`USER_COUNTER_DEFAULTS` machinery —
  `getCurrentUser` hydrates it to `{}` separately). Unlike every other type, **`target` is DERIVED, not
  authored**: `recomputeAchievementTargets` recounts pins per scope and writes `target` onto the defs on
  every seed/`upsertPinHandle`/`deletePinHandle` (so authoring `target` on these is pointless — it's
  overwritten). ⚠️ **EVERY active pin type counts toward the target** (task #45) — `recomputeAchievementTargets`
  filters on `isActive` alone, matching the award path, which calls `scopeKeys(pin)` for every type. Filtering
  by type on **one side only** is exactly what made badges unlock early before #45 — the rule is that the two
  sides must agree, which they do by both reading `scopeKeys` and neither filtering around it. The
  deliberate exceptions live *inside* that helper, so both sides still drop them together: **`ghost` (#60) and
  `geocaching` (#75) omit their `map:<mapId>` key** — each sits on a map image only because a marker needs
  coordinates (a ghost marks a place that is not there; a geocache is hidden in plain sight), so neither must
  inflate that floor's badge. Each still counts towards its `group:` **and its own `type:` scope**.
  Consequences worth knowing when authoring pins (#16): a `feedback` pin in a
  scope means its badge needs the talk rated, and a **`photo` pin means the badge cannot complete until an
  admin approves that photo** — keep photo pins out of any scope that must stay self-serve.
  `loadDefinitions` rejects a `pinsInScope` def with `target < 1` (a `>= 0`
  target auto-grants event-wide on a player's first award).
- **Per-type badges (#38) are `pinsInScope` scoped `type:<pinType>`** — "collect every pin of a kind", one per
  collectible type (code/riddle/visit/feedback/ghost/geocaching; `photo` is excluded — it can't self-complete, it
  needs an admin approval). They need **no manual grouping** (type is intrinsic): `scopeKeys` emits `type:<pin.type>`
  for every pin, so the derived target and the award numerator stay in step exactly the way the location badges do.
  Geocaching used to be the one hand-tagged `group:geocaching` badge; since #75 it is a first-class `PinType` with a
  `type:geocaching` badge, so **no badge needs hand-tagged pins** any more. ⚠️ **The client
  (`useAchievements`) hides any def with `target < 1`** so an empty-scope badge (a `type:`/`map:`/`group:` whose
  scope has zero active pins) neither shows nor dilutes the completion-%, mirroring the server `loadDefinitions`
  reject.
- **`order`** is the /achievements display sort key (lower first; `pages/achievements.tsx` sorts on it, then
  `target`). The seed authors it in blocks of 100 per category (100s score · 200s location incl. building
  "kings" · 300s owls · 400s types incl. geocaching · 501 zaświaty) with gaps so a new badge slots in without a
  renumber. It is **display-only — the server never reads it.** Per-type badge `icon` keys mirror `getPinIcon`
  (qrcode/puzzle-piece/map-pin/microphone/ghost); building "kings" use `crown`.
- ⚠️ **A bug here must never kill scoring** — it runs inside *every* `awardPoints` transaction, event-wide.
  `evaluateAchievements(user, definitions)` is pure (no writes, does not mutate `user`, returns a grant LIST)
  and is wrapped in try/catch; `applyGrant` — the only writer — runs **outside** the try, which is why a
  mid-loop throw cannot half-apply a grant. Two stable, greppable log prefixes:
  **`ACHIEVEMENTS_EVAL_FAILED`** and **`ACHIEVEMENTS_DEF_INVALID`** (a malformed doc is skipped *and* logged —
  never a silent no-op, since the compiler cannot vouch for a Firestore doc).
- `loadDefinitions` caches for **60s** (0 under `FUNCTIONS_EMULATOR` so e2e reads fresh) and serves
  last-known-good on a failed fetch — scoring never blocks on it.
- **Exactly-once guard = `users/{uid}.achievements[uid] = {grantedAt, bonus}`** — a map on the user doc
  (already loaded per award, already live-synced to the client), not a subcollection. `bonus` records what was
  *actually* awarded, so editing a definition later cannot rewrite history. **There is deliberately no
  `collectedAchievements` clone**: definitions are public, so #24 shows ALL achievements (locked included) by
  joining definitions × that map × live counters. Cards/pins clone only because their source is admin-only-read.
- `awardPoints` returns `AchievementGrant[]`, surfaced by the collect/answer callables as `achievements`.
  ⚠️ It **must be the return value of the `runTransaction` callback** — an outer closure array yields phantom
  grants (and phantom toasts) when Firestore retries a contended tx body.
- `User.fromFirestore` **skips achievement entries it cannot parse** rather than throwing: `useUserData`
  subscribes to that doc, so one malformed entry would otherwise brick the whole app for that player.
- Known accepted risk: a swallowed eval error on a player's *final* award loses that badge — there is no next
  award to self-heal on. Mitigation is visibility (the log prefix), not machinery.

### 12.4 User photo uploads — private pin proof, manually reviewed

> **✅ SHIPPED as photo-proof pins (#19).** A `photo`-type pin, reachable ONLY from the `/map` pin sheet
> (`collectPinHandle` still rejects `photo`). Flow: client downscales the shot (`utils/downscaleImage.ts`,
> canvas ≤2048px q0.8) → `uploadBytes` to `users/{uid}/photos/{pinUid}` under a **narrow owner-only
> `storage.rules`** (owner + `<10MB` + `image/*`, overwrite-allowed) → `submitPhotoHandle` validates the
> pin, verifies the object exists, writes `collectedPins`(awardedPoints 0) + a `photoSubmissions` doc +
> `user.pendingScore += value` — **no points, no fan-out**. Admin reviews at **`/admin/photo-review`**
> (`getPhotoSubmissionsHandle`, admin-read-via-callable → 15s poll, photos via server-built
> **download-token URLs**, no signBlob): **approve** → `reviewPhotoHandle` awards `sub.value` through the
> shared `awardPoints` (full pipeline: score + 4-place fan-out + achievements + location scope counters)
> and sets `awardedPoints`; **reject** → deletes `collectedPins` + the pin's `collectedBy` entry so the
> pin **REOPENS** for retry. Both clear `pendingScore`; review is idempotent (transactional
> pending-status check) and uses snapshotted `sub.value`/`sub.scopeKeys`, never re-reading the pin.
> `user.pendingScore` is a **score sibling** (both type worlds + `getCurrentUser` default 0) shown ONLY on
> the player's own ranking header as `+X oczekuje` — NOT a `UserCounterKey`, never fanned out, never in
> leaderboard sort. `assertPin*` guards were extracted to `actions/assertPin.ts` (shared with
> collectPinHandle). Kill-switch: seed zero photo pins → feature fully inert. Tests: `functions/test/photos.test.mjs`.

- Photos are **proof that a pin was collected** — not a social feature. **No public gallery; users cannot see
  each other's uploads.** Review is manual: **explicitly no AI moderation** (cost, and not wanted).
- **`storage.rules` opens exactly ONE narrow match** (`/users/{uid}/photos/{pinUid}`: owner + `<10MB` +
  `image/*`, overwrite allowed) — everything else stays `allow read, write: if false`. This is the only
  place the app lets a client write directly to Firebase infrastructure. Admins read photos via
  server-built download-token URLs, not a rule. Overwrite (not create-only) is deliberate: create-only has
  an orphan trap where a dropped `submitPhotoHandle` call leaves an object the retry can't replace.
- `getStorage()` is initialized + emulator-wired in `utils/firebase.ts` (client) and used server-side via
  `functions/src/actions/photoStorage.ts` (bucket resolved from `FIREBASE_CONFIG`/`GCLOUD_PROJECT`).

### Checklist for adding *any* new entity (pin type, achievement, collection)

1. `Enum/FireDoc.ts` — add the collection name.
2. `firestore.rules` — add a `match` block. **Default to `allow read: if request.auth != null; allow write: if false;`**
   and put the mutation behind a callable. If the client must never see part of the doc (e.g. a quest's answer,
   a marker's solution), keep it in a server-only collection with *no* rule at all, the way `questions` does.
3. `models/<Entity>.ts` — client class + converter (throw in `toFirestore` if immutable).
4. `functions/src/types/<entity>.ts` — admin-side type.
5. `functions/src/seeds/<entity>Seed.ts.dist` + wire it into `seedDatabaseHandle.ts`.
6. `Enum/Page.ts` + `next.config.js` rewrites — if it gets a route.
7. `components/Navbar/Navbar.tsx` — if it gets a tab (mind the hard-coded `repeat(2, 1fr) 120px repeat(2, 1fr)` grid + hardcoded side hrefs).
8. `tailwind.config.js` `safelist` — if it introduces dynamically-built class names.
9. `firestore.indexes.json` — if it needs a composite query.
10. Update `User` in **both** type worlds if it adds a counter, plus `USER_COUNTER_DEFAULTS` (compile-enforced),
    and `RankingRoundUser` / `GuildMember` if that counter should show up on a leaderboard.
11. **Route every point award through the shared transactional `awardPoints` action.** Never hand-roll the fan-out.
12. Extend `functions/test/` — the e2e suite is the only safety net (§9a).

**Worked example:** pins did every step of this. `Enum/FireDoc.ts` (`PINS`, `USERS__COLLECTED_PINS`),
`firestore.rules` (admin-only read, because the `code` is inline), `models/Pin.ts` + `models/CollectedPin.ts`,
`functions/src/types/pin.ts`, `pinsSeed.ts.dist` → `seedDatabaseHandle`, the safelist, the `User` counter +
`USER_COUNTER_DEFAULTS` + `RankingRoundUser`, `awardPoints`, and `functions/test/pins.test.mjs`.
Copy that shape for achievements (#23).
