import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { SyncBadge } from './SyncBadge';
import { UpdateBadge } from './UpdateBadge';

export function Topbar({
  title,
  subtitle,
  back,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Pad voor de terugknop; alleen tonen waar terug ook echt logisch is. */
  back?: string;
  children?: ReactNode;
}) {
  return (
    <header className="topbar">
      {back && (
        <Link to={back} className="btn btn--ghost btn--sm" title="Terug">
          <ChevronLeft size={16} />
        </Link>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="topbar__title">{title}</div>
        {subtitle && <div className="topbar__sub">{subtitle}</div>}
      </div>
      <div className="topbar__spacer" />
      {children}
      <UpdateBadge />
      <SyncBadge />
    </header>
  );
}
