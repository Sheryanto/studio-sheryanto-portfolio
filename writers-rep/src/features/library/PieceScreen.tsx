import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/AppContext';
import { Dialog } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { getExercise, getTrack } from '../../data/library';
import { downloadText, pieceToMarkdown, pieceToText, safeFileName } from '../../db/backup';
import { db } from '../../db/db';
import { applyRecoveredDraft, restoreRevision, snapshotRevision, updateDocumentMeta } from '../../db/repo';
import { minutesOf } from '../../domain/timer';
import type { DocumentRevision, WritingDocument } from '../../domain/types';
import { countWords } from '../../domain/wordcount';
import { fmtDateTime } from '../../i18n/format';
import { readJournal } from '../session/draftJournal';
import { useAutosave } from '../session/useAutosave';

export function PieceScreen() {
  const { id = '' } = useParams();
  const { t } = useApp();
  const doc = useLiveQuery(() => db.documents.get(id).then((d) => d ?? null), [id]);
  if (doc === undefined) return null;
  if (doc === null)
    return (
      <div className="page">
        <p>{t.piece.notFound}</p>
        <Link className="btn btn-secondary" to="/library">{t.common.back}</Link>
      </div>
    );
  return <Piece doc={doc} />;
}

function Piece({ doc }: { doc: WritingDocument }) {
  const { t, lang } = useApp();
  const navigate = useNavigate();
  const session = useLiveQuery(() => (doc.sessionId ? db.sessions.get(doc.sessionId) : undefined), [doc.sessionId]);
  const revisions = useLiveQuery(() => db.document_revisions.where('documentId').equals(doc.id).reverse().sortBy('createdAt'), [doc.id]);
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState<DocumentRevision | null>(null);
  const [restoring, setRestoring] = useState<DocumentRevision | null>(null);
  const [title, setTitle] = useState(doc.title);
  const [tagInput, setTagInput] = useState('');
  const exercise = getExercise(doc.exerciseId);
  const track = getTrack(doc.trackId);
  const inActiveSession = session?.status === 'active';
  const dir = doc.language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => setTitle(doc.title), [doc.title]);

  const meta = {
    exerciseTitle: exercise ? (lang === 'en' ? exercise.titleEn : exercise.titleAr) : undefined,
    trackName: track ? (lang === 'en' ? track.nameEn : track.nameAr) : undefined,
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    void updateDocumentMeta(doc.id, { tags: [...doc.tags, tag] });
    setTagInput('');
  };

  return (
    <div className="page piece">
      <header className="page-head">
        <button className="btn btn-ghost btn-small back-link" onClick={() => navigate(-1)}>
          <Icon name="back" size={18} className="flip-rtl" /> {t.common.back}
        </button>
        <label className="field">
          <span className="sr-only">{t.piece.titleLabel}</span>
          <input
            className="title-input"
            value={title}
            dir="auto"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title !== doc.title && void updateDocumentMeta(doc.id, { title })}
            aria-label={t.piece.titleLabel}
          />
        </label>
        <p className="doc-meta">
          {[meta.trackName, meta.exerciseTitle, t.common.words(doc.wordCount)].filter(Boolean).join(' · ')}
          {session && ` · ${t.piece.sessionInfo(minutesOf(session.activeSeconds))}`}
        </p>
        <p className="doc-meta">
          {t.piece.created} {fmtDateTime(doc.createdAt, lang)} · {t.piece.updated} {fmtDateTime(doc.updatedAt, lang)}
        </p>
      </header>

      <div className="tags" aria-label={t.piece.tags}>
        {doc.tags.map((tag) => (
          <span key={tag} className="chip chip-tag">
            {tag}
            <button className="chip-x" aria-label={t.piece.removeTag(tag)} onClick={() => void updateDocumentMeta(doc.id, { tags: doc.tags.filter((x) => x !== tag) })}>
              <Icon name="x" size={14} />
            </button>
          </span>
        ))}
        <input
          className="tag-input"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === '،') {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          placeholder={t.piece.tagsPlaceholder}
          aria-label={t.piece.tags}
          dir="auto"
        />
      </div>

      {inActiveSession ? (
        <div className="card">
          <p className="coach-line">{t.piece.activeSession}</p>
          <Link className="btn btn-primary" to={`/session/${session.id}`}>{t.piece.openSession}</Link>
        </div>
      ) : null}

      {editing && !inActiveSession ? (
        <PieceEditor doc={doc} onDone={() => setEditing(false)} />
      ) : (
        <>
          <article className={`reader lang-${doc.language}`} dir={dir} lang={doc.language} data-testid="reader">
            {doc.content || <span className="hint">—</span>}
          </article>
          {!inActiveSession && (
            <button
              className="btn btn-secondary"
              onClick={async () => {
                await snapshotRevision(doc.id, 'before-edit');
                setEditing(true);
              }}
            >
              {t.piece.edit}
            </button>
          )}
        </>
      )}

      <div className="btn-row">
        <button className="btn btn-ghost btn-small" onClick={() => downloadText(safeFileName(doc.title, 'md'), pieceToMarkdown(doc, meta), 'text/markdown')}>
          <Icon name="download" size={18} /> {t.piece.exportMd}
        </button>
        <button className="btn btn-ghost btn-small" onClick={() => downloadText(safeFileName(doc.title, 'txt'), pieceToText(doc), 'text/plain')}>
          <Icon name="download" size={18} /> {t.piece.exportTxt}
        </button>
      </div>

      <section className="card" aria-labelledby="rev-title">
        <h2 id="rev-title" className="card-title">{t.piece.revisions}</h2>
        {!revisions?.length ? (
          <p className="hint">{t.piece.noRevisions}</p>
        ) : (
          <ul className="rev-list">
            {revisions.map((r) => (
              <li key={r.id} className="rev-item">
                <div>
                  <strong>{t.piece.revisionSource[r.source]}</strong>
                  <span className="hint"> · {fmtDateTime(r.createdAt, lang)} · {t.common.words(countWords(r.contentSnapshot))}</span>
                </div>
                <div className="btn-row">
                  <button className="btn btn-ghost btn-small" onClick={() => setViewing(r)}>{t.piece.view}</button>
                  {!inActiveSession && !editing && (
                    <button className="btn btn-ghost btn-small" onClick={() => setRestoring(r)}>{t.piece.restore}</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `${t.piece.revisionSource[viewing.source]} · ${fmtDateTime(viewing.createdAt, lang)}` : ''}>
        <div className={`reader reader-dialog lang-${doc.language}`} dir={dir}>{viewing?.contentSnapshot}</div>
        <button className="btn btn-secondary" onClick={() => setViewing(null)}>{t.common.close}</button>
      </Dialog>
      <Dialog open={!!restoring} onClose={() => setRestoring(null)} title={t.piece.restore}>
        <p>{t.piece.restoreConfirm}</p>
        <div className="btn-row">
          <button
            className="btn btn-primary"
            onClick={async () => {
              if (restoring) await restoreRevision(doc.id, restoring.id);
              setRestoring(null);
            }}
          >
            {t.piece.restore}
          </button>
          <button className="btn btn-secondary" onClick={() => setRestoring(null)}>{t.common.cancel}</button>
        </div>
      </Dialog>
    </div>
  );
}

function PieceEditor({ doc, onDone }: { doc: WritingDocument; onDone: () => void }) {
  const { t } = useApp();
  const autosave = useAutosave(doc.id);
  const [content, setContent] = useState(doc.content);
  // Apply a newer crash-journal entry (if the tab died mid-edit), snapshotting the stored text first.
  useEffect(() => {
    const j = readJournal(doc.id);
    if (j && j.content !== doc.content && j.savedAt > doc.updatedAt) {
      void applyRecoveredDraft(doc.id, j.content, j.savedAt).then(() => setContent(j.content));
    }
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);
  const dir = doc.language === 'ar' ? 'rtl' : 'ltr';
  return (
    <div className="piece-editor">
      <textarea
        className={`editor-text editor-inline lang-${doc.language}`}
        dir={dir}
        lang={doc.language}
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          autosave.change(e.target.value);
        }}
        aria-label={t.session.editorLabel}
        autoFocus
      />
      <div className="btn-row">
        <span className={`save-state save-${autosave.state}`} role="status">
          {autosave.state === 'saving' ? t.session.saving : autosave.state === 'error' ? t.session.saveError : t.session.saved}
        </span>
        <button
          className="btn btn-primary btn-small"
          onClick={async () => {
            await autosave.flush();
            await snapshotRevision(doc.id, 'checkpoint');
            onDone();
          }}
        >
          {t.piece.doneEditing}
        </button>
      </div>
    </div>
  );
}
