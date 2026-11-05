import Dexie from 'dexie';
import { EXERCISES, PROGRAM_SEQUENCE, TRACKS, getExercise } from '../data/library';
import { addDays, currentTimezone, localDateTime, toLocalDate, weekdayOf } from '../domain/dates';
import { newId } from '../domain/ids';
import { dayRole, generatedThroughAfterChange, planAssignments, removableOnScheduleChange } from '../domain/schedule';
import { currentWeekRange, periodStats } from '../domain/stats';
import { countsTowardAssignment, deriveStatus } from '../domain/status';
import { heartbeat, pause, recoverInterrupted, start } from '../domain/timer';
import type {
  DocumentRevision,
  Lang,
  RevisionSource,
  Session,
  SessionKind,
  Settings,
  WritingDocument,
} from '../domain/types';
import { buildWidgetSnapshot } from '../domain/widgetSnapshot';
import { countWords } from '../domain/wordcount';
import { publishWidgetSnapshot } from '../platform/native';
import { db } from './db';

/** Minimum spacing between automatic checkpoint revisions while writing. */
export const CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000;

export function defaultSettings(now: Date): Settings {
  return {
    id: 'singleton',
    onboardedAt: null,
    programStartDate: toLocalDate(now),
    scheduleGeneratedThrough: null,
    timezone: currentTimezone(),
    locale: 'ar',
    writingLanguageDefault: 'ar',
    trainingDays: [1, 2, 3, 4, 5],
    reviewDay: 6,
    restDays: [0],
    weekStartsOn: 1,
    sessionMinutes: 20,
    reminderTime: '19:00',
    cutoffTime: '21:00',
    graceMinutes: 60,
    widgetPrivacy: 'show',
    notificationPermissionState: 'unknown',
    updatedAt: now.toISOString(),
  };
}

export async function getSettings(): Promise<Settings | undefined> {
  return db.settings.get('singleton');
}

async function requireSettings(): Promise<Settings> {
  const s = await getSettings();
  if (!s) throw new Error('Settings missing; initApp() must run first');
  return s;
}

/** App start: sync bundled library, create settings, recover crashed timers, extend the schedule. */
export async function initApp(now = new Date()): Promise<Settings> {
  await db.transaction('rw', [db.tracks, db.exercises, db.settings, db.app_events], async () => {
    await db.tracks.bulkPut(TRACKS);
    await db.exercises.bulkPut(EXERCISES);
    const existing = await db.settings.get('singleton');
    if (!existing) {
      await db.settings.put(defaultSettings(now));
      return;
    }
    const tz = currentTimezone();
    if (existing.timezone !== tz) {
      // Timezone policy: schedule dates are local calendar dates and are NOT shifted. "Today" simply
      // follows the device clock. The change is logged so History can be interpreted later.
      await db.settings.update('singleton', { timezone: tz, updatedAt: now.toISOString() });
      await db.app_events.add({ id: newId(), at: now.toISOString(), kind: 'timezone-change', detail: `${existing.timezone} → ${tz}` });
    }
  });
  await recoverInterruptedSessions(now);
  const settings = await requireSettings();
  if (settings.onboardedAt) {
    await ensureSchedule(now);
    await refreshWidgetSnapshot(now);
  }
  return requireSettings();
}

/** Any session still marked running at start-up has no live editor: bank time up to its last heartbeat. */
export async function recoverInterruptedSessions(now = new Date()): Promise<number> {
  return db.transaction('rw', [db.sessions, db.app_events], async () => {
    const running = (await db.sessions.where('status').equals('active').toArray()).filter((s) => s.runningSince);
    for (const s of running) await markInterrupted(s, now);
    return running.length;
  });
}

async function markInterrupted(s: Session, now: Date) {
  const t = recoverInterrupted(s);
  await db.sessions.update(s.id, { ...t, interruptedAt: t.lastHeartbeatAt ?? s.updatedAt, updatedAt: now.toISOString() });
  await db.app_events.add({
    id: newId(),
    at: now.toISOString(),
    kind: 'session-recovered',
    detail: `session ${s.id} interrupted; last saved ${t.lastHeartbeatAt ?? s.updatedAt}`,
  });
}

/** Re-check one session when its editor mounts (e.g. after a reload while the timer ran). */
export async function recoverSessionIfInterrupted(sessionId: string, now = new Date()): Promise<boolean> {
  return db.transaction('rw', [db.sessions, db.app_events], async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.status !== 'active' || !s.runningSince) return false;
    await markInterrupted(s, now);
    return true;
  });
}

