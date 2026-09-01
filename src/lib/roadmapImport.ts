import type { Flashcard, Roadmap, RoadmapNode, RoadmapResource } from '@/types';

/**
 * Leerpaden die je zelf toevoegt komen als één JSON-document binnen. Dat is
 * bewust: een AI in een browser kan geen bestanden op je schijf zetten, maar wel
 * een blok tekst teruggeven dat je hier plakt.
 *
 * Er zijn twee soorten documenten:
 *
 *  - een **leerpad**: de volledige structuur, met of zonder uitleg per onderwerp
 *  - een **aanvulling**: uitleg voor onderwerpen die al bestaan
 *
 * De tweede vorm bestaat omdat een compleet leerpad met alle teksten te groot is
 * voor één antwoord van een AI. Je haalt dan eerst de structuur op en vult daarna
 * per fase de uitleg aan.
 */

export const ROADMAP_SCHEMA_VERSION = 1;

const VALID_KINDS = new Set(['milestone', 'topic', 'subtopic', 'label']);
const VALID_RESOURCE_TYPES = new Set([
  'article',
  'video',
  'book',
  'course',
  'standard',
  'tool',
  'podcast',
  'practice',
]);

/** Iconen die de app kent; zie components/Icon.tsx. */
export const ICON_NAMES = [
  'book-open',
  'briefcase',
  'building',
  'clipboard-check',
  'file-text',
  'fingerprint',
  'gauge',
  'graduation-cap',
  'key',
  'layers',
  'lock',
  'network',
  'radar',
  'scroll',
  'shield',
  'shield-check',
  'target',
  'users',
  'workflow',
] as const;

