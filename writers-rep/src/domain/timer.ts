import type { Session } from './types';

/**
 * Session timer math. Pure functions over the persisted session fields:
 *   activeSeconds   – seconds already banked
 *   runningSince    – start of the current running stretch (null when paused)
 *   lastHeartbeatAt – last time a running stretch was persisted
 *
 * The timer only ever credits time it has evidence for. If the app dies while running,
 * recovery credits time up to the last heartbeat, never up to "now".
 */

type TimerFields = Pick<Session, 'activeSeconds' | 'runningSince' | 'lastHeartbeatAt'>;

const secondsBetween = (fromIso: string, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - new Date(fromIso).getTime()) / 1000));

export function elapsedSeconds(s: TimerFields, now: Date): number {
  return s.activeSeconds + (s.runningSince ? secondsBetween(s.runningSince, now) : 0);
}

export function isRunning(s: TimerFields): boolean {
  return s.runningSince !== null;
}

export function start(s: TimerFields, now: Date): TimerFields {
  if (s.runningSince) return s;
  const iso = now.toISOString();
  return { activeSeconds: s.activeSeconds, runningSince: iso, lastHeartbeatAt: iso };
}

export function pause(s: TimerFields, now: Date): TimerFields {
  if (!s.runningSince) return s;
  return { activeSeconds: elapsedSeconds(s, now), runningSince: null, lastHeartbeatAt: now.toISOString() };
}

export function heartbeat(s: TimerFields, now: Date): TimerFields {
  if (!s.runningSince) return s;
  return { ...s, lastHeartbeatAt: now.toISOString() };
}

/**
 * A session found "running" when the editor mounts was left running by a previous page that
 * closed or crashed. Bank only the stretch up to its last heartbeat and leave it paused.
 */
export function recoverInterrupted(s: TimerFields): TimerFields {
  if (!s.runningSince) return s;
  const until = s.lastHeartbeatAt && s.lastHeartbeatAt > s.runningSince ? s.lastHeartbeatAt : s.runningSince;
  return {
    activeSeconds: s.activeSeconds + secondsBetween(s.runningSince, new Date(until)),
    runningSince: null,
    lastHeartbeatAt: until,
  };
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const minutesOf = (seconds: number) => Math.floor(seconds / 60);
