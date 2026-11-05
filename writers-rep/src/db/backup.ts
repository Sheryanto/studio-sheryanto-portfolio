import { isHHMM, isLocalDate, toLocalDate } from '../domain/dates';
import { newId } from '../domain/ids';
import type { WritingDocument } from '../domain/types';
import { BACKUP_TABLES, type BackupTable, db } from './db';

/**
 * Full-data backup (PRD §4.4, §9).
 *  - Export: every table, as plain JSON, with a format marker and schema version.
 *  - Import: the whole file is validated BEFORE anything is touched. The replace runs in one
 *    IndexedDB transaction, so a failure part-way rolls back and existing data stays intact.
 */

export const BACKUP_FORMAT = 'writers-rep-backup';
export const BACKUP_SCHEMA_VERSION = 1;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<BackupTable, unknown[]>;
}

export async function exportAll(now = new Date()): Promise<BackupFile> {
  const tables = {} as Record<BackupTable, unknown[]>;
  await db.transaction('r', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) tables[t] = await db.table(t).toArray();
  });
  return { format: BACKUP_FORMAT, schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: now.toISOString(), tables };
}

export const backupFileName = (now = new Date()) => `writers-rep-backup-${toLocalDate(now)}.json`;

// --- validation --------------------------------------------------------------------------------

type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'iso' | 'localdate' | 'hhmm' | 'nullable-iso' | 'nullable-localdate' | 'nullable-number';
type Spec = Record<string, FieldType | `${FieldType}?`>;

const SPECS: Partial<Record<BackupTable, Spec>> = {
  settings: {
    id: 'string', onboardedAt: 'nullable-iso', programStartDate: 'localdate', scheduleGeneratedThrough: 'nullable-localdate',
    timezone: 'string', locale: 'string', writingLanguageDefault: 'string', trainingDays: 'array', reviewDay: 'nullable-number',
    restDays: 'array', weekStartsOn: 'number', sessionMinutes: 'number', reminderTime: 'hhmm', cutoffTime: 'hhmm',
    graceMinutes: 'number', widgetPrivacy: 'string', notificationPermissionState: 'string', updatedAt: 'iso',
  },
  assignments: { id: 'string', exerciseId: 'string', scheduledLocalDate: 'localdate', programIndex: 'number', status: 'string', assignedAt: 'iso', completedSessionId: 'string?', rescheduledFrom: 'localdate?' },
  sessions: {
    id: 'string', documentId: 'string', kind: 'string', status: 'string', startedAt: 'iso', endedAt: 'iso?', activeSeconds: 'number',
    runningSince: 'nullable-iso', lastHeartbeatAt: 'nullable-iso', targetMinutes: 'number', writingLanguage: 'string', wordCount: 'number',
    updatedAt: 'iso', assignmentId: 'string?', exerciseId: 'string?', notes: 'string?', reflection: 'string?', missedReason: 'string?', interruptedAt: 'iso?',
  },
  documents: { id: 'string', title: 'string', content: 'string', language: 'string', tags: 'array', status: 'string', wordCount: 'number', createdAt: 'iso', updatedAt: 'iso', sessionId: 'string?' },
  document_revisions: { id: 'string', documentId: 'string', contentSnapshot: 'string', title: 'string', createdAt: 'iso', source: 'string' },
  reviews: { id: 'string', sessionId: 'string', rubricVersion: 'number', scores: 'object', evidence: 'object', reflection: 'string', createdAt: 'iso', reviewerType: 'string' },
  notification_events: { id: 'string', assignmentId: 'string', kind: 'string', scheduledAt: 'iso', status: 'string' },
  exercises: { id: 'string', trackId: 'string', promptAr: 'string', targetMinutes: 'number', version: 'number' },
  tracks: { id: 'string', nameAr: 'string' },
  widget_snapshot: { id: 'string', localDate: 'localdate', updatedAt: 'iso' },
  app_events: { id: 'string', at: 'iso', kind: 'string', detail: 'string' },
};

const isIso = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && /^\d{4}-\d{2}-\d{2}T/.test(v);

function checkType(v: unknown, t: FieldType): boolean {
  switch (t) {
    case 'string': return typeof v === 'string';
    case 'number': return typeof v === 'number' && Number.isFinite(v);
    case 'boolean': return typeof v === 'boolean';
    case 'array': return Array.isArray(v);
    case 'object': return typeof v === 'object' && v !== null && !Array.isArray(v);
    case 'iso': return isIso(v);
    case 'localdate': return isLocalDate(v);
    case 'hhmm': return isHHMM(v);
    case 'nullable-iso': return v === null || isIso(v);
    case 'nullable-localdate': return v === null || isLocalDate(v);
    case 'nullable-number': return v === null || (typeof v === 'number' && Number.isFinite(v));
  }
}

export interface BackupSummary {
  exportedAt: string;
  counts: Record<BackupTable, number>;
}
export type ValidationResult = { ok: true; backup: BackupFile; summary: BackupSummary } | { ok: false; errors: string[] };

