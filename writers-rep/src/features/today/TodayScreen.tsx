import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/AppContext';
import { StatusBadge } from '../../components/StatusBadge';
import { getExercise, getTrack } from '../../data/library';
import { db } from '../../db/db';
import { completeSession, startSession } from '../../db/repo';
import { localDateTime, weekdayOf, dateRange } from '../../domain/dates';
import { dayRole } from '../../domain/schedule';
import { currentWeekRange, periodStats } from '../../domain/stats';
import { cutoffOf, deriveStatus } from '../../domain/status';
import { elapsedSeconds, minutesOf } from '../../domain/timer';
import type { Assignment, Session } from '../../domain/types';
import { fmtDate, fmtDateTime, fmtHHMM } from '../../i18n/format';

export function TodayScreen() {
  const { settings, t, lang, now, today } = useApp();
  const navigate = useNavigate();
  const week = currentWeekRange(today, settings.weekStartsOn);

  const data = useLiveQuery(async () => {
    const [weekAssignments, activeSessions, upcoming, completedCount] = await Promise.all([
      db.assignments.where('scheduledLocalDate').between(week.from, week.to, true, true).toArray(),
      db.sessions.where('status').equals('active').toArray(),
      db.assignments.where('scheduledLocalDate').above(today).limit(1).toArray(),
      db.sessions.where('status').equals('completed').count(),
    ]);
    const ids = weekAssignments.map((a) => a.id);
    const weekSessions = await db.sessions.where('startedAt').aboveOrEqual(localDateTime(week.from, '00:00').toISOString()).toArray();
    const assignmentSessions = ids.length ? await db.sessions.where('assignmentId').anyOf(ids).toArray() : [];
    return { weekAssignments, weekSessions, assignmentSessions, activeSessions, next: upcoming[0], completedCount };
  }, [week.from, week.to, today]);

  if (!data) return null;

  const todays = data.weekAssignments.find((a) => a.scheduledLocalDate === today);
  const role = dayRole(settings, weekdayOf(today));
  const stats = periodStats({ from: week.from, to: week.to, assignments: data.weekAssignments, sessions: data.weekSessions, settings, now });

  return (
    <div className="page today">
      <header className="page-head">
        <p className="eyebrow">{fmtDate(today, lang)}</p>
        <h1 className="page-title">{t.today.mission}</h1>
      </header>

      {data.activeSessions
        .filter((s) => !todays || s.assignmentId !== todays.id)
        .map((s) => (
          <UnfinishedCard key={s.id} session={s} />
        ))}

      {settings.trainingDays.length === 0 ? (
        <EmptyCard title={t.today.noScheduleTitle} body={t.today.noScheduleBody} action={{ label: t.today.noScheduleAction, to: '/settings' }} />
      ) : todays ? (
        <MissionCard
          assignment={todays}
          sessions={data.assignmentSessions.filter((s) => s.assignmentId === todays.id)}
          isFirst={data.completedCount === 0}
          onStart={async () => {
            const id = await startSession({ assignmentId: todays.id, kind: 'full' });
            navigate(`/session/${id}?start=1`);
          }}
        />
      ) : today < settings.programStartDate ? (
        <EmptyCard title={t.today.notStartedYetTitle} body={t.today.notStartedYetBody(fmtDate(settings.programStartDate, lang))} />
      ) : role === 'review' ? (
        <EmptyCard title={t.today.reviewTitle} body={t.today.reviewBody} action={{ label: t.today.reviewAction, to: '/library' }} />
      ) : (
        <EmptyCard title={t.today.restTitle} body={t.today.restBody} />
      )}

      {!todays && data.next && (
        <p className="next-line">
          {t.today.next(
            fmtDate(data.next.scheduledLocalDate, lang, { weekday: 'long' }),
            exerciseTitle(data.next.exerciseId, lang) ?? t.common.unknownExercise,
          )}
        </p>
      )}

      {(!todays || todays.status === 'completed') && (
        <button
          className="btn btn-ghost btn-block"
          onClick={async () => {
            const id = await startSession({ kind: 'freewrite' });
            navigate(`/session/${id}?start=1`);
          }}
        >
          {t.today.freewrite}
        </button>
      )}

      <section className="card week-card" aria-labelledby="week-title">
        <h2 id="week-title" className="card-title">{t.today.weekTitle}</h2>
        <WeekStrip assignments={data.weekAssignments} sessions={data.assignmentSessions} from={week.from} to={week.to} />
        <dl className="stat-row">
          <div className="stat">
            <dt>{t.today.sessionsDone}</dt>
            <dd>
              <span dir="ltr" className="frac">
                <strong>{stats.completed}</strong>
                <span className="stat-of">/{stats.planned}</span>
              </span>
            </dd>
          </div>
          <div className="stat">
            <dt>{t.today.activeMinutes}</dt>
            <dd>
              <strong>{minutesOf(stats.activeSeconds)}</strong>
            </dd>
          </div>
          <div className="stat">
            <dt>{t.today.wordsWritten}</dt>
            <dd>
              <strong>{stats.words}</strong>
            </dd>
          </div>
        </dl>
        {stats.missed > 0 && <p className="coach-line">{t.today.missedThisWeek(stats.missed)}</p>}
      </section>
    </div>
  );
}

