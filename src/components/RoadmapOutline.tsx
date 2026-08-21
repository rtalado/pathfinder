import { useMemo } from 'react';
import type { NodeStatus, Roadmap } from '@/types';
import { computeOutline } from '@/lib/layout';
import { StatusBox } from './StatusControl';

/**
 * De lijstweergave. Op een telefoon is dit de standaard: dezelfde inhoud en
 * volgorde als de graph, maar leesbaar op een smal scherm.
 */
export function RoadmapOutline({
  roadmap,
  statusOf,
  selectedId,
  filter,
  onSelect,
  onCycleStatus,
}: {
  roadmap: Roadmap;
  statusOf(nodeId: string): NodeStatus;
  selectedId: string | null;
  filter: string;
  onSelect(nodeId: string): void;
  onCycleStatus(nodeId: string): void;
}) {
  const items = useMemo(() => computeOutline(roadmap), [roadmap]);

  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? items.filter(
        (item) =>
          item.node.title.toLowerCase().includes(needle) ||
          item.node.summary?.toLowerCase().includes(needle) ||
          item.node.tags?.some((tag) => tag.toLowerCase().includes(needle))
      )
    : items;

  if (!visible.length) {
    return <p className="empty">Niets gevonden voor "{filter}".</p>;
  }

  return (
    <div className="outline">
      {visible.map(({ node, depth }) => {
        const status = statusOf(node.id);
        const isMilestone = node.kind === 'milestone';
        const childCount = roadmap.nodes.filter((other) => other.parent === node.id).length;
        const doneChildren = roadmap.nodes.filter(
          (other) => other.parent === node.id && statusOf(other.id) === 'done'
        ).length;

        return (
          <div
            key={node.id}
            className={[
              'outline__row',
              isMilestone ? 'outline__row--milestone' : '',
              selectedId === node.id ? 'outline__row--selected' : '',
              status === 'done' ? 'outline__row--done' : '',
              status === 'skipped' ? 'outline__row--skipped' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ marginLeft: needle ? 0 : depth * 18 }}
          >
            {node.kind !== 'label' && (
              <button
                type="button"
                onClick={() => onCycleStatus(node.id)}
                title="Status wijzigen"
                style={{ display: 'flex' }}
              >
                <StatusBox status={status} />
              </button>
            )}
            <button
              type="button"
              className="outline__title"
              onClick={() => onSelect(node.id)}
              style={{
                opacity: status === 'skipped' ? 0.55 : 1,
                textDecoration: status === 'skipped' ? 'line-through' : 'none',
              }}
            >
              {node.title}
              {node.optional && <span className="dim"> (optioneel)</span>}
            </button>
            {isMilestone && childCount > 0 && (
              <span className="outline__count">
                {doneChildren}/{childCount}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
