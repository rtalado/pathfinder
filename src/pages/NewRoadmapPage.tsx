import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ClipboardCopy,
  Download,
  ExternalLink,
  Plus,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { Roadmap } from '@/types';
import { Icon } from '@/components/Icon';
import { Topbar } from '@/components/Topbar';
import { openExternal } from '@/lib/platform';
import { activeRoadmaps, findRoadmap, librarySize } from '@/lib/library';
import {
  applyPatch,
  buildContentPrompt,
  buildStructurePrompt,
  parseImport,
  serializeRoadmap,
  type PromptOptions,
} from '@/lib/roadmapImport';
import { useProgress } from '@/store/progressStore';

const AI_SITES = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
];

function CopyButton({ text, label = 'Prompt kopiëren' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--primary"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          })
          .catch(() => setCopied(false));
      }}
    >
      <ClipboardCopy size={14} /> {copied ? 'Gekopieerd' : label}
    </button>
  );
}

/** Stap 1 en 2: een nieuw leerpad laten schrijven en binnenhalen. */
function CreateSection() {
  const navigate = useNavigate();
  const saveRoadmap = useProgress((store) => store.saveRoadmap);

  const [options, setOptions] = useState<PromptOptions>({
    topic: '',
    level: 'beginner',
    language: 'nl',
    depth: 'normaal',
  });
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [created, setCreated] = useState<Roadmap | null>(null);

  const prompt = useMemo(
    () => (options.topic.trim() ? buildStructurePrompt(options) : ''),
    [options]
  );

  async function handleImport() {
    setBusy(true);
    setError(null);
    setHint(null);
    setWarnings([]);
    try {
      const result = parseImport(pasted);
      if (result.kind !== 'roadmap') {
        setError('Dit is een aanvulling, geen leerpad.');
        setHint('Gebruik het vak onder "Uitleg aanvullen" bij het betreffende leerpad.');
        return;
      }
      await saveRoadmap(result.roadmap);
      setPasted('');
      setWarnings(result.warnings);
      setCreated(result.roadmap);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Toevoegen mislukt.');
      if (cause && typeof cause === 'object' && 'hint' in cause) {
        setHint(String((cause as { hint?: string }).hint ?? ''));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card stack">
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>1. Vertel wat je wilt leren</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Je krijgt een kant-en-klare opdracht die je in ChatGPT, Claude of Gemini plakt. Die
            geeft een leerpad terug dat je hieronder weer inplakt. Er is geen account of sleutel
            voor nodig.
          </p>
        </div>

        <div className="field" style={{ margin: 0 }}>
          <span className="field__label">Onderwerp</span>
          <input
            className="input"
            value={options.topic}
            placeholder="bijvoorbeeld: Blender, Kubernetes, gitaar spelen, Spaans"
            onChange={(event) => setOptions({ ...options, topic: event.target.value })}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <span className="field__label">Niveau</span>
            <select
              className="select"
              value={options.level}
              onChange={(event) =>
                setOptions({ ...options, level: event.target.value as PromptOptions['level'] })
              }
            >
              <option value="beginner">Beginner</option>
              <option value="gevorderd">Gevorderd</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <span className="field__label">Omvang</span>
            <select
              className="select"
              value={options.depth}
              onChange={(event) =>
                setOptions({ ...options, depth: event.target.value as PromptOptions['depth'] })
              }
            >
              <option value="compact">Compact</option>
              <option value="normaal">Normaal</option>
              <option value="uitgebreid">Uitgebreid</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <span className="field__label">Taal</span>
            <select
              className="select"
              value={options.language}
              onChange={(event) =>
                setOptions({
                  ...options,
                  language: event.target.value as PromptOptions['language'],
                })
              }
            >
              <option value="nl">Nederlands</option>
              <option value="en">Engels</option>
            </select>
          </div>
        </div>

        {prompt && (
          <>
            <div className="row" style={{ flexWrap: 'wrap' }}>
              <CopyButton text={prompt} />
              {AI_SITES.map((site) => (
                <button
                  key={site.name}
                  type="button"
                  className="btn btn--sm"
                  onClick={() => openExternal(site.url)}
                >
                  {site.name} <ExternalLink size={12} />
                </button>
              ))}
            </div>
            <details>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
                De opdracht bekijken
              </summary>
              <textarea
                className="textarea"
                readOnly
                value={prompt}
                style={{ marginTop: 10, minHeight: 220, fontSize: 12 }}
              />
            </details>
          </>
        )}
      </section>

      <section className="card stack">
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>2. Plak het antwoord</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Kopieer het volledige antwoord van de AI en plak het hier. Tekst eromheen is geen
            probleem; het JSON-blok wordt er zelf uitgehaald.
          </p>
        </div>

        <textarea
          className="textarea"
          value={pasted}
          placeholder={'{\n  "id": "blender",\n  "title": "Blender leren",\n  ...\n}'}
          onChange={(event) => setPasted(event.target.value)}
        />

        <div className="row">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!pasted.trim() || busy}
            onClick={() => void handleImport()}
          >
            {busy ? <span className="spinner" /> : <Plus size={14} />} Leerpad toevoegen
          </button>
        </div>

        {error && (
          <div className="banner banner--error">
            <TriangleAlert size={15} />
            <span>
              {error}
              {hint && (
                <>
                  <br />
                  <span className="muted">{hint}</span>
                </>
              )}
            </span>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="banner banner--warn">
            <span>
              {warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </span>
          </div>
        )}

        {created && (
          <div className="banner banner--ok" style={{ flexDirection: 'column', gap: 10 }}>
            <span>
              <strong>{created.title}</strong> toegevoegd: {created.nodes.length} onderwerpen. De
              structuur staat er; de uitleg per onderwerp haal je in de volgende stap op.
            </span>
            <div className="row">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => navigate(`/nieuw?roadmap=${created.id}`)}
              >
                <Sparkles size={13} /> Uitleg aanvullen
              </button>
              <Link to={`/pad/${created.id}`} className="btn btn--sm">
                Naar het leerpad
              </Link>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/** Stap 3: per fase de uitleg laten schrijven en aanvullen. */
function EnrichSection({ roadmap }: { roadmap: Roadmap }) {
  const saveRoadmap = useProgress((store) => store.saveRoadmap);
  const [milestoneId, setMilestoneId] = useState(
    roadmap.nodes.find((node) => node.kind === 'milestone')?.id ?? ''
  );
  const [pasted, setPasted] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const milestones = roadmap.nodes.filter((node) => node.kind === 'milestone');
  const written = roadmap.nodes.filter((node) => node.content).length;
  const total = roadmap.nodes.filter((node) => node.kind !== 'label').length;

  const prompt = useMemo(
    () => (milestoneId ? buildContentPrompt(roadmap, milestoneId) : ''),
    [roadmap, milestoneId]
  );

  async function handlePatch() {
    setError(null);
    setResult(null);
    try {
      const parsed = parseImport(pasted);
      if (parsed.kind !== 'patch') {
        setError('Dit is een heel leerpad, geen aanvulling. Voeg het toe onder "Nieuw leerpad".');
        return;
      }
      const applied = applyPatch(roadmap, parsed.patch);
      if (applied.applied === 0) {
        setError('Geen enkel onderwerp herkend. Kloppen de ids met dit leerpad?');
        return;
      }
      await saveRoadmap(applied.roadmap);
      setPasted('');
      setResult(
        `${applied.applied} onderwerp(en) bijgewerkt.` +
          (applied.unknown.length ? ` ${applied.unknown.length} onbekende id overgeslagen.` : '')
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Aanvullen mislukt.');
    }
  }

  return (
    <section className="card stack">
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Uitleg aanvullen</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          De structuur staat er. De uitleg haal je per fase op, omdat een AI het anders niet in
          één antwoord kwijt kan. {written} van de {total} onderwerpen heeft nu uitleg.
        </p>
      </div>

      <div className="progress">
        <div
          className="progress__bar"
          style={{
            width: `${total ? Math.round((written / total) * 100) : 0}%`,
            background: roadmap.color ?? 'var(--accent)',
          }}
        />
      </div>

      <div className="field" style={{ margin: 0 }}>
        <span className="field__label">Fase</span>
        <select
          className="select"
          value={milestoneId}
          onChange={(event) => setMilestoneId(event.target.value)}
        >
          {milestones.map((milestone) => {
            const kids = roadmap.nodes.filter((node) => node.parent === milestone.id);
            const done = [milestone, ...kids].filter((node) => node.content).length;
            return (
              <option key={milestone.id} value={milestone.id}>
                {milestone.title} — {done}/{kids.length + 1} geschreven
              </option>
            );
          })}
        </select>
      </div>

      {prompt && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <CopyButton text={prompt} label="Opdracht voor deze fase kopiëren" />
          {AI_SITES.map((site) => (
            <button
              key={site.name}
              type="button"
              className="btn btn--sm"
              onClick={() => openExternal(site.url)}
            >
              {site.name} <ExternalLink size={12} />
            </button>
          ))}
        </div>
      )}

      <textarea
        className="textarea"
        value={pasted}
        placeholder={'{\n  "roadmapId": "' + roadmap.id + '",\n  "nodes": [ ... ]\n}'}
        onChange={(event) => setPasted(event.target.value)}
      />

      <div className="row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!pasted.trim()}
          onClick={() => void handlePatch()}
        >
          <Sparkles size={14} /> Uitleg toevoegen
        </button>
        <Link to={`/pad/${roadmap.id}`} className="btn">
          Naar het leerpad
        </Link>
      </div>

      {result && <div className="banner banner--ok">{result}</div>}
      {error && <div className="banner banner--error">{error}</div>}
    </section>
  );
}

/** Overzicht en beheer van de leerpaden die je zelf hebt toegevoegd. */
function LibrarySection() {
  const library = useProgress((store) => store.library);
  const deleteRoadmap = useProgress((store) => store.deleteRoadmap);
  const [confirming, setConfirming] = useState<string | null>(null);

  const own = activeRoadmaps(library);
  if (!own.length) return null;

  const size = Math.round(librarySize(library) / 1024);

  return (
    <section className="card stack">
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Jouw leerpaden</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {own.length} zelf toegevoegd, samen {size} kB. Ze synchroniseren mee naar je andere
          apparaten.
        </p>
      </div>

      <div className="doclist">
        {own.map((roadmap) => {
          const written = roadmap.nodes.filter((node) => node.content).length;
          return (
            <div key={roadmap.id} className="docrow">
              <Icon name={roadmap.icon} size={15} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/pad/${roadmap.id}`} className="docrow__title">
                  {roadmap.title}
                </Link>
                <div className="resource__meta">
                  {roadmap.nodes.length} onderwerpen · {written} met uitleg
                </div>
              </div>
              <Link to={`/nieuw?roadmap=${roadmap.id}`} className="btn btn--sm btn--ghost">
                <Sparkles size={14} />
              </Link>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                title="Als bestand kopiëren"
                onClick={() => void navigator.clipboard.writeText(serializeRoadmap(roadmap))}
              >
                <Download size={14} />
              </button>
              {confirming === roadmap.id ? (
                <button
                  type="button"
                  className="btn btn--sm btn--danger"
                  onClick={() => {
                    void deleteRoadmap(roadmap.id);
                    setConfirming(null);
                  }}
                >
                  Zeker weten?
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  title="Verwijderen"
                  onClick={() => setConfirming(roadmap.id)}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function NewRoadmapPage() {
  const [params] = useSearchParams();
  const library = useProgress((store) => store.library);
  const roadmapId = params.get('roadmap');
  const roadmap = roadmapId ? findRoadmap(library, roadmapId) : null;

  return (
    <>
      <Topbar
        title={roadmap ? roadmap.title : 'Nieuw leerpad'}
        subtitle={roadmap ? 'Uitleg aanvullen' : 'Laat een AI er een voor je schrijven'}
        back={roadmap ? '/nieuw' : '/'}
      />
      <div className="content">
        <div className="page stack" style={{ gap: 20 }}>
          {roadmap ? (
            <EnrichSection roadmap={roadmap} />
          ) : (
            <>
              <CreateSection />
              <LibrarySection />
            </>
          )}
        </div>
      </div>
    </>
  );
}