export async function ensureSchedule(now = new Date()): Promise<number> {
  return db.transaction('rw', [db.settings, db.assignments], async () => {
    const settings = await requireSettings();
    if (!settings.onboardedAt) return 0;
    const existing = await db.assignments.toArray();
    const plan = planAssignments({ settings, existing, today: toLocalDate(now), program: PROGRAM_SEQUENCE, now, newId });
    if (plan.create.length) await db.assignments.bulkAdd(plan.create);
    if (plan.generatedThrough !== settings.scheduleGeneratedThrough)
      await db.settings.update('singleton', { scheduleGeneratedThrough: plan.generatedThrough });
    return plan.create.length;
  });
}

export type OnboardingChoices = Pick<
  Settings,
  'trainingDays' | 'reviewDay' | 'restDays' | 'reminderTime' | 'cutoffTime' | 'writingLanguageDefault' | 'locale'
>;

export async function completeOnboarding(choices: OnboardingChoices, now = new Date()): Promise<void> {
  const today = toLocalDate(now);
  // Setting up after today's cutoff must not create an instant "missed" day.
  const start = now < localDateTime(today, choices.cutoffTime) ? today : addDays(today, 1);
  await db.settings.update('singleton', {
    ...choices,
    onboardedAt: now.toISOString(),
    programStartDate: start,
    scheduleGeneratedThrough: null,
    updatedAt: now.toISOString(),
  });
  await ensureSchedule(now);
  await refreshWidgetSnapshot(now);
}

const SCHEDULE_KEYS = ['trainingDays', 'reviewDay', 'restDays', 'weekStartsOn'] as const;

/** Update settings. Weekly-pattern changes only re-plan unstarted future days (see domain/schedule.ts). */
export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>, now = new Date()): Promise<void> {
  await db.transaction('rw', [db.settings, db.assignments, db.sessions, db.app_events], async () => {
    const before = await requireSettings();
    const scheduleChanged = SCHEDULE_KEYS.some((k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(before[k]));
    const next: Settings = { ...before, ...patch, updatedAt: now.toISOString() };
    if (scheduleChanged && before.onboardedAt) {
      const today = toLocalDate(now);
      const existing = await db.assignments.toArray();
      const withSessions = new Set((await db.sessions.toArray()).map((s) => s.assignmentId).filter((x): x is string => !!x));
      const removable = removableOnScheduleChange({ existing, assignmentIdsWithSessions: withSessions, today, now, cutoffTime: before.cutoffTime });
      await db.assignments.bulkDelete(removable.map((a) => a.id));
      const through = generatedThroughAfterChange(today, now, before.cutoffTime);
      if (!next.scheduleGeneratedThrough || through < next.scheduleGeneratedThrough) next.scheduleGeneratedThrough = through;
      await db.app_events.add({
        id: newId(),
        at: now.toISOString(),
        kind: 'schedule-change',
        detail: `training days ${before.trainingDays.join(',')} → ${next.trainingDays.join(',')}; re-planned ${removable.length} future day(s)`,
      });
    }
    await db.settings.put(next);
  });
  await ensureSchedule(now);
  await refreshWidgetSnapshot(now);
}

// ---------------------------------------------------------------------------------------------
// Sessions & documents

export async function startSession(
  args: { assignmentId?: string; kind: SessionKind; writingLanguage?: Lang; exerciseId?: string },
  now = new Date(),
): Promise<string> {
  const id = await db.transaction('rw', [db.settings, db.assignments, db.sessions, db.documents], async () => {
    const settings = await requireSettings();
    if (args.assignmentId) {
      const active = await db.sessions.where('assignmentId').equals(args.assignmentId).filter((s) => s.status === 'active').first();
      if (active) return active.id;
    }
    const assignment = args.assignmentId ? await db.assignments.get(args.assignmentId) : undefined;
    if (args.assignmentId && !assignment) throw new Error('Assignment not found');
    const exercise = getExercise(assignment?.exerciseId ?? args.exerciseId);
    const lang = args.writingLanguage ?? settings.writingLanguageDefault;
    const iso = now.toISOString();
    const docId = newId();
    const sessionId = newId();
    const title = exercise ? (lang === 'en' ? exercise.titleEn : exercise.titleAr) : lang === 'en' ? 'Free write' : 'كتابة حرة';
    const doc: WritingDocument = {
      id: docId,
      sessionId,
      exerciseId: exercise?.id,
      trackId: exercise?.trackId,
      title,
      content: '',
      language: lang,
      tags: [],
      status: 'draft',
      wordCount: 0,
      createdAt: iso,
      updatedAt: iso,
    };
    const session: Session = {
      id: sessionId,
      assignmentId: assignment?.id,
      exerciseId: exercise?.id,
      documentId: docId,
      kind: args.kind,
      status: 'active',
      startedAt: iso,
      activeSeconds: 0,
      // Created paused: the editor starts the timer once it is actually on screen.
      runningSince: null,
      lastHeartbeatAt: null,
      targetMinutes: args.kind === 'rescue' ? 5 : settings.sessionMinutes,
      writingLanguage: lang,
      wordCount: 0,
      updatedAt: iso,
    };
    await db.documents.add(doc);
    await db.sessions.add(session);
    return sessionId;
  });
  await refreshWidgetSnapshot(now);
  return id;
}

export async function updateSessionTimer(
  sessionId: string,
  timer: Pick<Session, 'activeSeconds' | 'runningSince' | 'lastHeartbeatAt'>,
  now = new Date(),
): Promise<void> {
  await db.sessions.update(sessionId, { ...timer, updatedAt: now.toISOString() });
}

/** Start or pause the timer, computed from the freshly read record to avoid races with stale UI state. */
export async function setSessionRunning(sessionId: string, running: boolean, now = new Date()): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.status !== 'active') return;
    const next = running ? start(s, now) : pause(s, now);
    if (next !== s) await db.sessions.update(sessionId, { ...next, updatedAt: now.toISOString() });
  });
}

