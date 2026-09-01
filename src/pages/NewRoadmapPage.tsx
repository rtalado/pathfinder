import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
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
  trackOrder,
  trackParts,
  type PromptOptions,
  type TrackPart,
} from '@/lib/roadmapImport';
import { useProgress } from '@/store/progressStore';

const AI_SITES = [
  { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  { name: 'Claude', url: 'https://claude.ai/new' },
  { name: 'Gemini', url: 'https://gemini.google.com/app' },
];

function CopyButton({
  text,
  label = 'Prompt kopiëren',
  primary = true,
  small = false,
}: {
  text: string;
  label?: string;
  /** Een opdracht die nog niet aan de beurt is hoeft de aandacht niet te trekken. */
  primary?: boolean;
  small?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`btn${primary ? ' btn--primary' : ''}${small ? ' btn--sm' : ''}`}
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

const LEVEL_NAMES: Record<PromptOptions['level'], string> = {
  beginner: 'Beginner',
  gevorderd: 'Gevorderd',
  expert: 'Expert',
};

/** Stap 1 en 2: een nieuw leerpad laten schrijven en binnenhalen. */
function CreateSection() {
  const navigate = useNavigate();
  const saveRoadmap = useProgress((store) => store.saveRoadmap);
  const library = useProgress((store) => store.library);

  const [options, setOptions] = useState<PromptOptions>({
    topic: '',
    level: 'beginner',
    language: 'nl',
    depth: 'normaal',
    track: false,
  });
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [created, setCreated] = useState<Roadmap | null>(null);

  const topic = options.topic.trim();

  const prompt = useMemo(
    () => (topic && !options.track ? buildStructurePrompt(options) : ''),
    [options, topic]
  );

  // De drie delen van een traject hebben een vaste id. Daardoor kan de app in je
  // eigen verzameling opzoeken welke delen er al staan, ook als je de app er
  // tussendoor bij hebt dichtgedaan.
  const parts = useMemo(
    () => (topic && options.track ? trackParts(options) : []),
    [options, topic]
  );
  const made = parts.map((part) => findRoadmap(library, part.id));
  const missing = made.findIndex((roadmap) => !roadmap);
  const activeIndex = missing === -1 ? parts.length - 1 : missing;

  /**
   * De opdracht voor één deel. Delen die al binnen zijn gaan als inhoudsopgave mee,
   * zodat het volgende deel begint waar het vorige ophoudt in plaats van de helft
   * over te doen.
   */
  function promptForPart(index: number): string {
    return buildStructurePrompt(options, {
      part: parts[index],
      parts,
      earlier: parts
        .slice(0, index)
        .map((part, position) => ({ part, roadmap: made[position] }))
        .filter((entry): entry is { part: TrackPart; roadmap: Roadmap } => Boolean(entry.roadmap)),
    });
  }

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

      // In een traject hangt alles aan die vaste id: daaraan ziet de app welk deel
      // al staat en waarop het volgende deel moet aansluiten. Gaf de AI het een
      // eigen naam, dan zetten we dat hier recht.
      let roadmap = result.roadmap;
      if (parts.length) {
        const part = parts.find((entry) => entry.id === roadmap.id) ?? parts[activeIndex];
        roadmap = { ...roadmap, id: part.id, order: trackOrder(part) };
      }

      await saveRoadmap(roadmap);
      setPasted('');
      setWarnings(result.warnings);
      setCreated(roadmap);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Toevoegen mislukt.');
      if (cause && typeof cause === 'object' && 'hint' in cause) {
        setHint(String((cause as { hint?: string }).hint ?? ''));
      }
    } finally {
      setBusy(false);
    }
  }

  const createdPart = created ? parts.find((part) => part.id === created.id) : undefined;

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
            {options.track ? (
              // In een traject ligt het niveau vast: elk deel heeft zijn eigen.
              <div className="field__hint" style={{ paddingTop: 9 }}>
                Alle drie, één per deel
              </div>
            ) : (
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
            )}
          </div>
          <div className="field" style={{ margin: 0 }}>
            <span className="field__label">Omvang{options.track ? ' per deel' : ''}</span>
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

        <label className="switch" style={{ alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={Boolean(options.track)}
            onChange={(event) => setOptions({ ...options, track: event.target.checked })}
          />
          <span>
            <span style={{ fontWeight: 600 }}>Een heel traject in drie delen</span>
            <span className="field__hint" style={{ display: 'block' }}>
              Begin, midden en eind als drie losse leerpaden die op elkaar aansluiten. Je krijgt
              drie opdrachten, één per deel, zodat een AI aan elk deel de aandacht van een heel
              leerpad kan geven. Deel twee en drie krijgen de inhoud van de vorige delen mee, zodat
              er niets dubbel komt te staan.
            </span>
          </span>
        </label>

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

        {parts.length > 0 && (
          <div className="track">
            {parts.map((part, index) => {
              const roadmap = made[index];
              const active = !roadmap && index === activeIndex;
              const classes = [
                'track__part',
                active ? 'track__part--active' : '',
                roadmap ? 'track__part--done' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div key={part.id} className={classes}>
                  <div className="track__head">
                    <span className="track__num">
                      {roadmap ? <Check size={13} strokeWidth={3} /> : part.index}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="track__title">
                        Deel {part.index} — {part.label}
                      </div>
                      <div className="track__scope">
                        {LEVEL_NAMES[part.level]}: {part.scope}
                      </div>
                    </div>
                    {roadmap ? (
                      <Link to={`/pad/${roadmap.id}`} className="btn btn--sm">
                        Bekijken
                      </Link>
                    ) : (
                      <CopyButton
                        text={promptForPart(index)}
                        label={active ? 'Opdracht kopiëren' : 'Vast kopiëren'}
                        primary={active}
                        small
                      />
                    )}
                  </div>

                  {active && (
                    <>
                      <div className="row" style={{ flexWrap: 'wrap' }}>
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
                          value={promptForPart(index)}
                          style={{ marginTop: 10, minHeight: 220, fontSize: 12 }}
                        />
                      </details>
                    </>
                  )}
                </div>
              );
            })}
            <p className="field__hint" style={{ margin: 0 }}>
              Doe ze één voor één: plak het antwoord hieronder, dan weet de opdracht voor het
              volgende deel wat er al staat. Alles in één keer bij een AI neerleggen kan ook, maar
              dan sluiten de delen minder strak op elkaar aan.
            </p>
          </div>
        )}
      </section>

      <section className="card stack">
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>2. Plak het antwoord</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Kopieer het volledige antwoord van de AI en plak het hier. Tekst eromheen is geen
            probleem; het JSON-blok wordt er zelf uitgehaald.
            {parts.length > 0 && ' Bij een traject plak je hier elk deel apart.'}
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
            {busy ? <span className="spinner" /> : <Plus size={14} />}{' '}
            {parts.length > 0 ? `Deel ${parts[activeIndex].index} toevoegen` : 'Leerpad toevoegen'}
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
              {createdPart &&
                (createdPart.index < createdPart.total
                  ? ` Hierboven staat nu de opdracht voor deel ${createdPart.index + 1}.`
                  : ' Daarmee is het traject compleet.')}
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
