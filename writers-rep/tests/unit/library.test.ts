import { describe, expect, it } from 'vitest';
import exercises from '../../src/data/exercises.json';
import program from '../../src/data/program.json';
import tracks from '../../src/data/tracks.json';
import { EXERCISES, PROGRAM, PROGRAM_SEQUENCE, programPosition, validateLibrary } from '../../src/data/library';

describe('bundled exercise library', () => {
  it('is valid and has at least 20 exercises across all four tracks', () => {
    expect(validateLibrary(tracks, exercises, program)).toEqual([]);
    expect(EXERCISES.length).toBeGreaterThanOrEqual(20);
    expect(new Set(EXERCISES.map((e) => e.trackId))).toEqual(new Set(['journaling', 'creative', 'screenwriting', 'professional']));
  });
  it('defines a four-week, five-session first month', () => {
    expect(PROGRAM.weeks).toHaveLength(4);
    expect(PROGRAM.weeks.every((w) => w.exerciseIds.length === 5)).toBe(true);
    expect(PROGRAM_SEQUENCE).toHaveLength(20);
  });
  it('maps program indices to week/slot and cycles', () => {
    expect(programPosition(0)).toEqual({ cycle: 0, weekIndex: 0, slot: 0 });
    expect(programPosition(7)).toEqual({ cycle: 0, weekIndex: 1, slot: 2 });
    expect(programPosition(21)).toEqual({ cycle: 1, weekIndex: 0, slot: 1 });
  });
  it('rejects broken edits', () => {
    const broken = [...exercises, { ...exercises[0], trackId: 'poetry' }];
    const errs = validateLibrary(tracks, broken, { weeks: [{ exerciseIds: ['nope'] }] });
    expect(errs.some((e) => e.includes('Duplicate exercise id'))).toBe(true);
    expect(errs.some((e) => e.includes('unknown trackId'))).toBe(true);
    expect(errs.some((e) => e.includes('unknown exercise nope'))).toBe(true);
  });
});
