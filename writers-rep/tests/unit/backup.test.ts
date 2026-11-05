import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/db';
import { exportAll, importBackup, parseBackupText, pieceToMarkdown, validateBackup } from '../../src/db/backup';
import { completeOnboarding, completeSession, initApp, saveDocumentContent, setSessionRunning, startSession } from '../../src/db/repo';

const at = (hh: number, mm = 0) => new Date(2026, 10, 2, hh, mm);

async function seed() {
  await initApp(at(9));
  await completeOnboarding(
    { trainingDays: [1, 2, 3, 4, 5], reviewDay: 6, restDays: [0], reminderTime: '19:00', cutoffTime: '21:00', writingLanguageDefault: 'ar', locale: 'ar' },
    at(9),
  );
  const a = (await db.assignments.orderBy('scheduledLocalDate').first())!;
  const sid = await startSession({ assignmentId: a.id, kind: 'full' }, at(10));
    await setSessionRunning(sid, true, at(10));
  const s = (await db.sessions.get(sid))!;
  await saveDocumentContent(s.documentId, 'المسودة الأولى\nسطر ثانٍ', at(10, 5));
  await completeSession(sid, { reflection: 'تأمل' }, at(10, 20));
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('backup export/import', () => {
  it('round-trips every record exactly', async () => {
    await seed();
    const exported = await exportAll(at(11));
    const text = JSON.stringify(exported);
    await db.delete();
    await db.open();
    const parsed = await parseBackupText(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    await importBackup(parsed.backup, at(12));
    const again = await exportAll(at(11));
    const { app_events: ev1, ...rest1 } = exported.tables;
    const { app_events: ev2, ...rest2 } = again.tables;
    expect(rest2).toEqual(rest1);
    expect(ev2.length).toBe(ev1.length + 1); // the import itself is logged
  });

  it('rejects corrupted files and leaves existing data untouched', async () => {
    await seed();
    const before = await exportAll(at(11));
    expect((await parseBackupText('{not json')).ok).toBe(false);
    expect(validateBackup({ hello: 'world' }).ok).toBe(false);
    const broken = structuredClone(before);
    (broken.tables.documents[0] as Record<string, unknown>).content = 42;
    (broken.tables.sessions[0] as Record<string, unknown>).documentId = 'missing';
    const v = validateBackup(broken);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.some((e) => e.includes('documents[0].content'))).toBe(true);
      expect(v.errors.some((e) => e.includes('missing document'))).toBe(true);
    }
    await expect(importBackup(broken as never)).rejects.toThrow();
    const after = await exportAll(at(11));
    expect(after.tables).toEqual(before.tables);
  });

  it('rolls back when the write itself fails part-way', async () => {
    await seed();
    const before = await exportAll(at(11));
    const dup = structuredClone(before);
    // Same id twice in a table that validation does not catch across tables: force a bulkAdd failure.
    dup.tables.document_revisions.push({ ...(dup.tables.document_revisions[0] as object) });
    expect(validateBackup(dup).ok).toBe(false); // caught by duplicate-id validation
    const sneaky = structuredClone(before);
    const original = db.table('document_revisions').bulkAdd.bind(db.table('document_revisions'));
    db.table('document_revisions').bulkAdd = (() => Promise.reject(new Error('disk full'))) as never;
    await expect(importBackup(sneaky)).rejects.toThrow('disk full');
    db.table('document_revisions').bulkAdd = original;
    const after = await exportAll(at(11));
    expect(after.tables).toEqual(before.tables);
  });

  it('exports a piece as markdown with metadata', async () => {
    await seed();
    const doc = (await db.documents.toArray())[0]!;
    const md = pieceToMarkdown(doc, { exerciseTitle: 'X', trackName: 'Y' });
    expect(md.startsWith(`# ${doc.title}\n`)).toBe(true);
    expect(md).toContain('المسودة الأولى');
    expect(md).toContain('- Words: 4');
  });
});
