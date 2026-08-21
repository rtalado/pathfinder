import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { openExternal } from '@/lib/platform';

/**
 * Markdown-weergave voor zowel de leerpad-teksten als de omgezette Word- en
 * Excel-documenten. Externe links gaan naar de systeembrowser; binnen een
 * Electron-venster of een webview wil je die nooit in de app zelf openen.
 */
export function Markdown({ children }: { children: string }) {
  const components = useMemo(
    () =>
      ({
        a({ href, children: label }) {
          if (!href) return <span>{label}</span>;
          const external = /^https?:/i.test(href);
          return (
            <a
              href={href}
              onClick={(event) => {
                if (!external) return;
                event.preventDefault();
                openExternal(href);
              }}
              rel="noreferrer"
            >
              {label}
            </a>
          );
        },
        // Word- en Excel-tabellen zijn vaak breder dan het scherm; die krijgen
        // hun eigen scrollgebied zodat de pagina niet horizontaal meeschuift.
        table({ children: rows }) {
          return (
            <div className="md__scroll">
              <table>{rows}</table>
            </div>
          );
        },
      }) satisfies React.ComponentProps<typeof ReactMarkdown>['components'],
    []
  );

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