function exerciseTitle(id: string | undefined, lang: 'ar' | 'en') {
  const e = getExercise(id);
  return e ? (lang === 'en' ? e.titleEn : e.titleAr) : undefined;
}

function MissionCard({ assignment, sessions, isFirst, onStart }: { assignment: Assignment; sessions: Session[]; isFirst: boolean; onStart: () => Promise<void> }) {
  const { settings, t, lang, now } = useApp();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const exercise = getExercise(assignment.exerciseId);
  const track = getTrack(exercise?.trackId);
  const status = deriveStatus(assignment, sessions, settings, now);
  const active = sessions.find((s) => s.status === 'active');
  const done = sessions.find((s) => s.id === assignment.completedSessionId);
  const cutoffLabel = fmtHHMM(settings.cutoffTime, lang);
  const pastCutoff = now >= cutoffOf(assignment, settings);

  const start = async () => {
    setBusy(true);
    try {
      await onStart();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card mission" aria-labelledby="mission-title">
      <div className="mission-meta">
        <span className="chip">{track ? (lang === 'en' ? track.nameEn : track.nameAr) : ''}</span>
        {exercise && <span className="chip chip-quiet">{t.skills[exercise.skill] ?? exercise.skill}</span>}
        <StatusBadge status={status} />
      </div>
      <h2 id="mission-title" className="mission-title">
        {exercise ? (lang === 'en' ? exercise.titleEn : exercise.titleAr) : t.common.unknownExercise}
      </h2>
      {exercise && (
        <p className="mission-prompt" lang={lang === 'en' && exercise.promptEn ? 'en' : 'ar'}>
          {lang === 'en' && exercise.promptEn ? exercise.promptEn : exercise.promptAr}
        </p>
      )}
      <ul className="mission-targets">
        <li>{t.today.targetMinutes(settings.sessionMinutes)}</li>
        {exercise?.targetWords && <li>{t.today.targetWords(exercise.targetWords)}</li>}
        {status === 'due' && <li>{t.today.dueBy(cutoffLabel)}</li>}
      </ul>
      {exercise && (
        <details className="mission-details">
          <summary>{t.today.showInstructions}</summary>
          <p>{lang === 'en' && exercise.instructionsEn ? exercise.instructionsEn : exercise.instructionsAr}</p>
          <p>
            <strong>{t.today.criteria}: </strong>
            {lang === 'en' && exercise.completionCriteriaEn ? exercise.completionCriteriaEn : exercise.completionCriteriaAr}
          </p>
        </details>
      )}

      {status === 'due' && (
        <>
          {isFirst && <p className="coach-line">{t.today.firstSession}</p>}
          <p className="coach-line">{t.today.pending(settings.sessionMinutes)}</p>
          <button className="btn btn-primary btn-block btn-xl" disabled={busy} onClick={() => void start()}>
            {t.today.startWriting}
          </button>
        </>
      )}
      {(status === 'in_progress' || (status === 'missed' && active)) && active && (
        <>
          <p className="coach-line">{status === 'missed' ? t.today.lateSessionNote : t.today.inProgressLine}</p>
          {active.interruptedAt && <p className="hint">{t.today.interruptedNote}</p>}
          <button className="btn btn-primary btn-block btn-xl" onClick={() => navigate(`/session/${active.id}?start=1`)}>
            {t.today.resume}
          </button>
        </>
      )}
      {status === 'missed' && !active && (
        <>
          <p className="coach-line coach-missed">{t.today.missedLine(cutoffLabel)}</p>
          {pastCutoff && (
            <button className="btn btn-secondary btn-block" disabled={busy} onClick={() => void start()}>
              {t.today.writeLate}
            </button>
          )}
        </>
      )}
      {status === 'completed' && (
        <>
          <p className="coach-line coach-done">
            {done ? t.today.completedLine(minutesOf(done.activeSeconds), done.wordCount) : t.status.completed}
          </p>
          {done && (
            <Link className="btn btn-secondary btn-block" to={`/library/${done.documentId}`}>
              {t.today.openPiece}
            </Link>
          )}
        </>
      )}
    </article>
  );
}

function UnfinishedCard({ session }: { session: Session }) {
  const { t, lang, now } = useApp();
  const navigate = useNavigate();
  const exercise = getExercise(session.exerciseId);
  const title = exercise ? (lang === 'en' ? exercise.titleEn : exercise.titleAr) : t.kinds[session.kind];
  return (
    <article className="card unfinished" aria-label={t.today.unfinishedTitle}>
      <div className="mission-meta">
        <StatusBadge status="in_progress" label={t.today.unfinishedTitle} />
        <span className="chip chip-quiet">{t.kinds[session.kind]}</span>
      </div>
      <h2 className="card-title">{title}</h2>
      <p className="hint">
        {t.today.unfinishedBody(fmtDateTime(session.startedAt, lang), fmtDateTime(session.updatedAt, lang), minutesOf(elapsedSeconds(session, now)))}
      </p>
      {session.interruptedAt && <p className="coach-line">{t.today.interruptedNote}</p>}
      <div className="btn-row">
        <button className="btn btn-primary" onClick={() => navigate(`/session/${session.id}?start=1`)}>
          {t.today.resume}
        </button>
        <button className="btn btn-secondary" onClick={() => void completeSession(session.id, {}).then(() => navigate(`/session/${session.id}`))}>
          {t.today.finishNow}
        </button>
      </div>
    </article>
  );
}

function EmptyCard({ title, body, action }: { title: string; body: string; action?: { label: string; to: string } }) {
  return (
    <article className="card empty-card">
      <h2 className="card-title">{title}</h2>
      <p>{body}</p>
      {action && (
        <Link className="btn btn-secondary" to={action.to}>
          {action.label}
        </Link>
      )}
    </article>
  );
}

function WeekStrip({ assignments, sessions, from, to }: { assignments: Assignment[]; sessions: Session[]; from: string; to: string }) {
  const { settings, t, now, today, lang } = useApp();
  const byDate = new Map(assignments.map((a) => [a.scheduledLocalDate, a]));
  return (
    <ol className="week-strip">
      {dateRange(from, to).map((d) => {
        const a = byDate.get(d);
        const status = a ? deriveStatus(a, sessions.filter((s) => s.assignmentId === a.id), settings, now) : dayRole(settings, weekdayOf(d));
        const label = `${fmtDate(d, lang, { weekday: 'long' })}: ${status in t.status ? t.status[status as keyof typeof t.status] : t.roles[status as 'rest']}`;
        return (
          <li key={d} className={`wday wday-${status} ${d === today ? 'is-today' : ''}`} aria-label={label} title={label}>
            <span className="wday-name">{t.weekdaysShort[weekdayOf(d)]}</span>
            <span className="wday-dot" aria-hidden="true" />
          </li>
        );
      })}
    </ol>
  );
}
