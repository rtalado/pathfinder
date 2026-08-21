import {
  BookOpen,
  Briefcase,
  Building2,
  ClipboardCheck,
  FileText,
  Fingerprint,
  Gauge,
  GraduationCap,
  KeyRound,
  Layers,
  Lock,
  Network,
  Radar,
  ScrollText,
  Shield,
  ShieldCheck,
  Target,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

/**
 * Alleen deze iconen zitten in de bundel. Een roadmap.json verwijst met een naam
 * uit deze lijst; staat de naam er niet in, dan wordt het schildje gebruikt.
 */
const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  briefcase: Briefcase,
  building: Building2,
  'clipboard-check': ClipboardCheck,
  'file-text': FileText,
  fingerprint: Fingerprint,
  gauge: Gauge,
  'graduation-cap': GraduationCap,
  key: KeyRound,
  layers: Layers,
  lock: Lock,
  network: Network,
  radar: Radar,
  scroll: ScrollText,
  shield: Shield,
  'shield-check': ShieldCheck,
  target: Target,
  users: Users,
  workflow: Workflow,
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name?: string;
  size?: number;
  className?: string;
}) {
  const Component = (name && ICONS[name]) || ShieldCheck;
  return <Component size={size} className={className} aria-hidden />;
}