export class ImportError extends Error {
  constructor(
    message: string,
    readonly hint?: string
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

export interface ContentPatch {
  roadmapId?: string;
  nodes: { id: string; content: string }[];
}

export type ImportResult =
  | { kind: 'roadmap'; roadmap: Roadmap; warnings: string[] }
  | { kind: 'patch'; patch: ContentPatch; warnings: string[] };

/** Haalt het JSON-object uit een antwoord dat er tekst of codeblokken omheen heeft. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new ImportError('Er is niets geplakt.');

  const candidates: string[] = [];

  // Eerst codeblokken; daar zet vrijwel elke AI het antwoord in.
  const fence = /```(?:json)?\s*\n([\s\S]*?)```/gi;
  for (let match = fence.exec(trimmed); match; match = fence.exec(trimmed)) {
    candidates.push(match[1]);
  }
  candidates.push(trimmed);

  // Als laatste redmiddel het gedeelte tussen de eerste { en de laatste }.
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Volgende kandidaat proberen.
    }
  }

  throw new ImportError(
    'Dit is geen geldige JSON.',
    'Kopieer het volledige antwoord van de AI, inclusief de accolades. Vraag zo nodig: "geef alleen het JSON-object, zonder uitleg eromheen".'
  );
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeResources(raw: unknown, warnings: string[], where: string): RoadmapResource[] {
  if (!Array.isArray(raw)) return [];
  const result: RoadmapResource[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const title = asString(item.title);
    if (!title) continue;

    const query = asString(item.query);
    const type = asString(item.type);
    const searchOn = asString(item.searchOn);
    // Een bron met een zoekopdracht is per definitie een zoekbron; dat voorkomt
    // dat een AI hem als "video" bestempelt en er alsnog een verzonnen link bij zet.
    const kind = query
      ? 'search'
      : ((type && VALID_RESOURCE_TYPES.has(type) ? type : 'article') as RoadmapResource['type']);

    result.push({
      title,
      url: query ? undefined : asString(item.url),
      type: kind,
      query,
      searchOn: searchOn === 'youtube' ? 'youtube' : query ? 'web' : undefined,
      note: asString(item.note),
      free: typeof item.free === 'boolean' ? item.free : undefined,
      minutes: typeof item.minutes === 'number' ? item.minutes : undefined,
    });
  }
  if (Array.isArray(raw) && result.length < raw.length) {
    warnings.push(`${where}: ${raw.length - result.length} bron(nen) overgeslagen zonder titel.`);
  }
  return result;
}

function normalizeFlashcards(raw: unknown, warnings: string[], where: string): Flashcard[] {
  if (!Array.isArray(raw)) return [];
  const result: Flashcard[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const item = entry as Record<string, unknown>;
    const question = asString(item.question) ?? asString(item.q);
    const answer = asString(item.answer) ?? asString(item.a);
    if (!question || !answer) {
      warnings.push(`${where}: kaart ${index + 1} mist een vraag of antwoord en is overgeslagen.`);
      return;
    }
    let id = asString(item.id) ?? `c${index + 1}`;
    while (seen.has(id)) id = `${id}x`;
    seen.add(id);
    result.push({ id, question, answer, hint: asString(item.hint) });
  });
  return result;
}

/** Controleert en repareert een binnengekomen leerpad. Gooit bij echte fouten. */
export function normalizeRoadmap(input: unknown, warnings: string[] = []): Roadmap {
  if (!input || typeof input !== 'object') {
    throw new ImportError('Het document is geen JSON-object.');
  }
  const raw = input as Record<string, unknown>;

  const title = asString(raw.title);
  if (!title) throw new ImportError('Het leerpad heeft geen titel.');

  const id = slug(asString(raw.id) ?? title);
  if (!id) throw new ImportError('Kon geen geldige id afleiden uit de titel.');

  if (!Array.isArray(raw.nodes) || raw.nodes.length === 0) {
    throw new ImportError('Het leerpad bevat geen onderwerpen.');
  }
  if (raw.nodes.length > 500) {
    throw new ImportError('Het leerpad bevat meer dan 500 onderwerpen.');
  }

  const ids = new Set<string>();
  const nodes: RoadmapNode[] = [];

  raw.nodes.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      warnings.push(`Onderwerp ${index + 1} is geen object en is overgeslagen.`);
      return;
    }
    const item = entry as Record<string, unknown>;
    const nodeTitle = asString(item.title);
    if (!nodeTitle) {
      warnings.push(`Onderwerp ${index + 1} heeft geen titel en is overgeslagen.`);
      return;
    }

    let nodeId = slug(asString(item.id) ?? nodeTitle) || `node-${index + 1}`;
    while (ids.has(nodeId)) nodeId = `${nodeId}-2`;
    ids.add(nodeId);

    const kind = asString(item.kind);
    const where = `"${nodeTitle}"`;

    nodes.push({
      id: nodeId,
      title: nodeTitle,
      kind: (kind && VALID_KINDS.has(kind) ? kind : 'topic') as RoadmapNode['kind'],
      parent: asString(item.parent),
      side: item.side === 'left' || item.side === 'right' ? item.side : undefined,
      group: asString(item.group),
      optional: item.optional === true,
      summary: asString(item.summary),
      // Een pad naar een bestand heeft hier geen betekenis: een geimporteerd
      // leerpad bestaat alleen uit dit ene document.
      content: asString(item.content) ?? asString(item.body_markdown),
      resources: normalizeResources(item.resources, warnings, where),
      flashcards: normalizeFlashcards(item.flashcards, warnings, where),
      tags: Array.isArray(item.tags)
        ? item.tags.filter((tag): tag is string => typeof tag === 'string')
        : undefined,
    });
  });

  if (!nodes.length) throw new ImportError('Geen enkel bruikbaar onderwerp gevonden.');

  // Ouders die niet bestaan zouden nodes onzichtbaar maken.
  const milestones = nodes.filter((node) => node.kind === 'milestone');
  if (!milestones.length) {
    nodes[0].kind = 'milestone';
    nodes[0].parent = undefined;
    warnings.push(`Geen enkele fase gevonden; "${nodes[0].title}" is nu de eerste fase.`);
  }

  const firstMilestone = nodes.find((node) => node.kind === 'milestone')!.id;
  let repaired = 0;
  for (const node of nodes) {
    if (node.kind === 'milestone') {
      node.parent = undefined;
      continue;
    }
    if (!node.parent || !ids.has(node.parent) || node.parent === node.id) {
      node.parent = firstMilestone;
      repaired += 1;
    }
  }
  if (repaired) {
    warnings.push(`${repaired} onderwerp(en) hingen nergens aan en staan nu bij de eerste fase.`);
  }

  const icon = asString(raw.icon);
  const color = asString(raw.color);

  return {
    id,
    title,
    subtitle: asString(raw.subtitle),
    description: asString(raw.description),
    icon: icon && (ICON_NAMES as readonly string[]).includes(icon) ? icon : 'graduation-cap',
    color: color && /^#[0-9a-f]{6}$/i.test(color) ? color : '#38bdf8',
    version: typeof raw.version === 'number' ? raw.version : 1,
    order: typeof raw.order === 'number' ? raw.order : 50,
    estimatedHours: typeof raw.estimatedHours === 'number' ? raw.estimatedHours : undefined,
    updatedAt: new Date().toISOString().slice(0, 10),
    nodes,
  };
}

