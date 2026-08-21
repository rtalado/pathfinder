import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { Topbar } from '@/components/Topbar';
import { computeStats, useAllRoadmaps } from '@/lib/hooks';
import { today } from '@/lib/progress';
import { isDue } from '@/lib/srs';
import { selectCard, selectStreak, useProgress } from '@/store/progressStore';

const WEEKS = 18;

function Heatmap({ activity }: { activity: Record<string, number> }) {
  const weeks = useMemo(() => {
    const days: { key: string; count: number }[] = [];
    const cursor = new Date();
    // Terug naar de zondag van deze week, zodat de kolommen kloppen.
    cursor.setDate(cursor.getDate() - cursor.getDay());
    cursor.setDate(cursor.getDate() - (WEEKS - 1) * 7);

    for (let week = 0; week < WEEKS; week += 1) {
      for (let day = 0; day < 7; day += 1) {
        const key = today(cursor);
        days.push({ key, count: activity[key] ?? 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return Array.from({ length: WEEKS }, (_, index) => days.slice(index * 7, index * 7 + 7));
  }, [activity]);

  const intensity = (count: number) => {
    if (!count) return 'var(--surface-3)';
    if (count < 3) return 'rgba(63, 185, 80, 0.35)';
    if (count < 6) return 'rgba(63, 185, 80, 0.6)';
    return 'var(--status-done)';
  };

  return (
    <div className="heatmap">
      {weeks.map((week, index) => (
        <div key={index} className="heatmap__week">
          {week.map((day) => (
            <div
              key={day.key}
              className="heatmap__day"
              style={{ background: intensity(day.count) }}
              title={`${day.key}: ${day.count} item${day.count === 1 ? '' : 's'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { roadmaps, loading } = useAllRoadmaps();
  const progress = useProgress((store) => store.state);
  const streak = selectStreak(progress);

  const totals = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const roadmap of roadmaps) {
      const stats = computeStats(roadmap, progress);
      done += stats.done;
      total += stats.total;
    }
    return { done, total };
  }, [roadmaps, progress]);

  const dueCards = useMemo(() => {
    let count = 0;
    for (const roadmap of roadmaps) {
      for (const node of roadmap.nodes) {
        for (const card of node.flashcards ?? []) {
          if (isDue(selectCard(progress, roadmap.id, node.id, card.id))) count += 1;
        }
      }
    }
    return count;
  }, [roadmaps, progress]);

  return (
    <>
      <Topbar title="Overzicht" subtitle={`${roadmaps.length} leerpaden`} />
      <div className="content">
        <div className="page stack" style={{ gap: 22 }}>
          <div className="stats">
            <div className="stat">
              <div className="stat__value">{totals.done}</div>
              <div className="stat__label">onderwerpen afgerond</div>
            </div>
            <div className="stat">
              <div className="stat__value">
                {totals.total ? Math.round((totals.done / totals.total) * 100) : 0}%
              </div>
              <div className="stat__label">van alles wat er ligt</div>
            </div>
            <div className="stat">
              <div className="stat__value" style={{ color: streak.current ? 'var(--status-doing)' : undefined }}>
                <Flame size={20} style={{ verticalAlign: -2 }} /> {streak.current}
              </div>
              <div className="stat__label">
                dagen op rij {streak.longest > streak.current ? `· record ${streak.longest}` : ''}
              </div>
            </div>
            <Link to="/overhoren" className="stat" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="stat__value">{dueCards}</div>
              <div className="stat__label">kaarten te overhoren</div>
            </Link>
          </div>

          <div className="card">
            <div className="field__label" style={{ marginBottom: 10 }}>
              Activiteit
            </div>
            <Heatmap activity={progress.activity} />
          </div>

          <div>
            <div className="sidebar__section" style={{ padding: '0 0 10px' }}>
              Leerpaden
            </div>
            {loading && !roadmaps.length ? (
              <p className="muted">Laden…</p>
            ) : (
              <div className="grid">
                {roadmaps.map((roadmap) => {
                  const stats = computeStats(roadmap, progress);
                  const accent = roadmap.color ?? 'var(--accent)';
                  return (
                    <Link key={roadmap.id} to={`/pad/${roadmap.id}`} className="roadmapcard">
                      <div className="row">
                        <span
                          className="roadmapcard__icon"
                          style={{ background: `${accent}22`, color: accent }}
                        >
                          <Icon name={roadmap.icon} size={19} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="roadmapcard__title">{roadmap.title}</div>
                          {roadmap.subtitle && (
                            <div className="roadmapcard__sub">{roadmap.subtitle}</div>
                          )}
                        </div>
                      </div>
                      <div className="progress">
                        <div
                          className="progress__bar"
                          style={{ width: `${stats.percent}%`, background: accent }}
                        />
                      </div>
                      <div className="roadmapcard__stats">
                        <span>
                          {stats.done} van {stats.total} afgerond
                        </span>
                        <span>{stats.percent}%</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
