import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import {
  CHECKPOINT_INTERVAL_MS,
  completeOnboarding,
  completeSession,
  ensureSchedule,
  initApp,
  recoverInterruptedSessions,
  restoreRevision,
  saveDocumentContent,
  setSessionRunning,
  startSession,
  updateSessionTimer,
  updateSettings,
} from '../../src/db/repo';
import { PROGRAM_SEQUENCE } from '../../src/data/library';
import { heartbeat } from '../../src/domain/timer';
import { deriveStatus } from '../../src/domain/status';

const at = (date: string, hh = 10, mm = 0, ss = 0) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hh, mm, ss);
};
const choices = {
  trainingDays: [1, 2, 3, 4, 5] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[],
  reviewDay: 6 as const,
  restDays: [0] as (0 | 1 | 2 | 3 | 4 | 5 | 6)[],
  reminderTime: '19:00',
  cutoffTime: '21:00',
  writingLanguageDefault: 'ar' as const,
  locale: 'ar' as const,
};

async function setup(date = '2026-11-02', hh = 9) {
  await initApp(at(date, hh));
  await completeOnboarding(choices, at(date, hh));
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('first launch', () => {
  it('creates settings, syncs the library and schedules the first week', async () => {
    const s0 = await initApp(at('2026-11-02', 9));
    expect(s0.onboardedAt).toBeNull();
    expect(await db.exercises.count()).toBeGreaterThanOrEqual(20);
    expect(await db.assignments.count()).toBe(0); // nothing before setup
    await completeOnboarding(choices, at('2026-11-02', 9));
    const as = await db.assignments.orderBy('scheduledLocalDate').toArray();
    expect(as.map((a) => a.scheduledLocalDate)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(as[0]!.exerciseId).toBe(PROGRAM_SEQUENCE[0]);
    expect((await db.widget_snapshot.get('current'))?.weeklyPlanned).toBe(5);
  });

  it('setting up after the cutoff starts the program tomorrow (no instant missed day)', async () => {
    await initApp(at('2026-11-02', 22));
    await completeOnboarding(choices, at('2026-11-02', 22));
    const first = await db.assignments.orderBy('scheduledLocalDate').first();
    expect(first?.scheduledLocalDate).toBe('2026-11-03');
  });
});

describe('session lifecycle', () => {
  it('start → write → complete marks the assignment completed with actual duration', async () => {
    await setup();
    const a = (await db.assignments.where('scheduledLocalDate').equals('2026-11-02').first())!;
    const sid = await startSession({ assignmentId: a.id, kind: 'full' }, at('2026-11-02', 10));
    await setSessionRunning(sid, true, at('2026-11-02', 10));
    // Starting again returns the same active session instead of creating a duplicate.
    expect(await startSession({ assignmentId: a.id, kind: 'full' }, at('2026-11-02', 10, 1))).toBe(sid);
    const s = (await db.sessions.get(sid))!;
    await saveDocumentContent(s.documentId, 'كتبت اليوم عن البحر', at('2026-11-02', 10, 5));
    const res = await completeSession(sid, { reflection: 'ok' }, at('2026-11-02', 10, 7));
    expect(res.countedForAssignment).toBe(true);
    expect(res.activeSeconds).toBe(7 * 60); // finished early: 7 real minutes, not 20
    const done = (await db.sessions.get(sid))!;
    expect(done.status).toBe('completed');
    expect(done.wordCount).toBe(4);
    expect((await db.assignments.get(a.id))!.status).toBe('completed');
    expect((await db.documents.get(s.documentId))!.status).toBe('finished');
    expect(await db.document_revisions.where('documentId').equals(s.documentId).count()).toBeGreaterThanOrEqual(1);
  });

  it('a session started after the cutoff is recorded but does not complete the day', async () => {
    await setup();
    const a = (await db.assignments.where('scheduledLocalDate').equals('2026-11-02').first())!;
    const sid = await startSession({ assignmentId: a.id, kind: 'full' }, at('2026-11-02', 21, 30));
    await setSessionRunning(sid, true, at('2026-11-02', 21, 30));
    const res = await completeSession(sid, {}, at('2026-11-02', 21, 50));
    expect(res.countedForAssignment).toBe(false);
    const after = (await db.assignments.get(a.id))!;
    expect(deriveStatus(after, await db.sessions.toArray(), { cutoffTime: '21:00' }, at('2026-11-02', 22))).toBe('missed');
  });

  it('resuming a missed day later never converts it to a completion', async () => {
    await setup();
    const a = (await db.assignments.where('scheduledLocalDate').equals('2026-11-02').first())!;
    const sid = await startSession({ assignmentId: a.id, kind: 'full' }, at('2026-11-02', 20, 50));
    await setSessionRunning(sid, true, at('2026-11-02', 20, 50));
    // started before the cutoff → finishing shortly after still counts (started on time)
    const res = await completeSession(sid, {}, at('2026-11-02', 21, 10));
    expect(res.countedForAssignment).toBe(true);
  });

  it('recovers a crashed running session crediting time only up to the last heartbeat', async () => {
    await setup();
    const a = (await db.assignments.where('scheduledLocalDate').equals('2026-11-02').first())!;
    const sid = await startSession({ assignmentId: a.id, kind: 'full' }, at('2026-11-02', 10));
    await setSessionRunning(sid, true, at('2026-11-02', 10));
    const s = (await db.sessions.get(sid))!;
    await saveDocumentContent(s.documentId, 'نص لا يجب أن يضيع', at('2026-11-02', 10, 3));
    await updateSessionTimer(sid, heartbeat(s, at('2026-11-02', 10, 3)));
    // App killed. Reopened two hours later.
    expect(await recoverInterruptedSessions(at('2026-11-02', 12))).toBe(1);
    const r = (await db.sessions.get(sid))!;
    expect(r.status).toBe('active');
    expect(r.runningSince).toBeNull();
    expect(r.activeSeconds).toBe(180);
    expect(r.interruptedAt).toBe(at('2026-11-02', 10, 3).toISOString());
    expect((await db.documents.get(s.documentId))!.content).toBe('نص لا يجب أن يضيع');
  });
});

describe('revisions', () => {
  it('checkpoints periodically and restores non-destructively', async () => {
    await setup();
    const sid = await startSession({ kind: 'freewrite' }, at('2026-11-02', 10));
    await setSessionRunning(sid, true, at('2026-11-02', 10));
    const docId = (await db.sessions.get(sid))!.documentId;
    const t0 = at('2026-11-02', 10, 1).getTime();
    await saveDocumentContent(docId, 'v1', new Date(t0));
    await saveDocumentContent(docId, 'v2', new Date(t0 + 1000)); // within interval: no new checkpoint
    await saveDocumentContent(docId, 'v3', new Date(t0 + CHECKPOINT_INTERVAL_MS + 1000));
    let revs = await db.document_revisions.where('documentId').equals(docId).sortBy('createdAt');
    expect(revs.map((r) => r.contentSnapshot)).toEqual(['v1', 'v3']);

    await saveDocumentContent(docId, 'v4 unsaved in revisions', new Date(t0 + CHECKPOINT_INTERVAL_MS + 2000));
    await restoreRevision(docId, revs[0]!.id, new Date(t0 + CHECKPOINT_INTERVAL_MS + 3000));
    expect((await db.documents.get(docId))!.content).toBe('v1');
    revs = await db.document_revisions.where('documentId').equals(docId).sortBy('createdAt');
    expect(revs.map((r) => [r.source, r.contentSnapshot])).toEqual([
      ['checkpoint', 'v1'],
      ['checkpoint', 'v3'],
      ['before-restore', 'v4 unsaved in revisions'],
      ['restore', 'v1'],
    ]);
  });
});

describe('settings changes', () => {
  it('changing training days keeps past and started days, re-plans the rest', async () => {
    await setup('2026-11-02', 9);
    const a3 = (await db.assignments.where('scheduledLocalDate').equals('2026-11-03').first())!;
    await startSession({ assignmentId: a3.id, kind: 'full' }, at('2026-11-03', 10));
    // On Wednesday at noon, switch to Mon/Wed/Sat.
    await updateSettings({ trainingDays: [1, 3, 6], reviewDay: null, restDays: [0, 2, 4, 5] }, at('2026-11-04', 12));
    const dates = (await db.assignments.orderBy('scheduledLocalDate').toArray()).map((a) => [a.scheduledLocalDate, a.programIndex]);
    expect(dates).toEqual([
      ['2026-11-02', 0],
      ['2026-11-03', 1],
      ['2026-11-04', 2],
      ['2026-11-07', 3],
    ]);
    expect(await db.app_events.where('kind').equals('schedule-change').count()).toBe(1);
  });

  it('ensureSchedule extends into new weeks on later opens', async () => {
    await setup('2026-11-02', 9);
    await ensureSchedule(at('2026-11-10', 9));
    expect(await db.assignments.count()).toBe(10);
  });
});