/** Bepaalt of het geplakte document een leerpad of een aanvulling is. */
export function parseImport(text: string): ImportResult {
  const parsed = extractJson(text);
  const raw = parsed as Record<string, unknown>;
  const warnings: string[] = [];

  const looksLikePatch =
    Array.isArray(raw.nodes) &&
    !raw.title &&
    (raw.nodes as unknown[]).every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        'content' in (entry as Record<string, unknown>) &&
        !('kind' in (entry as Record<string, unknown>))
    );

  if (looksLikePatch) {
    const nodes: ContentPatch['nodes'] = [];
    for (const entry of raw.nodes as Record<string, unknown>[]) {
      const id = asString(entry.id);
      const content = asString(entry.content);
      if (id && content) nodes.push({ id, content });
    }
    if (!nodes.length) throw new ImportError('De aanvulling bevat geen bruikbare teksten.');
    return { kind: 'patch', patch: { roadmapId: asString(raw.roadmapId), nodes }, warnings };
  }

  return { kind: 'roadmap', roadmap: normalizeRoadmap(parsed, warnings), warnings };
}

export interface PatchResult {
  roadmap: Roadmap;
  applied: number;
  unknown: string[];
}

export function applyPatch(roadmap: Roadmap, patch: ContentPatch): PatchResult {
  const byId = new Map(roadmap.nodes.map((node) => [node.id, node]));
  const unknown: string[] = [];
  let applied = 0;

  const nodes = roadmap.nodes.map((node) => ({ ...node }));
  const lookup = new Map(nodes.map((node) => [node.id, node]));

  for (const item of patch.nodes) {
    const target = lookup.get(item.id) ?? lookup.get(slug(item.id));
    if (!target || !byId.has(target.id)) {
      unknown.push(item.id);
      continue;
    }
    target.content = item.content;
    applied += 1;
  }

  return {
    roadmap: { ...roadmap, nodes, updatedAt: new Date().toISOString().slice(0, 10) },
    applied,
    unknown,
  };
}

/** Het leerpad als deelbaar document, zodat je het kunt bewaren of doorgeven. */
export function serializeRoadmap(roadmap: Roadmap): string {
  return `${JSON.stringify(roadmap, null, 2)}\n`;
}

export interface PromptOptions {
  topic: string;
  level: 'beginner' | 'gevorderd' | 'expert';
  language: 'nl' | 'en';
  depth: 'compact' | 'normaal' | 'uitgebreid';
  /**
   * Eén leerpad, of een traject: drie leerpaden achter elkaar, van beginner tot
   * expert. Zie TRACK_LEVELS hieronder waarom dat drie opdrachten oplevert.
   */
  track?: boolean;
}

const LEVEL_TEXT: Record<PromptOptions['level'], string> = {
  beginner: 'iemand die er net mee begint en nog geen voorkennis heeft',
  gevorderd: 'iemand die de basis kent en wil verdiepen richting professioneel niveau',
  expert: 'iemand die al ervaren is en de laatste 20 procent zoekt',
};

