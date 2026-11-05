# Writer's Rep: implementation plan & decisions

## Decisions made without asking (reversible)

| Decision | Why |
|---|---|
| App lives in `writers-rep/` inside the `studio-sheryanto-portfolio` repo | It was the only repository available. The portfolio files at the root are untouched. Moving the folder to its own repo is a plain `git mv`/copy. |
| Vite + React + TypeScript, Dexie (IndexedDB), vite-plugin-pwa, HashRouter | Matches PRD §7 with few dependencies. Hash routes work offline, from any static path, and inside a future Capacitor WebView, where they double as deep-link targets (`#/start`, `#/session/:id`). |
| Weekly pattern: each weekday is training, review, or rest; at most one review day | PRD defaults (5/1/1) without assuming which weekdays. Stored as `trainingDays`, `reviewDay`, and `restDays` (the PRD's single `restDay` became a list so that 4-day weeks work). |
| Program advances one step per *scheduled* training day | Deterministic. A missed day keeps its exercise and is never silently reassigned. Rescheduling is an explicit M2 action. |
| A session counts toward the day if it **started** before the cutoff | Fair to someone who starts at 20:50 and finishes at 21:10, and strict otherwise ("never retroactively convert a missed session"). |
| Setting up after today's cutoff starts the program tomorrow | Avoids a fake "missed" day on first launch. |
| Session target = Settings → session length (default 20) | The PRD makes the length editable. Exercises are written for 20 minutes. |
| Sessions are created paused; the editor starts the timer | A timer never runs without an editor on screen. Crash recovery is unambiguous. |
| Arabic UI uses Latin digits (`ar-u-nu-latn`) | Common in the Gulf, and numbers stay easy to scan. Change it in `src/i18n/format.ts`. |
| No streak, Progress tab or rescue button in M1 | These are M2. Showing them early would mean placeholder numbers or buttons that do nothing. |

## Risks identified

1. **PWA background limits.** A browser cannot guarantee reminders or a widget. Mitigation: the app
   states this in Settings and the README, and M3 adds a native shell.
2. **Storage eviction.** Mitigation: the app requests persistent storage, shows whether it was
   granted, offers prominent JSON export, and imports atomically.
3. **Lost keystrokes on a sudden kill.** Mitigation: a synchronous localStorage journal plus
   debounced IndexedDB writes and flushes on pagehide/visibilitychange.
4. **Clock and timezone edge cases.** Mitigation: local-date keys, DST-safe arithmetic, and tests
   run in two timezones.

## Milestones

| | Scope | Gate | State |
|---|---|---|---|
| M0 | Repo, data model (all PRD §6 tables), 24-exercise library and 4-week program, theme, navigation, tests | App runs locally | ✅ |
| M1 | Onboarding, Today, editor (timer, autosave, recovery, notes, reflection), Library (search/filter/tags/revisions/restore/export), History (calendar + list), Program view, Settings, JSON backup/import | Sessions completed and recovered (automated e2e) | ✅ in the browser. Still needs three real sessions on the phone. |
| M2 | Progress screen (7/14/30-day adherence, activity, quality rubric), streak, missed-reason capture, 5-min rescue, weekly review, reschedule and load-reduction suggestion, web notifications where supported | Schedule tests + 7-day simulated timeline | Next |
| M3 | Capacitor Android shell, local notifications, Kotlin AppWidgetProvider (2×2, 4×2), shared snapshot, deep links, refresh on events and rollover | Installable widget works on your phone | Pending |
| M4 | 14-day pilot | | Pending |

**Smallest version for daily use (available now):** open the app, start today's exercise in one tap,
write, finish. The writing is saved, recoverable, searchable, and backed up by export. Weekly
completion is computed from real records.

## File map

```
src/
  app/          App shell, routes, context (settings, i18n, clock tick + day rollover)
  components/   Icon, Dialog (<dialog>), StatusBadge, WeekRolePicker
  data/         exercises.json, tracks.json, program.json, library.ts (validation)
  db/           db.ts (Dexie schema), repo.ts (all writes), backup.ts (export/import/validation)
  domain/       pure logic: dates, schedule, status, stats, timer, wordcount, widgetSnapshot, types
  features/     today, session (editor, autosave, crash journal), library, history, program, settings, onboarding
  i18n/         strings.ts (ar source + typed en mirror), format.ts
  platform/     native.ts: seam for the M3 Capacitor widget bridge (no-op on web)
tests/unit      Vitest + fake-indexeddb
tests/e2e       Playwright (Pixel 7 + desktop)
```

## M3 notes (for later)

- `widget_snapshot` is already refreshed when the app starts, on day rollover, and when a session
  starts or finishes. `platform/native.ts → publishWidgetSnapshot` is the single place to forward it
  to SharedPreferences and call `AppWidgetManager.updateAppWidget`.
- Deep links: map `writersrep://start` to `#/start`, and `writersrep://today` to `#/today`.
- Downloads (export) will need the Capacitor Filesystem/Share plugins inside the WebView.
