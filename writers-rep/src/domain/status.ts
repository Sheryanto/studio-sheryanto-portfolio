import { localDateTime, toLocalDate } from './dates';
import type { Assignment, DisplayStatus, Session, Settings } from './types';

/**
 * Display status of a training assignment (PRD §4.1):
 *   excused / completed  – persisted decisions, always win
 *   in_progress          – an unfinished (active) full session exists for it
 *   upcoming             – scheduled for a later date
 *   due                  – today, before the cutoff
 *   missed               – the cutoff passed with no qualifying completion
 *
 * A session counts toward its assignment only if it is a FULL session that STARTED before the
 * cutoff of the scheduled date and was then completed. Starting late, or resuming a missed day on
 * a later date, never converts a missed day into a completion.
 */
export function deriveStatus(
  a: Assignment,
  sessionsForAssignment: readonly Session[],
  settings: Pick<Settings, 'cutoffTime'>,
  now: Date,
): DisplayStatus {
  if (a.status === 'excused') return 'excused';
  if (a.status === 'completed') return 'completed';
  if (sessionsForAssignment.some((s) => s.status === 'active' && s.kind === 'full' && countsTowardAssignment(s, a, settings)))
    return 'in_progress';
  const today = toLocalDate(now);
  if (a.scheduledLocalDate > today) return 'upcoming';
  if (a.scheduledLocalDate === today && now < cutoffOf(a, settings)) return 'due';
  return 'missed';
}

export function cutoffOf(a: Pick<Assignment, 'scheduledLocalDate'>, settings: Pick<Settings, 'cutoffTime'>): Date {
  return localDateTime(a.scheduledLocalDate, settings.cutoffTime);
}

/** Whether a session (once completed) is eligible to complete this assignment. */
export function countsTowardAssignment(
  s: Pick<Session, 'kind' | 'startedAt' | 'assignmentId'>,
  a: Assignment,
  settings: Pick<Settings, 'cutoffTime'>,
): boolean {
  return s.kind === 'full' && s.assignmentId === a.id && new Date(s.startedAt) < cutoffOf(a, settings);
}