const DEPTH_TEXT: Record<PromptOptions['depth'], { milestones: string; topics: string }> = {
  compact: { milestones: '5 tot 6', topics: '3 tot 5' },
  normaal: { milestones: '7 tot 9', topics: '4 tot 7' },
  uitgebreid: { milestones: '9 tot 12', topics: '5 tot 8' },
};

/**
 * Een traject is één onderwerp, verdeeld over drie leerpaden die je na elkaar
 * loopt. Dat is meer dan een niveaukeuze: door er drie opdrachten van te maken
 * krijgt elk deel de aandacht van een heel leerpad, in plaats van dertig fasen in
 * één antwoord. De delen sluiten op elkaar aan doordat de opdracht voor deel twee
 * en drie de inhoudsopgave van de eerdere delen meekrijgt.
 */
export const TRACK_LEVELS: {
  label: string;
  level: PromptOptions['level'];
  scope: string;
}[] = [
  {
    label: 'Begin',
    level: 'beginner',
    scope:
      'van niets naar de basis: de begrippen, het gereedschap opzetten, en de eerste keren zelf doen',
  },
  {
    label: 'Midden',
    level: 'gevorderd',
    scope:
      'van de basis naar zelfstandig werk van goede kwaliteit: de gangbare werkwijzen, de valkuilen, en het echte werk',
  },
  {
    label: 'Eind',
    level: 'expert',
    scope:
      'van goed naar diep: randgevallen, de afwegingen achter de keuzes, en het werk waar weinig mensen aan toekomen',
  },
];

export interface TrackPart {
  /** 1, 2 of 3. */
  index: number;
  total: number;
  /** De id die het leerpad van dit deel moet krijgen; daar herkent de app het aan. */
  id: string;
  label: string;
  level: PromptOptions['level'];
  scope: string;
}

/** Waar dit deel in de lijst van het overzicht komt te staan. */
export function trackOrder(part: TrackPart): number {
  return 50 + part.index;
}

/** De drie delen van een traject over dit onderwerp, met vaste ids. */
export function trackParts(options: PromptOptions): TrackPart[] {
  // Ruim onder de 60 tekens die slug() overhoudt, zodat het achtervoegsel er altijd
  // ongeschonden bij past; anders herkent de app het deel straks niet terug.
  const base = slug(options.topic).slice(0, 40).replace(/-+$/, '') || 'traject';
  return TRACK_LEVELS.map((entry, index) => ({
    index: index + 1,
    total: TRACK_LEVELS.length,
    id: `${base}-${index + 1}-${entry.label.toLowerCase()}`,
    label: entry.label,
    level: entry.level,
    scope: entry.scope,
  }));
}

export interface TrackContext {
  part: TrackPart;
  parts: TrackPart[];
  /** De delen die al binnen zijn; hierop moet dit deel aansluiten. */
  earlier: { part: TrackPart; roadmap: Roadmap }[];
}

/** Inhoudsopgave van een deel: fasen met de onderwerpen die eronder hangen. */
function roadmapOutline(roadmap: Roadmap): string {
  return roadmap.nodes
    .filter((node) => node.kind === 'milestone')
    .map((milestone) => {
      const kids = roadmap.nodes
        .filter((node) => node.parent === milestone.id && node.kind !== 'label')
        .map((node) => node.title);
      return `    ${milestone.title}${kids.length ? `: ${kids.join(', ')}` : ''}`;
    })
    .join('\n');
}

