/**
 * Markdown leesbaar maken in een terminal. Geen volledige parser: de app schrijft
 * zelf markdown en een AI levert markdown aan, en dat is in de praktijk koppen,
 * lijstjes, nadruk, links, citaten, code en af en toe een tabel.
 */
import {
  bold as BOLD,
  dim as DIM,
  italic as ITALIC,
  reset as RESET,
  underline as UL,
  wrap,
} from './ansi.mjs';
import { glyphs } from './glyphs.mjs';

/** Plaatshouder voor stukjes code; dit teken komt in geschreven tekst niet voor. */
const MARK = String.fromCharCode(0);

/** Nadruk, code en links binnen een regel. */
function inline(text, palette) {
  let out = String(text);

  // Code eerst apart zetten, zodat sterretjes binnen `code` met rust blijven.
  const codes = [];
  out = out.replace(/`([^`]+)`/g, (_match, code) => {
    codes.push(code);
    return `${MARK}${codes.length - 1}${MARK}`;
  });

  // [tekst](url) wordt de tekst, met de url erachter als hij iets toevoegt.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) =>
    label.trim() === url.trim()
      ? `${palette.accent}${UL}${label}${RESET}${palette.text}`
      : `${palette.accent}${UL}${label}${RESET}${palette.faint} (${url})${RESET}${palette.text}`
  );

  out = out.replace(/\*\*([^*]+)\*\*/g, `${BOLD}$1${RESET}${palette.text}`);
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, `$1${ITALIC}$2${RESET}${palette.text}`);
  out = out.replace(/(^|\s)_([^_\n]+)_/g, `$1${ITALIC}$2${RESET}${palette.text}`);
  out = out.replace(/~~([^~]+)~~/g, `${DIM}$1${RESET}${palette.text}`);

  // De stukken tussen twee plaatshouders zijn per definitie de codefragmenten,
  // dus een reguliere expressie is hier niet nodig.
  out = out
    .split(MARK)
    .map((part, index) =>
      index % 2 === 1 ? palette.doing + codes[Number(part)] + RESET + palette.text : part
    )
    .join('');

  return out;
}

/** Zet een regel om en breekt hem af, met dezelfde inspringing op elke vervolgregel. */
function block(text, width, palette, { indent = '', hanging = null } = {}) {
  const first = hanging ?? indent;
  const usable = Math.max(8, width - first.length);
  return wrap(text, usable).map((line, index) => {
    const prefix = index === 0 ? first : indent;
    return `${prefix}${palette.text}${inline(line, palette)}${RESET}`;
  });
}

/**
 * Markdown naar regels voor het scherm. Elke regel is af: de kleuren zitten er al
 * in, zodat de tekenlaag er verder niets meer aan hoeft te doen.
 */
export function renderMarkdown(text, width, palette) {
  const lines = [];
  const source = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  const blank = () => {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
  };

  while (index < source.length) {
    const line = source[index];

    // Codeblok: onbewerkt laten staan, met een streep ervoor.
    const fence = line.match(/^\s*```(.*)$/);
    if (fence) {
      blank();
      index += 1;
      while (index < source.length && !/^\s*```/.test(source[index])) {
        const code = source[index].replace(/\t/g, '  ');
        lines.push(`  ${palette.border}${glyphs.code}${RESET} ${palette.doing}${code}${RESET}`);
        index += 1;
      }
      index += 1;
      blank();
      continue;
    }

    if (!line.trim()) {
      blank();
      index += 1;
      continue;
    }

    // Streep tussen twee delen.
    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blank();
      lines.push(`${palette.border}${glyphs.rule.repeat(Math.max(4, width - 2))}${RESET}`);
      blank();
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blank();
      const level = heading[1].length;
      const title = heading[2].replace(/\s*#+\s*$/, '');
      const color = level === 1 ? palette.accent : level === 2 ? palette.accentSoft : palette.text;
      for (const part of wrap(title, width)) {
        lines.push(`${BOLD}${color}${part}${RESET}`);
      }
      // Een hoofdstuk krijgt een streepje mee, dieper niet: anders wordt het druk.
      if (level <= 2) {
        lines.push(`${palette.border}${glyphs.rule.repeat(Math.min(width, Math.max(6, title.length)))}${RESET}`);
      }
      index += 1;
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      const collected = [];
      while (index < source.length) {
        const match = source[index].match(/^\s*>\s?(.*)$/);
        if (!match) break;
        collected.push(match[1]);
        index += 1;
      }
      for (const part of wrap(collected.join(' '), Math.max(8, width - 4))) {
        lines.push(`  ${palette.accent}${glyphs.quote}${RESET} ${palette.muted}${inline(part, palette)}${RESET}`);
      }
      continue;
    }

    // Tabel: koprij, streepjesrij, en daarna de gegevens.
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(source[index + 1] ?? '')) {
      const rows = [];
      while (index < source.length && /^\s*\|.*\|\s*$/.test(source[index])) {
        rows.push(
          source[index]
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((cell) => cell.trim().replace(/`/g, ''))
        );
        index += 1;
      }
      const [head, , ...body] = rows;
      const columns = head.length;
      const sizes = Array.from({ length: columns }, (_, column) =>
        Math.max(...[head, ...body].map((row) => (row[column] ?? '').length))
      );
      // Past het niet, dan wordt de laatste kolom smaller in plaats van de regel breder.
      const total = sizes.reduce((sum, size) => sum + size + 3, 1);
      if (total > width) sizes[columns - 1] = Math.max(6, sizes[columns - 1] - (total - width));

      blank();
      const format = (row, style) =>
        row
          .map((cell, column) => `${style}${cell.slice(0, sizes[column]).padEnd(sizes[column])}${RESET}`)
          .join(`${palette.border} ${glyphs.divider} ${RESET}`);
      lines.push(`  ${format(head, `${BOLD}${palette.text}`)}`);
      const seam = `${glyphs.rule}${glyphs.divider}${glyphs.rule}`;
      lines.push(`  ${palette.border}${sizes.map((size) => glyphs.rule.repeat(size)).join(seam)}${RESET}`);
      for (const row of body) lines.push(`  ${format(row, palette.text)}`);
      blank();
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (bullet) {
      const depth = Math.floor(bullet[1].length / 2);
      const indent = '  '.repeat(depth + 1);
      lines.push(
        ...block(bullet[2], width, palette, {
          indent: `${indent}  `,
          hanging: `${indent}${palette.accent}${glyphs.bullet}${RESET} `,
        })
      );
      index += 1;
      continue;
    }

    const numbered = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
    if (numbered) {
      const depth = Math.floor(numbered[1].length / 2);
      const indent = '  '.repeat(depth + 1);
      const marker = `${numbered[2]}.`;
      lines.push(
        ...block(numbered[3], width, palette, {
          indent: `${indent}${' '.repeat(marker.length + 1)}`,
          hanging: `${indent}${palette.accent}${marker}${RESET} `,
        })
      );
      index += 1;
      continue;
    }

    // Gewone alinea: doorlopen tot de volgende lege regel of het volgende blok.
    const paragraph = [];
    while (index < source.length && source[index].trim() && !/^\s*(#{1,6}\s|>|```|[-*+]\s|\d+[.)]\s|\|)/.test(source[index])) {
      paragraph.push(source[index].trim());
      index += 1;
    }
    if (paragraph.length) lines.push(...block(paragraph.join(' '), width, palette));
    else index += 1;
  }

  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
