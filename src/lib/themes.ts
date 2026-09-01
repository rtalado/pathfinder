import themeFile from '../../shared/themes.json';

/**
 * De thema's staan in shared/themes.json, buiten src/. Dat is expres: de TUI leest
 * datzelfde bestand en zet de kleuren om naar ANSI. Eén palet, twee schermen.
 *
 * De tokens zelf staan als CSS-variabelen in index.css onder :root. Hier worden ze
 * per thema overschreven op <html>, zodat een nieuw thema geen CSS-regel vraagt.
 */

export interface ThemeColors {
  bg: string;
  bgSoft: string;
  surface: string;
  surface2: string;
  surface3: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentSoft: string;
  done: string;
  doing: string;
  skipped: string;
  danger: string;
  milestone: string;
  milestoneText: string;
  topic: string;
  topicText: string;
  subtopic: string;
  subtopicText: string;
  doneNode: string;
  doneNodeText: string;
  /**
   * Overschrijft de kleur waar de plattegrond zijn tinten uit afleidt. Een
   * leerpad draagt normaal zijn eigen kleur, maar in een thema dat om één kleur
   * draait valt zo'n paarse fase uit de toon.
   */
  graphBase: string | null;
  /** "r g b" van de kleur waar schaduwen mee gemaakt worden. */
  shadowRgb: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  dark: boolean;
  /** Alles in een schrijfmachineletter; hoort bij de terminalthema's. */
  mono: boolean;
  colors: ThemeColors;
}

export const THEMES: Theme[] = (themeFile as { themes: Theme[] }).themes;

export const DEFAULT_THEME_ID = 'dark';

/** 'system' volgt de voorkeur van het besturingssysteem, de rest is een thema-id. */
export type ThemeChoice = string;

export function findTheme(id: string): Theme {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

export function isKnownTheme(id: string): boolean {
  return id === 'system' || THEMES.some((theme) => theme.id === id);
}

const MONO_STACK = "'Cascadia Mono', 'JetBrains Mono', ui-monospace, 'Consolas', monospace";
const SANS_STACK = "'Segoe UI', system-ui, -apple-system, 'Inter', sans-serif";

function alpha(hex: string, amount: number): string {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((char) => char + char)
          .join('')
      : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${amount})`;
}

/** De CSS-variabelen die bij een thema horen; de rest staat vast in index.css. */
export function themeVariables(theme: Theme): Record<string, string> {
  const c = theme.colors;
  return {
    '--bg': c.bg,
    '--bg-soft': c.bgSoft,
    '--surface': c.surface,
    '--surface-2': c.surface2,
    '--surface-3': c.surface3,
    '--border': c.border,
    '--border-strong': c.borderStrong,
    '--text': c.text,
    '--text-muted': c.textMuted,
    '--text-dim': c.textDim,
    '--accent': c.accent,
    '--accent-soft': c.accentSoft,
    '--accent-ghost': alpha(c.accent, 0.14),
    '--status-done': c.done,
    '--status-done-soft': alpha(c.done, 0.16),
    '--status-doing': c.doing,
    '--status-doing-soft': alpha(c.doing, 0.16),
    '--status-skipped': c.skipped,
    '--danger': c.danger,
    '--node-milestone': c.milestone,
    '--node-milestone-text': c.milestoneText,
    '--node-topic': c.topic,
    '--node-topic-text': c.topicText,
    '--node-subtopic': c.subtopic,
    '--node-subtopic-text': c.subtopicText,
    '--node-done': c.doneNode,
    '--node-done-text': c.doneNodeText,
    '--shadow-hard': `3px 3px 0 rgb(${c.shadowRgb} / ${theme.dark ? 0.55 : 0.22})`,
    '--shadow-soft': `0 8px 24px rgb(${c.shadowRgb} / ${theme.dark ? 0.4 : 0.12})`,
    '--font': theme.mono ? MONO_STACK : SANS_STACK,
  };
}

/** Zet een thema op <html>. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVariables(theme))) {
    root.style.setProperty(name, value);
  }
  root.dataset.theme = theme.id;
  // Losse haak voor de paar regels die alleen om licht of donker geven.
  root.dataset.mode = theme.dark ? 'dark' : 'light';
  root.style.colorScheme = theme.dark ? 'dark' : 'light';
}
