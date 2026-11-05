/**
 * Synchronous crash-safety net for the editor.
 *
 * IndexedDB writes are asynchronous and debounced; if the tab is killed between a keystroke and the
 * next flush, the newest characters could be lost. Every change is therefore also written
 * synchronously to localStorage. When the editor opens, a journal entry newer than the stored
 * document is applied (after snapshotting the stored version as a revision). The entry is cleared
 * once IndexedDB confirms the same content.
 */

export interface JournalEntry {
  content: string;
  savedAt: string;
}

const key = (documentId: string) => `wr.journal.${documentId}`;

export function writeJournal(documentId: string, content: string): boolean {
  try {
    localStorage.setItem(key(documentId), JSON.stringify({ content, savedAt: new Date().toISOString() } satisfies JournalEntry));
    return true;
  } catch {
    return false; // quota or storage disabled; IndexedDB remains the primary store
  }
}

export function readJournal(documentId: string): JournalEntry | null {
  try {
    const raw = localStorage.getItem(key(documentId));
    if (!raw) return null;
    const v = JSON.parse(raw) as JournalEntry;
    return typeof v?.content === 'string' && typeof v?.savedAt === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function clearJournalIfMatches(documentId: string, content: string) {
  try {
    const j = readJournal(documentId);
    if (j && j.content === content) localStorage.removeItem(key(documentId));
  } catch {
    /* ignore */
  }
}
