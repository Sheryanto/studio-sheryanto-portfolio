# Writer's Rep: handover to a new Claude Code session

Paste the section **"Prompt for the new session"** into the new chat, and attach (or place in the
repo) the two files it mentions: `WRITERS_REP_PRD_v1.0.md` and this code.

---

## Prompt for the new session

> You are taking over **Writer's Rep**, a personal writing-training and accountability app (single
> user, Arabic-first RTL, mobile-first Android + desktop, inspired by Hevy's clarity but not its
> branding). Act as my senior full-stack engineer, product designer and tech lead.
>
> **Sources of truth, in order:**
> 1. `WRITERS_REP_PRD_v1.0.md` (the PRD). Read all of it first.
> 2. `writers-rep/docs/HANDOVER.md` (this file): current state, decisions, rules.
> 3. `writers-rep/docs/PLAN.md` and `writers-rep/README.md`.
>
> **Status:** Milestones M0 and M1 are done and tested: 59 unit tests and 12 Playwright tests pass.
> Nothing has been deployed. Nothing has been tested on a physical phone yet.
>
> **Your first steps:**
> 1. `cd writers-rep && npm install && npm run check && npm run test:e2e` and confirm everything is green.
> 2. Read the code map in HANDOVER.md before changing anything.
> 3. Then implement **Milestone M2** (scope below). Keep the app runnable after every step.
>
> **Working rules (from me, non-negotiable):**
> - Work autonomously within the PRD scope. Ask only for decisions with high cost, security, or
>   product implications.
> - Never create mock buttons, fake or sample statistics, or features that look functional but aren't.
>   Use real persisted data only.
> - Never claim the Android home-screen widget works until it is implemented natively and tested on
>   an Android device. A PWA shortcut is not a widget.
> - No paid APIs, no AI features with external costs, no subscriptions, no public deployment, no
>   purchases without my explicit approval.
> - Never risk losing my writing. Preserve revisions; no silent overwrites.
> - Consistency metrics must never pose as writing-quality metrics. Word count never decides completion.
> - At the end, report: what was implemented, what works, what is incomplete or untested, how to run
>   and test it, and the recommended next milestone.

---

## Where the code is

- GitHub: `sheryanto/studio-sheryanto-portfolio`, branch **`ccr-793c1d4b-xet0a4`**, folder
  **`writers-rep/`**. That repo is also my portfolio site; the root portfolio files must stay untouched.
  Moving the app to its own private repo is fine and was recommended (if GitHub Pages serves the
  portfolio repo, merging would expose the source folder publicly).
- If the GitHub repo is not reachable from the new account, the same code is in
  `writers-rep-handover.zip` (contains `writers-rep/` plus the PRD).

## Stack

Vite 8 + React 19 + TypeScript (strict), Dexie 4 (IndexedDB), dexie-react-hooks, react-router 8
(HashRouter), vite-plugin-pwa 2 (generateSW, `registerType: 'prompt'` so an update never reloads under
the writer), self-hosted fonts (IBM Plex Sans Arabic for UI, Noto Naskh Arabic for writing), Vitest 5 +
fake-indexeddb, Playwright 1.63 (Pixel 7 + desktop projects), ESLint 10 flat config.

## Commands

```bash
cd writers-rep
npm install
npm run dev            # http://localhost:5173
npm run build && npm run preview   # http://localhost:4173, with service worker / offline / install
npm run check          # tsc + eslint + unit tests (Asia/Dubai) + unit tests (America/New_York) + build
npm run test:e2e       # Playwright; builds and serves automatically
npm run icons          # re-render PNG icons from public/icons/icon.svg (uses Playwright Chromium)
```

## Code map

