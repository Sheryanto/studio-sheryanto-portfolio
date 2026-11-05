# Writer's Rep

A private, single-user writing coach. It assigns a daily exercise, saves everything you write
on your device, and reports how consistent you have been. That report is never presented as a
measure of writing quality. Arabic-first RTL UI. You can write each session in Arabic or English.

**Status: Milestones M0 (foundation) and M1 (usable writing loop) are done.** M2 (coach & progress)
and M3 (native Android widget) have not been built. See [Limitations](#limitations).

The PRD is the source of truth. Design decisions and the plan are in [docs/PLAN.md](docs/PLAN.md).

## Quick start

Requires Node 20+ (tested on Node 22).

```bash
cd writers-rep
npm install
npm run dev          # http://localhost:5173 (hot reload, service worker disabled in dev)
```

Production build and local preview (with service worker / offline / installable PWA):

```bash
npm run build
npm run preview      # http://localhost:4173
```

### Use it on your Android phone (PWA)

Chrome treats an app as installable only on `https://` or `localhost`. Options:

1. **Same Wi-Fi, quick test:** `npm run build && npx vite preview --host --port 4173`, then on the
   phone open `http://<computer-ip>:4173`. The app works, but Chrome will not offer to install it and
   storage is less protected on plain http.
2. **Installable:** connect the phone by USB, enable USB debugging, and run
   `adb reverse tcp:4173 tcp:4173`. Then open `http://localhost:4173` in Chrome on the phone and use
   **⋮ → Install app**.
3. Any static HTTPS host works too (the build in `dist/` is static and uses relative paths). This repo
   has **not** been deployed anywhere. Publishing is your call.

Installing adds an app icon and a long-press shortcut ("ابدأ جلسة اليوم"). **It is not a
home-screen widget.** The widget needs the native Android app (Milestone 3).

## Checks

```bash
npm run typecheck    # tsc, strict
npm run lint         # eslint
npm test             # unit tests (Vitest) in Asia/Dubai
npm run test:tz      # same suite in America/New_York (DST)
npm run test:e2e     # Playwright: builds, serves, runs on Pixel 7 + desktop Chromium
npm run check        # typecheck + lint + both unit runs + build
```

If Playwright cannot find a browser, install one with `npx playwright install chromium`.

## Backup & restore

All data lives in this browser's IndexedDB on this device. Nothing is sent anywhere.

- **Settings → Export full backup (JSON)** downloads every record: settings, schedule, sessions,
  pieces, and all revisions.
- **Settings → Import backup** validates the whole file first. A corrupted or foreign file is rejected
  and nothing changes. A valid file replaces all local data in a single transaction, so a failure
  part-way rolls back. Moving to a new device: export on the old one, then import on the new one.
- Each piece can be exported as `.md` or `.txt` from its page in the Library.
- The app asks the browser for persistent storage. Settings shows whether it was granted. Export
  regularly anyway.

## How it works (short)

| Area | Rule |
|---|---|
| Schedule | You pick a role for each weekday: training, review, or rest. Assignments are created for every training day up to the end of the current week, including days the app was never opened, so a missed day cannot disappear. Changing the pattern only re-plans unstarted future days. |
| Program | 4 weeks × 5 sessions (`src/data/program.json`). Each scheduled training day moves you one step through the program, and the program repeats after week 4. |
| Status | `due` until the daily cutoff (default 21:00), then `missed`. A session counts toward its day only if it is a full session **started before the cutoff** and then completed. A late session is saved and shown as late, but never turns a missed day into a completed one. |
| Timer | Counts active writing time only. It pauses when the app goes to the background and resumes when you return. A heartbeat is saved every 5 s, so after a crash at most about 5 s are lost, and time is never made up. Finishing early stores the actual minutes. |
| Autosave | Every keystroke is written to `localStorage` right away (crash journal) and to IndexedDB after 0.5 s. Saving also happens when the page is hidden or closed and when you leave the editor. On reopen, newer journal text is restored, and the stored version is kept as a revision first. |
| Revisions | Saved as a checkpoint every 5 min while you write, at the end of each session, before edits in the Library, and before and after a restore. Restoring never destroys the current text. |
| Word count | Orthographic words: runs of letters, marks, and digits. Diacritics and tatweel never split a word, and `والكتاب` counts as 1. Fully documented and tested in `src/domain/wordcount.ts`. Word count never decides whether a session is complete. |
| Timezone | Schedule dates are local calendar dates and are never shifted. "Today" follows the device clock. When the device timezone changes, the change is logged to `app_events`. |

## Editing the exercise library

Edit `src/data/exercises.json`, `src/data/tracks.json` and `src/data/program.json`, then rebuild.
`validateLibrary` runs at startup and in the unit tests. Unknown tracks, duplicate IDs, missing
fields, references to exercises that don't exist, or fewer than 20 exercises all fail loudly. Bump an
exercise's `version` when you change its meaning.

## Limitations

- **No reminders yet.** You can set the reminder time, but nothing fires. A PWA cannot guarantee
  background reminders on Android, so dependable reminders are planned for the native app in M2/M3.
- **No Android home-screen widget.** The data it needs is already computed and stored (the
  `widget_snapshot` table, with no draft text). The native widget is Milestone 3 and has not been
  built or tested.
- **Not built yet (M2):** the Progress screen (rolling 7/14/30-day adherence), streak, asking for a
  reason after a missed day, the 5-minute rescue session, the weekly review with self-assessment,
  rescheduling, and the suggestion to reduce load after 2 or more misses.
- Data lives on one device until you export it. There is no sync (by design for v1).
- Tested in headless Chromium only (Pixel 7 emulation and desktop). **Not yet tested on a physical
  Android phone or in Firefox/Safari.** Arabic input methods on a real phone still need a manual
  check.