/** Het blok dat een deel zijn plaats in het traject geeft. */
function trackBlock(topic: string, track: TrackContext): string {
  const { part, parts, earlier } = track;
  const next = parts[part.index];

  const overview = parts
    .map(
      (entry) =>
        `  ${entry.index === part.index ? '>' : ' '} deel ${entry.index} — ${entry.label}: ${entry.scope}`
    )
    .join('\n');

  const known = earlier.length
    ? `WAT DE VORIGE DELEN AL BEHANDELEN

${earlier
  .map(
    (entry) =>
      `  deel ${entry.part.index} — "${entry.roadmap.title}"\n${roadmapOutline(entry.roadmap)}`
  )
  .join('\n\n')}

Dit is de werkelijke inhoud van die delen, geen schatting.`
    : `De vorige delen zijn nog niet geschreven. Ga uit van de verdeling hierboven en
neem aan dat alles wat daar hoort al behandeld is.`;

  const bridge = [
    part.index === 1
      ? '- Begin bij nul: geen voorkennis, geen aannames over eerder werk.'
      : `- Ga ervan uit dat alles uit de vorige delen bekend is. Herhaal het niet en leg het
  niet opnieuw uit; verwijs er hooguit in een halve zin naar ("je kent X al uit deel 1").`,
    part.index === 1
      ? null
      : `- Laat de eerste fase van dit deel direct aansluiten op waar deel ${part.index - 1} ophoudt. Zeg in de
  "summary" van die fase wat iemand moet kunnen om hier te beginnen.`,
    next
      ? `- Eindig dit deel op een punt waar deel ${next.index} (${next.scope}) logisch verder kan.
  Wat daar hoort, laat je hier weg.`
      : '- Dit is het laatste deel. Sluit af met waar iemand daarna zelfstandig verder kan.',
  ]
    .filter(Boolean)
    .join('\n');

  return `TRAJECT

Dit is deel ${part.index} van ${part.total} van één doorlopend traject over ${topic}. Het zijn drie
losse leerpaden die na elkaar gelopen worden:

${overview}

Je schrijft nu alleen deel ${part.index}. Wat in een ander deel hoort laat je weg, ook als het
verleidelijk is om het even aan te stippen; anders staat het straks twee keer in het traject.

${known}

AANSLUITEN

${bridge}
`;
}

function languageLine(language: 'nl' | 'en'): string {
  return language === 'nl'
    ? 'Schrijf alles in het Nederlands. Vaktermen die in het vakgebied Engels zijn, laat je Engels.'
    : 'Write everything in English.';
}

/**
 * De regels over bronnen. Een AI verzint links naar specifieke video's en artikelen
 * met veel overtuiging, en die zijn dan dood. Daarom: alleen adressen waar de AI
 * echt zeker van is, en voor de rest zoekopdrachten waar de app zelf een werkende
 * zoek-URL van maakt.
 */
const RESOURCE_RULES = `BRONNEN

Geef per onderwerp 2 tot 4 bronnen, in een van deze twee vormen:

1. Een **vast adres**, alleen als je zeker weet dat het bestaat en nog bestaat.
   Denk aan officiele documentatie, een RFC, een normpagina of een bekend boek.
   { "title": "...", "url": "https://...", "type": "article" }
   Verzin nooit een adres. Twijfel je ook maar een beetje? Gebruik dan vorm 2.

2. Een **zoekopdracht**, die de app omzet in een werkende zoeklink. Gebruik dit
   voor video's, tutorials en alles waarvan je het adres niet zeker weet.
   { "title": "Wat je gaat zoeken", "query": "de zoekterm", "searchOn": "youtube" }
   searchOn is "youtube" of "web". Formuleer de zoekterm zoals iemand die het vak
   kent hem zou intypen: specifiek, met de juiste termen, zonder vraagteken.

Zet bij elk onderwerp minstens een zoekopdracht voor een video, want daar leert
iemand vaak het snelst van. Voeg bij "type" alleen een waarde toe uit deze lijst:
article, video, book, course, standard, tool, podcast, practice.`;

/**
 * Stap 1: de structuur. Bewust zonder de volledige uitleg, want die past niet in
 * een antwoord. De uitleg volgt per fase of per onderwerp met de tweede prompt.
 *
 * Met een traject-context maakt dit de opdracht voor één deel van drie, dat op de
 * eerdere delen aansluit; zonder die context het gewone losse leerpad.
 */
