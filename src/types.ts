/**
 * Domeinmodel van LearnPath.
 *
 * Een leerpad is een gewone map onder content/roadmaps/ met een roadmap.json en
 * markdown-bestanden. Zolang een nieuwe map dit model volgt, verschijnt hij vanzelf
 * in de app; er hoeft geen code aangepast te worden.
 */

export type NodeStatus = 'todo' | 'doing' | 'done' | 'skipped';

export const NODE_STATUSES: NodeStatus[] = ['todo', 'doing', 'done', 'skipped'];

/**
 * milestone = hoofdstap op de verticale ruggengraat van de roadmap
 * topic     = onderwerp dat aan een milestone hangt
 * subtopic  = detail onder een topic
 * label     = tekstblok zonder voortgang, voor toelichting in de graph
 */
export type NodeKind = 'milestone' | 'topic' | 'subtopic' | 'label';

export type ResourceType =
  | 'article'
  | 'video'
  | 'book'
  | 'course'
  | 'standard'
  | 'tool'
  | 'podcast'
  | 'practice';

export interface RoadmapResource {
  /** Stabiele sleutel voor de leesstatus; valt terug op de url als hij ontbreekt. */
  id?: string;
  title: string;
  url?: string;
  type: ResourceType;
  /** Korte toelichting: waarom is dit de moeite waard. */
  note?: string;
  free?: boolean;
  minutes?: number;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  hint?: string;
}

/** Verwijzing naar een omgezet document uit content/docs/<collection>/. */
export interface DocumentLink {
  collection: string;
  id: string;
  label?: string;
}

export interface RoadmapNode {
  id: string;
  title: string;
  kind: NodeKind;
  /** id van de milestone (voor topics) of van de topic (voor subtopics). */
  parent?: string;
  /** Handmatige plaatsing; zonder waarde kiest de layout zelf links of rechts. */
  side?: 'left' | 'right';
  /** Niet nodig om het pad af te ronden, maar wel nuttig. */
  optional?: boolean;
  /** Een tot drie zinnen; verschijnt in het zijpaneel en als tooltip. */
  summary?: string;
  /** Pad naar markdown binnen de roadmapmap, bijv. "nodes/scope.md". */
  body?: string;
  /**
   * Markdown die rechtstreeks in het leerpad staat in plaats van in een apart
   * bestand. Zo kan een compleet leerpad als één JSON-document worden gedeeld,
   * bijvoorbeeld het antwoord van een AI dat je in de app plakt.
   */
  content?: string;
  resources?: RoadmapResource[];
  flashcards?: Flashcard[];
  docs?: DocumentLink[];
  tags?: string[];
}

export interface Roadmap {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  /** Naam van een lucide-icoon, bijv. "shield-check". */
  icon?: string;
  /** Accentkleur als hex, gebruikt in de kaart en de graph. */
  color?: string;
  version: number;
  updatedAt?: string;
  estimatedHours?: number;
  /** Optionele leesvolgorde-hint voor het dashboard. */
  order?: number;
  nodes: RoadmapNode[];
}

export interface RoadmapSummary {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  color?: string;
  version: number;
  order?: number;
  path: string;
}

/** Meegeleverd met de app, of zelf toegevoegd. */
export type RoadmapSource = 'bundled' | 'user';

/**
 * De zelf toegevoegde leerpaden. Een waarde van null is een verwijderd leerpad:
 * die blijft staan als grafsteen, anders zet het andere apparaat hem bij de
 * volgende synchronisatie gewoon weer terug.
 */
export interface RoadmapLibrary {
  schema: number;
  roadmaps: Record<string, Stamped<Roadmap | null>>;
}

export interface DocumentMeta {
  id: string;
  title: string;
  code: string | null;
  version: string | null;
  folder: string;
  folderKey: string;
  kind: 'word' | 'excel' | 'markdown' | 'image';
  sourcePath: string;
  sourceExt: string;
  modifiedAt: string;
  convertedAt?: string;
  docPath?: string;
  assetPath?: string;
  chars?: number;
}

export interface DocumentCollection {
  collection: string;
  title: string;
  sourceRoot: string;
  generatedAt: string;
  documents: DocumentMeta[];
}

export interface ManifestFile {
  path: string;
  hash: string;
  size: number;
}

export interface ContentManifest {
  /** Verandert zodra een van de bestanden verandert; hiermee weet de app of hij moet bijwerken. */
  contentVersion: string;
  generatedAt: string;
  roadmaps: RoadmapSummary[];
  collections: { id: string; title: string; path: string; documentCount: number }[];
  files: ManifestFile[];
}

/** Elke waarde draagt zijn eigen tijdstempel, zodat twee apparaten per item kunnen mergen. */
export interface Stamped<T> {
  value: T;
  updatedAt: number;
}

export interface CardReview {
  /** Epoch-ms waarop de kaart weer aan de beurt is. */
  due: number;
  /** Interval in dagen. */
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
  lastReviewedAt: number;
}

export interface ProgressState {
  schema: number;
  /** Sleutel is `${roadmapId}/${nodeId}`. */
  nodes: Record<string, Stamped<NodeStatus>>;
  notes: Record<string, Stamped<string>>;
  /** Sleutel is `${roadmapId}/${nodeId}/${resourceId}`. */
  resources: Record<string, Stamped<boolean>>;
  /** Sleutel is `${roadmapId}/${nodeId}/${cardId}`. */
  cards: Record<string, Stamped<CardReview>>;
  /** Aantal afgeronde items per dag (YYYY-MM-DD), voor de streak. */
  activity: Record<string, number>;
}

/**
 * Waar de voortgang heen gaat. GitHub vraagt geen eigen server maar wel een
 * account; een eigen server draait bij je thuis en laat je gegevens het huis niet
 * uit. De app werkt met beide precies hetzelfde.
 */
export type SyncBackendKind = 'github' | 'server';

export interface SyncSettings {
  enabled: boolean;
  backend: SyncBackendKind;

  /** GitHub. */
  owner: string;
  repo: string;
  branch: string;
  /** Pad in de repo waar de voortgang staat. */
  path: string;
  /** Content ook live uit de repo halen, zodat nieuwe roadmaps zonder app-update binnenkomen. */
  pullContent: boolean;

  /** Eigen server, bijvoorbeeld http://raspberrypi.local:8787 */
  serverUrl: string;

  autoSyncMinutes: number;
}

export type SyncPhase = 'idle' | 'syncing' | 'ok' | 'error' | 'offline' | 'unconfigured';

export interface SyncStatus {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  message?: string;
  /** Aantal items dat bij de laatste sync van het andere apparaat kwam. */
  pulled?: number;
  pushed?: number;
}
