import { useCallback, useEffect, useRef, useState } from 'react';
import { saveDocumentContent } from '../../db/repo';
import { clearJournalIfMatches, writeJournal } from './draftJournal';

export type SaveState = 'saved' | 'saving' | 'error';

const DEBOUNCE_MS = 500;
const RETRY_MS = 3000;

/**
 * Autosave for one document: journal synchronously on every change, write to IndexedDB after a
 * short debounce, and flush immediately when the page is hidden, closed, or the editor unmounts.
 */
export function useAutosave(documentId: string | undefined) {
  const [state, setState] = useState<SaveState>('saved');
  const pending = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<void> | null>(null);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    if (!documentId) return;
    if (inFlight.current) await inFlight.current;
    const content = pending.current;
    if (content === null) return;
    pending.current = null;
    const run = (async () => {
      try {
        await saveDocumentContent(documentId, content);
        clearJournalIfMatches(documentId, content);
        if (pending.current === null) setState('saved');
      } catch (err) {
        console.error('autosave failed', err);
        if (pending.current === null) pending.current = content;
        setState('error');
        timer.current = window.setTimeout(() => void flush(), RETRY_MS);
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [documentId]);

  const change = useCallback(
    (content: string) => {
      if (!documentId) return;
      writeJournal(documentId, content);
      pending.current = content;
      setState('saving');
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
    },
    [documentId, flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      void flush();
    };
  }, [flush]);

  return { state, change, flush };
}
