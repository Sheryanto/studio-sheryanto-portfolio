import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useApp } from '../../app/AppContext';
import { WeekRolePicker, type WeekPattern } from '../../components/WeekRolePicker';
import { completeOnboarding, updateSettings } from '../../db/repo';
import type { Lang } from '../../domain/types';

/** First launch (PRD §8.1): confirm the week and cutoff → Today → Start writing. */
export function OnboardingScreen() {
  const { settings, t, lang } = useApp();
  const navigate = useNavigate();
  const [pattern, setPattern] = useState<WeekPattern>({
    trainingDays: settings.trainingDays,
    reviewDay: settings.reviewDay,
    restDays: settings.restDays,
  });
  const [cutoff, setCutoff] = useState(settings.cutoffTime);
  const [reminder, setReminder] = useState(settings.reminderTime);
  const [writingLang, setWritingLang] = useState<Lang>(settings.writingLanguageDefault);
  const [busy, setBusy] = useState(false);

  if (settings.onboardedAt) return <Navigate to="/today" replace />;

  const error = pattern.trainingDays.length === 0 ? t.onboarding.needTraining : reminder >= cutoff ? t.onboarding.cutoffAfterReminder : null;

  const submit = async () => {
    if (error) return;
    setBusy(true);
    await completeOnboarding({ ...pattern, cutoffTime: cutoff, reminderTime: reminder, writingLanguageDefault: writingLang, locale: lang });
    navigate('/today', { replace: true });
  };

  return (
    <main className="page onboarding">
      <div className="onboarding-top">
        <span className="brandmark" aria-hidden="true">WR</span>
        <button className="btn btn-ghost btn-small" onClick={() => void updateSettings({ locale: lang === 'ar' ? 'en' : 'ar' })}>
          {lang === 'ar' ? t.lang.en : t.lang.ar}
        </button>
      </div>
      <h1 className="page-title">{t.onboarding.title}</h1>
      <p className="lead">{t.onboarding.lead}</p>

      <section className="card" aria-labelledby="ob-week">
        <h2 id="ob-week" className="card-title">{t.onboarding.weekTitle}</h2>
        <WeekRolePicker value={pattern} onChange={setPattern} weekStartsOn={settings.weekStartsOn} />
        <p className="hint">{t.onboarding.summary(pattern.trainingDays.length, settings.sessionMinutes)}</p>
      </section>

      <section className="card" aria-labelledby="ob-times">
        <h2 id="ob-times" className="card-title">{t.onboarding.timesTitle}</h2>
        <label className="field">
          <span>{t.onboarding.cutoffLabel}</span>
          <input type="time" value={cutoff} onChange={(e) => setCutoff(e.target.value)} required />
          <small className="hint">{t.onboarding.cutoffHint}</small>
        </label>
        <label className="field">
          <span>{t.onboarding.reminderLabel}</span>
          <input type="time" value={reminder} onChange={(e) => setReminder(e.target.value)} />
          <small className="hint">{t.onboarding.reminderHint}</small>
        </label>
        <div className="field">
          <span>{t.onboarding.writingLang}</span>
          <div className="segmented" role="radiogroup" aria-label={t.onboarding.writingLang}>
            {(['ar', 'en'] as const).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={writingLang === l} className={`seg ${writingLang === l ? 'is-on' : ''}`} onClick={() => setWritingLang(l)}>
                {t.lang[l]}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="sticky-cta">
        <button className="btn btn-primary btn-block" disabled={!!error || busy} onClick={() => void submit()}>
          {t.onboarding.start}
        </button>
      </div>
    </main>
  );
}