export async function sessionHeartbeat(sessionId: string, now = new Date()): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.status !== 'active' || !s.runningSince) return;
    await db.sessions.update(sessionId, { ...heartbeat(s, now), updatedAt: now.toISOString() });
  });
}

export async function updateSessionFields(sessionId: string, patch: Partial<Pick<Session, 'notes' | 'writingLanguage'>>, now = new Date()) {
  await db.transaction('rw', [db.sessions, db.documents], async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) return;
    await db.sessions.update(sessionId, { ...patch, updatedAt: now.toISOString() });
    if (patch.writingLanguage) await db.documents.update(s.documentId, { language: patch.writingLanguage });
  });
}

async function lastRevision(documentId: string): Promise<DocumentRevision | undefined> {
  return db.document_revisions
    .where('[documentId+createdAt]')
    .between([documentId, Dexie.minKey], [documentId, Dexie.maxKey])
    .last();
}

/** Adds a revision unless the content is identical to the latest one. */
async function addRevisionIfChanged(doc: WritingDocument, source: RevisionSource, now: Date, always = false): Promise<boolean> {
  const last = await lastRevision(doc.id);
  if (!always && last && last.contentSnapshot === doc.content && last.title === doc.title) return false;
  if (!last && doc.content === '') return false;
  await db.document_revisions.add({
    id: newId(),
    documentId: doc.id,
    contentSnapshot: doc.content,
    title: doc.title,
    createdAt: now.toISOString(),
    source,
  });
  return true;
}

/**
 * Persist editor content. Also keeps the active session's word count current and adds a
 * checkpoint revision at most every CHECKPOINT_INTERVAL_MS while content keeps changing.
 */
export async function saveDocumentContent(documentId: string, content: string, now = new Date()): Promise<WritingDocument> {
  return db.transaction('rw', [db.documents, db.sessions, db.document_revisions], async () => {
    const doc = await db.documents.get(documentId);
    if (!doc) throw new Error('Document not found');
    const wordCount = countWords(content);
    const updated: WritingDocument = { ...doc, content, wordCount, updatedAt: now.toISOString() };
    if (doc.content !== content) await db.documents.put(updated);
    if (doc.sessionId) {
      const s = await db.sessions.get(doc.sessionId);
      if (s?.status === 'active' && s.wordCount !== wordCount) await db.sessions.update(s.id, { wordCount, updatedAt: now.toISOString() });
    }
    const last = await lastRevision(documentId);
    if (!last || now.getTime() - new Date(last.createdAt).getTime() >= CHECKPOINT_INTERVAL_MS) await addRevisionIfChanged(updated, 'checkpoint', now);
    return updated;
  });
}

export async function updateDocumentMeta(documentId: string, patch: Partial<Pick<WritingDocument, 'title' | 'tags'>>, now = new Date()) {
  const clean = { ...patch };
  if (clean.tags) clean.tags = [...new Set(clean.tags.map((t) => t.trim()).filter(Boolean))];
  if (clean.title !== undefined) clean.title = clean.title.trim() || 'بدون عنوان';
  await db.documents.update(documentId, { ...clean, updatedAt: now.toISOString() });
}

export async function snapshotRevision(documentId: string, source: RevisionSource, now = new Date()): Promise<boolean> {
  return db.transaction('rw', [db.documents, db.document_revisions], async () => {
    const doc = await db.documents.get(documentId);
    return doc ? addRevisionIfChanged(doc, source, now) : false;
  });
}

