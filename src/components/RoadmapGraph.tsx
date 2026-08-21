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

interface NodeData extends Record<string, unknown> {
  node: RoadmapNode;
  status: NodeStatus;
  active: boolean;
  hasNote: boolean;
  docCount: number;
  cardCount: number;
}

type FlowNode = Node<NodeData>;

function RoadmapFlowNode({ data }: NodeProps<FlowNode>) {
  const { node, status, active, hasNote, docCount, cardCount } = data;
  const classes = [
    'rnode',
    `rnode--${node.kind}`,
    status !== 'todo' ? `rnode--${status}` : '',
    active ? 'rnode--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} title={node.summary ?? node.title}>
      <span>{node.title}</span>
      {node.optional && <span style={{ opacity: 0.6, fontSize: '0.82em' }}>(optioneel)</span>}

      {(hasNote || docCount > 0 || cardCount > 0) && (
        <span className="rnode__flag">
          {hasNote ? (
            <StickyNote size={10} />
          ) : docCount > 0 ? (
            <FileText size={10} />
          ) : (
            <Layers size={10} />
          )}
        </span>
      )}
    </div>
  );
}

const NODE_TYPES = { roadmap: RoadmapFlowNode };

/**
 * De verbindingslijnen. We tekenen ze zelf in één SVG-laag binnen de viewport
 * in plaats van React Flow-edges te gebruiken: de posities liggen al vast in de
 * plattegrond, en zo is de weergave niet afhankelijk van het opmeten van elke
 * node. Dat scheelt bovendien 65 losse SVG-elementen.
 */
function Connections({ layout }: { layout: RoadmapLayout }) {
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
        {paths.map(({ edge, d }) => (
          <path
            key={edge.id}
            d={d}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={edge.kind === 'spine' ? 2.5 : 1.5}
            strokeDasharray={edge.kind === 'detail' ? '4 4' : undefined}
            strokeLinecap="round"
          />
        ))}
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
        },
      }))
    );
  }, [layout, setNodes]);

  // Het beginbeeld rekenen we zelf uit vanuit de plattegrond. fitView zou hetzelfde
  // doen, maar leunt op het opmeten van elke node en dat is trager en fragieler.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    if (!width || !height) return;

    const zoom = Math.min(1, width / layout.width, height / layout.height);
    setViewport({
      x: (width - layout.width * zoom) / 2,
      y: 24,
      zoom: Math.max(0.15, zoom),
    });
  }, [layout, setViewport]);

  // Voortgang werkt alleen de data bij, zodat de graph niet opnieuw opbouwt.
  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const status = statusOf(node.id);
        const active = selectedId === node.id;
        const hasNote = noteOf(node.id);
        if (
          node.data.status === status &&
          node.data.active === active &&
          node.data.hasNote === hasNote
        ) {
          return node;
        }
        return { ...node, data: { ...node.data, status, active, hasNote } };
      })
    );
  }, [statusOf, noteOf, selectedId, setNodes]);

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
        zoomOnDoubleClick={false}
        minZoom={0.15}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
        <Controls showInteractive={false} position="bottom-right" />
        <Connections layout={layout} />
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