export function validateBackup(input: unknown): ValidationResult {
  const errors: string[] = [];
  const f = input as Partial<BackupFile> | null;
  if (!f || typeof f !== 'object') return { ok: false, errors: ['File is not a JSON object'] };
  if (f.format !== BACKUP_FORMAT) return { ok: false, errors: ["Not a Writer's Rep backup (format marker missing)"] };
  if (typeof f.schemaVersion !== 'number' || f.schemaVersion > BACKUP_SCHEMA_VERSION)
    return { ok: false, errors: [`Unsupported backup version ${String(f.schemaVersion)}`] };
  if (!f.tables || typeof f.tables !== 'object') return { ok: false, errors: ['Backup has no tables'] };

  const counts = {} as Record<BackupTable, number>;
  for (const table of BACKUP_TABLES) {
    const rows = (f.tables as Record<string, unknown>)[table] ?? [];
    if (!Array.isArray(rows)) {
      errors.push(`${table}: expected an array`);
      continue;
    }
    counts[table] = rows.length;
    const spec = SPECS[table];
    const ids = new Set<string>();
    rows.forEach((row, i) => {
      if (!row || typeof row !== 'object') return errors.push(`${table}[${i}]: not an object`);
      const r = row as Record<string, unknown>;
      if (typeof r.id === 'string') {
        if (ids.has(r.id)) errors.push(`${table}[${i}]: duplicate id ${r.id}`);
        ids.add(r.id);
      }
      for (const [field, rawType] of Object.entries(spec ?? {})) {
        const optional = rawType.endsWith('?');
        const type = rawType.replace('?', '') as FieldType;
        if (optional && (r[field] === undefined || r[field] === null)) continue;
        if (!checkType(r[field], type)) errors.push(`${table}[${i}].${field}: expected ${type}`);
      }
    });
    if (errors.length > 50) return { ok: false, errors: [...errors.slice(0, 50), '…'] };
  }
  const t = f.tables as Record<BackupTable, Array<Record<string, unknown>>>;
  if ((t.settings ?? []).length !== 1) errors.push('settings: exactly one settings record is required');
  const docIds = new Set((t.documents ?? []).map((d) => d.id));
  const sessionIds = new Set((t.sessions ?? []).map((s) => s.id));
  for (const s of t.sessions ?? []) if (!docIds.has(s.documentId)) errors.push(`session ${String(s.id)} references a missing document`);
  for (const r of t.document_revisions ?? []) if (!docIds.has(r.documentId)) errors.push(`revision ${String(r.id)} references a missing document`);
  for (const d of t.documents ?? []) if (d.sessionId && !sessionIds.has(d.sessionId)) errors.push(`document ${String(d.id)} references a missing session`);

  if (errors.length) return { ok: false, errors: errors.slice(0, 50) };
  return { ok: true, backup: f as BackupFile, summary: { exportedAt: String(f.exportedAt ?? ''), counts } };
}

export async function parseBackupText(text: string): Promise<ValidationResult> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['File is not valid JSON'] };
  }
  return validateBackup(json);
}

/** Replace ALL local data with a validated backup, atomically. */
export async function importBackup(backup: BackupFile, now = new Date()): Promise<void> {
  const v = validateBackup(backup);
  if (!v.ok) throw new Error(v.errors.join('\n'));
  await db.transaction('rw', BACKUP_TABLES.map((t) => db.table(t)), async () => {
    for (const t of BACKUP_TABLES) await db.table(t).clear();
    for (const t of BACKUP_TABLES) {
      const rows = backup.tables[t] ?? [];
      if (rows.length) await db.table(t).bulkAdd(rows);
    }
    await db.app_events.add({ id: newId(), at: now.toISOString(), kind: 'import', detail: `restored backup exported ${backup.exportedAt}` });
  });
}

// --- single-piece export ---------------------------------------------------------------------

export function pieceToMarkdown(doc: WritingDocument, meta: { exerciseTitle?: string; trackName?: string }): string {
  const lines = [`# ${doc.title}`, ''];
  lines.push(`- Date: ${toLocalDate(new Date(doc.createdAt))}`);
  if (meta.trackName) lines.push(`- Track: ${meta.trackName}`);
  if (meta.exerciseTitle) lines.push(`- Exercise: ${meta.exerciseTitle}`);
  lines.push(`- Words: ${doc.wordCount}`);
  if (doc.tags.length) lines.push(`- Tags: ${doc.tags.join(', ')}`);
  lines.push('', doc.content, '');
  return lines.join('\n');
}

export function pieceToText(doc: WritingDocument): string {
  return `${doc.title}\n\n${doc.content}\n`;
}

export function safeFileName(title: string, ext: string): string {
  const base = title.replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').trim().slice(0, 80) || 'piece';
  return `${base}.${ext}`;
}

/** Trigger a browser download. (In the native shell, M3 will route this through the share sheet.) */
export function downloadText(fileName: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
