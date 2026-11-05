/**
 * Core data model (PRD §6). All ids are UUIDs, all instants are ISO-8601 UTC strings,
 * and every schedule boundary uses a device-local calendar date (`LocalDate`, YYYY-MM-DD).
 */

export type LocalDate = string; // 'YYYY-MM-DD' in the device's current timezone
export type IsoInstant = string; // new Date().toISOString()
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // JS Date#getDay(): 0 = Sunday
export type Lang = 'ar' | 'en';
export type HHMM = string; // '21:00'

export type DayRole = 'training' | 'review' | 'rest';

export interface Settings {
  id: 'singleton';
  /** Set when the first-launch setup is confirmed. Until then the app shows onboarding. */
  onboardedAt: IsoInstant | null;
  /** First local date the program runs. Assignments are never generated before it. */
  programStartDate: LocalDate;
  /** Assignments exist for every training day up to and including this date (see domain/schedule.ts). */
  scheduleGeneratedThrough: LocalDate | null;
  /** IANA zone last seen on this device; used only to detect and log timezone changes. */
  timezone: string;
  locale: Lang;
  writingLanguageDefault: Lang;
  trainingDays: Weekday[];
  reviewDay: Weekday | null;
  /** Explicit rest days. Any weekday that is neither training nor review is also treated as rest. */
  restDays: Weekday[];
  weekStartsOn: Weekday;
  sessionMinutes: number;
  reminderTime: HHMM;
  /** Local time after which an unstarted training session counts as missed. Same calendar day. */
  cutoffTime: HHMM;
  graceMinutes: number;
  widgetPrivacy: 'show' | 'hide';
  notificationPermissionState: 'unknown' | 'default' | 'granted' | 'denied' | 'unsupported';
  updatedAt: IsoInstant;
}

export interface Track {
  id: TrackId;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
}

export type TrackId = 'journaling' | 'creative' | 'screenwriting' | 'professional';

export interface Exercise {
  id: string;
  trackId: TrackId;
  skill: string;
  titleAr: string;
  titleEn: string;
  promptAr: string;
  promptEn?: string;
  instructionsAr: string;
  instructionsEn?: string;
  targetMinutes: number;
  targetWords?: number;
  completionCriteriaAr: string;
  completionCriteriaEn?: string;
  reflectionQuestionAr: string;
  reflectionQuestionEn?: string;
  version: number;
}

/** Persisted assignment state. Display status (due / missed / ...) is derived, see domain/status.ts. */
export type AssignmentRecordStatus = 'scheduled' | 'completed' | 'missed' | 'excused';

export interface Assignment {
  id: string;
  exerciseId: string;
  scheduledLocalDate: LocalDate;
  /** Position in the program sequence (0-based); decides which exercise is prescribed. */
  programIndex: number;
  status: AssignmentRecordStatus;
  completedSessionId?: string;
  rescheduledFrom?: LocalDate;
  assignedAt: IsoInstant;
}

export type SessionKind = 'full' | 'rescue' | 'freewrite' | 'review';
export type SessionStatus = 'active' | 'completed' | 'abandoned';

export interface Session {
  id: string;
  assignmentId?: string;
  exerciseId?: string;
  documentId: string;
  kind: SessionKind;
  status: SessionStatus;
  startedAt: IsoInstant;
  endedAt?: IsoInstant;
  /** Accumulated active writing seconds, excluding the currently running stretch. */
  activeSeconds: number;
  /** Start of the currently running stretch; null when paused. */
  runningSince: IsoInstant | null;
  /** Last time the running timer was persisted. Bounds what is credited after a crash. */
  lastHeartbeatAt: IsoInstant | null;
  /** Set when a session was found running with no live editor (app closed / crashed). */
  interruptedAt?: IsoInstant;
  targetMinutes: number;
  writingLanguage: Lang;
  wordCount: number;
  notes?: string;
  reflection?: string;
  missedReason?: string;
  updatedAt: IsoInstant;
}

export type DocumentStatus = 'draft' | 'finished';

export interface WritingDocument {
  id: string;
  sessionId?: string;
  exerciseId?: string;
  trackId?: TrackId;
  title: string;
  content: string;
  language: Lang;
  tags: string[];
  status: DocumentStatus;
  wordCount: number;
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

export type RevisionSource =
  | 'checkpoint'
  | 'session-start'
  | 'session-complete'
  | 'before-edit'
  | 'before-restore'
  | 'restore'
  | 'before-recovery'
  | 'recovery';

export interface DocumentRevision {
  id: string;
  documentId: string;
  contentSnapshot: string;
  title: string;
  createdAt: IsoInstant;
  source: RevisionSource;
}

/** Defined now (M0 data model); populated from M2 (weekly review / self-assessment). */
export interface Review {
  id: string;
  sessionId: string;
  rubricVersion: number;
  scores: Record<string, number>;
  evidence: Record<string, string>;
  reflection: string;
  createdAt: IsoInstant;
  reviewerType: 'self' | 'human' | 'ai';
}

/** Defined now (M0 data model); populated from M2 (reminders). */
export interface NotificationEvent {
  id: string;
  assignmentId: string;
  kind: 'reminder' | 'second-reminder' | 'missed';
  scheduledAt: IsoInstant;
  deliveredAt?: IsoInstant;
  status: 'scheduled' | 'delivered' | 'cancelled' | 'failed';
}

/** Small, privacy-safe summary for the future native Android widget (M3). Never contains draft text. */
export interface WidgetSnapshot {
  id: 'current';
  localDate: LocalDate;
  assignmentId?: string;
  missionTitle: string;
  status: DisplayStatus | 'rest' | 'review' | 'no-schedule';
  plannedMinutes: number;
  weeklyCompleted: number;
  weeklyPlanned: number;
  /** Streak is calculated from M2; null until then so the widget never shows an invented number. */
  streak: number | null;
  updatedAt: IsoInstant;
}

export type DisplayStatus = 'upcoming' | 'due' | 'in_progress' | 'completed' | 'missed' | 'excused';
