import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/AppContext';
import { StatusBadge } from '../../components/StatusBadge';
import { EXERCISES, PROGRAM, PROGRAM_SEQUENCE, TRACKS, getExercise, programPosition } from '../../data/library';
import { db } from '../../db/db';
import { addDays } from '../../domain/dates';
import { groupSessions } from '../../domain/stats';
import { deriveStatus } from '../../domain/status';
import type { Exercise } from '../../domain/types';
import { fmtDate } from '../../i18n/format';

export function ProgramScreen() {
  const { t, lang, settings, now, today } = useApp();
  const data = useLiveQuery(async () => {
    const latest = await db.assignments.where('scheduledLocalDate').belowOrEqual(today).last();
    const upcoming = await db.assignments.where('scheduledLocalDate').between(today, addDays(today, 7), true, true).toArray();
    const sessions = upcoming.length ? await db.sessions.where('assignmentId').anyOf(upcoming.map((a) => a.id)).toArray() : [];
    return { latest, upcoming, sessions };
  }, [today]);
  if (!data) return null;
  const pos = data.latest ? programPosition(data.latest.programIndex) : null;
  const inProgram = new Set(PROGRAM_SEQUENCE);
  const extras = EXERCISES.filter((e) => !inProgram.has(e.id));
  const bySession = groupSessions(data.sessions);
  const L = (ar: string, en?: string) => (lang === 'en' && en ? en : ar);

  return (
    <div className="page program">
      <header className="page-head">
        <h1 className="page-title">{t.program.title}</h1>
        <p className="eyebrow">{pos ? t.program.position(pos.weekIndex + 1, pos.cycle) : t.program.notStarted}</p>
      </header>

      <section className="card" aria-labelledby="up-title">
        <h2 id="up-title" className="card-title">{t.program.upcoming}</h2>
        {data.upcoming.length === 0 ? (
          <p className="hint">{t.program.noUpcoming}</p>
        ) : (
          <ul className="up-list">
            {data.upcoming.map((a) => {
              const e = getExercise(a.exerciseId);
              return (
                <li key={a.id} className="up-item">
                  <span className="up-date">{fmtDate(a.scheduledLocalDate, lang, { weekday: 'short', day: 'numeric' })}</span>
                  <span className="up-title">{e ? L(e.titleAr, e.titleEn) : t.common.unknownExercise}</span>
                  <StatusBadge status={deriveStatus(a, bySession.get(a.id) ?? [], settings, now)} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="month-title">
        <h2 id="month-title" className="section-title">{t.program.month}</h2>
        {PROGRAM.weeks.map((w, wi) => (
          <details key={wi} className="card week-block" open={pos ? pos.weekIndex === wi : wi === 0}>
            <summary>
              <span className="week-block-title">{L(w.titleAr, w.titleEn)}</span>
              {pos?.weekIndex === wi && <span className="chip">{t.program.current}</span>}
              <span className="hint week-focus">{L(w.focusAr, w.focusEn)}</span>
            </summary>
            <ol className="ex-list">
              {w.exerciseIds.map((id, slot) => {
                const e = getExercise(id)!;
                const current = pos?.weekIndex === wi && pos.slot === slot;
                return <ExerciseItem key={id} e={e} current={current} />;
              })}
            </ol>
          </details>
        ))}
        <p className="hint">{t.program.cycleNote}</p>
      </section>

      <section aria-labelledby="extra-title">
        <h2 id="extra-title" className="section-title">{t.program.extra}</h2>
        <ol className="ex-list card">{extras.map((e) => <ExerciseItem key={e.id} e={e} current={false} />)}</ol>
      </section>

      <section aria-labelledby="tracks-title">
        <h2 id="tracks-title" className="section-title">{t.program.tracks}</h2>
        <ul className="track-list">
          {TRACKS.map((tr) => (
            <li key={tr.id} className="card track-item">
              <strong>{L(tr.nameAr, tr.nameEn)}</strong>
              <p className="hint">{L(tr.descriptionAr, tr.descriptionEn)}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ExerciseItem({ e, current }: { e: Exercise; current: boolean }) {
  const { t, lang } = useApp();
  const L = (ar: string, en?: string) => (lang === 'en' && en ? en : ar);
  const track = TRACKS.find((x) => x.id === e.trackId);
  return (
    <li className={`ex-item ${current ? 'is-current' : ''}`}>
      <details>
        <summary>
          <span className="ex-title">{L(e.titleAr, e.titleEn)}</span>
          <span className="hint"> · {track ? L(track.nameAr, track.nameEn) : ''} · {t.skills[e.skill] ?? e.skill}</span>
        </summary>
        <div className="ex-body">
          <p>{L(e.promptAr, e.promptEn)}</p>
          <p><strong>{t.program.instructions}: </strong>{L(e.instructionsAr, e.instructionsEn)}</p>
          <p><strong>{t.program.criteria}: </strong>{L(e.completionCriteriaAr, e.completionCriteriaEn)}</p>
          <p><strong>{t.program.reflection}: </strong>{L(e.reflectionQuestionAr, e.reflectionQuestionEn)}</p>
          <p className="hint">{t.common.minutes(e.targetMinutes)}{e.targetWords ? ` · ${t.common.words(e.targetWords)}` : ''}</p>
        </div>
      </details>
    </li>
  );
}
