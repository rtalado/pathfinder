/**
 * Kleur per fase. Elke fase krijgt een eigen tint, afgeleid van de kleur van het
 * leerpad zelf, zodat je in een uitgezoomde plattegrond ziet welke blokken bij
 * elkaar horen zonder dat het een lappendeken wordt.
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;

  const r = Number.parseInt(full.slice(0, 2), 16) / 255;
  const g = Number.parseInt(full.slice(2, 4), 16) / 255;
  const b = Number.parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return { h: h * 360, s, l };
}

export function hslToCss({ h, s, l }: Hsl, alpha = 1): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = Math.round(Math.min(1, Math.max(0, s)) * 100);
  const lightness = Math.round(Math.min(1, Math.max(0, l)) * 100);
  return alpha >= 1
    ? `hsl(${hue.toFixed(0)} ${saturation}% ${lightness}%)`
    : `hsl(${hue.toFixed(0)} ${saturation}% ${lightness}% / ${alpha})`;
}

/**
 * Hoeveel de kleurtoon per fase afwijkt van die van het leerpad.
 *
 * Bewust niet in vaste stappen oplopend: dat draait bij tien fasen de hele
 * kleurencirkel rond en dan is een violet leerpad halverwege oranje. Deze reeks
 * blijft binnen zestig graden van de basiskleur, terwijl opeenvolgende fasen ver
 * genoeg uit elkaar liggen om ze uit elkaar te houden.
 */
const HUE_STEPS = [0, 28, -24, 52, -46, 14, -36, 60, -58, 40, -14, 46];

const LIGHTNESS_STEPS = [0.62, 0.58, 0.65, 0.6, 0.63, 0.57];

/** De tint van fase n, afgeleid van de kleur van het leerpad. */
export function phaseHue(base: string, index: number): Hsl {
  const { h, s } = hexToHsl(base || '#8b5cf6');
  return {
    h: h + HUE_STEPS[index % HUE_STEPS.length],
    s: Math.min(0.78, Math.max(0.45, s + ((index % 3) - 1) * 0.06)),
    l: LIGHTNESS_STEPS[index % LIGHTNESS_STEPS.length],
  };
}

export interface NodePaint {
  background: string;
  border: string;
  text: string;
}

/**
 * Hoe een blok geverfd wordt. Een fase krijgt de volle kleur, een onderwerp een
 * doorschijnende versie ervan. Doorschijnend werkt in beide thema's: op een donkere
 * ondergrond wordt het vanzelf donker, op een lichte vanzelf licht.
 */
export function paintFor(hsl: Hsl, kind: 'milestone' | 'topic' | 'subtopic' | 'label'): NodePaint {
  switch (kind) {
    case 'milestone':
      return {
        background: hslToCss({ ...hsl, l: 0.62 }),
        border: hslToCss({ ...hsl, l: 0.44 }),
        // Op een verzadigde kleur leest donkere tekst het beste.
        text: hslToCss({ ...hsl, s: Math.min(1, hsl.s + 0.15), l: 0.14 }),
      };
    case 'topic':
      return {
        background: hslToCss(hsl, 0.2),
        border: hslToCss({ ...hsl, l: 0.55 }, 0.7),
        text: 'var(--text)',
      };
    case 'subtopic':
      return {
        background: hslToCss(hsl, 0.1),
        border: hslToCss({ ...hsl, l: 0.55 }, 0.4),
        text: 'var(--text-muted)',
      };
    case 'label':
      return {
        background: 'transparent',
        border: hslToCss({ ...hsl, l: 0.55 }, 0.45),
        text: 'var(--text-muted)',
      };
  }
}
