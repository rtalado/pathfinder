import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText, FolderOpen, X } from 'lucide-react';
import type { DocumentMeta, Roadmap, RoadmapNode } from '@/types';
import { loadCollection, loadRoadmapBody } from '@/lib/content';
import { canOpenLocalFiles, openExternal, openLocalFile } from '@/lib/platform';
import {
  selectNote,
  selectResourceRead,
  selectStatus,
  useProgress,
} from '@/store/progressStore';
import { Markdown } from './Markdown';
import { StatusChips } from './StatusControl';
import { FlashcardDeck } from './FlashcardDeck';

/** Een documentverwijzing met de verzameling erbij, nodig om de link te bouwen. */
interface LinkedDocument {
  collection: string;
  doc: DocumentMeta;
}

type Tab = 'uitleg' | 'bronnen' | 'notitie' | 'kaarten' | 'documenten';

const RESOURCE_LABELS: Record<string, string> = {
  article: 'Artikel',
  video: 'Video',
  book: 'Boek',
  course: 'Cursus',
  standard: 'Norm',
  tool: 'Tool',
  podcast: 'Podcast',
  practice: 'Oefening',
};

export function NodePanel({
  roadmap,
  node,
  onClose,
}: {
  roadmap: Roadmap;
  node: RoadmapNode;
  onClose(): void;
}) {
  const state = useProgress((store) => store.state);
  const setNodeStatus = useProgress((store) => store.setNodeStatus);
  const setNote = useProgress((store) => store.setNote);
  const setResourceRead = useProgress((store) => store.setResourceRead);

  const [tab, setTab] = useState<Tab>('uitleg');
  const [body, setBody] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [docs, setDocs] = useState<LinkedDocument[]>([]);
  const [openError, setOpenError] = useState<string | null>(null);

  const status = selectStatus(state, roadmap.id, node.id);
  const note = selectNote(state, roadmap.id, node.id);

  const tabs = useMemo(() => {
    const list: Tab[] = ['uitleg'];
    if (node.resources?.length) list.push('bronnen');
    list.push('notitie');
    if (node.flashcards?.length) list.push('kaarten');
    if (node.docs?.length) list.push('documenten');
    return list;
  }, [node]);

  useEffect(() => {
    setTab('uitleg');
    setBody(null);
    setBodyError(null);
    setOpenError(null);

    // Zelf toegevoegde leerpaden dragen hun uitleg in het leerpad zelf mee;
    // meegeleverde leerpaden verwijzen naar een markdown-bestand.
    if (node.content) {
      setBody(node.content);
      return;
    }
    if (!node.body) return;

    let cancelled = false;
    loadRoadmapBody(roadmap.id, node.body)
      .then((text) => {
        if (!cancelled) setBody(text);
      })
      .catch((error: Error) => {
        if (!cancelled) setBodyError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [roadmap.id, node]);

  useEffect(() => {
    if (!node.docs?.length) {
      setDocs([]);
      return;
    }
    let cancelled = false;
    const collections = [...new Set(node.docs.map((link) => link.collection))];
    Promise.all(collections.map((id) => loadCollection(id)))
      .then((loaded) => {
        if (cancelled) return;
        const byId = new Map(
          loaded.flatMap((collection) =>
            collection.documents.map(
              (doc) =>
                [
                  `${collection.collection}/${doc.id}`,
                  { collection: collection.collection, doc },
                ] as const
            )
          )
        );
        setDocs(
          node
            .docs!.map((link) => byId.get(`${link.collection}/${link.id}`))
            .filter((entry): entry is LinkedDocument => Boolean(entry))
        );
      })
      .catch(() => {
        if (!cancelled) setDocs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [node]);

  return (
    <aside className="panel">
      <header className="panel__head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="panel__title">{node.title}</div>
          {node.summary && (
            <p className="muted" style={{ margin: '6px 0 0', fontSize: 13 }}>
              {node.summary}
            </p>
          )}
          {node.tags?.length ? (
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              {node.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose} title="Sluiten">
          <X size={16} />
        </button>
      </header>

      <StatusChips
        value={status}
        onChange={(next) => setNodeStatus(roadmap.id, node.id, next)}
      />

      {tabs.length > 1 && (
        <nav className="panel__tabs">
          {tabs.map((name) => (
            <button
              key={name}
              type="button"
              className={`tab${tab === name ? ' tab--active' : ''}`}
              onClick={() => setTab(name)}
            >
              {name === 'uitleg' && 'Uitleg'}
              {name === 'bronnen' && `Bronnen (${node.resources?.length ?? 0})`}
              {name === 'notitie' && 'Notitie'}
              {name === 'kaarten' && `Kaarten (${node.flashcards?.length ?? 0})`}
              {name === 'documenten' && `Documenten (${node.docs?.length ?? 0})`}
            </button>
          ))}
        </nav>
      )}

      <div className="panel__body">
        {tab === 'uitleg' && (
          <>
            {node.body || node.content ? (
              bodyError ? (
                <div className="banner banner--error">{bodyError}</div>
              ) : body === null ? (
                <div className="row muted">
                  <span className="spinner" /> Laden…
                </div>
              ) : (
                <Markdown>{body}</Markdown>
              )
            ) : (
              <p className="muted">
                {node.summary ?? 'Nog geen uitleg voor dit onderwerp.'}
              </p>
            )}
          </>
        )}

        {tab === 'bronnen' && (
          <div>
            {node.resources?.map((resource, index) => {
              const resourceId = resource.id ?? resource.url ?? `r${index}`;
              const read = selectResourceRead(state, roadmap.id, node.id, resourceId);
              return (
                <div key={resourceId} className={`resource${read ? ' resource--read' : ''}`}>
                  <input
                    type="checkbox"
                    checked={read}
                    onChange={(event) =>
                      setResourceRead(roadmap.id, node.id, resourceId, event.target.checked)
                    }
                    style={{ marginTop: 3 }}
                    aria-label="Gelezen"
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="resource__title">
                      {resource.url ? (
                        <a
                          href={resource.url}
                          onClick={(event) => {
                            event.preventDefault();
                            openExternal(resource.url!);
                          }}
                        >
                          {resource.title} <ExternalLink size={11} />
                        </a>
                      ) : (
                        resource.title
                      )}
                    </div>
                    {resource.note && (
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {resource.note}
                      </div>
                    )}
                    <div className="resource__meta">
                      {RESOURCE_LABELS[resource.type] ?? resource.type}
                      {resource.minutes ? ` · ${resource.minutes} min` : ''}
                      {resource.free === false ? ' · betaald' : resource.free ? ' · gratis' : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'notitie' && (
          <div className="stack">
            <textarea
              className="textarea"
              value={note}
              placeholder="Je eigen samenvatting, vragen of voorbeelden. Markdown mag."
              onChange={(event) => setNote(roadmap.id, node.id, event.target.value)}
            />
            {note.trim() && (
              <div className="card">
                <div className="field__label" style={{ marginBottom: 8 }}>
                  Weergave
                </div>
                <Markdown>{note}</Markdown>
              </div>
            )}
          </div>
        )}

        {tab === 'kaarten' && node.flashcards?.length ? (
          <FlashcardDeck roadmapId={roadmap.id} nodeId={node.id} cards={node.flashcards} />
        ) : null}

        {tab === 'documenten' && (
          <div className="doclist">
            {openError && <div className="banner banner--warn">{openError}</div>}
            {docs.map(({ collection, doc }) => (
              <div key={collection + doc.id} className="docrow">
                <FileText size={15} className="dim" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link to={`/docs/${collection}/${doc.id}`} className="docrow__title">
                    {doc.code ? `${doc.code} · ` : ''}
                    {doc.title}
                  </Link>
                  <div className="resource__meta">{doc.folder}</div>
                </div>
                {canOpenLocalFiles() && (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    title="Open het originele bestand"
                    onClick={async () => setOpenError(await openLocalFile(doc.sourcePath))}
                  >
                    <FolderOpen size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
