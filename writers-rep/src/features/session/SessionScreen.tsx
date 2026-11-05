import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp, useNow } from '../../app/AppContext';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { getExercise } from '../../data/library';
import { db } from '../../db/db';
import {
  applyRecoveredDraft,
  completeSession,
  recoverSessionIfInterrupted,
  sessionHeartbeat,
  setSessionRunning,
  updateSessionFields,
} from '../../db/repo';
import { currentWeekRange, periodStats } from '../../domain/stats';
import { countsTowardAssignment } from '../../domain/status';
import { elapsedSeconds, formatClock, minutesOf } from '../../domain/timer';
import type { Lang, Session } from '../../domain/types';
import { countWords } from '../../domain/wordcount';
import { fmtDateTime } from '../../i18n/format';
import { readJournal } from './draftJournal';
import { useAutosave } from './useAutosave';

const HEARTBEAT_MS = 5000;

/**
 * Sessions whose timer was started by an editor in THIS page lifetime. A session found running that
 * is not in this set was left running by a page that died (crash, kill, reload) → interrupted.
 */
const startedInThisPage = new Set<string>();

export function SessionScreen() {
  const { id = '' } = useParams();
  const session = useLiveQuery(() => db.sessions.get(id).then((s) => s ?? null), [id]);
  const { t } = useApp();
  if (session === undefined) return <div className="boot">{t.loading}</div>;
  if (session === null)
    return (
      <main className="page">
        <p>{t.session.notFound}</p>
        <Link className="btn btn-secondary" to="/today">{t.session.backToToday}</Link>
      </main>
    );
  if (session.status !== 'active') return <SessionSummary session={session} />;
  return <Editor key={session.id} session={session} />;
}

