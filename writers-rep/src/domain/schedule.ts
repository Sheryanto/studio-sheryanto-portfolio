import { addDays, dateRange, endOfWeek, localDateTime, weekdayOf } from './dates';
import type { Assignment, DayRole, LocalDate, Settings, Weekday } from './types';

/**
 * Schedule generation.
 *
 * Rules
 *  1. Assignments exist for every training day from `programStartDate` through the end of the
 *     current week. Days the app was never opened still get assignments, so a missed day can never
 *     disappear just because the app stayed closed.
 *  2. `scheduleGeneratedThrough` freezes the past: generation only extends forward. Editing the
 *     weekly pattern never creates (fake) missed days in the past and never deletes past days.
 *  3. The prescribed exercise advances one program step per scheduled training day
 *     (programIndex = previous index + 1). A missed day keeps its exercise; the program does not
 *     silently re-assign it. Rescheduling is an explicit action (M2).
 */

export function dayRole(settings: Pick<Settings, 'trainingDays' | 'reviewDay'>, weekday: Weekday): DayRole {
  if (settings.trainingDays.includes(weekday)) return 'training';
  if (settings.reviewDay === weekday) return 'review';
  return 'rest';
}

export function exerciseIdFor(program: readonly string[], programIndex: number): string {
  if (program.length === 0) throw new Error('Program has no exercises');
  return program[((programIndex % program.length) + program.length) % program.length]!;
}

type ScheduleSettings = Pick<
  Settings,
  'programStartDate' | 'scheduleGeneratedThrough' | 'trainingDays' | 'reviewDay' | 'weekStartsOn'
>;

export interface PlanResult {
  create: Assignment[];
  generatedThrough: LocalDate;
}

export function planAssignments(args: {
  settings: ScheduleSettings;
  existing: readonly Assignment[];
  today: LocalDate;
  program: readonly string[];
  now: Date;
  newId: () => string;
}): PlanResult {
  const { settings, existing, today, program, now, newId } = args;
  const to = endOfWeek(today, settings.weekStartsOn);
  const generatedThrough = settings.scheduleGeneratedThrough;
  if (generatedThrough && generatedThrough >= to) return { create: [], generatedThrough };

  const from = generatedThrough ? addDays(generatedThrough, 1) : settings.programStartDate;
  const start = from < settings.programStartDate ? settings.programStartDate : from;
  const byDate = new Set(existing.map((a) => a.scheduledLocalDate));
  const all = [...existing];
  const create: Assignment[] = [];

  for (const date of dateRange(start, to)) {
    if (dayRole(settings, weekdayOf(date)) !== 'training' || byDate.has(date)) continue;
    const programIndex = nextProgramIndex(all, date);
    const a: Assignment = {
      id: newId(),
      exerciseId: exerciseIdFor(program, programIndex),
      scheduledLocalDate: date,
      programIndex,
      status: 'scheduled',
      assignedAt: now.toISOString(),
    };
    create.push(a);
    all.push(a);
    byDate.add(date);
  }
  return { create, generatedThrough: to > (generatedThrough ?? '') ? to : (generatedThrough as string) };
}

function nextProgramIndex(all: readonly Assignment[], date: LocalDate): number {
  let max = -1;
  for (const a of all) if (a.scheduledLocalDate < date && a.programIndex > max) max = a.programIndex;
  return max + 1;
}

/**
 * Which assignments may be removed when the weekly pattern changes. Only future work that has not
 * started: dates after today, or today itself while it is still before the cutoff. Anything with a
 * session, anything completed/missed/excused, and anything already past its cutoff is kept.
 */
export function removableOnScheduleChange(args: {
  existing: readonly Assignment[];
  assignmentIdsWithSessions: ReadonlySet<string>;
  today: LocalDate;
  now: Date;
  cutoffTime: string;
}): Assignment[] {
  const { existing, assignmentIdsWithSessions, today, now, cutoffTime } = args;
  const todayOpen = now < localDateTime(today, cutoffTime);
  return existing.filter(
    (a) =>
      a.status === 'scheduled' &&
      !assignmentIdsWithSessions.has(a.id) &&
      (a.scheduledLocalDate > today || (a.scheduledLocalDate === today && todayOpen)),
  );
}

/**
 * New `scheduleGeneratedThrough` after a pattern change: today stays regenerable while it is still
 * before the cutoff; otherwise today is frozen too. Generation then resumes from the next day.
 */
export function generatedThroughAfterChange(today: LocalDate, now: Date, cutoffTime: string): LocalDate {
  return now < localDateTime(today, cutoffTime) ? addDays(today, -1) : today;
}
