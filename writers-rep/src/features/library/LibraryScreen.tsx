import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/AppContext';
import { Icon } from '../../components/Icon';
import { StatusBadge } from '../../components/StatusBadge';
import { TRACKS, getTrack } from '../../data/library';
import { db } from '../../db/db';
import { toLocalDate } from '../../domain/dates';
import type { DocumentStatus, TrackId } from '../../domain/types';
import { detectDirection } from '../../domain/wordcount';
import { fmtDate } from '../../i18n/format';
import { filterDocuments, type LibraryFilter } from './filter';

export function LibraryScreen() {
  const { t, lang } = useApp();
  const [params, setParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const docs = useLiveQuery(() => db.documents.toArray(), []);
  const f: LibraryFilter = {
    q: params.get('q') ?? '',
    track: (params.get('track') ?? '') as TrackId | '',
    status: (params.get('status') ?? '') as DocumentStatus | '',
    tag: params.get('tag') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
  };
  const set = (patch: Partial<LibraryFilter>) => {
    const next = { ...f, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    setParams(p, { replace: true });
  };

  if (!docs) return null;
  const allTags = [...new Set(docs.flatMap((d) => d.tags))].sort();
  const results = filterDocuments(docs, f);
  const hasFilter = Object.entries(f).some(([k, v]) => k !== 'q' && v);

  return (
    <div className="page library">
      <header className="page-head">
        <h1 className="page-title">{t.library.title}</h1>
        <p className="eyebrow">{t.library.count(docs.length)}</p>
      </header>

      {docs.length === 0 ? (
        <article className="card empty-card"><p>{t.library.empty}</p></article>
      ) : (
        <>
          <div className="search-row">
            <label className="search">
              <Icon name="search" size={18} />
              <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder={t.library.search} aria-label={t.library.search} dir="auto" />
            </label>
            <button className={`btn btn-secondary btn-small ${hasFilter ? 'has-dot' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}>
              {t.library.filters}
            </button>
          </div>
          {showFilters && (
            <div className="filters card">
              <label className="field">
                <span>{t.library.track}</span>
                <select value={f.track} onChange={(e) => set({ track: e.target.value as TrackId | '' })}>
                  <option value="">{t.common.all}</option>
                  {TRACKS.map((tr) => <option key={tr.id} value={tr.id}>{lang === 'en' ? tr.nameEn : tr.nameAr}</option>)}
                </select>
              </label>
              <label className="field">
                <span>{t.library.status}</span>
                <select value={f.status} onChange={(e) => set({ status: e.target.value as DocumentStatus | '' })}>
                  <option value="">{t.common.all}</option>
                  <option value="draft">{t.library.statusDraft}</option>
                  <option value="finished">{t.library.statusFinished}</option>
                </select>
              </label>
              <label className="field">
                <span>{t.library.tag}</span>
                <select value={f.tag} onChange={(e) => set({ tag: e.target.value })}>
                  <option value="">{t.common.all}</option>
                  {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
              </label>
              <div className="field-pair">
                <label className="field"><span>{t.library.from}</span><input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
                <label className="field"><span>{t.library.to}</span><input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
              </div>
              {hasFilter && <button className="btn btn-ghost btn-small" onClick={() => setParams({}, { replace: true })}>{t.library.clearFilters}</button>}
            </div>
          )}
          {results.length === 0 ? (
            <p className="hint">{t.library.noResults}</p>
          ) : (
            <ul className="doc-list">
              {results.map((d) => {
                const track = getTrack(d.trackId);
                const preview = d.content.trim().split('\n')[0]?.slice(0, 140) ?? '';
                return (
                  <li key={d.id}>
                    <Link to={`/library/${d.id}`} className="doc-item">
                      <div className="doc-head">
                        <span className="doc-title" dir="auto">{d.title}</span>
                        <StatusBadge status={d.status === 'finished' ? 'completed' : 'in_progress'} label={d.status === 'finished' ? t.library.statusFinished : t.library.statusDraft} />
                      </div>
                      {preview && <p className="doc-preview" dir={detectDirection(preview)}>{preview}</p>}
                      <p className="doc-meta">
                        {fmtDate(toLocalDate(new Date(d.createdAt)), lang, { day: 'numeric', month: 'short', year: 'numeric' })}
                        {track && ` · ${lang === 'en' ? track.nameEn : track.nameAr}`}
                        {` · ${t.common.words(d.wordCount)}`}
                        {d.tags.map((tag) => <span key={tag} className="chip chip-tag">{tag}</span>)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
