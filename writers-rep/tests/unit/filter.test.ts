import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, filterDocuments, normalizeForSearch } from '../../src/features/library/filter';
import type { WritingDocument } from '../../src/domain/types';

const doc = (over: Partial<WritingDocument>): WritingDocument => ({
  id: 'x', title: 't', content: '', language: 'ar', tags: [], status: 'draft', wordCount: 0,
  createdAt: '2026-11-02T08:00:00.000Z', updatedAt: '2026-11-02T08:00:00.000Z', ...over,
});

describe('library search and filters', () => {
  it('matches Arabic regardless of diacritics, hamza forms and case', () => {
    expect(normalizeForSearch('كَتَبَ')).toBe('كتب');
    expect(normalizeForSearch('أحمد')).toBe(normalizeForSearch('احمد'));
    const docs = [doc({ id: 'a', content: 'كتبَ الولد' }), doc({ id: 'b', title: 'Dialogue Draft' })];
    expect(filterDocuments(docs, { ...EMPTY_FILTER, q: 'كتب' }).map((d) => d.id)).toEqual(['a']);
    expect(filterDocuments(docs, { ...EMPTY_FILTER, q: 'dialogue' }).map((d) => d.id)).toEqual(['b']);
  });
  it('filters by track, status, tag and date range, newest first', () => {
    const docs = [
      doc({ id: 'a', trackId: 'creative', status: 'finished', tags: ['scene'], createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z' }),
      doc({ id: 'b', trackId: 'creative', status: 'draft', createdAt: '2026-11-04T08:00:00.000Z', updatedAt: '2026-11-04T08:00:00.000Z' }),
      doc({ id: 'c', trackId: 'journaling', status: 'finished', createdAt: '2026-11-03T08:00:00.000Z', updatedAt: '2026-11-05T08:00:00.000Z' }),
    ];
    expect(filterDocuments(docs, EMPTY_FILTER).map((d) => d.id)).toEqual(['c', 'b', 'a']);
    expect(filterDocuments(docs, { ...EMPTY_FILTER, track: 'creative' }).map((d) => d.id)).toEqual(['b', 'a']);
    expect(filterDocuments(docs, { ...EMPTY_FILTER, status: 'finished' }).map((d) => d.id)).toEqual(['c', 'a']);
    expect(filterDocuments(docs, { ...EMPTY_FILTER, tag: 'scene' }).map((d) => d.id)).toEqual(['a']);
    expect(filterDocuments(docs, { ...EMPTY_FILTER, from: '2026-11-02', to: '2026-11-03' }).map((d) => d.id)).toEqual(['c']);
  });
});
