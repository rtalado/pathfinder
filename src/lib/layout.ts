import type { Roadmap, RoadmapNode } from '@/types';

/**
 * Berekent de plattegrond van een leerpad in de stijl van roadmap.sh: een
 * verticale ruggengraat van milestones, met de onderwerpen afwisselend links en
 * rechts en hun details daar weer buiten.
 *
 * De layout wordt uitgerekend in plaats van in het bestand vastgelegd, zodat een
 * nieuw leerpad alleen een lijst nodes hoeft te bevatten.
 */

export const SIZES = {
  milestone: { width: 300, height: 58 },
  topic: { width: 238, height: 46 },
  subtopic: { width: 210, height: 38 },
  label: { width: 210, height: 34 },
} as const;

const GAP = {
  /** Tussen ruggengraat en de kolom met onderwerpen. */
  spineToTopic: 86,
  /** Tussen een onderwerp en zijn details. */
  topicToSubtopic: 54,
  /** Verticaal tussen twee onderwerpen binnen dezelfde milestone. */
  betweenTopics: 18,
  betweenSubtopics: 10,
  /** Verticaal tussen twee milestones. */
  betweenMilestones: 64,
} as const;

export interface LayoutNode {
  id: string;
  node: RoadmapNode;
  /** Linksboven, zoals React Flow verwacht. */
  x: number;
  y: number;
  width: number;
  height: number;
  side: 'left' | 'right' | 'center';
}

export interface LayoutEdge {
  id: string;
  source: string;
  target: string;
  kind: 'spine' | 'branch' | 'detail';
  side: 'left' | 'right' | 'center';
}

export interface RoadmapLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

function sizeOf(node: RoadmapNode) {
  return SIZES[node.kind] ?? SIZES.topic;
}

