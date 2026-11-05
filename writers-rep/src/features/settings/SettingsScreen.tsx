import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { WeekRolePicker, type WeekPattern } from '../../components/WeekRolePicker';
import { backupFileName, downloadText, exportAll, importBackup, parseBackupText, type BackupFile, type BackupSummary } from '../../db/backup';
import { updateSettings } from '../../db/repo';
import { isHHMM } from '../../domain/dates';
import type { Lang, Weekday } from '../../domain/types';
import { fmtDateTime } from '../../i18n/format';
import { useInstallPrompt } from './useInstallPrompt';

export function SettingsScreen() {
  const { t, lang, settings } = useApp();
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const say = (msg: string) => {
    setFlash(msg);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 2500);
  };
  const save = async (patch: Parameters<typeof updateSettings>[0]) => {
    await updateSettings(patch);
    say(t.settings.saved);
  };

  const pattern: WeekPattern = { trainingDays: settings.trainingDays, reviewDay: settings.reviewDay, restDays: settings.restDays };

  return (
    <div className="page settings">
      <header className="page-head">
        <h1 className="page-title">{t.settings.title}</h1>
      </header>
      <div className="flash" role="status" aria-live="polite">{flash}</div>

      <section className="card" aria-labelledby="s-week">
        <h2 id="s-week" className="card-title">{t.settings.schedule}</h2>
        <p className="hint">{t.settings.scheduleHint}</p>
        <WeekRolePicker
          value={pattern}
          weekStartsOn={settings.weekStartsOn}
          onChange={(p) => {
            if (p.trainingDays.length === 0) return say(t.onboarding.needTraining);
            void save(p);
          }}
        />
        <label className="field">
          <span>{t.settings.weekStart}</span>
          <select value={settings.weekStartsOn} onChange={(e) => void save({ weekStartsOn: Number(e.target.value) as Weekday })}>
            {[6, 0, 1].map((d) => <option key={d} value={d}>{t.weekdaysLong[d]}</option>)}
          </select>
        </label>
        <NumberField label={t.settings.sessionMinutes} value={settings.sessionMinutes} min={5} max={120} onCommit={(v) => void save({ sessionMinutes: v })} invalid={t.settings.invalid} />
        <LangField label={t.settings.writingLang} value={settings.writingLanguageDefault} onChange={(v) => void save({ writingLanguageDefault: v })} />
      </section>

      <section className="card" aria-labelledby="s-acc">
        <h2 id="s-acc" className="card-title">{t.settings.accountability}</h2>
        <TimeField label={t.settings.cutoff} value={settings.cutoffTime} onCommit={(v) => (v > settings.reminderTime ? void save({ cutoffTime: v }) : say(t.onboarding.cutoffAfterReminder))} />
        <TimeField label={t.settings.reminder} value={settings.reminderTime} onCommit={(v) => (v < settings.cutoffTime ? void save({ reminderTime: v }) : say(t.onboarding.cutoffAfterReminder))} />
        <p className="hint">{t.settings.remindersInactive}</p>
      </section>

      <section className="card" aria-labelledby="s-ui">
        <h2 id="s-ui" className="card-title">{t.settings.uiLang}</h2>
        <LangField label={t.settings.uiLang} value={lang} onChange={(v) => void save({ locale: v })} />
      </section>

      <DataSection say={say} />
      <InstallSection />

      <section className="card" aria-labelledby="s-about">
        <h2 id="s-about" className="card-title">{t.settings.about}</h2>
        <p className="hint">{t.settings.version(__APP_VERSION__)} · {t.settings.timezone(settings.timezone)}</p>
        <h3 className="sub-title">{t.settings.limitations}</h3>
        <ul className="bullets">{t.settings.limitationList.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>
    </div>
  );
}

