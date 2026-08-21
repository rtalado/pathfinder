import { useMemo, useState } from 'react';
import { ClipboardCopy, ExternalLink, Sparkles } from 'lucide-react';
import type { Roadmap, RoadmapNode } from '@/types';
import { openExternal } from '@/lib/platform';
import { applyPatch, buildNodePrompt, parseImport } from '@/lib/roadmapImport';
import { useProgress } from '@/store/progressStore';

const AI_SITES = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
];

/**
 * Eén onderwerp opnieuw laten schrijven, dieper dan de opdracht per fase kan.
 * Alleen zichtbaar bij leerpaden die je zelf hebt toegevoegd; de meegeleverde
 * teksten staan in bestanden en horen bij de app.
 */
export function DeepenNode({ roadmap, node }: { roadmap: Roadmap; node: RoadmapNode }) {
  const saveRoadmap = useProgress((store) => store.saveRoadmap);

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prompt = useMemo(() => buildNodePrompt(roadmap, node.id), [roadmap, node.id]);

  async function apply() {
    setError(null);
    setMessage(null);
    try {
      const parsed = parseImport(pasted);
      if (parsed.kind !== 'patch') {
        setError('Dit is een heel leerpad in plaats van uitleg voor dit onderwerp.');
        return;
      }
      const result = applyPatch(roadmap, parsed.patch);
      if (result.applied === 0) {
        setError('Geen enkel onderwerp herkend. Klopt de id in het antwoord?');
        return;
      }
      await saveRoadmap(result.roadmap);
      setPasted('');
      setMessage('Bijgewerkt.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bijwerken mislukt.');
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn--sm btn--ghost"
        style={{ marginTop: 20 }}
        onClick={() => setOpen(true)}
      >
        <Sparkles size={13} /> {node.content ? 'Uitleg verdiepen' : 'Uitleg laten schrijven'}
      </button>
    );
  }

  return (
    <section className="card stack" style={{ marginTop: 20, gap: 10 }}>
      <div>
        <div style={{ fontWeight: 650, fontSize: 14 }}>
          {node.content ? 'Deze uitleg verdiepen' : 'Uitleg laten schrijven'}
        </div>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5 }}>
          Kopieer de opdracht, plak hem in een AI, en plak het antwoord hieronder terug. De
          opdracht vraagt om een stappenplan, een voorbeeld van het resultaat en een opdracht om
          zelf te doen.
        </p>
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={() => {
            void navigator.clipboard.writeText(prompt).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2500);
            });
          }}
        >
          <ClipboardCopy size={13} /> {copied ? 'Gekopieerd' : 'Opdracht kopiëren'}
        </button>
        {AI_SITES.map((site) => (
          <button
            key={site.name}
            type="button"
            className="btn btn--sm"
            onClick={() => openExternal(site.url)}
          >
            {site.name} <ExternalLink size={11} />
          </button>
        ))}
      </div>

      <textarea
        className="textarea"
        style={{ minHeight: 90 }}
        value={pasted}
        placeholder="Plak hier het antwoord van de AI"
        onChange={(event) => setPasted(event.target.value)}
      />

      <div className="row">
        <button
          type="button"
          className="btn btn--sm"
          disabled={!pasted.trim()}
          onClick={() => void apply()}
        >
          Toepassen
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpen(false)}>
          Sluiten
        </button>
      </div>

      {message && <div className="banner banner--ok">{message}</div>}
      {error && <div className="banner banner--error">{error}</div>}
    </section>
  );
}
