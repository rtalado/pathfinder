/**
 * Het scherm: een tweede schermbuffer, ruwe invoer en één keer per beeld alles
 * uitschrijven. Niet slim proberen te zijn met deelvernieuwingen; een leerpad
 * past op een scherm en een hele buffer wegschrijven kost niets.
 */
import { CSI, decodeKeys, pad, truncate, width as visibleWidth } from './ansi.mjs';
import { glyphs } from './glyphs.mjs';

export function createScreen() {
  const out = process.stdout;
  const input = process.stdin;

  let keyHandler = () => {};
  let resizeHandler = () => {};
  let closed = false;

  const onData = (chunk) => {
    for (const key of decodeKeys(chunk)) keyHandler(key);
  };

  const onResize = () => resizeHandler();

  function open() {
    out.write(CSI.altScreen + CSI.hideCursor + CSI.clear + CSI.home);
    if (input.isTTY) input.setRawMode(true);
    input.resume();
    input.on('data', onData);
    out.on('resize', onResize);
  }

  function close() {
    if (closed) return;
    closed = true;
    input.off('data', onData);
    out.off('resize', onResize);
    if (input.isTTY) input.setRawMode(false);
    input.pause();
    out.write(CSI.showCursor + CSI.mainScreen);
  }

  open();

  return {
    get width() {
      return Math.max(40, out.columns || 80);
    },
    get height() {
      return Math.max(10, out.rows || 24);
    },

    onKey(handler) {
      keyHandler = handler;
    },

    onResize(handler) {
      resizeHandler = handler;
    },

    /**
     * Tekent een beeld. `base` is de kleurcode die overal onder ligt; hij wordt
     * na elke reset opnieuw gezet, anders valt de achtergrond halverwege een
     * regel terug op die van de terminal.
     */
    render(lines, base = '', reset = '') {
      const rows = this.height;
      const columns = this.width;
      let frame = CSI.home;

      for (let row = 0; row < rows; row += 1) {
        const raw = lines[row] ?? '';
        const line = reset ? raw.split(reset).join(reset + base) : raw;
        const clipped = truncate(line, columns);
        const filled = clipped + ' '.repeat(Math.max(0, columns - visibleWidth(clipped)));
        frame += `\x1b[${row + 1};1H${base}${filled}${reset}`;
      }

      out.write(frame);
    },

    close,
  };
}

/** Een blok regels dat langer is dan het scherm, met een schuifbalk ernaast. */
export function scrollView(lines, offset, height, columns, palette) {
  if (lines.length <= height) return lines.slice();

  const start = Math.max(0, Math.min(offset, lines.length - height));
  const visible = lines.slice(start, start + height);

  // De balk is een teken breed en staat rechts; hij zegt vooral hoe ver je bent.
  const barSize = Math.max(1, Math.round((height / lines.length) * height));
  const barStart = Math.round((start / (lines.length - height)) * (height - barSize));
  const room = Math.max(1, columns - 2);

  return visible.map((line, index) => {
    const inBar = index >= barStart && index < barStart + barSize;
    const clipped = truncate(line, room);
    const filler = ' '.repeat(Math.max(0, room - visibleWidth(clipped)));
    const mark = inBar ? `${palette.borderStrong}${glyphs.scrollFull}` : `${palette.border}${glyphs.scrollEmpty}`;
    return `${clipped}${palette.reset}${filler} ${mark}${palette.reset}`;
  });
}

/** Een voortgangsbalkje van vaste breedte. */
export function bar(fraction, size, palette, color = palette.accent) {
  const filled = Math.round(Math.max(0, Math.min(1, fraction)) * size);
  return `${color}${glyphs.barFull.repeat(filled)}${palette.border}${glyphs.barEmpty.repeat(size - filled)}${palette.reset}`;
}

/** Regel met een label links en een waarde rechts, opgevuld tot de volle breedte. */
export function spread(left, right, columns, palette) {
  const gap = Math.max(1, columns - visibleWidth(left) - visibleWidth(right));
  return `${left}${palette.reset}${' '.repeat(gap)}${right}`;
}

export { pad };