```
writers-rep/
  index.html, vite.config.ts (PWA manifest: lang ar, dir rtl, start_url ./#/today, shortcut ./#/start)
  vitest.config.ts, playwright.config.ts, eslint.config.js, tsconfig*.json
  public/icons/            icon.svg + 192/512/maskable PNGs
  scripts/make-icons.mjs
  src/
    main.tsx               fonts, CSS, initApp(), navigator.storage.persist()
    app/App.tsx            routes: /onboarding, /today, /start (deep link: start or resume today),
                           /session/:id, /program, /library, /library/:id, /history, /settings;
                           tab bar (bottom on mobile, side rail ≥900px); SW update banner
    app/AppContext.tsx     settings (live), i18n, `now` tick every 30s + on focus, day rollover → ensureSchedule
    components/            Icon, Dialog (native <dialog>), StatusBadge, WeekRolePicker
    data/                  exercises.json (24), tracks.json (4), program.json (4 weeks × 5), library.ts (validateLibrary)
    db/db.ts               Dexie schema v1 (all PRD §6 tables + app_events log); BACKUP_TABLES
    db/repo.ts             ALL writes: initApp, ensureSchedule, completeOnboarding, updateSettings,
                           startSession, setSessionRunning, sessionHeartbeat, saveDocumentContent,
                           completeSession, revisions/restore, recovery, refreshWidgetSnapshot
    db/backup.ts           exportAll, validateBackup, parseBackupText, importBackup (atomic), md/txt export
    domain/                pure logic: types, dates, schedule, status, stats, timer, wordcount, ids, widgetSnapshot
    features/              onboarding, today, session (SessionScreen, useAutosave, draftJournal),
                           library (LibraryScreen, PieceScreen, filter), history, program, settings (+ useInstallPrompt)
    i18n/strings.ts        Arabic source + English mirror typed as the same shape; format.ts (ar-u-nu-latn)
    platform/native.ts     M3 seam: publishWidgetSnapshot() is a no-op on web
    styles/global.css      dark tokens, logical (RTL-safe) properties
  tests/unit/              wordcount, dates, timer, library, schedule, repo, backup, filter
  tests/e2e/core.spec.ts   first-launch → write → reload → resume → finish → Library/History;
                           English LTR; missed cutoff + late session; backup export/corrupt/import;
                           offline via service worker; English UI LTR
```

## Product rules already implemented (keep them)