export function computeLayout(roadmap: Roadmap): RoadmapLayout {
  const nodes = roadmap.nodes;
  const milestones = nodes.filter((node) => node.kind === 'milestone');
  const childrenOf = (parentId: string) => nodes.filter((node) => node.parent === parentId);

  // Nodes zonder geldige ouder zouden anders onzichtbaar zijn; die hangen we aan
  // de laatste milestone, of aan een impliciete eerste als die er niet is.
  const known = new Set(nodes.map((node) => node.id));
  const orphans = nodes.filter(
    (node) => node.kind !== 'milestone' && (!node.parent || !known.has(node.parent))
  );

  const layoutNodes: LayoutNode[] = [];
  const layoutEdges: LayoutEdge[] = [];

  let cursorY = 0;
  let previousMilestone: string | null = null;

  milestones.forEach((milestone, index) => {
    const defaultSide: 'left' | 'right' = index % 2 === 0 ? 'right' : 'left';
    const attached = [
      ...childrenOf(milestone.id),
      ...(index === milestones.length - 1 ? orphans : []),
    ];

    const columns: Record<'left' | 'right', RoadmapNode[]> = { left: [], right: [] };
    attached.forEach((topic, topicIndex) => {
      // Zonder expliciete kant verdelen we ze: eerst de kant van deze milestone,
      // daarna afwisselend, zodat een milestone met veel onderwerpen niet scheef hangt.
      const side =
        topic.side ??
        (attached.length > 3
          ? topicIndex % 2 === 0
            ? defaultSide
            : defaultSide === 'right'
              ? 'left'
              : 'right'
          : defaultSide);
      columns[side].push(topic);
    });

    const columnHeights: Record<'left' | 'right', number> = { left: 0, right: 0 };
    const blocks: Record<'left' | 'right', { topic: RoadmapNode; height: number }[]> = {
      left: [],
      right: [],
    };

    (['left', 'right'] as const).forEach((side) => {
      for (const topic of columns[side]) {
        const subtopics = childrenOf(topic.id);
        const subtopicHeight = subtopics.length
          ? subtopics.reduce((total, sub) => total + sizeOf(sub).height, 0) +
            (subtopics.length - 1) * GAP.betweenSubtopics
          : 0;
        const height = Math.max(sizeOf(topic).height, subtopicHeight);
        blocks[side].push({ topic, height });
        columnHeights[side] += height + GAP.betweenTopics;
      }
      columnHeights[side] = Math.max(0, columnHeights[side] - GAP.betweenTopics);
    });

    const bandHeight = Math.max(
      SIZES.milestone.height,
      columnHeights.left,
      columnHeights.right
    );
    const bandTop = cursorY;
    const bandCenter = bandTop + bandHeight / 2;

    layoutNodes.push({
      id: milestone.id,
      node: milestone,
      x: -SIZES.milestone.width / 2,
      y: bandCenter - SIZES.milestone.height / 2,
      width: SIZES.milestone.width,
      height: SIZES.milestone.height,
      side: 'center',
    });

    if (previousMilestone) {
      layoutEdges.push({
        id: `spine-${previousMilestone}-${milestone.id}`,
        source: previousMilestone,
        target: milestone.id,
        kind: 'spine',
        side: 'center',
      });
    }
    previousMilestone = milestone.id;

    (['left', 'right'] as const).forEach((side) => {
      const direction = side === 'right' ? 1 : -1;
      const topicSize = SIZES.topic;
      const topicCenterX =
        direction * (SIZES.milestone.width / 2 + GAP.spineToTopic + topicSize.width / 2);

      // De kolom wordt verticaal gecentreerd tegenover de milestone.
      let y = bandTop + (bandHeight - columnHeights[side]) / 2;

      for (const { topic, height } of blocks[side]) {
        const size = sizeOf(topic);
        const topicY = y + (height - size.height) / 2;
        layoutNodes.push({
          id: topic.id,
          node: topic,
          x: topicCenterX - size.width / 2,
          y: topicY,
          width: size.width,
          height: size.height,
          side,
        });
        layoutEdges.push({
          id: `branch-${milestone.id}-${topic.id}`,
          source: milestone.id,
          target: topic.id,
          kind: 'branch',
          side,
        });

        const subtopics = childrenOf(topic.id);
        if (subtopics.length) {
          const subCenterX =
            topicCenterX +
            direction * (topicSize.width / 2 + GAP.topicToSubtopic + SIZES.subtopic.width / 2);
          let subY = y;
          for (const sub of subtopics) {
            const subSize = sizeOf(sub);
            layoutNodes.push({
              id: sub.id,
              node: sub,
              x: subCenterX - subSize.width / 2,
              y: subY,
              width: subSize.width,
              height: subSize.height,
              side,
            });
            layoutEdges.push({
              id: `detail-${topic.id}-${sub.id}`,
              source: topic.id,
              target: sub.id,
              kind: 'detail',
              side,
            });
            subY += subSize.height + GAP.betweenSubtopics;
          }
        }

        y += height + GAP.betweenTopics;
      }
    });

    cursorY = bandTop + bandHeight + GAP.betweenMilestones;
  });

  // Alles naar positieve coordinaten schuiven, met wat lucht rondom.
  const padding = 60;
  const minX = Math.min(...layoutNodes.map((node) => node.x), 0);
  const maxX = Math.max(...layoutNodes.map((node) => node.x + node.width), 0);
  const shifted = layoutNodes.map((node) => ({
    ...node,
    x: node.x - minX + padding,
    y: node.y + padding,
  }));

  return {
    nodes: shifted,
    edges: layoutEdges,
    width: maxX - minX + padding * 2,
    height: Math.max(0, cursorY - GAP.betweenMilestones) + padding * 2,
  };
}

/**
 * Berekent het SVG-pad van een verbinding. We tekenen de lijnen zelf in plaats
 * van ze door React Flow te laten plaatsen: de plattegrond ligt hier toch al
 * vast, en zo hangt de weergave niet af van het meten van elk element.
 */
export function edgePath(edge: LayoutEdge, byId: Map<string, LayoutNode>): string | null {
  const from = byId.get(edge.source);
  const to = byId.get(edge.target);
  if (!from || !to) return null;

  if (edge.kind === 'spine') {
    const x = from.x + from.width / 2;
    return `M ${x} ${from.y + from.height} L ${x} ${to.y}`;
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

  // Twee afgeronde hoeken: eerst horizontaal naar het midden, dan verticaal,
  // dan weer horizontaal naar de node toe.
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

  // Nodes die aan niets hangen horen er ook bij te staan.
  const seen = new Set(items.map((item) => item.node.id));
  for (const node of roadmap.nodes) {
    if (!seen.has(node.id)) items.push({ node, depth: 1 });
  }

  return items;
}