export function buildStructurePrompt(options: PromptOptions, track?: TrackContext): string {
  const { topic, language, depth } = options;
  const counts = DEPTH_TEXT[depth];
  const level = track ? track.part.level : options.level;

  // Het onderwerp komt straks in een JSON-voorbeeld terecht; aanhalingstekens
  // zouden dat voorbeeld openbreken.
  const plainTopic = topic.replace(/["\\]/g, '').trim();

  const subject = track
    ? `${topic} — deel ${track.part.index} van ${track.part.total}: ${track.part.label}`
    : topic;
  const idLine = track ? `"id": "${track.part.id}",` : '"id": "korte-kebab-case-naam",';
  const titleLine = track
    ? `"title": "${plainTopic} — deel ${track.part.index}: ${track.part.label}",`
    : '"title": "Naam van het leerpad",';
  const orderLine = track ? `\n  "order": ${trackOrder(track.part)},` : '';

  const trackRules = track
    ? `\n12. Gebruik exact deze "id": "${track.part.id}" en exact deze "order": ${trackOrder(track.part)}. Daar herkent de app dit deel aan; verzin er geen eigen id bij.
13. Laat de titel beginnen met het onderwerp en het deelnummer, zoals in het voorbeeld hierboven.
14. Blijf binnen de omvang van dit deel: ${counts.milestones} fasen. Dat het traject uit drie delen bestaat is geen reden om er hier meer bij te doen.`
    : '';

  return `Je maakt een leerpad voor de app Pathfinder. Antwoord met UITSLUITEND een JSON-object in een codeblok. Geen inleiding, geen uitleg eromheen.

ONDERWERP: ${subject}
BEDOELD VOOR: ${LEVEL_TEXT[level]}
TAAL: ${languageLine(language)}

${track ? `${trackBlock(topic, track)}\n` : ''}Lever dit JSON-formaat:

\`\`\`json
{
  ${idLine}
  ${titleLine}
  "subtitle": "Een regel die zegt waar het pad heen gaat",
  "description": "Twee tot drie zinnen over de opzet en voor wie het is.",
  "icon": "graduation-cap",
  "color": "#38bdf8",
  "version": 1,${orderLine}
  "estimatedHours": 60,
  "nodes": [
    {
      "id": "fase-1",
      "title": "1. Naam van de eerste fase",
      "kind": "milestone",
      "summary": "Twee tot vier zinnen: wat leer je in deze fase, waarom staat hij hier, en wat kun je erna dat je daarvoor niet kon."
    },
    {
      "id": "fase-1-onderwerp",
      "title": "Naam van het onderwerp",
      "kind": "topic",
      "parent": "fase-1",
      "summary": "Twee tot vier zinnen. Zeg concreet wat je gaat doen en wat het resultaat is, niet dat het belangrijk is.",
      "resources": [
        { "title": "Officiele documentatie", "url": "https://...", "type": "standard" },
        { "title": "Uitleg in video", "query": "concrete zoekterm", "searchOn": "youtube" }
      ],
      "flashcards": [
        { "id": "c1", "question": "Korte, scherpe vraag?", "answer": "Antwoord in markdown." }
      ]
    },
    {
      "id": "fase-1-optie-a",
      "title": "Optie A",
      "kind": "subtopic",
      "parent": "fase-1-onderwerp",
      "group": "opties",
      "summary": "Korte omschrijving."
    },
    {
      "id": "fase-1-kader",
      "title": "Let op",
      "kind": "label",
      "parent": "fase-1",
      "summary": "Een korte toelichting die naast de kaart komt te staan, bijvoorbeeld een begrip dat verwarring geeft."
    }
  ]
}
\`\`\`

REGELS

1. Maak ${counts.milestones} fasen ("kind": "milestone"), in de volgorde waarin je ze het beste leert. Nummer de titels: "1. ...", "2. ...".
2. Hang aan elke fase ${counts.topics} onderwerpen ("kind": "topic") met "parent" = de id van die fase.
3. Gebruik "kind": "subtopic" waar een onderwerp uiteenvalt in delen, met de id van het onderwerp als "parent".
4. Staan er korte, gelijksoortige keuzes naast elkaar, zoals talen of gereedschappen? Geef die dezelfde "group"; ze komen dan naast elkaar op een rij te staan.
5. Voeg 1 tot 3 blokken met "kind": "label" toe voor begrippen die uitleg nodig hebben. Die tellen niet mee in je voortgang; de "summary" is de tekst die je ziet.
6. Elke "id" is kebab-case, uniek, en begint met de id van de fase. Elke node behalve een milestone heeft een bestaande "parent".
7. Elke "summary" is twee tot vier zinnen en zegt iets concreets. Fout: "Dit is een belangrijk onderdeel van het vakgebied." Goed: "Je zet een lokale omgeving op met Docker, laadt de voorbeelddataset in en draait je eerste query. Daarna weet je of je installatie klopt."
8. Zet "optional": true bij onderwerpen die nuttig maar niet noodzakelijk zijn.
9. Voeg 0 tot 2 "flashcards" toe bij onderwerpen waar feitenkennis telt. Vraag naar begrip, niet naar definities uit het hoofd.
10. Kies "icon" uit precies deze lijst: ${ICON_NAMES.join(', ')}.
11. Geen "content"-veld in dit antwoord. De uitleg volgt in een tweede stap.${trackRules}

${RESOURCE_RULES}

Geef nu alleen het JSON-object.`;
}

/**
 * De opbouw die elk onderwerp moet krijgen. Dit is waar het om draait: zonder deze
 * regels levert een AI een alinea die klinkt als een samenvatting van een
 * samenvatting, en daar leer je niets van.
 */
const CONTENT_RULES = `WAT ER IN ELK ONDERWERP MOET STAAN

Gebruik deze vier delen, in deze volgorde, met deze koppen:

    # <de titel van het onderwerp>

    <Twee tot vier alinea's: wat het is, hoe het werkt, en waarom het ertoe doet.
    Leg het mechanisme uit, niet alleen de definitie. Gebruik waar het helpt een
    tabel of een opsomming.>

    ## Hoe je het doet

    <Genummerde stappen die iemand echt kan volgen. Noem concrete namen: het menu,
    de instelling, het commando, het bestand, het veld. Waar een commando of stukje
    configuratie hoort, zet je dat in een codeblok. Geen algemeenheden als "richt
    het goed in" of "zorg voor beleid".>

    ## Hoe het eruitziet

    <Een concreet voorbeeld van het resultaat: een stuk configuratie, een schema,
    een voorbeelddocument, een tabel met voorbeeldwaarden, of een beschrijving van
    wat je op je scherm ziet als het klopt. Iets waaraan de lezer zijn eigen werk
    kan afmeten.>

    ## Zelf doen

    <Een opdracht van dertig tot negentig minuten die de lezer echt kan uitvoeren,
    met wat hij daarvoor nodig heeft. Sluit af met: waaraan zie je dat het gelukt is.>

SCHRIJFREGELS

- 700 tot 1200 woorden per onderwerp. Korter is te dun.
- Meteen ter zake. Geen "in dit hoofdstuk bespreken we", geen samenvatting aan het eind.
- Concreet boven volledig. Een voorbeeld dat klopt is meer waard dan drie die vaag zijn.
- Verzin geen feiten, versienummers, prijzen of bronnen. Weet je iets niet zeker,
  schrijf dan wat je wel zeker weet en zeg waar het van afhangt.
- Schrijf voor iemand die het gaat doen, niet voor iemand die erover wil meepraten.
- Let op: dit is JSON. Regeleindes in "content" schrijf je als \\n, aanhalingstekens
  escape je, en een backslash schrijf je als \\\\.`;

/**
 * Stap 2a: de uitleg voor een hele fase. Per fase, omdat een AI het anders niet in
 * een antwoord kwijt kan.
 */
export function buildContentPrompt(
  roadmap: Roadmap,
  milestoneId: string,
  language: 'nl' | 'en' = 'nl'
): string {
  const milestone = roadmap.nodes.find((node) => node.id === milestoneId);
  const children = new Set<string>();
  const collect = (parentId: string) => {
    for (const node of roadmap.nodes) {
      if (node.parent === parentId && !children.has(node.id)) {
        children.add(node.id);
        collect(node.id);
      }
    }
  };
  collect(milestoneId);

  const targets = [milestone, ...roadmap.nodes.filter((node) => children.has(node.id))].filter(
    (node): node is RoadmapNode => node !== undefined && node.kind !== 'label'
  );

  const list = targets
    .map((node) => `- ${node.id} — ${node.title}${node.summary ? `\n      ${node.summary}` : ''}`)
    .join('\n');

  return `Je schrijft de lesstof voor een fase uit het leerpad "${roadmap.title}". Antwoord met UITSLUITEND een JSON-object in een codeblok.

${languageLine(language)}

Schrijf voor deze ${targets.length} onderwerpen, in deze volgorde:

${list}

Formaat:

\`\`\`json
{
  "roadmapId": "${roadmap.id}",
  "nodes": [
    { "id": "${targets[0]?.id ?? 'onderwerp-id'}", "content": "# Titel\\n\\n..." }
  ]
}
\`\`\`

Gebruik exact de ids uit de lijst hierboven, ongewijzigd.

${CONTENT_RULES}

Wordt je antwoord te lang voor alle ${targets.length} onderwerpen? Behandel er dan zoveel als je goed kunt doen, en zet aan het eind buiten het codeblok een regel met welke ids je nog niet hebt gedaan. Lever nooit een half onderwerp of afgekapte JSON.

Geef nu het JSON-object.`;
}

/**
 * Stap 2b: een enkel onderwerp, veel dieper. Voor als de uitleg te dun blijkt of
 * je juist van dit onderwerp alles wilt weten.
 */
export function buildNodePrompt(
  roadmap: Roadmap,
  nodeId: string,
  language: 'nl' | 'en' = 'nl'
): string {
  const node = roadmap.nodes.find((entry) => entry.id === nodeId);
  if (!node) return '';

  const parent = node.parent ? roadmap.nodes.find((entry) => entry.id === node.parent) : undefined;
  const siblings = roadmap.nodes
    .filter((entry) => entry.parent === node.parent && entry.id !== node.id)
    .map((entry) => entry.title);

  const context = [
    `Leerpad: ${roadmap.title}${roadmap.subtitle ? ` — ${roadmap.subtitle}` : ''}`,
    parent ? `Hoort bij: ${parent.title}` : null,
    siblings.length ? `Onderwerpen ernaast: ${siblings.join(', ')}` : null,
    node.summary ? `Korte omschrijving: ${node.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const existing = node.content
    ? `\nEr staat al een tekst, maar die is te oppervlakkig. Schrijf hem opnieuw, dieper en concreter. Herhaal niet wat er staat als het te algemeen was.\n\n--- huidige tekst ---\n${node.content.slice(0, 1200)}${node.content.length > 1200 ? '\n[...]' : ''}\n--- einde ---\n`
    : '';

  return `Je schrijft de lesstof voor een onderwerp uit een leerpad. Antwoord met UITSLUITEND een JSON-object in een codeblok.

${languageLine(language)}

ONDERWERP: ${node.title}

${context}
${existing}
Formaat:

\`\`\`json
{
  "roadmapId": "${roadmap.id}",
  "nodes": [
    { "id": "${node.id}", "content": "# ${node.title}\\n\\n..." }
  ]
}
\`\`\`

${CONTENT_RULES}

Omdat dit om een enkel onderwerp gaat, mag je uitgebreider zijn: 1000 tot 1800 woorden. Ga de diepte in waar het interessant wordt, in plaats van de breedte.

Geef nu het JSON-object.`;
}

/** De werkende zoek-URL bij een bron die een zoekopdracht in plaats van een adres heeft. */
export function searchUrl(query: string, on: 'youtube' | 'web' = 'web'): string {
  const encoded = encodeURIComponent(query);
  return on === 'youtube'
    ? `https://www.youtube.com/results?search_query=${encoded}`
    : `https://duckduckgo.com/?q=${encoded}`;
}

/** Het adres waar een bron heen wijst, of die nu een link of een zoekopdracht is. */
export function resourceUrl(resource: RoadmapResource): string | undefined {
  if (resource.url) return resource.url;
  if (resource.query) return searchUrl(resource.query, resource.searchOn ?? 'web');
  return undefined;
}