| Area | Rule |
|---|---|
| Weekly pattern | Each weekday is training, review, or rest; at most one review day. Stored as `trainingDays`, `reviewDay`, `restDays` (the PRD's single `restDay` became a list). Defaults: Mon–Fri training, Sat review, Sun rest, week starts Monday, 20-min sessions, cutoff 21:00, reminder 19:00, Arabic UI and writing. |
| Schedule | Assignments exist for every training day from `programStartDate` through the end of the current week, including days the app was never opened, so missed days can't vanish. `scheduleGeneratedThrough` freezes the past. Changing the pattern only deletes unstarted future days (and today before the cutoff), then regenerates. Logged to `app_events`. |
| Program | Advances one step per **scheduled** training day (`programIndex`) and cycles after 20. A missed day keeps its exercise. |
| Onboarding after cutoff | The program starts tomorrow, so there's no instant "missed" day. |
| Status | Derived: `upcoming` → `due` (before the cutoff) → `missed`; `in_progress` when a qualifying active session exists; `completed`/`excused` are persisted. |
| Counting | A session completes its assignment only if it is a **full** session that **started before the cutoff** of the scheduled date. Late sessions are saved and labelled late but never convert a missed day. |
| Timer | Sessions are created **paused**; the editor starts the timer. Counts active time only; pauses when hidden and auto-resumes if it auto-paused. 5 s heartbeat; crash recovery credits time only up to the last heartbeat (`recoverInterrupted`) and sets `interruptedAt`. A module-level `startedInThisPage` set distinguishes a live editor from a dead page. Finishing early stores actual minutes. |
| Autosave | Synchronous localStorage journal on every keystroke (`wr.journal.<docId>`), IndexedDB after 500 ms debounce, flush on hidden/pagehide/unmount, retry every 3 s on error. On open, a newer journal is applied via `applyRecoveredDraft` (stored version snapshotted first). |
| Revisions | Checkpoint at most every 5 min while writing; always one at session end; `before-edit` when editing in Library; `before-restore` + `restore` on restore. Documents are never deleted (no delete UI by design). |
| Word count | Orthographic words: runs of \p{L}\p{M}\p{N}; apostrophes and hyphens join letters; `. , ٫ ٬` join digits; ZWNJ/ZWJ join. `والكتاب` = 1, diacritics never change the count. Documented in `domain/wordcount.ts`. |
| Timezone | Schedule keys are local dates and are never shifted; "today" follows the device clock; a timezone change is logged. |
| Backup | JSON `{format:'writers-rep-backup', schemaVersion:1, exportedAt, tables}`. Full validation (types, duplicate ids, references, exactly one settings record) **before** touching data; replace-all in one transaction (rolls back on failure). |
| Widget snapshot | `widget_snapshot` refreshed on init, rollover, session start and finish. No draft text, ever; mission title blank when `widgetPrivacy = 'hide'`; `streak: null` until M2. |
| Copy | Direct and factual, with no guilt or hype. Example: «جلسة اليوم ما زالت معلّقة. ابدأ 20 دقيقة.» |
| UI | Arabic uses Latin digits (`ar-u-nu-latn`). Fractions like 1/2 are wrapped in `dir="ltr"`. Skill names are translated through the `t.skills` map. |

## Deliberately NOT built yet (don't fake them)

- Progress screen, streak, missed-reason capture, 5-min rescue session, weekly review and self-assessment
  rubric, rescheduling, load-reduction suggestion (M2).
- Reminders: the time is stored, but Settings says reminders are inactive.
- Native Android app and widget (M3).

## Next: Milestone M2 scope (from PRD §4.5, §4.6, §11)

1. **Progress screen** (new tab): consistency = completed planned sessions / scheduled eligible
   sessions over rolling 7/14/30 days; exclude rest days; show excused separately; never drop missed
   days. Activity: active minutes, words, pieces finished, weekly trend. Label everything as
   consistency or activity, not quality.
2. **Streak**: consecutive *scheduled training days completed*; review and rest days don't break it.
   Rescue counts as a rescue completion, is shown differently, and doesn't count toward full-session %.
   Fill `widget_snapshot.streak`.
3. **Missed flow**: when the app opens after a cutoff passed, persist `missed`, ask for a reason
   (busy, tired, unclear prompt, avoidance, other + note) and store `missedReason`, then offer a
   **5-minute rescue** (`kind: 'rescue'`, target 5) or rescheduling a future session. Never convert a
   missed full session into a completion.
4. **2+ misses in rolling 7 days** → suggest lower difficulty or rescheduling; apply only after the user approves.
5. **Weekly review** on the review day: planned vs completed, self-assessment rubric (clarity,
   specificity, structure, tension, dialogue; 1–5 with evidence notes) stored in `reviews`
   (`reviewerType: 'self'`), strengths, weak spots, recommended next exercise. Show quality trends only
   with enough comparable samples, labelled as self-reported.
6. **Reminders** where the browser supports them (Notification API + permission state shown in
   Settings; denial must not block writing). State clearly that a PWA can't guarantee background delivery.
7. **Gate:** automated schedule tests plus a 7-day simulated timeline test (rest days, misses,
   rescue, midnight, timezone change).

Then **M3**: Capacitor Android shell, native local notifications, Kotlin AppWidgetProvider (2×2 compact,
4×2 expanded), shared snapshot via `platform/native.ts`, deep links (`writersrep://start` → `#/start`),
refresh on session events, rollover and periodic updates, stale fallback, privacy toggle; validated on
my physical phone. Then **M4**: a 14-day pilot.

## Open items and notes for me

- Not yet tested: a real Android phone, Arabic keyboard IMEs, Firefox and Safari. The M1 gate's "three
  real sessions" still needs to happen on the device.
- Installing on the phone: run the app on a computer (`npm run build && npm run preview`), connect the
  phone by USB with USB debugging on, run `adb reverse tcp:4173 tcp:4173`, open `localhost:4173` in
  Chrome, then menu → Install app. An HTTPS host (GitHub Pages or Netlify) would remove the cable but
  makes the URL public; that needs my approval.
- The JS bundle is about 490 KB (about 150 KB gzipped). Acceptable for now.
