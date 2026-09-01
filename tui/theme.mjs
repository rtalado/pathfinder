/**
 * Dezelfde thema's als de grafische app. shared/themes.json is de enige bron; hier
 * worden de hexkleuren omgezet naar iets waar een terminal mee overweg kan.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './paths.mjs';
import { bg, bold, dim, fg, reset } from './ansi.mjs';

const file = path.join(ROOT, 'shared', 'themes.json');

export const THEMES = JSON.parse(fs.readFileSync(file, 'utf8')).themes;

export const DEFAULT_THEME_ID = 'dark';

export function findTheme(id) {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0];
}

/**
 * Een thema als kant-en-klare stukjes escape-code.
 *
 * De achtergrond zetten we alleen waar het moet: een terminal heeft al een
 * achtergrondkleur, en die van de gebruiker overschrijven op elk teken geeft een
 * app die zich niets van je instellingen aantrekt. Balken en selecties krijgen
 * hem wel, want daar is het contrast het punt.
 */
export function palette(theme) {
  const c = theme.colors;
  return {
    id: theme.id,
    name: theme.name,
    dark: theme.dark,
    hex: c,

    text: fg(c.text),
    muted: fg(c.textMuted),
    faint: fg(c.textDim),
    accent: fg(c.accent),
    accentSoft: fg(c.accentSoft),
    done: fg(c.done),
    doing: fg(c.doing),
    skipped: fg(c.skipped),
    danger: fg(c.danger),
    border: fg(c.border),
    borderStrong: fg(c.borderStrong),

    /** De achtergrond waar de hele app op staat. */
    appBg: bg(c.bg),
    /** Balken boven- en onderaan het scherm. */
    barBg: bg(c.surface),
    barText: fg(c.text),
    /** De regel waar je op staat. */
    selectionBg: bg(c.surface3),
    /** Een titel of het actieve tabblad. */
    highlightBg: bg(c.accent),
    highlightText: fg(c.milestoneText),

    bold,
    dim,
    reset,
  };
}
