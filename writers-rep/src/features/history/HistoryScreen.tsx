import { useState } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/AppContext';
import { Icon } from '../../components/Icon';
import { StatusBadge, type BadgeStatus } from '../../components/StatusBadge';
import { getExercise } from '../../data/library';
import { db } from '../../db/db';
import { localDateTime, toLocalDate, weekdayOf } from '../../domain/dates';
import { dayEntries, type DayEntry } from '../../domain/stats';
import { countsTowardAssignment } from '../../domain/status';
import { elapsedSeconds, minutesOf } from '../../domain/timer';
import type { Weekday } from '../../domain/types';
import { fmtDate, fmtMonth, fmtTime } from '../../i18n/format';

/** Calendar/list of training days (PRD §4.4): completed, missed, excused, rescue, rest, review. */
export function HistoryScreen() {
  const { t, lang, settings, now, today } = useApp();
  const [month, setMonth] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [selected, setSelected] = useState<string>(today);

  const first = toLocalDate(new Date(month.y, month.m, 1));
  const last = toLocalDate(new Date(month.y, month.m + 1, 0));
  const data = useLiveQuery(async () => {
    const [assignments, sessions] = await Promise.all([
      db.assignments.where('scheduledLocalDate').between(first, last, true, true).toArray(),
      db.sessions
        .where('startedAt')
        .between(new Date(localDateTime(first, '00:00').getTime() - 864e5).toISOString(), new Date(localDateTime(last, '23:59').getTime() + 864e5).toISOString())
        .toArray(),
    ]);
    return { assignments, sessions };
  }, [first, last]);

  if (!data) return null;
  const entries = dayEntries({ from: first, to: last, assignments: data.assignments, sessions: data.sessions, settings, now });
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const lead = (weekdayOf(first) - settings.weekStartsOn + 7) % 7;
  const headers = Array.from({ length: 7 }, (_, i) => ((settings.weekStartsOn + i) % 7) as Weekday);
  const listEntries = entries.filter((e) => (e.assignment || e.sessions.length) && e.date <= today).reverse();
  const shift = (delta: number) => setMonth(({ y, m }) => ({ y: new Date(y, m + delta, 1).getFullYear(), m: new Date(y, m + delta, 1).getMonth() }));

  return (
    <div className="page history">
      <header className="page-head">
        <h1 className="page-title">{t.history.title}</h1>
      </header>
      <div className="month-nav">
        <button className="icon-btn" aria-label={t.history.prevMonth} onClick={() => shift(-1)}>
          <Icon name="chevronStart" className="flip-rtl" />
        </button>
        <h2 className="month-title">{fmtMonth(month.y, month.m, lang)}</h2>
        <button className="icon-btn" aria-label={t.history.nextMonth} onClick={() => shift(1)}>
          <Icon name="chevronEnd" className="flip-rtl" />
        </button>
        <div className="segmented segmented-small" role="radiogroup">
          {(['calendar', 'list'] as const).map((v) => (
            <button key={v} role="radio" aria-checked={view === v} className={`seg ${view === v ? 'is-on' : ''}`} onClick={() => setView(v)}>
              {t.history[v]}
            </button>
          ))}
        </div>
      </div>

      {view === 'calendar' ? (
        <>
          <div className="cal" role="grid">
            {headers.map((d) => (
              <div key={`h${d}`} className="cal-head" role="columnheader">{t.weekdaysShort[d]}</div>
            ))}
            {Array.from({ length: lead }, (_, i) => <div key={`pad${i}`} className="cal-pad" />)}
            {entries.map((e) => {
              const mark = markOf(e, today);
              return (
                <button
                  key={e.date}
                  role="gridcell"
                  className={`cal-day cal-${mark} ${e.date === today ? 'is-today' : ''} ${e.date === selected ? 'is-selected' : ''}`}
                  aria-label={`${fmtDate(e.date, lang)}: ${labelOf(mark, t)}`}
                  aria-selected={e.date === selected}
                  onClick={() => setSelected(e.date)}
                >
                  <span className="cal-num">{Number(e.date.slice(8))}</span>
                  <span className="cal-dot" aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <Legend />
          {byDate.get(selected) && <DayDetail entry={byDate.get(selected)!} />}
        </>
      ) : listEntries.length === 0 ? (
        <p className="hint">{t.history.noEntries}</p>
      ) : (
        <div className="day-list">
          {listEntries.map((e) => <DayDetail key={e.date} entry={e} />)}
        </div>
      )}
    </div>
  );
}

type Mark = 'completed' | 'missed' | 'excused' | 'in_progress' | 'due' | 'upcoming' | 'rescue' | 'review' | 'rest' | 'extra' | 'none';

function markOf(e: DayEntry, today: string): Mark {
  if (e.outsideProgram && !e.sessions.length) return 'none';
  if (e.status) {
    if (e.status !== 'completed' && e.sessions.some((s) => s.kind === 'rescue' && s.status === 'completed')) return 'rescue';
    return e.status;
  }
  if (e.sessions.some((s) => s.status === 'completed')) return 'extra';
  if (e.date > today) return 'none';
  return e.role === 'review' ? 'review' : 'rest';
}

function labelOf(mark: Mark, t: ReturnType<typeof useApp>['t']): string {
  if (mark === 'rescue') return t.kinds.rescue;
  if (mark === 'extra') return t.kinds.freewrite;
  if (mark === 'none') return '—';
  return t.status[mark];
}

function Legend() {
  const { t } = useApp();
  const marks: Mark[] = ['completed', 'missed', 'excused', 'rescue', 'in_progress', 'review', 'rest'];
  return (
    <ul className="legend" aria-label={t.history.legend}>
      {marks.map((m) => (
        <li key={m} className={`legend-item cal-${m}`}>
          <span className="cal-dot" aria-hidden="true" />
          {labelOf(m, t)}
        </li>
      ))}
    </ul>
  );
}

function DayDetail({ entry }: { entry: DayEntry }) {
  const { t, lang, settings, now } = useApp();
  const exercise = getExercise(entry.assignment?.exerciseId);
  return (
    <article className="card day-detail">
      <div className="day-head">
        <h3 className="card-title">{fmtDate(entry.date, lang)}</h3>
        {entry.status ? <StatusBadge status={entry.status} /> : <StatusBadge status={entry.role as BadgeStatus} label={t.roles[entry.role]} />}
      </div>
      {entry.outsideProgram && <p className="hint">{t.history.beforeProgram}</p>}
      {exercise && <p>{lang === 'en' ? exercise.titleEn : exercise.titleAr}</p>}
      {entry.sessions.length === 0 ? (
        <p className="hint">{t.history.dayEmpty}</p>
      ) : (
        <ul className="session-list">
          {entry.sessions.map((s) => {
            const late = entry.assignment && s.kind === 'full' && s.assignmentId === entry.assignment.id && !countsTowardAssignment(s, entry.assignment, settings);
            return (
              <li key={s.id}>
                <Link to={s.status === 'active' ? `/session/${s.id}` : `/library/${s.documentId}`} className="session-link">
                  {t.history.sessionLine(t.kinds[s.kind], fmtTime(s.startedAt, lang), minutesOf(elapsedSeconds(s, now)), s.wordCount)}
                  {late && <span className="chip chip-quiet">{t.history.lateTag}</span>}
                  {s.status === 'active' && <span className="chip chip-quiet">{t.history.activeTag}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
