/**
 * Alles wat met de terminal zelf te maken heeft: kleuren, cursor, toetsen.
 *
 * Bewust zonder externe pakketten. Een leerpad-app hoort niet met een halve
 * bibliotheek aan afhankelijkheden te komen, en de escape-codes die we nodig
 * hebben passen op een half scherm.
 */

const ESC = '\x1b[';

export const CSI = {
  clear: `${ESC}2J`,
  home: `${ESC}H`,
  hideCursor: `${ESC}?25l`,
  showCursor: `${ESC}?25h`,
  altScreen: `${ESC}?1049h`,
  mainScreen: `${ESC}?1049l`,
  reset: `${ESC}0m`,
  clearLine: `${ESC}2K`,
};

export const to = (row, column) => `${ESC}${row};${column}H`;

// ---------------------------------------------------------------------------
// Kleur
// ---------------------------------------------------------------------------

/** 0 = geen kleur, 1 = zestien kleuren, 2 = 256 kleuren, 3 = alles. */
export function colorLevel() {
  if (process.env.NO_COLOR) return 0;
  if (!process.stdout.isTTY) return 0;
  const term = process.env.TERM ?? '';
  if (term === 'dumb') return 0;
  if (/truecolor|24bit/i.test(process.env.COLORTERM ?? '')) return 3;
  // Windows Terminal en de console van Windows 10 en later kunnen alle kleuren,
  // maar zetten COLORTERM niet.
  if (process.platform === 'win32') return 3;
  if (/256/.test(term)) return 2;
  return term ? 1 : 0;
}

const LEVEL = colorLevel();

export function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean;
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

/** Dichtstbijzijnde kleur uit het 256-kleurenpalet: de kubus plus de grijstinten. */
function to256([r, g, b]) {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return 232 + Math.round(((r - 8) / 247) * 24);
  }
  const level = (value) => Math.round((Math.max(0, Math.min(255, value)) / 255) * 5);
  return 16 + 36 * level(r) + 6 * level(g) + level(b);
}

/** De acht basiskleuren, voor een terminal die niet meer kan. */
function to16([r, g, b]) {
  const bright = (r + g + b) / 3 > 128 ? 60 : 0;
  return 30 + (r > 128 ? 1 : 0) + (g > 128 ? 2 : 0) + (b > 128 ? 4 : 0) + bright;
}

export function fg(hex) {
  if (LEVEL === 0) return '';
  const rgb = hexToRgb(hex);
  if (LEVEL === 3) return `${ESC}38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
  if (LEVEL === 2) return `${ESC}38;5;${to256(rgb)}m`;
  return `${ESC}${to16(rgb)}m`;
}

export function bg(hex) {
  if (LEVEL === 0) return '';
  const rgb = hexToRgb(hex);
  if (LEVEL === 3) return `${ESC}48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
  if (LEVEL === 2) return `${ESC}48;5;${to256(rgb)}m`;
  return `${ESC}${to16(rgb) + 10}m`;
}

export const bold = LEVEL ? `${ESC}1m` : '';
export const dim = LEVEL ? `${ESC}2m` : '';
export const italic = LEVEL ? `${ESC}3m` : '';
export const underline = LEVEL ? `${ESC}4m` : '';
export const reverse = LEVEL ? `${ESC}7m` : '';
export const reset = LEVEL ? CSI.reset : '';

export function stripAnsi(text) {
  return String(text).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
}

/** Lengte zonder de escape-codes; nodig om iets te kunnen uitlijnen. */
export function width(text) {
  return stripAnsi(text).length;
}

/** Kapt af op een zichtbare breedte, met de escape-codes intact. */
export function truncate(text, max) {
  if (max <= 0) return '';
  if (width(text) <= max) return text;
  let visible = 0;
  let out = '';
  let index = 0;
  const raw = String(text);
  while (index < raw.length && visible < max - 1) {
    if (raw[index] === '\x1b') {
      const end = raw.indexOf('m', index);
      if (end === -1) break;
      out += raw.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    out += raw[index];
    visible += 1;
    index += 1;
  }
  return `${out}…`;
}

export function pad(text, size) {
  const missing = size - width(text);
  return missing > 0 ? text + ' '.repeat(missing) : text;
}

/** Breekt af op woorden; een leesbare regel is belangrijker dan een volle regel. */
export function wrap(text, max) {
  const lines = [];
  const limit = Math.max(1, max);
  for (const paragraph of String(text).split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/)) {
      if (!line.length) line = word;
      else if (line.length + 1 + word.length <= limit) line += ` ${word}`;
      else {
        lines.push(line);
        line = word;
      }
      // Een woord dat zelf niet past, breken we alsnog af.
      while (line.length > limit) {
        lines.push(line.slice(0, limit));
        line = line.slice(limit);
      }
    }
    if (line.length) lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Toetsen
// ---------------------------------------------------------------------------

const NAMED = {
  '\x1b[A': 'up',
  '\x1b[B': 'down',
  '\x1b[C': 'right',
  '\x1b[D': 'left',
  '\x1b[H': 'home',
  '\x1b[F': 'end',
  '\x1b[1~': 'home',
  '\x1b[4~': 'end',
  '\x1b[5~': 'pageup',
  '\x1b[6~': 'pagedown',
  '\x1b[3~': 'delete',
  '\x1b[Z': 'backtab',
  '\x1bOA': 'up',
  '\x1bOB': 'down',
  '\x1bOC': 'right',
  '\x1bOD': 'left',
  '\r': 'enter',
  '\n': 'enter',
  '\t': 'tab',
  '\x7f': 'backspace',
  '\b': 'backspace',
  '\x1b': 'escape',
  ' ': 'space',
  '\x03': 'ctrl-c',
  '\x04': 'ctrl-d',
  '\x15': 'ctrl-u',
  '\x17': 'ctrl-w',
};

const SEQUENCES = Object.keys(NAMED).sort((a, b) => b.length - a.length);

/**
 * Zet wat de terminal stuurt om in iets waar de app op kan reageren. Eén toets
 * kan meerdere bytes zijn, en snel typen levert meerdere toetsen in één blok op.
 */
export function decodeKeys(chunk) {
  const raw = chunk.toString('utf8');
  const keys = [];
  let index = 0;

  while (index < raw.length) {
    const rest = raw.slice(index);

    // De langste bekende reeks eerst, anders is \x1b[ al een losse escape.
    const matched = SEQUENCES.find((sequence) => rest.startsWith(sequence));
    if (matched) {
      keys.push({ name: NAMED[matched], sequence: matched, char: matched === ' ' ? ' ' : '' });
      index += matched.length;
      continue;
    }

    // Onbekende escape-reeks: overslaan, anders komt de rommel in een invoerveld.
    if (rest.startsWith('\x1b[') || rest.startsWith('\x1bO')) {
      const end = rest.search(/[A-Za-z~]/);
      index += end === -1 ? rest.length : end + 1;
      continue;
    }

    const char = rest[0];
    const code = char.charCodeAt(0);
    if (code < 32) {
      keys.push({ name: `ctrl-${String.fromCharCode(code + 96)}`, sequence: char, char: '' });
    } else {
      keys.push({ name: char.toLowerCase(), sequence: char, char });
    }
    index += 1;
  }

  return keys;
}