function NumberField({ label, value, min, max, onCommit, invalid }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void; invalid: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const n = Number(v);
  const ok = Number.isInteger(n) && n >= min && n <= max;
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" inputMode="numeric" min={min} max={max} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => ok && n !== value && onCommit(n)} aria-invalid={!ok} />
      {!ok && <small className="form-error">{invalid}</small>}
    </label>
  );
}

function TimeField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <label className="field">
      <span>{label}</span>
      <input type="time" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => isHHMM(v) && v !== value && onCommit(v)} />
    </label>
  );
}

function LangField({ label, value, onChange }: { label: string; value: Lang; onChange: (v: Lang) => void }) {
  const { t } = useApp();
  return (
    <div className="field">
      <span>{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {(['ar', 'en'] as const).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={value === l} className={`seg ${value === l ? 'is-on' : ''}`} onClick={() => value !== l && onChange(l)}>
            {t.lang[l]}
          </button>
        ))}
      </div>
    </div>
  );
}

function DataSection({ say }: { say: (m: string) => void }) {
  const { t, lang } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ backup: BackupFile; summary: BackupSummary } | null>(null);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const onFile = async (file: File) => {
    setErrors(null);
    const v = await parseBackupText(await file.text());
    if (!v.ok) return setErrors(v.errors);
    setPending({ backup: v.backup, summary: v.summary });
  };

  return (
    <section className="card" aria-labelledby="s-data">
      <h2 id="s-data" className="card-title">{t.settings.data}</h2>
      <p className="hint">{t.settings.dataHint}</p>
      <div className="btn-col">
        <button className="btn btn-primary" onClick={async () => downloadText(backupFileName(), JSON.stringify(await exportAll(), null, 2), 'application/json')}>
          <Icon name="download" size={18} /> {t.settings.exportJson}
        </button>
        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={18} /> {t.settings.importJson}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="import-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onFile(f);
          }}
        />
      </div>
      {errors && (
        <div className="form-error" role="alert">
          <p>{t.settings.importInvalid}</p>
          <ul className="bullets" dir="ltr">{errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      <h3 className="sub-title">{t.settings.storage}</h3>
      <p className="hint">{persisted === null ? t.settings.storageUnknown : persisted ? t.settings.storageGranted : t.settings.storageNotGranted}</p>
      {persisted === false && (
        <button className="btn btn-ghost btn-small" onClick={() => void navigator.storage.persist().then(setPersisted)}>
          {t.settings.storageRequest}
        </button>
      )}

      <Dialog open={!!pending} onClose={() => setPending(null)} title={t.settings.importJson}>
        {pending && (
          <>
            <p>{t.settings.importSummary(pending.summary.counts.documents, pending.summary.counts.sessions, pending.summary.exportedAt ? fmtDateTime(pending.summary.exportedAt, lang) : '—')}</p>
            <p className="coach-line coach-missed">{t.settings.importReplace}</p>
            <div className="btn-col">
              <button className="btn btn-secondary" onClick={async () => downloadText(backupFileName(), JSON.stringify(await exportAll(), null, 2), 'application/json')}>
                {t.settings.exportJson}
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  try {
                    await importBackup(pending.backup);
                    say(t.settings.importDone);
                  } catch (err) {
                    console.error(err);
                    say(t.settings.importFailed);
                  }
                  setPending(null);
                }}
              >
                {t.settings.importConfirm}
              </button>
              <button className="btn btn-ghost" onClick={() => setPending(null)}>{t.common.cancel}</button>
            </div>
          </>
        )}
      </Dialog>
    </section>
  );
}

function InstallSection() {
  const { t } = useApp();
  const { canInstall, installed, install } = useInstallPrompt();
  return (
    <section className="card" aria-labelledby="s-install">
      <h2 id="s-install" className="card-title">{t.settings.install}</h2>
      {installed ? <p className="hint">{t.settings.installed}</p> : <p className="hint">{t.settings.installHint}</p>}
      {canInstall && !installed && (
        <button className="btn btn-secondary" onClick={() => void install()}>{t.settings.installButton}</button>
      )}
    </section>
  );
}
