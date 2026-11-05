import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ensureSchedule, refreshWidgetSnapshot } from '../db/repo';
import { toLocalDate } from '../domain/dates';
import type { Lang, Settings } from '../domain/types';
import { STRINGS, type Strings } from '../i18n/strings';

interface AppState {
  settings: Settings;
  t: Strings;
  lang: Lang;
  /** Ticks every 30s and on focus, so date rollover and cutoffs update without a reload. */
  now: Date;
  today: string;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);
  const now = useNow(30_000);
  const today = toLocalDate(now);
  const onboarded = !!settings?.onboardedAt;

  // Day rollover: extend the schedule and refresh the widget snapshot when the local date changes.
  useEffect(() => {
    if (!onboarded) return;
    void ensureSchedule(new Date()).then(() => refreshWidgetSnapshot(new Date()));
  }, [today, onboarded]);

  const lang: Lang = settings?.locale ?? 'ar';
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const value = useMemo(() => (settings ? { settings, t: STRINGS[lang], lang, now, today } : null), [settings, lang, now, today]);
  if (!value) return <div className="boot">{STRINGS.ar.loading}</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}

export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, intervalMs);
    const onVis = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', tick);
    };
  }, [intervalMs]);
  return now;
}
