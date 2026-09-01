#!/usr/bin/env node
/**
 * Pathfinder-server: bewaart je voortgang en je eigen leerpaden, zodat je
 * apparaten gelijk lopen zonder dat je gegevens het huis uit gaan.
 *
 * Bewust zonder afhankelijkheden: alleen Node 18 of nieuwer. Op een Raspberry Pi
 * start je hem met:
 *
 *   node pathfinder-server.mjs
 *
 * Instellingen via omgevingsvariabelen:
 *
 *   PORT       poort om op te luisteren (standaard 8787)
 *   DATA_DIR   waar de gegevens komen te staan (standaard ./data)
 *   TOKEN      de toegangssleutel; zonder wordt er bij de eerste start een
 *              gemaakt en in DATA_DIR/token.txt gezet
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const VERSION = '1.0.0';
const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = path.resolve(process.env.DATA_DIR ?? './data');

/** Alleen deze documenten bestaan; een naam uit het verzoek wordt nooit een pad. */
const DOCUMENTS = new Set(['progress', 'roadmaps']);

/** Een voortgangsbestand is klein; leerpaden met uitleg kunnen enkele megabytes zijn. */
const MAX_BODY = 16 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Sleutel
// ---------------------------------------------------------------------------

function loadToken() {
  if (process.env.TOKEN) return process.env.TOKEN.trim();

  const tokenFile = path.join(DATA_DIR, 'token.txt');
  if (fs.existsSync(tokenFile)) {
    const existing = fs.readFileSync(tokenFile, 'utf8').trim();
    if (existing) return existing;
  }

  const generated = crypto.randomBytes(24).toString('base64url');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(tokenFile, `${generated}\n`, { mode: 0o600 });
  console.log(`\nNieuwe toegangssleutel aangemaakt:\n\n    ${generated}\n`);
  console.log(`Bewaard in ${tokenFile}. Vul hem in de app in bij Instellingen.\n`);
  return generated;
}

const TOKEN = loadToken();

/** Vergelijking die niet sneller stopt bij het eerste verkeerde teken. */
function tokenMatches(candidate) {
  const a = Buffer.from(candidate ?? '');
  const b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Opslag
// ---------------------------------------------------------------------------

function documentPath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

/** De versie is de vingerafdruk van de inhoud; verandert die, dan is er iemand geweest. */
function versionOf(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

async function readDocument(name) {
  try {
    const text = await fsp.readFile(documentPath(name), 'utf8');
    return { data: text, version: versionOf(text) };
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeDocument(name, text) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const target = documentPath(name);

  // De vorige versie bewaren; een fout aan de kant van de app kost je dan niet alles.
  try {
    await fsp.copyFile(target, `${target}.bak`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  // Eerst schrijven, dan hernoemen: bij stroomuitval blijft het oude bestand heel.
  const temporary = `${target}.tmp`;
  await fsp.writeFile(temporary, text, 'utf8');
  await fsp.rename(temporary, target);

  return { version: versionOf(text) };
}

async function countDocuments() {
  let total = 0;
  for (const name of DOCUMENTS) {
    if (fs.existsSync(documentPath(name))) total += 1;
  }
  return total;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function send(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    // De app draait vanaf een eigen protocol en vanaf https://localhost in de
    // Android-webview. Toegang loopt via de sleutel, niet via de herkomst.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Pathfinder-Device',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Cache-Control': 'no-store',
  });
  response.end(text);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Te groot'), { tooLarge: true }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function logLine(request, message) {
  const device = request.headers['x-pathfinder-device'] ?? 'onbekend apparaat';
  console.log(`${new Date().toISOString()}  ${device}  ${message}`);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

  if (request.method === 'OPTIONS') {
    send(response, 204, {});
    return;
  }

  // De sleutel geldt voor alles, ook voor de gezondheidscontrole. Zo verraadt de
  // server niets aan iemand die willekeurig poorten aan het aftasten is.
  const authorization = request.headers.authorization ?? '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!tokenMatches(provided)) {
    send(response, 401, { error: 'Ongeldige sleutel.' });
    return;
  }

  try {
    if (url.pathname === '/api/v1/health' && request.method === 'GET') {
      send(response, 200, {
        name: 'pathfinder-server',
        version: VERSION,
        documents: await countDocuments(),
      });
      return;
    }

    const match = url.pathname.match(/^\/api\/v1\/doc\/([a-z]+)$/);
    if (match && DOCUMENTS.has(match[1])) {
      const name = match[1];

      if (request.method === 'GET') {
        const document = await readDocument(name);
        if (!document) {
          send(response, 404, { error: 'Bestaat nog niet.' });
          return;
        }
        send(response, 200, document);
        return;
      }

      if (request.method === 'PUT') {
        const body = JSON.parse(await readBody(request));
        const current = await readDocument(name);
        const expected = body.version ?? null;

        // Ging de app uit van een andere versie, dan is er intussen iemand geweest.
        // De app haalt het document dan opnieuw op en voegt nogmaals samen.
        if ((current?.version ?? null) !== expected) {
          logLine(request, `${name}: geweigerd, versie verlopen`);
          send(response, 409, { error: 'Versie verlopen.', version: current?.version ?? null });
          return;
        }

        const written = await writeDocument(name, String(body.data ?? ''));
        logLine(request, `${name}: opgeslagen (${Buffer.byteLength(String(body.data ?? ''))} bytes)`);
        send(response, 200, written);
        return;
      }
    }

    send(response, 404, { error: 'Onbekend adres.' });
  } catch (error) {
    if (error?.tooLarge) {
      send(response, 413, { error: 'Document te groot.' });
      return;
    }
    console.error('Fout:', error);
    send(response, 500, { error: 'Er ging iets mis op de server.' });
  }
});

server.listen(PORT, () => {
  console.log(`Pathfinder-server ${VERSION}`);
  console.log(`Luistert op poort ${PORT}, gegevens in ${DATA_DIR}`);
  console.log('Vul in de app het adres van deze machine in, bijvoorbeeld:');
  console.log(`    http://raspberrypi.local:${PORT}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\nAfsluiten.');
    server.close(() => process.exit(0));
  });
}
