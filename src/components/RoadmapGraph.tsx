import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { FileText, Layers, StickyNote } from 'lucide-react';
import type { NodeStatus, Roadmap, RoadmapNode } from '@/types';
import { computeLayout, edgePath, type RoadmapLayout } from '@/lib/layout';
import { hslToCss, paintFor, phaseHue, type Hsl } from '@/lib/colors';
import { findTheme } from '@/lib/themes';
import { useSettings } from '@/store/settingsStore';

interface NodeData extends Record<string, unknown> {
  node: RoadmapNode;
  status: NodeStatus;
  active: boolean;
  hasNote: boolean;
  docCount: number;
  cardCount: number;
  hsl: Hsl;
  /** Alleen bij een fase: hoeveel van wat eronder hangt is af. */
  progress?: { done: number; total: number };
}

type FlowNode = Node<NodeData>;

/** Het ringetje bij een fase dat laat zien hoe ver je bent. */
function ProgressRing({ done, total, color }: { done: number; total: number; color: string }) {
  const size = 20;
  const radius = 7.5;
  const circumference = 2 * Math.PI * radius;
  const fraction = total ? done / total : 0;

  return (
    <svg
      className="rnode__ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`${done} van ${total} afgerond`}
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={3} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeDasharray={`${circumference * fraction} ${circumference}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function RoadmapFlowNode({ data }: NodeProps<FlowNode>) {
  const { node, status, active, hasNote, docCount, cardCount, hsl, progress } = data;
  const kind = node.kind === 'label' ? 'label' : node.kind;
  const paint = paintFor(hsl, kind);

  const classes = [
    'rnode',
    `rnode--${kind}`,
    status !== 'todo' ? `rnode--${status}` : '',
    node.optional ? 'rnode--optional' : '',
    active ? 'rnode--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // Afgerond en overgeslagen krijgen hun eigen kleur; anders overheerst de fase.
  const style =
    status === 'done' || status === 'skipped'
      ? { borderColor: paint.border }
      : { background: paint.background, borderColor: paint.border, color: paint.text };

  if (kind === 'label') {
    return (
      <div className={classes} style={style}>
        <div className="rnode__labeltitle">{node.title}</div>
        {node.summary && <div className="rnode__labelbody">{node.summary}</div>}
      </div>
    );
  }

  return (
    <div className={classes} style={style} title={node.summary ?? node.title}>
      {progress && progress.total > 0 && (
        <ProgressRing
          done={progress.done}
          total={progress.total}
          color={hslToCss({ ...hsl, l: 0.22 })}
        />
      )}
      <span className="rnode__title">{node.title}</span>
      {node.optional && <span className="rnode__optional">optioneel</span>}

      {(hasNote || docCount > 0 || cardCount > 0) && (
        <span className="rnode__flag">
          {hasNote ? <StickyNote size={10} /> : docCount > 0 ? <FileText size={10} /> : <Layers size={10} />}
        </span>
      )}
    </div>
  );
}

const NODE_TYPES = { roadmap: RoadmapFlowNode };

/**
 * De verbindingslijnen. We tekenen ze zelf in één SVG-laag binnen de viewport in
 * plaats van React Flow-edges te gebruiken: de posities liggen al vast in de
 * plattegrond, en zo is de weergave niet afhankelijk van het opmeten van elke node.
 */
function Connections({ layout, hues }: { layout: RoadmapLayout; hues: Hsl[] }) {
  const paths = useMemo(() => {
    const byId = new Map(layout.nodes.map((node) => [node.id, node]));
    return layout.edges
      .map((edge) => ({ edge, d: edgePath(edge, byId) }))
      .filter((entry): entry is { edge: (typeof layout.edges)[number]; d: string } =>
        Boolean(entry.d)
      );
  }, [layout]);

  return (
    <ViewportPortal>
      <svg
        width={layout.width}
        height={layout.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        {paths.map(({ edge, d }) => {
          const hsl = hues[edge.phase] ?? hues[0];
          return (
            <path
              key={edge.id}
              d={d}
              fill="none"
              stroke={hslToCss({ ...hsl, l: 0.55 }, edge.kind === 'spine' ? 0.8 : 0.45)}
              strokeWidth={edge.kind === 'spine' ? 2.5 : 1.5}
              strokeDasharray={edge.kind === 'detail' ? '3 4' : undefined}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
    </ViewportPortal>
  );
}

interface GraphProps {
  roadmap: Roadmap;
  statusOf(nodeId: string): NodeStatus;
  noteOf(nodeId: string): boolean;
  selectedId: string | null;
  onSelect(nodeId: string): void;
  onCycleStatus(nodeId: string): void;
}

function Flow({ roadmap, statusOf, noteOf, selectedId, onSelect, onCycleStatus }: GraphProps) {
  const layout = useMemo(() => computeLayout(roadmap), [roadmap]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const { setViewport } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  // De terminalthema's draaien om een enkele kleur; daar hoort een paarse fase
  // niet in thuis, dus mag het thema de basiskleur overnemen.
  const themeBase = useSettings((store) => findTheme(store.resolvedTheme).colors.graphBase);

  const hues = useMemo(() => {
    const count = roadmap.nodes.filter((node) => node.kind === 'milestone').length || 1;
    const base = themeBase ?? roadmap.color ?? '#8b5cf6';
    return Array.from({ length: count }, (_, index) => phaseHue(base, index));
  }, [roadmap, themeBase]);

  /** Wat er onder een fase hangt, voor het voortgangsringetje. */
  const descendants = useMemo(() => {
    const byParent = new Map<string, RoadmapNode[]>();
    for (const node of roadmap.nodes) {
      if (!node.parent) continue;
      const list = byParent.get(node.parent) ?? [];
      list.push(node);
      byParent.set(node.parent, list);
    }
    const collect = (id: string, into: string[] = []): string[] => {
      for (const child of byParent.get(id) ?? []) {
        if (child.kind === 'label') continue;
        into.push(child.id);
        collect(child.id, into);
      }
      return into;
    };
    const result = new Map<string, string[]>();
    for (const node of roadmap.nodes) {
      if (node.kind === 'milestone') result.set(node.id, collect(node.id));
    }
    return result;
  }, [roadmap]);

  useEffect(() => {
    setNodes(
      layout.nodes.map((item) => ({
        id: item.id,
        type: 'roadmap',
        position: { x: item.x, y: item.y },
        width: item.width,
        height: item.height,
        draggable: false,
        connectable: false,
        selectable: item.node.kind !== 'label',
        data: {
          node: item.node,
          status: 'todo',
          active: false,
          hasNote: false,
          docCount: item.node.docs?.length ?? 0,
          cardCount: item.node.flashcards?.length ?? 0,
          hsl: hues[item.phase] ?? hues[0],
        },
      }))
    );

    // De fitView-prop werkt alleen bij het opstarten. Wissel je van leerpad terwijl
    // de graph blijft staan, dan moet het beeld opnieuw op de nieuwe plattegrond.
    const element = containerRef.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height) return;

    // Op een breed scherm past de hele plattegrond in beeld. Op een telefoon zou
    // dat neerkomen op een zoom van rond de 0.4: je ziet dan alles, maar je leest
    // niets meer. Daar kiezen we de zoom waarbij het breedste blokje net past, en
    // pan of knijp je zelf verder. De ruggengraat staat daarbij in het midden.
    const narrow = width < 760;
    const widest = layout.nodes.reduce((max, item) => Math.max(max, item.width), 1);
    const zoom = narrow
      ? Math.min(1, (width - 28) / widest)
      : Math.min(1, width / layout.width, height / layout.height);

    setViewport({
      x: (width - layout.width * zoom) / 2,
      y: 24,
      zoom: Math.max(0.15, zoom),
    });
  }, [layout, hues, setNodes, setViewport]);

  // Voortgang werkt alleen de data bij, zodat de graph niet opnieuw opbouwt.
  useEffect(() => {
    setNodes((current) =>
      current.map((flowNode) => {
        const status = statusOf(flowNode.id);
        const active = selectedId === flowNode.id;
        const hasNote = noteOf(flowNode.id);

        const kids = descendants.get(flowNode.id);
        const progress = kids
          ? { done: kids.filter((id) => statusOf(id) === 'done').length, total: kids.length }
          : undefined;

        if (
          flowNode.data.status === status &&
          flowNode.data.active === active &&
          flowNode.data.hasNote === hasNote &&
          flowNode.data.progress?.done === progress?.done &&
          flowNode.data.progress?.total === progress?.total
        ) {
          return flowNode;
        }
        return { ...flowNode, data: { ...flowNode.data, status, active, hasNote, progress } };
      })
    );
  }, [statusOf, noteOf, selectedId, descendants, setNodes]);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const data = node.data as NodeData;
      if (data.node.kind === 'label') return;
      onSelect(node.id);
    },
    [onSelect]
  );

  const handleContextMenu = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Rechtsklikken zet de status een stap door, net als op roadmap.sh.
      event.preventDefault();
      const data = node.data as NodeData;
      if (data.node.kind === 'label') return;
      onCycleStatus(node.id);
    },
    [onCycleStatus]
  );

  return (
    <div className="graph" ref={containerRef}>
      <ReactFlow
        nodes={nodes}
        edges={[]}
        onNodesChange={onNodesChange}
        nodeTypes={NODE_TYPES}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleContextMenu}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnScroll
        zoomOnScroll={false}
        zoomOnPinch
        panOnDrag
        zoomOnDoubleClick={false}
        minZoom={0.15}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
        <Controls showInteractive={false} position="bottom-right" />
        <Connections layout={layout} hues={hues} />
      </ReactFlow>
    </div>
  );
}

export function RoadmapGraph(props: GraphProps) {
  return (
    <ReactFlowProvider>
      <Flow {...props} />
    </ReactFlowProvider>
  );
}