/** Restore never overwrites destructively: the current text is saved as a revision first. */
export async function restoreRevision(documentId: string, revisionId: string, now = new Date()): Promise<void> {
  await db.transaction('rw', [db.documents, db.document_revisions], async () => {
    const doc = await db.documents.get(documentId);
    const rev = await db.document_revisions.get(revisionId);
    if (!doc || !rev || rev.documentId !== documentId) throw new Error('Revision not found');
    await addRevisionIfChanged(doc, 'before-restore', now);
    const restored: WritingDocument = {
      ...doc,
      content: rev.contentSnapshot,
      wordCount: countWords(rev.contentSnapshot),
      updatedAt: new Date(now.getTime() + 1).toISOString(),
    };
    await db.documents.put(restored);
    await addRevisionIfChanged(restored, 'restore', new Date(now.getTime() + 1));
  });
}

/** Called when the editor applies newer text from the synchronous local journal (crash safety net). */
export async function applyRecoveredDraft(documentId: string, content: string, savedAt: string, now = new Date()) {
  await snapshotRevision(documentId, 'before-recovery', now);
  await saveDocumentContent(documentId, content, now);
  await snapshotRevision(documentId, 'recovery', new Date(now.getTime() + 1));
  await db.app_events.add({ id: newId(), at: now.toISOString(), kind: 'draft-recovered', detail: `document ${documentId}; journal saved ${savedAt}` });
}

export interface CompleteResult {
  countedForAssignment: boolean;
  activeSeconds: number;
}

export async function completeSession(
  sessionId: string,
  extra: { reflection?: string; notes?: string },
  now = new Date(),
): Promise<CompleteResult> {
  const result = await db.transaction(
    'rw',
    [db.settings, db.sessions, db.documents, db.document_revisions, db.assignments],
    async (): Promise<CompleteResult> => {
      const settings = await requireSettings();
      const s = await db.sessions.get(sessionId);
      if (!s) throw new Error('Session not found');
      if (s.status !== 'active') return { countedForAssignment: false, activeSeconds: s.activeSeconds };
      const timer = pause(s, now);
      const doc = await db.documents.get(s.documentId);
      if (doc) {
        // Always mark the version a session ended with, even if a checkpoint holds the same text.
        await addRevisionIfChanged(doc, 'session-complete', now, true);
        await db.documents.update(doc.id, { status: 'finished' });
      }
      await db.sessions.update(sessionId, {
        ...timer,
        status: 'completed',
        endedAt: now.toISOString(),
        wordCount: doc?.wordCount ?? s.wordCount,
        reflection: extra.reflection?.trim() || s.reflection,
        notes: extra.notes ?? s.notes,
        updatedAt: now.toISOString(),
      });
      let counted = false;
      if (s.assignmentId) {
        const a = await db.assignments.get(s.assignmentId);
        if (a && a.status === 'scheduled' && countsTowardAssignment(s, a, settings)) {
          await db.assignments.update(a.id, { status: 'completed', completedSessionId: s.id });
          counted = true;
        }
      }
      return { countedForAssignment: counted, activeSeconds: timer.activeSeconds };
    },
  );
  await refreshWidgetSnapshot(now);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Widget snapshot (consumed by the native widget in M3)

export async function refreshWidgetSnapshot(now = new Date()): Promise<void> {
  const settings = await getSettings();
  if (!settings?.onboardedAt) return;
  const today = toLocalDate(now);
  const { from, to } = currentWeekRange(today, settings.weekStartsOn);
  const [assignments, sessions] = await Promise.all([
    db.assignments.where('scheduledLocalDate').between(from, to, true, true).toArray(),
    db.sessions.where('startedAt').aboveOrEqual(new Date(localDateTime(from, '00:00').getTime() - 864e5).toISOString()).toArray(),
  ]);
  const todays = assignments.find((a) => a.scheduledLocalDate === today);
  const forToday = sessions.filter((s) => s.assignmentId === todays?.id);
  const exercise = getExercise(todays?.exerciseId);
  const week = periodStats({ from, to, assignments, sessions, settings, now });
  const snapshot = buildWidgetSnapshot({
    settings,
    localDate: today,
    role: dayRole(settings, weekdayOf(today)),
    assignment: todays,
    status: todays ? deriveStatus(todays, forToday, settings, now) : undefined,
    missionTitle: exercise ? (settings.locale === 'en' ? exercise.titleEn : exercise.titleAr) : undefined,
    weeklyCompleted: week.completed,
    weeklyPlanned: week.planned,
    now,
  });
  await db.widget_snapshot.put(snapshot);
  await publishWidgetSnapshot(snapshot);
}

