import { useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { List, Network, Search } from 'lucide-react';
import { NodePanel } from '@/components/NodePanel';
import { RoadmapGraph } from '@/components/RoadmapGraph';
import { RoadmapOutline } from '@/components/RoadmapOutline';
import { Topbar } from '@/components/Topbar';
import { useRoadmap, useRoadmapStats } from '@/lib/hooks';
import { nodeKey } from '@/lib/progress';
import { selectStatus, useProgress } from '@/store/progressStore';
import { useSettings } from '@/store/settingsStore';

export function RoadmapPage() {
  const { roadmapId } = useParams<{ roadmapId: string }>();
  const [params, setParams] = useSearchParams();
  const { roadmap, error } = useRoadmap(roadmapId);
  const stats = useRoadmapStats(roadmap);

  const progress = useProgress((store) => store.state);
  const cycleNodeStatus = useProgress((store) => store.cycleNodeStatus);
  const viewMode = useSettings((store) => store.viewMode);
  const setViewMode = useSettings((store) => store.setViewMode);

  const selectedId = params.get('node');
  const filter = params.get('q') ?? '';

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const statusOf = useCallback(
    (nodeId: string) => selectStatus(progress, roadmapId!, nodeId),
    [progress, roadmapId]
  );

  const noteOf = useCallback(
    (nodeId: string) => Boolean(progress.notes[nodeKey(roadmapId!, nodeId)]?.value),
    [progress, roadmapId]
  );

  const selectedNode = useMemo(
    () => roadmap?.nodes.find((node) => node.id === selectedId) ?? null,
    [roadmap, selectedId]
  );

  if (error) {
    return (
      <>
        <Topbar title="Leerpad" back="/" />
        <div className="content">
          <div className="page">
            <div className="banner banner--error">{error}</div>
          </div>
        </div>
      </>
    );
  }

  if (!roadmap || !roadmapId) {
    return (
      <>
        <Topbar title="Leerpad" back="/" />
        <div className="content">
          <div className="page muted">Laden…</div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title={roadmap.title}
        subtitle={
          stats ? `${stats.done}/${stats.total} afgerond · ${stats.percent}%` : roadmap.subtitle
        }
        back="/"
      >
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => setViewMode(viewMode === 'graph' ? 'list' : 'graph')}
          title={viewMode === 'graph' ? 'Naar lijstweergave' : 'Naar kaartweergave'}
          aria-label={viewMode === 'graph' ? 'Naar lijstweergave' : 'Naar kaartweergave'}
        >
          {viewMode === 'graph' ? <List size={15} /> : <Network size={15} />}
          {/* Op een telefoon is een icoon alleen te raadselachtig om te vinden. */}
          <span className="btn__label">{viewMode === 'graph' ? 'Lijst' : 'Kaart'}</span>
        </button>
      </Topbar>

      <div className="content">
        {viewMode === 'graph' ? (
          <RoadmapGraph
            roadmap={roadmap}
            statusOf={statusOf}
            noteOf={noteOf}
            selectedId={selectedId}
            onSelect={(nodeId) => setParam('node', nodeId)}
            onCycleStatus={(nodeId) => cycleNodeStatus(roadmapId, nodeId)}
          />
        ) : (
          <div className="page">
            <div className="row" style={{ marginBottom: 14 }}>
              <Search size={15} className="dim" />
              <input
                className="input"
                placeholder="Zoek in dit leerpad"
                value={filter}
                onChange={(event) => setParam('q', event.target.value || null)}
              />
            </div>
            {roadmap.description && !filter && (
              <p className="muted" style={{ marginTop: 0 }}>
                {roadmap.description}
              </p>
            )}
            <RoadmapOutline
              roadmap={roadmap}
              statusOf={statusOf}
              selectedId={selectedId}
              filter={filter}
              onSelect={(nodeId) => setParam('node', nodeId)}
              onCycleStatus={(nodeId) => cycleNodeStatus(roadmapId, nodeId)}
            />
          </div>
        )}

        {selectedNode && (
          <NodePanel
            roadmap={roadmap}
            node={selectedNode}
            onClose={() => setParam('node', null)}
          />
        )}
      </div>
    </>
  );
}
