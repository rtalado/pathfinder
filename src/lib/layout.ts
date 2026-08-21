import type { Roadmap, RoadmapNode } from '@/types';

/**
 * Berekent de plattegrond van een leerpad.
 *
 * De opzet volgt roadmap.sh: een verticale ruggengraat van fasen, met daarnaast
 * clusters van onderwerpen. Bewust niet symmetrisch: blokken zijn zo breed als hun
 * tekst, korte verwante onderwerpen staan naast elkaar op een rij, details staan
 * ingesprongen onder hun onderwerp, en de ruggengraat loopt niet kaarsrecht. Dat
 * leest als een kaart in plaats van als een tabel.
 *
 * De layout wordt uitgerekend in plaats van in het bestand vastgelegd, zodat een
 * nieuw leerpad alleen een lijst onderwerpen hoeft te bevatten.
 */

const SIZE = {
  milestone: { min: 190, max: 300, charWidth: 8.3, padding: 30, line: 21, base: 56 },
  topic: { min: 118, max: 250, charWidth: 7.0, padding: 26, line: 18, base: 44 },
  subtopic: { min: 96, max: 210, charWidth: 6.6, padding: 24, line: 17, base: 38 },
  label: { min: 190, max: 250, charWidth: 6.3, padding: 26, line: 16, base: 34 },
} as const;

const GAP = {
  /** Tussen ruggengraat en de kolom met onderwerpen. */
  spineToColumn: 74,
  /** Tussen twee rijen binnen een cluster. */
  betweenRows: 11,
  /** Tussen twee clusters in dezelfde kolom. */
  betweenClusters: 26,
  /** Tussen twee blokken die op dezelfde rij staan. */
  withinRow: 8,
  /** Verticaal tussen twee fasen. */
  betweenPhases: 70,
  /** Hoe ver details onder hun onderwerp inspringen. */
  indent: 22,
} as const;

/** Hoe ver de ruggengraat per fase van het midden afwijkt. */
const SPINE_WANDER = [0, -32, 20, -16, 30, -24, 12, -28, 26, -12];

export interface LayoutNode {
  id: string;
  node: RoadmapNode;
  /** Linksboven, zoals React Flow verwacht. */
  x: number;
  y: number;
  width: number;
  height: number;
  side: 'left' | 'right' | 'center';
  /** Bepaalt de kleur; fasen tellen door vanaf nul. */
  phase: number;
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  kind: 'spine' | 'branch' | 'detail';
  side: 'left' | 'right' | 'center';
  phase: number;
}

export interface RoadmapLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

type Kind = keyof typeof SIZE;

function kindOf(node: RoadmapNode): Kind {
  return (node.kind in SIZE ? node.kind : 'topic') as Kind;
}

/**
 * Schat de afmeting uit de tekst. Precies meten zou de layout van de browser
 * afhankelijk maken; een schatting is ruim genoeg omdat de blokken hun tekst
 * mogen laten teruglopen.
 */
function measure(node: RoadmapNode): { width: number; height: number } {
  const kind = kindOf(node);
  const spec = SIZE[kind];

  const label = node.title + (node.optional ? '  (optioneel)' : '');
  const ideal = label.length * spec.charWidth + spec.padding;
  const width = Math.round(Math.min(spec.max, Math.max(spec.min, ideal)));

  const perLine = Math.max(8, (width - spec.padding) / spec.charWidth);
  let height = spec.base + Math.max(0, Math.ceil(label.length / perLine) - 1) * spec.line;

  // Een uitlegkader toont zijn tekst en heeft dus hoogte nodig naar rato.
  if (kind === 'label' && node.summary) {
    const bodyPerLine = Math.max(10, (width - 24) / 6.1);
    height += Math.ceil(node.summary.length / bodyPerLine) * 16 + 6;
  }

  return { width, height };
}

interface Row {
  items: { node: RoadmapNode; width: number; height: number }[];
  width: number;
  height: number;
  /** Details springen in ten opzichte van hun onderwerp. */
  indented: boolean;
}

/** Zet onderwerpen die dezelfde groep delen op één rij, de rest onder elkaar. */
function toRows(nodes: RoadmapNode[], indented: boolean): Row[] {
  const rows: Row[] = [];
  let current: Row | null = null;
  let currentGroup: string | null = null;

  for (const node of nodes) {
    const size = measure(node);
    const group = node.group?.trim() || null;

    if (current && group && group === currentGroup) {
      current.items.push({ node, ...size });
      current.width += GAP.withinRow + size.width;
      current.height = Math.max(current.height, size.height);
      continue;
    }

    current = { items: [{ node, ...size }], width: size.width, height: size.height, indented };
    currentGroup = group;
    rows.push(current);
  }

  return rows;
}

