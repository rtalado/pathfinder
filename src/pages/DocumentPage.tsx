import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FolderOpen } from 'lucide-react';
import { loadDocument, type ParsedDocument } from '@/lib/content';
import { canOpenLocalFiles, openLocalFile } from '@/lib/platform';
import { Markdown } from '@/components/Markdown';
import { Topbar } from '@/components/Topbar';

export function DocumentPage() {
  const { collectionId, documentId } = useParams<{ collectionId: string; documentId: string }>();
  const [document, setDocument] = useState<ParsedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    if (!collectionId || !documentId) return;
    let cancelled = false;
    setDocument(null);
    setError(null);
    loadDocument(collectionId, documentId)
      .then((loaded) => {
        if (!cancelled) setDocument(loaded);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, documentId]);

  const meta = document?.meta ?? {};

  return (
    <>
      <Topbar
        title={meta.title ?? 'Document'}
        subtitle={[meta.code, meta.version && `v${meta.version}`, meta.folder]
          .filter(Boolean)
          .join(' · ')}
        back="/docs"
      >
        {canOpenLocalFiles() && meta.sourcePath && (
          <button
            type="button"
            className="btn btn--sm"
            title="Open het originele bestand op deze pc"
            onClick={async () => setOpenError(await openLocalFile(meta.sourcePath))}
          >
            <FolderOpen size={14} /> Origineel
          </button>
        )}
      </Topbar>

      <div className="content">
        <div className="page">
          {openError && (
            <div className="banner banner--warn" style={{ marginBottom: 14 }}>
              {openError}
            </div>
          )}
          {error && <div className="banner banner--error">{error}</div>}
          {!document && !error && <p className="muted">Laden…</p>}
          {document && (
            <>
              <Markdown>{document.body}</Markdown>
              {meta.sourcePath && (
                <p className="dim" style={{ marginTop: 40, fontSize: 12 }}>
                  Omgezet uit {meta.sourcePath}
                  {meta.modifiedAt
                    ? ` · laatst gewijzigd ${new Date(meta.modifiedAt).toLocaleDateString('nl-NL')}`
                    : ''}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
