import type { Assignment, DisplayStatus, Settings, WidgetSnapshot } from './types';

/**
 * Builds the privacy-safe snapshot a native Android widget (Milestone 3) will render.
 * It never includes draft text. With widgetPrivacy = 'hide' it also omits the mission title.
 */
export function buildWidgetSnapshot(args: {
  settings: Pick<Settings, 'widgetPrivacy' | 'sessionMinutes' | 'trainingDays'>;
  localDate: string;
  role: 'training' | 'review' | 'rest';
  assignment?: Assignment;
  status?: DisplayStatus;
  missionTitle?: string;
  weeklyCompleted: number;
  weeklyPlanned: number;
  now: Date;
}): WidgetSnapshot {
  const { settings, localDate, role, assignment, status, missionTitle, weeklyCompleted, weeklyPlanned, now } = args;
  const hidden = settings.widgetPrivacy === 'hide';
  const snapStatus: WidgetSnapshot['status'] =
    settings.trainingDays.length === 0 ? 'no-schedule' : assignment && status ? status : role === 'review' ? 'review' : 'rest';
  return {
    id: 'current',
    localDate,
    assignmentId: assignment?.id,
    missionTitle: assignment ? (hidden ? '' : (missionTitle ?? '')) : '',
    status: snapStatus,
    plannedMinutes: assignment ? settings.sessionMinutes : 0,
    weeklyCompleted,
    weeklyPlanned,
    streak: null,
    updatedAt: now.toISOString(),
  };
}
