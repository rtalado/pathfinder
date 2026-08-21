import { Link } from 'react-router-dom';
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useProgress } from '@/store/progressStore';
import { useSettings } from '@/store/settingsStore';

function relativeTime(timestamp: number): string {
  const seconds = Math.round((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'net';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  return `${Math.round(hours / 24)} dagen geleden`;
}

export function SyncBadge() {
  const sync = useProgress((store) => store.sync);
  const syncNow = useProgress((store) => store.syncNow);
  const enabled = useSettings((store) => store.sync.enabled);

  if (!enabled) {
    return (
      <Link to="/instellingen" className="btn btn--ghost btn--sm" title="Sync is uit">
        <CloudOff size={15} />
      </Link>
    );
  }

  if (sync.phase === 'error') {
    return (
      <Link
        to="/instellingen"
        className="btn btn--sm btn--danger"
        title={sync.message ?? 'Synchroniseren mislukt'}
      >
        <TriangleAlert size={14} /> Sync
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="btn btn--ghost btn--sm"
      onClick={() => void syncNow()}
      disabled={sync.phase === 'syncing'}
      title={
        sync.lastSyncedAt
          ? `Laatst gesynchroniseerd ${relativeTime(sync.lastSyncedAt)}`
          : 'Nu synchroniseren'
      }
    >
      <RefreshCw
        size={15}
        style={sync.phase === 'syncing' ? { animation: 'spin 0.9s linear infinite' } : undefined}
      />
    </button>
  );
}
