import exercisesJson from './exercises.json';
import programJson from './program.json';
import tracksJson from './tracks.json';
import type { Exercise, Track, TrackId } from '../domain/types';

/**
 * Bundled training content. Edit the JSON files in this folder to change the library;
 * `validateLibrary` runs in the unit tests and at startup so a broken edit fails loudly.
 */

export interface ProgramWeek {
  titleAr: string;
  titleEn: string;
  focusAr: string;
  focusEn: string;
  exerciseIds: string[];
}
export interface Program {
  id: string;
  version: number;
  weeks: ProgramWeek[];
}

const TRACK_IDS: readonly TrackId[] = ['journaling', 'creative', 'screenwriting', 'professional'];

export function validateLibrary(tracks: unknown, exercises: unknown, program: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(tracks)) return ['tracks.json must be an array'];
  if (!Array.isArray(exercises)) return ['exercises.json must be an array'];
  const trackIds = new Set<string>();
  for (const t of tracks as Track[]) {
    if (!TRACK_IDS.includes(t?.id)) errors.push(`Unknown track id: ${String(t?.id)}`);
    if (!t?.nameAr || !t?.nameEn) errors.push(`Track ${String(t?.id)} needs nameAr and nameEn`);
    trackIds.add(t?.id);
  }
  const ids = new Set<string>();
  for (const e of exercises as Exercise[]) {
    const where = `Exercise ${String(e?.id)}`;
    if (typeof e?.id !== 'string' || !e.id) errors.push('Exercise without id');
    else if (ids.has(e.id)) errors.push(`Duplicate exercise id: ${e.id}`);
    ids.add(e?.id);
    if (!trackIds.has(e?.trackId)) errors.push(`${where}: unknown trackId ${String(e?.trackId)}`);
    for (const k of ['skill', 'titleAr', 'titleEn', 'promptAr', 'instructionsAr', 'completionCriteriaAr', 'reflectionQuestionAr'] as const)
      if (typeof e?.[k] !== 'string' || !e[k]) errors.push(`${where}: missing ${k}`);
    if (!Number.isInteger(e?.targetMinutes) || e.targetMinutes < 1) errors.push(`${where}: targetMinutes must be a positive integer`);
    if (e?.targetWords !== undefined && (!Number.isInteger(e.targetWords) || e.targetWords < 1))
      errors.push(`${where}: targetWords must be a positive integer`);
    if (!Number.isInteger(e?.version) || e.version < 1) errors.push(`${where}: version must be a positive integer`);
  }
  if (ids.size < 20) errors.push(`Library must contain at least 20 exercises (has ${ids.size})`);
  const p = program as Program;
  if (!p || !Array.isArray(p.weeks) || p.weeks.length === 0) errors.push('program.json must define weeks');
  else
    for (const [i, w] of p.weeks.entries())
      for (const id of w.exerciseIds ?? []) if (!ids.has(id)) errors.push(`Program week ${i + 1} references unknown exercise ${id}`);
  return errors;
}

const errors = validateLibrary(tracksJson, exercisesJson, programJson);
if (errors.length) throw new Error(`Exercise library is invalid:\n${errors.join('\n')}`);

export const TRACKS = tracksJson as Track[];
export const EXERCISES = exercisesJson as Exercise[];
export const PROGRAM = programJson as Program;
/** Flat program sequence; the scheduler walks it one step per scheduled training day, then repeats. */
export const PROGRAM_SEQUENCE: readonly string[] = PROGRAM.weeks.flatMap((w) => w.exerciseIds);

const byId = new Map(EXERCISES.map((e) => [e.id, e]));
export const getExercise = (id: string | undefined) => (id ? byId.get(id) : undefined);
export const getTrack = (id: TrackId | undefined) => TRACKS.find((t) => t.id === id);

export function programPosition(programIndex: number) {
  const perCycle = PROGRAM_SEQUENCE.length;
  const cycle = Math.floor(programIndex / perCycle);
  const inCycle = programIndex % perCycle;
  let acc = 0;
  for (const [weekIndex, w] of PROGRAM.weeks.entries()) {
    if (inCycle < acc + w.exerciseIds.length) return { cycle, weekIndex, slot: inCycle - acc };
    acc += w.exerciseIds.length;
  }
  return { cycle, weekIndex: 0, slot: 0 };
}