/** Een onderwerp met zijn details eronder: het blok dat als geheel geplaatst wordt. */
interface Cluster {
  rows: Row[];
  width: number;
  height: number;
  /** Het onderwerp zelf, waar de lijn vanaf de fase naartoe loopt. */
  head: RoadmapNode;
}

function buildCluster(topic: RoadmapNode, children: RoadmapNode[]): Cluster {
  const rows = [...toRows([topic], false), ...toRows(children, true)];
  const width = Math.max(...rows.map((row) => row.width + (row.indented ? GAP.indent : 0)));
  const height =
    rows.reduce((total, row) => total + row.height, 0) + (rows.length - 1) * GAP.betweenRows;
  return { rows, width, height, head: topic };
}

export function computeLayout(roadmap: Roadmap): RoadmapLayout {
  const all = roadmap.nodes;
  const milestones = all.filter((node) => node.kind === 'milestone');
  const childrenOf = (parentId: string) => all.filter((node) => node.parent === parentId);

  const known = new Set(all.map((node) => node.id));
  const orphans = all.filter(
    (node) => node.kind !== 'milestone' && (!node.parent || !known.has(node.parent))
  );

  const layoutNodes: LayoutNode[] = [];
  const layoutEdges: LayoutEdge[] = [];

  let cursorY = 0;
  let previous: { id: string; x: number } | null = null;

  milestones.forEach((milestone, phase) => {
    const attached = [
      ...childrenOf(milestone.id),
      ...(phase === milestones.length - 1 ? orphans : []),
    ];

    const clusters = attached.map((topic) => buildCluster(topic, childrenOf(topic.id)));

    // Verdelen over links en rechts. Een expliciete kant gaat voor; de rest komt
    // op de kant met tot dan toe de minste hoogte, zodat de fase in balans blijft.
    const columns: Record<'left' | 'right', Cluster[]> = { left: [], right: [] };
    const heights: Record<'left' | 'right', number> = { left: 0, right: 0 };
    const preferred: 'left' | 'right' = phase % 2 === 0 ? 'right' : 'left';

    for (const cluster of clusters) {
      const explicit = cluster.head.side;
      const side =
        explicit ??
        (clusters.length <= 3
          ? preferred
          : heights.left <= heights.right - 40
            ? 'left'
            : heights.right <= heights.left - 40
              ? 'right'
              : preferred);
      columns[side].push(cluster);
      heights[side] += cluster.height + GAP.betweenClusters;
    }

    const columnHeight = (side: 'left' | 'right') =>
      Math.max(0, heights[side] - GAP.betweenClusters);

    const milestoneSize = measure(milestone);
    const bandHeight = Math.max(milestoneSize.height, columnHeight('left'), columnHeight('right'));
    const bandTop = cursorY;
    const bandCenter = bandTop + bandHeight / 2;

    // De ruggengraat slingert; dat haalt het rasterachtige eruit.
    const spineX = SPINE_WANDER[phase % SPINE_WANDER.length];

    layoutNodes.push({
      id: milestone.id,
      node: milestone,
      x: spineX - milestoneSize.width / 2,
      y: bandCenter - milestoneSize.height / 2,
      width: milestoneSize.width,
      height: milestoneSize.height,
      side: 'center',
      phase,
    });

    if (previous) {
      layoutEdges.push({
        id: `spine-${previous.id}-${milestone.id}`,
        source: previous.id,
        target: milestone.id,
        kind: 'spine',
        side: 'center',
        phase,
      });
    }
    previous = { id: milestone.id, x: spineX };

    (['left', 'right'] as const).forEach((side) => {
      const list = columns[side];
      if (!list.length) return;

      const columnWidth = Math.max(...list.map((cluster) => cluster.width));
      const columnLeft =
        side === 'right'
          ? spineX + milestoneSize.width / 2 + GAP.spineToColumn
          : spineX - milestoneSize.width / 2 - GAP.spineToColumn - columnWidth;

      let y = bandTop + (bandHeight - columnHeight(side)) / 2;

      for (const cluster of list) {
        for (const row of cluster.rows) {
          const inset = row.indented ? GAP.indent : 0;
          // Rechts uitlijnen aan de kant van de ruggengraat, links andersom, zodat
          // de kolom een rechte rand naar de fase toe houdt.
          let x =
            side === 'right'
              ? columnLeft + inset
              : columnLeft + columnWidth - row.width - inset;

          for (const item of row.items) {
            layoutNodes.push({
              id: item.node.id,
              node: item.node,
              x,
              y: y + (row.height - item.height) / 2,
              width: item.width,
              height: item.height,
              side,
              phase,
            });
            x += item.width + GAP.withinRow;
          }

          y += row.height + GAP.betweenRows;
        }

        layoutEdges.push({
          id: `branch-${milestone.id}-${cluster.head.id}`,
          source: milestone.id,
          target: cluster.head.id,
          kind: 'branch',
          side,
          phase,
        });

        for (const row of cluster.rows) {
          if (!row.indented) continue;
          for (const item of row.items) {
            layoutEdges.push({
              id: `detail-${cluster.head.id}-${item.node.id}`,
              source: cluster.head.id,
              target: item.node.id,
              kind: 'detail',
              side,
              phase,
            });
          }
        }

        y += GAP.betweenClusters - GAP.betweenRows;
      }
    });

    cursorY = bandTop + bandHeight + GAP.betweenPhases;
  });

  // Alles naar positieve coordinaten schuiven, met wat lucht rondom.
  const padding = 64;
  const minX = Math.min(...layoutNodes.map((node) => node.x), 0);
  const maxX = Math.max(...layoutNodes.map((node) => node.x + node.width), 0);

  return {
    nodes: layoutNodes.map((node) => ({
      ...node,
      x: node.x - minX + padding,
      y: node.y + padding,
    })),
    edges: layoutEdges,
    width: maxX - minX + padding * 2,
    height: Math.max(0, cursorY - GAP.betweenPhases) + padding * 2,
  };
}

