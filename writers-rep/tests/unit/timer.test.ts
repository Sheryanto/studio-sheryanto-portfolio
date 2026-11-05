import { describe, expect, it } from 'vitest';
import { elapsedSeconds, formatClock, heartbeat, pause, recoverInterrupted, start } from '../../src/domain/timer';

const at = (s: number) => new Date(Date.UTC(2026, 10, 5, 10, 0, s));
const fresh = { activeSeconds: 0, runningSince: null, lastHeartbeatAt: null };

describe('session timer', () => {
  it('accumulates only running stretches', () => {
    let t = start(fresh, at(0));
    expect(elapsedSeconds(t, at(30))).toBe(30);
    t = pause(t, at(30));
    expect(elapsedSeconds(t, at(500))).toBe(30); // paused time is not counted
    t = start(t, at(500));
    t = pause(t, at(520));
    expect(t.activeSeconds).toBe(50);
  });
  it('start and pause are idempotent', () => {
    const t = start(fresh, at(0));
    expect(start(t, at(10))).toBe(t);
    const p = pause(t, at(5));
    expect(pause(p, at(50))).toBe(p);
  });
  it('recovers a crashed session up to the last heartbeat only', () => {
    let t = start({ ...fresh, activeSeconds: 100 }, at(0));
    t = heartbeat(t, at(40));
    // The app died at ~45s and was reopened an hour later: credit 40s, not an hour.
    const r = recoverInterrupted(t);
    expect(r.runningSince).toBeNull();
    expect(r.activeSeconds).toBe(140);
  });
  it('recovers to zero extra time when no heartbeat was written', () => {
    const r = recoverInterrupted({ activeSeconds: 12, runningSince: at(0).toISOString(), lastHeartbeatAt: null });
    expect(r.activeSeconds).toBe(12);
  });
  it('formats clocks', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(65)).toBe('01:05');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});