function Editor({ session }: { session: Session }) {
  const { t, lang, settings } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [content, setContent] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<'prompt' | 'notes' | null>(null);
  const [notes, setNotes] = useState(session.notes ?? '');
  const [confirming, setConfirming] = useState(false);
  const [reflection, setReflection] = useState('');
  const [autoPaused, setAutoPaused] = useState(false);
  const wasRunningBeforeConfirm = useRef(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const autosave = useAutosave(session.documentId);
  const running = session.runningSince !== null;
  const tick = useNow(running ? 1000 : 60_000);
  const exercise = getExercise(session.exerciseId);
  const assignment = useLiveQuery(() => (session.assignmentId ? db.assignments.get(session.assignmentId) : undefined), [session.assignmentId]);
  const writingLang: Lang = session.writingLanguage;

  // Load: recover an interrupted timer, apply a newer local journal, then (optionally) start.
  useEffect(() => {
    let cancelled = false;
    const autostart = params.get('start') === '1';
    void (async () => {
      const now = new Date();
      if (!startedInThisPage.has(session.id) && (await recoverSessionIfInterrupted(session.id, now))) {
        const s = await db.sessions.get(session.id);
        if (!cancelled && s?.interruptedAt) setNotice(t.session.interrupted(fmtDateTime(s.interruptedAt, lang)));
      }
      const doc = await db.documents.get(session.documentId);
      let text = doc?.content ?? '';
      const journal = readJournal(session.documentId);
      if (doc && journal && journal.content !== doc.content && journal.savedAt > doc.updatedAt) {
        await applyRecoveredDraft(doc.id, journal.content, journal.savedAt, now);
        text = journal.content;
        if (!cancelled) setNotice(t.session.recoveredDraft(fmtDateTime(journal.savedAt, lang)));
      }
      if (cancelled) return;
      setContent(text);
      if (!text) setPanel('prompt');
      if (autostart) {
        startedInThisPage.add(session.id);
        await setSessionRunning(session.id, true);
        setParams({}, { replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per session; params/lang are read at mount on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  // Heartbeat while running bounds the time credited if the app is killed.
  useEffect(() => {
    if (!running) return;
    const h = window.setInterval(() => void sessionHeartbeat(session.id), HEARTBEAT_MS);
    return () => window.clearInterval(h);
  }, [running, session.id]);

  // Pause when hidden (active writing time only); resume on return if we paused it.
  const runningRef = useRef(running);
  runningRef.current = running;
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden' && runningRef.current) {
        setAutoPaused(true);
        void setSessionRunning(session.id, false);
      } else if (document.visibilityState === 'visible') {
        setAutoPaused((was) => {
          if (was) {
            startedInThisPage.add(session.id);
            void setSessionRunning(session.id, true);
          }
          return false;
        });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      // Leaving the editor (navigation or unmount) always pauses.
      void setSessionRunning(session.id, false);
    };
  }, [session.id]);

  const toggleTimer = useCallback(() => {
    startedInThisPage.add(session.id);
    setAutoPaused(false);
    void setSessionRunning(session.id, !running);
    if (!running) setNotice(null);
    textRef.current?.focus();
  }, [running, session.id]);

  const onChange = (value: string) => {
    setContent(value);
    autosave.change(value);
  };

  // Notes: debounced save.
  useEffect(() => {
    if (notes === (session.notes ?? '')) return;
    const h = window.setTimeout(() => void updateSessionFields(session.id, { notes }), 600);
    return () => window.clearTimeout(h);
  }, [notes, session.id, session.notes]);

  const openFinish = async () => {
    await autosave.flush();
    wasRunningBeforeConfirm.current = running;
    if (running) await setSessionRunning(session.id, false);
    setConfirming(true);
  };
  const cancelFinish = () => {
    setConfirming(false);
    if (wasRunningBeforeConfirm.current) {
      startedInThisPage.add(session.id);
      void setSessionRunning(session.id, true);
    }
  };
  const confirmFinish = async () => {
    await autosave.flush();
    await updateSessionFields(session.id, { notes });
    await completeSession(session.id, { reflection, notes });
    setConfirming(false);
  };

  const elapsed = elapsedSeconds(session, tick);
  const words = content === null ? session.wordCount : countWords(content);
  const target = session.targetMinutes;
  const late = !!assignment && session.kind === 'full' && !countsTowardAssignment(session, assignment, settings);
  const prompt = exercise && (lang === 'en' && exercise.promptEn ? exercise.promptEn : exercise.promptAr);
  const reflectionQ = exercise && (lang === 'en' && exercise.reflectionQuestionEn ? exercise.reflectionQuestionEn : exercise.reflectionQuestionAr);
  const saveLabel = autosave.state === 'saving' ? t.session.saving : autosave.state === 'error' ? t.session.saveError : t.session.saved;

  return (
    <div className="editor-screen">
      <header className="editor-bar">
        <button className="icon-btn" aria-label={t.common.back} onClick={() => void autosave.flush().then(() => navigate('/today'))}>
          <Icon name="back" className="flip-rtl" />
        </button>
        <div className="timer" aria-live="off">
          <span className={`timer-clock ${running ? 'is-running' : ''}`} data-testid="timer">{formatClock(elapsed)}</span>
          <span className="timer-target">{t.session.timerTarget(target)}</span>
          <progress className="timer-progress" max={target * 60} value={Math.min(elapsed, target * 60)} aria-hidden="true" />
        </div>
        <button className={`icon-btn timer-btn ${running ? '' : 'is-paused'}`} aria-label={running ? t.session.pause : t.session.resume} aria-pressed={!running} onClick={toggleTimer}>
          <Icon name={running ? 'pause' : 'play'} />
        </button>
        <button className="btn btn-primary btn-small" onClick={() => void openFinish()}>
          {t.session.finish}
        </button>
      </header>

      <div className="editor-tools">
        {exercise && (
          <button className={`tool ${panel === 'prompt' ? 'is-on' : ''}`} aria-expanded={panel === 'prompt'} onClick={() => setPanel(panel === 'prompt' ? null : 'prompt')}>
            <Icon name="prompt" size={18} />
            {t.session.prompt}
          </button>
        )}
        <button className={`tool ${panel === 'notes' ? 'is-on' : ''}`} aria-expanded={panel === 'notes'} onClick={() => setPanel(panel === 'notes' ? null : 'notes')}>
          <Icon name="notes" size={18} />
          {t.session.notes}
        </button>
        <div className="segmented segmented-small" role="radiogroup" aria-label={t.session.writingLanguage}>
          {(['ar', 'en'] as const).map((l) => (
            <button key={l} type="button" role="radio" aria-checked={writingLang === l} className={`seg ${writingLang === l ? 'is-on' : ''}`} onClick={() => void updateSessionFields(session.id, { writingLanguage: l })}>
              {l === 'ar' ? 'ع' : 'En'}
            </button>
          ))}
        </div>
        <span className="tool-stat" aria-label={t.session.wordsLabel} data-testid="wordcount">{t.common.words(words)}</span>
        <span className={`save-state save-${autosave.state}`} role="status" data-testid="save-state">
          {autosave.state === 'error' ? '!' : autosave.state === 'saving' ? '…' : <Icon name="check" size={16} />}
          <span className="save-label">{saveLabel}</span>
        </span>
      </div>

      {late && <p className="editor-notice">{t.session.lateWarning}</p>}
      {notice && <p className="editor-notice" role="status">{notice}</p>}
      {autoPaused && !running && <p className="editor-notice">{t.session.pausedBackground}</p>}

      {panel === 'prompt' && exercise && (
        <section className="editor-panel" aria-label={t.session.prompt}>
          <p className="panel-prompt">{prompt}</p>
          <p className="hint">{lang === 'en' && exercise.instructionsEn ? exercise.instructionsEn : exercise.instructionsAr}</p>
        </section>
      )}
      {panel === 'notes' && (
        <section className="editor-panel" aria-label={t.session.notes}>
          <textarea className="notes-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t.session.notesPlaceholder} rows={3} dir="auto" />
        </section>
      )}

      {content !== null && (
        <textarea
          ref={textRef}
          className={`editor-text lang-${writingLang}`}
          dir={writingLang === 'ar' ? 'rtl' : 'ltr'}
          lang={writingLang}
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={writingLang === 'ar' ? t.session.placeholderAr : t.session.placeholderEn}
          aria-label={t.session.editorLabel}
          spellCheck
          autoFocus
          data-testid="editor"
        />
      )}

      <Dialog open={confirming} onClose={cancelFinish} title={t.session.confirmTitle}>
        <p>{minutesOf(elapsed) < target ? t.session.confirmEarly(minutesOf(elapsed), target) : t.session.confirmFull(minutesOf(elapsed))}</p>
        <p className="hint">{t.common.words(words)}</p>
        {late && <p className="coach-line coach-missed">{t.session.lateWarning}</p>}
        {reflectionQ && (
          <label className="field">
            <span>{t.session.reflection}</span>
            <small className="hint">{reflectionQ}</small>
            <textarea value={reflection} onChange={(e) => setReflection(e.target.value)} rows={3} dir="auto" />
          </label>
        )}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => void confirmFinish()}>{t.session.finishConfirm}</button>
          <button className="btn btn-secondary" onClick={cancelFinish}>{t.session.keepWriting}</button>
        </div>
      </Dialog>
    </div>
  );
}

function SessionSummary({ session }: { session: Session }) {
  const { t, settings, now, today } = useApp();
  const week = currentWeekRange(today, settings.weekStartsOn);
  const data = useLiveQuery(async () => {
    const assignments = await db.assignments.where('scheduledLocalDate').between(week.from, week.to, true, true).toArray();
    const ids = assignments.map((a) => a.id);
    const sessions = ids.length ? await db.sessions.where('assignmentId').anyOf(ids).toArray() : [];
    const assignment = session.assignmentId ? await db.assignments.get(session.assignmentId) : undefined;
    return { assignments, sessions, assignment };
  }, [week.from, week.to, session.assignmentId]);
  if (!data) return null;
  const stats = periodStats({ from: week.from, to: week.to, assignments: data.assignments, sessions: data.sessions, settings, now });
  const counted = data.assignment?.completedSessionId === session.id;
  const line = !session.assignmentId ? t.session.summaryFree : counted ? t.session.summaryCounted : t.session.summaryNotCounted;
  return (
    <main className="page summary">
      <h1 className="page-title">{t.session.summaryTitle}</h1>
      <p className={`coach-line ${counted ? 'coach-done' : ''}`}>{line}</p>
      <dl className="stat-row stat-row-big">
        <div className="stat">
          <dt>{t.session.summaryActive}</dt>
          <dd><strong data-testid="summary-minutes">{t.common.minutes(minutesOf(session.activeSeconds))}</strong></dd>
        </div>
        <div className="stat">
          <dt>{t.session.summaryWords}</dt>
          <dd><strong>{session.wordCount}</strong></dd>
        </div>
        <div className="stat">
          <dt>{t.session.summaryWeek}</dt>
          <dd><span dir="ltr" className="frac"><strong>{stats.completed}</strong><span className="stat-of">/{stats.planned}</span></span></dd>
        </div>
      </dl>
      {session.reflection && <blockquote className="reflection" dir="auto">{session.reflection}</blockquote>}
      <div className="btn-col">
        <Link className="btn btn-primary btn-block" to="/today">{t.session.backToToday}</Link>
        <Link className="btn btn-secondary btn-block" to={`/library/${session.documentId}`}>{t.session.openInLibrary}</Link>
      </div>
    </main>
  );
}
