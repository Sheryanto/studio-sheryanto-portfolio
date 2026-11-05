import { toLocalDate } from '../../domain/dates';
import type { DocumentStatus, TrackId, WritingDocument } from '../../domain/types';

export interface LibraryFilter {
  q: string;
  track: TrackId | '';
  status: DocumentStatus | '';
  tag: string;
  from: string;
  to: string;
}

export const EMPTY_FILTER: LibraryFilter = { q: '', track: '', status: '', tag: '', from: '', to: '' };

/** Normalise for search: case-fold and strip Arabic diacritics/tatweel so "كَتَبَ" matches "كتب". */
export function normalizeForSearch(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/\p{M}|\u0640/gu, '').replace(/[إأآ]/g, 'ا').replace(/ى/g, 'ي');
}

export function filterDocuments(docs: readonly WritingDocument[], f: LibraryFilter): WritingDocument[] {
  const q = normalizeForSearch(f.q.trim());
  return docs
    .filter((d) => {
      if (f.track && d.trackId !== f.track) return false;
      if (f.status && d.status !== f.status) return false;
      if (f.tag && !d.tags.includes(f.tag)) return false;
      const day = toLocalDate(new Date(d.createdAt));
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
      if (q && !normalizeForSearch(`${d.title}\n${d.tags.join(' ')}\n${d.content}`).includes(q)) return false;
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
