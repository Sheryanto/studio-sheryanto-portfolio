import { useEffect, useRef, useState } from 'react';
import { HashRouter, NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { db } from '../db/db';
import { ensureSchedule, startSession } from '../db/repo';
import { toLocalDate } from '../domain/dates';
import { Icon, type IconName } from '../components/Icon';
import { HistoryScreen } from '../features/history/HistoryScreen';
import { LibraryScreen } from '../features/library/LibraryScreen';
import { PieceScreen } from '../features/library/PieceScreen';
import { OnboardingScreen } from '../features/onboarding/OnboardingScreen';
import { ProgramScreen } from '../features/program/ProgramScreen';
import { SessionScreen } from '../features/session/SessionScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { TodayScreen } from '../features/today/TodayScreen';
import { AppProvider, useApp } from './AppContext';

/**
 * Routes are hash-based (#/today) so the app works from any static path, offline, and later inside
 * the native shell, where widget/shortcut deep links target the same paths:
 *   #/start            → start or resume today's prescribed session
 *   #/session/:id      → a specific session
 */
export function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route path="/onboarding" element={<OnboardingScreen />} />
          <Route element={<RequireOnboarding />}>
            <Route path="/start" element={<StartToday />} />
            <Route path="/session/:id" element={<SessionScreen />} />
            <Route element={<Shell />}>
              <Route path="/today" element={<TodayScreen />} />
              <Route path="/program" element={<ProgramScreen />} />
              <Route path="/library" element={<LibraryScreen />} />
              <Route path="/library/:id" element={<PieceScreen />} />
              <Route path="/history" element={<HistoryScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}

function RequireOnboarding() {
  const { settings } = useApp();
  if (!settings.onboardedAt) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

const TABS: { to: string; icon: IconName; key: 'today' | 'program' | 'library' | 'history' | 'settings' }[] = [
  { to: '/today', icon: 'today', key: 'today' },
  { to: '/program', icon: 'program', key: 'program' },
  { to: '/library', icon: 'library', key: 'library' },
  { to: '/history', icon: 'history', key: 'history' },
  { to: '/settings', icon: 'settings', key: 'settings' },
];

function Shell() {
  const { t } = useApp();
  return (
    <div className="shell">
      <UpdateBanner />
      <main className="shell-main" id="main">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label={t.appName}>
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => `tab ${isActive ? 'is-active' : ''}`}>
            <Icon name={tab.icon} />
            <span>{t.nav[tab.key]}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** Deep-link target: start (or resume) today's prescribed session; otherwise land on Today. */
function StartToday() {
  const navigate = useNavigate();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    void (async () => {
      const now = new Date();
      await ensureSchedule(now);
      const a = await db.assignments.where('scheduledLocalDate').equals(toLocalDate(now)).first();
      if (!a || a.status !== 'scheduled') return navigate('/today', { replace: true });
      const id = await startSession({ assignmentId: a.id, kind: 'full' }, now);
      navigate(`/session/${id}?start=1`, { replace: true });
    })();
  }, [navigate]);
  return <div className="boot">…</div>;
}

function UpdateBanner() {
  const { t } = useApp();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });
  const [hidden, setHidden] = useState(false);
  if (!needRefresh || hidden) return null;
  return (
    <div className="banner" role="status">
      <span>{t.update.available}</span>
      {/* Updating reloads the page; all text is already saved, and the session screen has no banner. */}
      <button className="btn btn-small" onClick={() => void updateServiceWorker(true)}>
        {t.update.reload}
      </button>
      <button className="btn btn-ghost btn-small" aria-label={t.common.close} onClick={() => setHidden(true)}>
        <Icon name="x" size={18} />
      </button>
    </div>
  );
}
