import { useEffect, useMemo, useState } from 'react';
import type { ContentManifest, ProgressState, Roadmap, RoadmapSource } from '@/types';
import { loadManifest, loadRoadmap } from './content';
import { activeRoadmaps, findRoadmap } from './library';
import { selectStatus, useProgress } from '@/store/progressStore';

/** Herlaadt zodra er via de sync nieuwe content is binnengekomen. */
function useContentVersion(): number {
  return useProgress((store) => store.contentVersion);
}

export function useManifest(): { manifest: ContentManifest | null; error: string | null } {
  const version = useContentVersion();
  const [manifest, setManifest] = useState<ContentManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadManifest(true)
      .then((loaded) => {
        if (!cancelled) setManifest(loaded);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return { manifest, error };
}

export function useRoadmap(id: string | undefined): {
  roadmap: Roadmap | null;
  error: string | null;
} {
  const version = useContentVersion();
  const library = useProgress((store) => store.library);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Een zelf toegevoegd leerpad staat volledig in de verzameling; die gaat voor.
  const own = id ? findRoadmap(library, id) : null;

  useEffect(() => {
    if (!id || own) return;
    let cancelled = false;
    setRoadmap(null);
    setError(null);
    loadRoadmap(id)
      .then((loaded) => {
        if (!cancelled) setRoadmap(loaded);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, own, version]);

  if (own) return { roadmap: own, error: null };
  return { roadmap, error };
}

export interface RoadmapStats {
  total: number;
  done: number;
  doing: number;
  skipped: number;
  /** Percentage afgerond, waarbij overgeslagen items als afgehandeld tellen. */
  percent: number;
}

export function computeStats(roadmap: Roadmap, progress: ProgressState): RoadmapStats {
  const countable = roadmap.nodes.filter((node) => node.kind !== 'label');
  let done = 0;
  let doing = 0;
  let skipped = 0;

  for (const node of countable) {
    const status = selectStatus(progress, roadmap.id, node.id);
    if (status === 'done') done += 1;
    else if (status === 'doing') doing += 1;
    else if (status === 'skipped') skipped += 1;
  }

  const total = countable.length;
  return {
    total,
    done,
    doing,
    skipped,
    percent: total === 0 ? 0 : Math.round(((done + skipped) / total) * 100),
  };
}

export function useRoadmapStats(roadmap: Roadmap | null): RoadmapStats | null {
  const progress = useProgress((store) => store.state);
  return useMemo(() => (roadmap ? computeStats(roadmap, progress) : null), [roadmap, progress]);
}

/** Laadt alle leerpaden; nodig voor het dashboard en het overhoren over paden heen. */
export function useAllRoadmaps(): { roadmaps: Roadmap[]; loading: boolean } {
  const { manifest } = useManifest();
  const library = useProgress((store) => store.library);
  const [bundled, setBundled] = useState<Roadmap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;
    setLoading(true);
    Promise.all(manifest.roadmaps.map((entry) => loadRoadmap(entry.id).catch(() => null)))
      .then((loaded) => {
        if (cancelled) return;
        setBundled(loaded.filter(Boolean) as Roadmap[]);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [manifest]);

  // Zelf toegevoegde leerpaden staan naast de meegeleverde. Bij dezelfde id wint
  // die van jou, zodat je een meegeleverd pad kunt overschrijven met je eigen versie.
  const roadmaps = useMemo(() => {
    const own = activeRoadmaps(library);
    const ownIds = new Set(own.map((roadmap) => roadmap.id));
    return [...bundled.filter((roadmap) => !ownIds.has(roadmap.id)), ...own].sort(
      (a, b) => (a.order ?? 50) - (b.order ?? 50) || a.title.localeCompare(b.title)
    );
  }, [bundled, library]);

  return { roadmaps, loading };
}

/** Of een leerpad is meegeleverd of door jou is toegevoegd. */
export function useRoadmapSource(id: string | undefined): RoadmapSource {
  const library = useProgress((store) => store.library);
  return id && findRoadmap(library, id) ? 'user' : 'bundled';
}

/** Reageert op wijzigingen in de schermbreedte, voor de mobiele weergave. */
export function useIsNarrow(breakpoint = 860): boolean {
  const [narrow, setNarrow] = useState(() => window.innerWidth <= breakpoint);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (event: MediaQueryListEvent) => setNarrow(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, [breakpoint]);
  return narrow;
}
