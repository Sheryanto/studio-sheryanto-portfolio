import { dateRange, endOfWeek, startOfWeek, toLocalDate, weekdayOf } from './dates';
import { dayRole } from './schedule';
import { deriveStatus } from './status';
import { elapsedSeconds } from './timer';
import type { Assignment, DayRole, DisplayStatus, LocalDate, Session, Settings } from './types';

/**
 * Activity and consistency summaries computed only from persisted records.
 * Consistency (sessions completed vs planned) and activity (minutes, words) are kept separate;
 * neither says anything about writing quality.
 */

export interface PeriodStats {
  planned: number;
  completed: number;
  missed: number;
  excused: number;
  activeSeconds: number;
  words: number;
  sessionsCompleted: number;
}

export function sessionLocalDate(s: Pick<Session, 'startedAt'>): LocalDate {
  return toLocalDate(new Date(s.startedAt));
}

export function periodStats(args: {
  from: LocalDate;
  to: LocalDate;
  assignments: readonly Assignment[];
  sessions: readonly Session[];
  settings: Pick<Settings, 'cutoffTime'>;
  now: Date;
}): PeriodStats {
  const { from, to, assignments, sessions, settings, now } = args;
  const inRange = (d: LocalDate) => d >= from && d <= to;
  const byAssignment = groupSessions(sessions);
  const stats: PeriodStats = { planned: 0, completed: 0, missed: 0, excused: 0, activeSeconds: 0, words: 0, sessionsCompleted: 0 };

  for (const a of assignments) {
    if (!inRange(a.scheduledLocalDate)) continue;
    stats.planned++;
    const st = deriveStatus(a, byAssignment.get(a.id) ?? [], settings, now);
    if (st === 'completed') stats.completed++;
    else if (st === 'missed') stats.missed++;
    else if (st === 'excused') stats.excused++;
  }
  for (const s of sessions) {
    if (!inRange(sessionLocalDate(s))) continue;
    stats.activeSeconds += elapsedSeconds(s, now);
    stats.words += s.wordCount;
    if (s.status === 'completed') stats.sessionsCompleted++;
  }
  return stats;
}

export function currentWeekRange(today: LocalDate, weekStartsOn: Settings['weekStartsOn']) {
  return { from: startOfWeek(today, weekStartsOn), to: endOfWeek(today, weekStartsOn) };
}

export function groupSessions(sessions: readonly Session[]): Map<string, Session[]> {
  const m = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!s.assignmentId) continue;
    const list = m.get(s.assignmentId);
    if (list) list.push(s);
    else m.set(s.assignmentId, [s]);
  }
  return m;
}

export interface DayEntry {
  date: LocalDate;
  role: DayRole;
  /** Before the program started, or later than the generated schedule. */
  outsideProgram: boolean;
  assignment?: Assignment;
  status?: DisplayStatus;
  sessions: Session[];
}

/** One entry per calendar day for History. Uses the *current* weekly pattern only for days without an assignment. */
export function dayEntries(args: {
  from: LocalDate;
  to: LocalDate;
  assignments: readonly Assignment[];
  sessions: readonly Session[];
  settings: Pick<Settings, 'cutoffTime' | 'trainingDays' | 'reviewDay' | 'programStartDate'>;
  now: Date;
}): DayEntry[] {
  const { from, to, assignments, sessions, settings, now } = args;
  const byDate = new Map(assignments.map((a) => [a.scheduledLocalDate, a] as const));
  const byAssignment = groupSessions(sessions);
  const sessionsByDate = new Map<LocalDate, Session[]>();
  for (const s of sessions) {
    const d = sessionLocalDate(s);
    sessionsByDate.set(d, [...(sessionsByDate.get(d) ?? []), s]);
  }
  return dateRange(from, to).map((date) => {
    const a = byDate.get(date);
    const role: DayRole = a ? 'training' : dayRole(settings, weekdayOf(date));
    return {
      date,
      role: role === 'training' && !a ? 'rest' : role,
      outsideProgram: date < settings.programStartDate,
      assignment: a,
      status: a ? deriveStatus(a, byAssignment.get(a.id) ?? [], settings, now) : undefined,
      sessions: sessionsByDate.get(date) ?? [],
    };
  });
}

