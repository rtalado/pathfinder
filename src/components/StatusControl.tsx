import { Check, CircleDashed, Minus, Play } from 'lucide-react';
import type { NodeStatus } from '@/types';

export const STATUS_LABELS: Record<NodeStatus, string> = {
  todo: 'Te doen',
  doing: 'Mee bezig',
  done: 'Afgerond',
  skipped: 'Overgeslagen',
};

export function StatusBox({ status }: { status: NodeStatus }) {
  return (
    <span className={`statusbox statusbox--${status}`} aria-label={STATUS_LABELS[status]}>
      {status === 'done' && <Check size={13} strokeWidth={3} />}
      {status === 'doing' && <Play size={9} fill="currentColor" />}
      {status === 'skipped' && <Minus size={12} strokeWidth={3} />}
    </span>
  );
}

const ORDER: NodeStatus[] = ['todo', 'doing', 'done', 'skipped'];

const ICONS: Record<NodeStatus, JSX.Element> = {
  todo: <CircleDashed size={13} />,
  doing: <Play size={11} fill="currentColor" />,
  done: <Check size={13} strokeWidth={3} />,
  skipped: <Minus size={13} strokeWidth={3} />,
};

export function StatusChips({
  value,
  onChange,
}: {
  value: NodeStatus;
  onChange(status: NodeStatus): void;
}) {
  return (
    <div className="statusrow">
      {ORDER.map((status) => (
        <button
          key={status}
          type="button"
          data-status={status}
          className={`statuschip${status === value ? ' statuschip--active' : ''}`}
          onClick={() => onChange(status)}
        >
          {ICONS[status]}
          {STATUS_LABELS[status]}
        </button>
      ))}
    </div>
  );
}
