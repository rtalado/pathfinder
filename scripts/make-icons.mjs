/**
 * Tekent het app-icoon en schrijft het weg als PNG en ICO. Bewust zonder
 * beeldbibliotheek: het motief is eenvoudig genoeg om zelf te rasteren, en zo
 * heeft de build geen extra afhankelijkheid nodig.
 *
 * Gebruik: node scripts/make-icons.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VIOLET = [139, 92, 246];
const INDIGO = [76, 29, 149];
const DARK = [13, 17, 23];

/** Supersampling: alles wordt vier keer zo groot getekend en daarna verkleind. */
const SS = 4;

function createCanvas(size) {
  return { size, data: new Float32Array(size * size * 4) };
}

function blend(canvas, x, y, [r, g, b], alpha) {
  if (alpha <= 0 || x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  const index = (y * canvas.size + x) * 4;
  const data = canvas.data;
  const inverse = 1 - alpha;
  data[index] = data[index] * inverse + r * alpha;
  data[index + 1] = data[index + 1] * inverse + g * alpha;
  data[index + 2] = data[index + 2] * inverse + b * alpha;
  data[index + 3] = Math.min(1, data[index + 3] * inverse + alpha);
}

function roundedRect(canvas, x0, y0, width, height, radius, color, alpha = 1, gradient = null) {
  const x1 = x0 + width;
  const y1 = y0 + height;
  for (let y = Math.floor(y0); y < Math.ceil(y1); y += 1) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) {
      // Afstand tot de dichtstbijzijnde hoekcirkel bepaalt of het punt binnen valt.
      const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
      const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
      if (dx * dx + dy * dy > radius * radius) continue;

      let paint = color;
      if (gradient) {
        const t = (x - x0 + (y - y0)) / (width + height);
        paint = gradient[0].map((from, i) => from + (gradient[1][i] - from) * t);
      }
      blend(canvas, x, y, paint, alpha);
    }
  }
}

function circle(canvas, cx, cy, radius, color, alpha = 1) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) blend(canvas, x, y, color, alpha);
    }
  }
}

/** Verkleint het supersampled beeld naar de doelgrootte. */
function downsample(canvas, factor) {
  const size = canvas.size / factor;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < factor; sy += 1) {
        for (let sx = 0; sx < factor; sx += 1) {
          const index = ((y * factor + sy) * canvas.size + (x * factor + sx)) * 4;
          r += canvas.data[index];
          g += canvas.data[index + 1];
          b += canvas.data[index + 2];
          a += canvas.data[index + 3];
        }
      }
      const count = factor * factor;
      const offset = (y * size + x) * 4;
      out[offset] = Math.round(r / count);
      out[offset + 1] = Math.round(g / count);
      out[offset + 2] = Math.round(b / count);
      out[offset + 3] = Math.round((a / count) * 255);
    }
  }
  return { size, pixels: out };
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng({ size, pixels }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bitdiepte
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filtertype "none"
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO met een ingebedde PNG; dat ondersteunt Windows sinds Vista. */
function encodeIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icoon
  header.writeUInt16LE(1, 4); // aantal afbeeldingen
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt16LE(1, 4); // kleurvlakken
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

/** Het motief: een verticale route met knooppunten en twee zijtakken. */
function drawLogo(canvas, { background = true } = {}) {
  const S = canvas.size;
  const white = [255, 255, 255];

  if (background) {
    roundedRect(canvas, 0, 0, S, S, S * 0.22, VIOLET, 1, [VIOLET, INDIGO]);
  }

  const cx = S / 2;
  const spineWidth = S * 0.052;
  roundedRect(canvas, cx - spineWidth / 2, S * 0.2, spineWidth, S * 0.6, spineWidth / 2, white, 0.92);

  const branch = (y, direction) => {
    const barHeight = S * 0.044;
    const length = S * 0.2;
    const x = direction > 0 ? cx : cx - length;
    roundedRect(canvas, x, y - barHeight / 2, length, barHeight, barHeight / 2, white, 0.75);
    const boxSize = S * 0.13;
    const boxX = direction > 0 ? cx + length - boxSize * 0.35 : cx - length - boxSize * 0.65;
    roundedRect(canvas, boxX, y - boxSize / 2, boxSize, boxSize, boxSize * 0.3, white, 0.95);
  };

  branch(S * 0.35, 1);
  branch(S * 0.65, -1);

  circle(canvas, cx, S * 0.24, S * 0.075, white, 1);
  circle(canvas, cx, S * 0.5, S * 0.062, white, 1);
  circle(canvas, cx, S * 0.76, S * 0.075, white, 1);
}

async function writeIcon(size, target, options) {
  const canvas = createCanvas(size * SS);
  drawLogo(canvas, options);
  const image = downsample(canvas, SS);
  const png = encodePng(image);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, png);
  return png;
}

async function writeSplash(size, target) {
  const canvas = createCanvas(size);
  // Effen donkere achtergrond met het logo in het midden.
  roundedRect(canvas, 0, 0, size, size, 0, DARK, 1);
  const logo = createCanvas(Math.round(size * 0.3) * SS);
  drawLogo(logo);
  const image = downsample(logo, SS);
  const offset = Math.round((size - image.size) / 2);
  for (let y = 0; y < image.size; y += 1) {
    for (let x = 0; x < image.size; x += 1) {
      const index = (y * image.size + x) * 4;
      const alpha = image.pixels[index + 3] / 255;
      blend(
        canvas,
        offset + x,
        offset + y,
        [image.pixels[index], image.pixels[index + 1], image.pixels[index + 2]],
        alpha
      );
    }
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, encodePng(downsample(canvas, 1)));
}

async function main() {
  const png1024 = await writeIcon(1024, path.join(ROOT, 'build', 'icon.png'));
  await fs.writeFile(path.join(ROOT, 'assets', 'icon.png'), png1024).catch(async () => {
    await fs.mkdir(path.join(ROOT, 'assets'), { recursive: true });
    await fs.writeFile(path.join(ROOT, 'assets', 'icon.png'), png1024);
  });

  // Android verwacht een variant zonder achtergrond voor het adaptieve icoon.
  await writeIcon(1024, path.join(ROOT, 'assets', 'icon-foreground.png'), { background: false });
  await writeIcon(1024, path.join(ROOT, 'assets', 'icon-background.png'), { background: true });

  const png256 = await writeIcon(256, path.join(ROOT, 'build', 'icon-256.png'));
  await fs.writeFile(path.join(ROOT, 'build', 'icon.ico'), encodeIco(png256, 256));

  await writeSplash(2732, path.join(ROOT, 'assets', 'splash.png'));
  await writeSplash(2732, path.join(ROOT, 'assets', 'splash-dark.png'));

  console.log('Iconen geschreven naar build/ en assets/.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