/**
 * Het SVG-pad van een verbinding. We tekenen de lijnen zelf in plaats van ze door
 * React Flow te laten plaatsen: de plattegrond ligt hier toch al vast, en zo hangt
 * de weergave niet af van het opmeten van elk element.
 */
export function edgePath(edge: LayoutEdge, byId: Map<string, LayoutNode>): string | null {
  const from = byId.get(edge.source);
  const to = byId.get(edge.target);
  if (!from || !to) return null;

  if (edge.kind === 'spine') {
    const x1 = from.x + from.width / 2;
    const x2 = to.x + to.width / 2;
    const y1 = from.y + from.height;
    const y2 = to.y;
    if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
    // Een vloeiende slinger tussen twee fasen die niet recht boven elkaar staan.
    const bend = (y2 - y1) / 2;
    return `M ${x1} ${y1} C ${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`;
  }

  if (edge.kind === 'detail') {
    // Een korte haak vanuit de insprong naar het detail toe.
    const rightwards = edge.side === 'right';
    const trunkX = rightwards ? to.x - GAP.indent / 2 : to.x + to.width + GAP.indent / 2;
    const startY = from.y + from.height;
    const endY = to.y + to.height / 2;
    return `M ${trunkX} ${startY} L ${trunkX} ${endY} L ${rightwards ? to.x : to.x + to.width} ${endY}`;
  }

  const rightwards = edge.side === 'right';
  const sx = rightwards ? from.x + from.width : from.x;
  const sy = from.y + from.height / 2;
  const tx = rightwards ? to.x : to.x + to.width;
  const ty = to.y + to.height / 2;

  if (Math.abs(sy - ty) < 1) return `M ${sx} ${sy} L ${tx} ${ty}`;

  const midX = sx + (tx - sx) / 2;
  const radius = Math.min(14, Math.abs(ty - sy) / 2, Math.abs(tx - sx) / 2);
  const horizontal = Math.sign(tx - sx);
  const vertical = Math.sign(ty - sy);

  return [
    `M ${sx} ${sy}`,
    `L ${midX - radius * horizontal} ${sy}`,
    `Q ${midX} ${sy} ${midX} ${sy + radius * vertical}`,
    `L ${midX} ${ty - radius * vertical}`,
    `Q ${midX} ${ty} ${midX + radius * horizontal} ${ty}`,
    `L ${tx} ${ty}`,
  ].join(' ');
}

/**
 * Mobiele weergave: geen graph maar een verticale lijst. De graph blijft
 * beschikbaar, maar op een telefoon is dit de leesbare volgorde.
 */
export interface OutlineItem {
  node: RoadmapNode;
  depth: number;
}

export function computeOutline(roadmap: Roadmap): OutlineItem[] {
  const items: OutlineItem[] = [];
  const childrenOf = (parentId: string) => roadmap.nodes.filter((node) => node.parent === parentId);

  const walk = (node: RoadmapNode, depth: number) => {
    items.push({ node, depth });
    for (const child of childrenOf(node.id)) walk(child, depth + 1);
  };

  for (const milestone of roadmap.nodes.filter((node) => node.kind === 'milestone')) {
    walk(milestone, 0);
  }

  const seen = new Set(items.map((item) => item.node.id));
  for (const node of roadmap.nodes) {
    if (!seen.has(node.id)) items.push({ node, depth: 1 });
  }

  return items;
}
