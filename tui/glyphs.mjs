/**
 * De tekens waar het scherm mee getekend wordt.
 *
 * Standaard de mooie variant; een terminal die geen UTF-8 aankan zou daar blokjes
 * van maken, dus daar is een set gewone tekens voor. Zet PATHFINDER_ASCII=1 om
 * hem af te dwingen.
 */

const ASCII = {
  rule: '-',
  cursor: '>',
  barFull: '=',
  barEmpty: '-',
  scrollFull: '#',
  scrollEmpty: ':',
  bullet: '-',
  quote: '|',
  code: '|',
  divider: '|',
  todo: ' ',
  doing: '>',
  done: 'x',
  skipped: '-',
  dot: '*',
};

const UNICODE = {
  rule: '─',
  cursor: '▸',
  barFull: '█',
  barEmpty: '░',
  scrollFull: '█',
  scrollEmpty: '│',
  bullet: '•',
  quote: '▏',
  code: '▏',
  divider: '│',
  todo: ' ',
  doing: '▸',
  done: '✓',
  skipped: '–',
  dot: '●',
};

function preferAscii() {
  if (process.env.PATHFINDER_ASCII) return true;
  if (process.platform === 'win32') return false;
  // De kale Linux-console kan geen tekentabel buiten zijn eigen font.
  if (process.env.TERM === 'linux') return true;
  const locale = `${process.env.LC_ALL ?? ''}${process.env.LC_CTYPE ?? ''}${process.env.LANG ?? ''}`;
  return locale ? !/utf-?8/i.test(locale) : false;
}

export const glyphs = preferAscii() ? ASCII : UNICODE;

/** Nederlands meervoud zonder "(en)" in de tekst. */
export function plural(count, single, many) {
  return `${count} ${count === 1 ? single : many}`;
}
