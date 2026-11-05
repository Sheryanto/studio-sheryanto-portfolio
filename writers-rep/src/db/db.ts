import Dexie, { type EntityTable } from 'dexie';
import type {
  Assignment,
  DocumentRevision,
  Exercise,
  IsoInstant,
  NotificationEvent,
  Review,
  Session,
  Settings,
  Track,
  WidgetSnapshot,
  WritingDocument,
} from '../domain/types';

/** Local audit log for events the user should be able to see later (e.g. timezone changes, imports). */
export interface AppEvent {
  id: string;
  at: IsoInstant;
  kind: 'timezone-change' | 'import' | 'schedule-change' | 'session-recovered' | 'draft-recovered';
  detail: string;
}

export class WritersRepDB extends Dexie {
  settings!: EntityTable<Settings, 'id'>;
  tracks!: EntityTable<Track, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  assignments!: EntityTable<Assignment, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  documents!: EntityTable<WritingDocument, 'id'>;
  document_revisions!: EntityTable<DocumentRevision, 'id'>;
  reviews!: EntityTable<Review, 'id'>;
  notification_events!: EntityTable<NotificationEvent, 'id'>;
  widget_snapshot!: EntityTable<WidgetSnapshot, 'id'>;
  app_events!: EntityTable<AppEvent, 'id'>;

  constructor(name = 'writers-rep') {
    super(name);
    // Schema changes must add a new version() block; never edit a shipped one.
    this.version(1).stores({
      settings: 'id',
      tracks: 'id',
      exercises: 'id, trackId',
      assignments: 'id, scheduledLocalDate, status',
      sessions: 'id, assignmentId, documentId, status, startedAt, kind',
      documents: 'id, sessionId, trackId, status, createdAt, updatedAt, *tags',
      document_revisions: 'id, documentId, createdAt, [documentId+createdAt]',
      reviews: 'id, sessionId',
      notification_events: 'id, assignmentId',
      widget_snapshot: 'id',
      app_events: 'id, at, kind',
    });
  }
}

export const db = new WritersRepDB();

/** Tables included in a full backup, in restore order. */
export const BACKUP_TABLES = [
  'settings',
  'tracks',
  'exercises',
  'assignments',
  'sessions',
  'documents',
  'document_revisions',
  'reviews',
  'notification_events',
  'widget_snapshot',
  'app_events',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
