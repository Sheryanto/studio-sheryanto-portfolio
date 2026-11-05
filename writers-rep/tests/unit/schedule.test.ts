import { describe, expect, it } from 'vitest';
import { addDays } from '../../src/domain/dates';
import { dayRole, generatedThroughAfterChange, planAssignments, removableOnScheduleChange } from '../../src/domain/schedule';
import { deriveStatus } from '../../src/domain/status';
import type { Assignment, Session, Settings, Weekday } from '../../src/domain/types';

const PROGRAM = ['e0', 'e1', 'e2', 'e3', 'e4'];
let n = 0;
const newId = () => `id-${++n}`;
// 2026-11-02 is a Monday.
const base = {
  programStartDate: '2026-11-02',
  scheduleGeneratedThrough: null as string | null,
  trainingDays: [1, 2, 3, 4, 5] as Weekday[],
  reviewDay: 6 as Weekday | null,
  weekStartsOn: 1 as Weekday,
  cutoffTime: '21:00',
};
const at = (date: string, hh = 10, mm = 0) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hh, mm);
};

function plan(settings: typeof base, existing: Assignment[], today: string) {
  return planAssignments({ settings, existing, today, program: PROGRAM, now: at(today), newId });
}

describe('dayRole', () => {
  it('classifies training, review and rest days', () => {
    expect(dayRole(base, 1)).toBe('training');
    expect(dayRole(base, 6)).toBe('review');
    expect(dayRole(base, 0)).toBe('rest');
  });
});

describe('planAssignments', () => {
  it('creates one assignment per training day through the end of the week', () => {
    const r = plan(base, [], '2026-11-02');
    expect(r.create.map((a) => a.scheduledLocalDate)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
    expect(r.create.map((a) => a.exerciseId)).toEqual(PROGRAM);
    expect(r.generatedThrough).toBe('2026-11-08');
  });

  it('is idempotent', () => {
    const first = plan(base, [], '2026-11-04');
    const second = plan({ ...base, scheduleGeneratedThrough: first.generatedThrough }, first.create, '2026-11-04');
    expect(second.create).toEqual([]);
  });

  it('fills days the app was never opened, so missed days cannot vanish', () => {
    const wk1 = plan(base, [], '2026-11-02');
    // App not opened for nine days, then opened on Wed 2026-11-18.
    const later = plan({ ...base, scheduleGeneratedThrough: wk1.generatedThrough }, wk1.create, '2026-11-18');
    expect(later.create.map((a) => a.scheduledLocalDate)).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
    ]);
    // The program advances one step per scheduled day and wraps.
    expect(later.create[0]!.programIndex).toBe(5);
    expect(later.create[0]!.exerciseId).toBe('e0');
  });

  it('never generates before the program start date', () => {
    const r = plan({ ...base, programStartDate: '2026-11-05' }, [], '2026-11-05');
    expect(r.create.map((a) => a.scheduledLocalDate)).toEqual(['2026-11-05', '2026-11-06']);
    expect(r.create[0]!.programIndex).toBe(0);
  });

  it('supports any weekly pattern and week start', () => {
    const s = { ...base, trainingDays: [6, 0, 2] as Weekday[], reviewDay: 4 as Weekday, weekStartsOn: 6 as Weekday, programStartDate: '2026-10-31' };
    const r = plan(s, [], '2026-10-31');
    expect(r.create.map((a) => a.scheduledLocalDate)).toEqual(['2026-10-31', '2026-11-01', '2026-11-03']);
    expect(r.generatedThrough).toBe('2026-11-06');
  });
});

describe('schedule changes keep the past frozen', () => {
  const week = plan(base, [], '2026-11-02').create;

  it('only removes unstarted future days (and today before its cutoff)', () => {
    const withSession = new Set([week[3]!.id]); // Thursday has a session
    const removable = removableOnScheduleChange({ existing: week, assignmentIdsWithSessions: withSession, today: '2026-11-04', now: at('2026-11-04', 12), cutoffTime: '21:00' });
    expect(removable.map((a) => a.scheduledLocalDate)).toEqual(['2026-11-04', '2026-11-06']);
    const afterCutoff = removableOnScheduleChange({ existing: week, assignmentIdsWithSessions: withSession, today: '2026-11-04', now: at('2026-11-04', 22), cutoffTime: '21:00' });
    expect(afterCutoff.map((a) => a.scheduledLocalDate)).toEqual(['2026-11-06']);
  });

  it('regenerates from today with the new pattern without touching past days', () => {
    const today = '2026-11-04';
    const now = at(today, 12);
    const removable = removableOnScheduleChange({ existing: week, assignmentIdsWithSessions: new Set(), today, now, cutoffTime: '21:00' });
    const kept = week.filter((a) => !removable.includes(a));
    const through = generatedThroughAfterChange(today, now, '21:00');
    expect(through).toBe(addDays(today, -1));
    const s = { ...base, trainingDays: [1, 2, 4, 0] as Weekday[], scheduleGeneratedThrough: through };
    const r = plan(s, kept, today);
    expect(kept.map((a) => a.scheduledLocalDate)).toEqual(['2026-11-02', '2026-11-03']);
    expect(r.create.map((a) => [a.scheduledLocalDate, a.programIndex])).toEqual([
      ['2026-11-05', 2],
      ['2026-11-08', 3],
    ]);
  });
});

describe('deriveStatus', () => {
  const settings: Pick<Settings, 'cutoffTime'> = { cutoffTime: '21:00' };
  const a: Assignment = { id: 'a1', exerciseId: 'e0', scheduledLocalDate: '2026-11-05', programIndex: 0, status: 'scheduled', assignedAt: '' };
  const session = (over: Partial<Session>): Session => ({
    id: 's1', assignmentId: 'a1', documentId: 'd1', kind: 'full', status: 'active', startedAt: at('2026-11-05', 20).toISOString(),
    activeSeconds: 0, runningSince: null, lastHeartbeatAt: null, targetMinutes: 20, writingLanguage: 'ar', wordCount: 0, updatedAt: '', ...over,
  });

  it('upcoming → due → missed across the cutoff and midnight', () => {
    expect(deriveStatus(a, [], settings, at('2026-11-04', 23, 59))).toBe('upcoming');
    expect(deriveStatus(a, [], settings, at('2026-11-05', 0, 0))).toBe('due');
    expect(deriveStatus(a, [], settings, at('2026-11-05', 20, 59))).toBe('due');
    expect(deriveStatus(a, [], settings, at('2026-11-05', 21, 0))).toBe('missed');
    expect(deriveStatus(a, [], settings, at('2026-11-06', 9))).toBe('missed');
  });

  it('in progress when a qualifying session is active, even past the cutoff', () => {
    expect(deriveStatus(a, [session({})], settings, at('2026-11-05', 21, 10))).toBe('in_progress');
  });

  it('a session started after the cutoff does not rescue the day', () => {
    const late = session({ startedAt: at('2026-11-05', 21, 5).toISOString() });
    expect(deriveStatus(a, [late], settings, at('2026-11-05', 21, 30))).toBe('missed');
  });

  it('persisted completed/excused win', () => {
    expect(deriveStatus({ ...a, status: 'completed' }, [], settings, at('2026-11-09'))).toBe('completed');
    expect(deriveStatus({ ...a, status: 'excused' }, [], settings, at('2026-11-09'))).toBe('excused');
  });
});
