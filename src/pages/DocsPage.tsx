import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Search } from 'lucide-react';
import type { DocumentCollection, DocumentMeta } from '@/types';
import { loadCollection } from '@/lib/content';
import { useManifest } from '@/lib/hooks';
import { Topbar } from '@/components/Topbar';

const KIND_LABELS: Record<string, string> = {
  word: 'word',
  excel: 'excel',
  markdown: 'md',
  image: 'svg',
};

export function DocsPage() {
  const { manifest } = useManifest();
  const [collections, setCollections] = useState<DocumentCollection[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;
    Promise.all(manifest.collections.map((entry) => loadCollection(entry.id).catch(() => null)))
      .then((loaded) => {
        if (!cancelled) setCollections(loaded.filter(Boolean) as DocumentCollection[]);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [manifest]);

  const needle = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    const result: { collection: DocumentCollection; folders: [string, DocumentMeta[]][] }[] = [];
    for (const collection of collections) {
      const matching = collection.documents.filter(
        (doc) =>
          doc.kind !== 'image' &&
          (!needle ||
            doc.title.toLowerCase().includes(needle) ||
            doc.code?.toLowerCase().includes(needle) ||
            doc.folder.toLowerCase().includes(needle))
      );
      const folders = new Map<string, DocumentMeta[]>();
      for (const doc of matching) {
        const list = folders.get(doc.folder) ?? [];
        list.push(doc);
        folders.set(doc.folder, list);
      }
      result.push({ collection, folders: [...folders.entries()] });
    }
    return result;
  }, [collections, needle]);

  const totalDocuments = collections.reduce(
    (total, collection) => total + collection.documents.length,
    0
  );

  return (
    <>
      <Topbar title="Documenten" subtitle={`${totalDocuments} bestanden`} />
      <div className="content">
        <div className="page stack">
          <div className="row">
            <Search size={15} className="dim" />
            <input
              className="input"
              placeholder="Zoek op titel, code of map"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          {!collections.length && <p className="muted">Laden…</p>}

          {grouped.map(({ collection, folders }) => (
            <section key={collection.collection} className="stack" style={{ gap: 10 }}>
              <div>
                <h2 style={{ margin: '4px 0 2px', fontSize: 16 }}>{collection.title}</h2>
                <p className="dim" style={{ margin: 0, fontSize: 12 }}>
                  Omgezet uit {collection.sourceRoot}
                </p>
              </div>

              {folders.map(([folder, documents]) => (
                <div key={folder}>
                  <div className="sidebar__section" style={{ padding: '8px 0 6px' }}>
                    {folder}
                  </div>
                  <div className="doclist">
                    {documents.map((doc) => (
                      <Link
                        key={doc.id}
                        to={`/docs/${collection.collection}/${doc.id}`}
                        className="docrow"
                      >
                        <FileText size={15} className="dim" />
                        {doc.code && <span className="docrow__code">{doc.code}</span>}
                        <span className="docrow__title">{doc.title}</span>
                        {doc.version && <span className="dim" style={{ fontSize: 11.5 }}>v{doc.version}</span>}
                        <span className={`kindpill kindpill--${doc.kind}`}>
                          {KIND_LABELS[doc.kind] ?? doc.kind}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
