import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { FileText, Flame, Home, Layers, Plus, Settings } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { useAllRoadmaps } from '@/lib/hooks';
import { computeStats } from '@/lib/hooks';
import { useProgress } from '@/store/progressStore';
import { DashboardPage } from '@/pages/DashboardPage';
import { RoadmapPage } from '@/pages/RoadmapPage';
import { DocsPage } from '@/pages/DocsPage';
import { DocumentPage } from '@/pages/DocumentPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NewRoadmapPage } from '@/pages/NewRoadmapPage';

function Sidebar() {
  const { roadmaps } = useAllRoadmaps();
  const progress = useProgress((store) => store.state);

  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">
          <Layers size={16} />
        </span>
        LearnPath
      </div>

      <NavLink
        to="/"
        end
        className={({ isActive }) => `navitem${isActive ? ' navitem--active' : ''}`}
      >
        <Home size={16} /> Overzicht
      </NavLink>
      <NavLink
        to="/overhoren"
        className={({ isActive }) => `navitem${isActive ? ' navitem--active' : ''}`}
      >
        <Flame size={16} /> Overhoren
      </NavLink>
      <NavLink
        to="/docs"
        className={({ isActive }) => `navitem${isActive ? ' navitem--active' : ''}`}
      >
        <FileText size={16} /> Documenten
      </NavLink>

      <div className="sidebar__section">Leerpaden</div>
      <NavLink
        to="/nieuw"
        className={({ isActive }) => `navitem${isActive ? ' navitem--active' : ''}`}
      >
        <Plus size={16} /> Nieuw leerpad
      </NavLink>
      {roadmaps.map((roadmap) => {
        const stats = computeStats(roadmap, progress);
        return (
          <NavLink
            key={roadmap.id}
            to={`/pad/${roadmap.id}`}
            className={({ isActive }) => `navitem${isActive ? ' navitem--active' : ''}`}
            title={roadmap.subtitle}
          >
            <Icon name={roadmap.icon} size={16} />
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {roadmap.title}
            </span>
            <span className="navitem__badge">{stats.percent}%</span>
          </NavLink>
        );
      })}

      <div className="sidebar__spacer" />

      <NavLink
        to="/instellingen"
        className={({ isActive }) => `navitem${isActive ? ' navitem--active' : ''}`}
      >
        <Settings size={16} /> Instellingen
      </NavLink>
    </nav>
  );
}

function MobileNav() {
  const items = [
    { to: '/', end: true, label: 'Overzicht', icon: Home },
    { to: '/overhoren', end: false, label: 'Overhoren', icon: Flame },
    { to: '/nieuw', end: false, label: 'Nieuw', icon: Plus },
    { to: '/docs', end: false, label: 'Docs', icon: FileText },
    { to: '/instellingen', end: false, label: 'Meer', icon: Settings },
  ];

  return (
    <nav className="mobilenav">
      {items.map(({ to, end, label, icon: ItemIcon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `mobilenav__item${isActive ? ' mobilenav__item--active' : ''}`
          }
        >
          <ItemIcon size={19} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function App() {
  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          {/* Oud pad; het overzicht toont de leerpaden al. */}
          <Route path="/paden" element={<Navigate to="/" replace />} />
          <Route path="/nieuw" element={<NewRoadmapPage />} />
          <Route path="/pad/:roadmapId" element={<RoadmapPage />} />
          <Route path="/overhoren" element={<ReviewPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/docs/:collectionId/:documentId" element={<DocumentPage />} />
          <Route path="/instellingen" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <MobileNav />
      </div>
    </div>
  );
}
