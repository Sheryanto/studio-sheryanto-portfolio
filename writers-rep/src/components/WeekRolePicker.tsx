import { useApp } from '../app/AppContext';
import type { DayRole, Weekday } from '../domain/types';

export interface WeekPattern {
  trainingDays: Weekday[];
  reviewDay: Weekday | null;
  restDays: Weekday[];
}

const ROLES: DayRole[] = ['training', 'review', 'rest'];

export function roleOf(p: WeekPattern, d: Weekday): DayRole {
  if (p.trainingDays.includes(d)) return 'training';
  if (p.reviewDay === d) return 'review';
  return 'rest';
}

/** Assign one role per weekday. At most one review day: choosing a new one turns the old one into rest. */
export function setRole(p: WeekPattern, d: Weekday, role: DayRole): WeekPattern {
  const trainingDays = p.trainingDays.filter((x) => x !== d);
  let reviewDay = p.reviewDay === d ? null : p.reviewDay;
  const restDays = p.restDays.filter((x) => x !== d);
  if (role === 'training') trainingDays.push(d);
  if (role === 'review') {
    if (reviewDay !== null) restDays.push(reviewDay);
    reviewDay = d;
  }
  if (role === 'rest') restDays.push(d);
  const sort = (a: Weekday[]) => [...new Set(a)].sort((x, y) => x - y);
  return { trainingDays: sort(trainingDays), reviewDay, restDays: sort(restDays) };
}

export function WeekRolePicker({ value, onChange, weekStartsOn }: { value: WeekPattern; onChange: (p: WeekPattern) => void; weekStartsOn: Weekday }) {
  const { t } = useApp();
  const days = Array.from({ length: 7 }, (_, i) => ((weekStartsOn + i) % 7) as Weekday);
  return (
    <div className="week-picker">
      {days.map((d) => {
        const current = roleOf(value, d);
        return (
          <fieldset key={d} className="week-row">
            <legend className="week-day">{t.weekdaysLong[d]}</legend>
            <div className="segmented" role="radiogroup" aria-label={t.weekdaysLong[d]}>
              {ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={current === r}
                  className={`seg seg-${r} ${current === r ? 'is-on' : ''}`}
                  onClick={() => onChange(setRole(value, d, r))}
                >
                  {t.roles[r]}
                </button>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
