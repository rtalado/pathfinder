import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.resolve(ROOT, 'content');
const PKG = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'package.json'), 'utf8'));

const MIME_TYPES: Record<string, string> = {
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

async function copyDirectory(from: string, to: string) {
  await fsp.mkdir(to, { recursive: true });
  const entries = await fsp.readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copyDirectory(source, target);
    else await fsp.copyFile(source, target);
  }
}

/**
 * De leerpaden en documenten staan bewust buiten src/: het zijn gegevens, geen code.
 * De app haalt ze op met fetch(), zodat een nieuwe roadmap later ook zonder nieuwe
 * app-versie binnen kan komen (zie src/lib/content.ts). In dev serveren we de map
 * rechtstreeks, bij een build kopieren we hem naar dist/content.
 */
function contentPlugin(): Plugin {
  return {
    name: 'pathfinder-content',
    configureServer(server) {
      server.middlewares.use('/content', (req, res, next) => {
        const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
        const filePath = path.join(CONTENT_DIR, urlPath);
        // Voorkomt dat een pad met ../ buiten de contentmap kan lezen.
        if (!filePath.startsWith(CONTENT_DIR)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          next();
          return;
        }
        res.setHeader(
          'Content-Type',
          MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
        );
        res.setHeader('Cache-Control', 'no-cache');
        fs.createReadStream(filePath).pipe(res);
      });

      // Wijzigingen in content/ moeten de pagina verversen, net als broncode.
      server.watcher.add(CONTENT_DIR);
      server.watcher.on('change', (file) => {
        if (file.startsWith(CONTENT_DIR)) server.ws.send({ type: 'full-reload' });
      });
    },
    async closeBundle() {
      const target = path.resolve(ROOT, 'dist', 'content');
      await fsp.rm(target, { recursive: true, force: true });
      await copyDirectory(CONTENT_DIR, target);
    },
  };
}

export default defineConfig({
  // Relatieve paden zijn nodig omdat de app ook vanaf een custom protocol
  // (Electron) en vanuit de APK geladen wordt, niet alleen vanaf een webserver.
  base: './',
  plugins: [react(), contentPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(PKG.version),
    // Waar de app zijn updates vandaan haalt. Dat is de repository waaruit de
    // releases komen, en die staat los van de repository waarin iemand zijn eigen
    // voortgang bewaart. Bij de publieke versie zijn dat verschillende repo's.
    __RELEASE_REPO__: JSON.stringify(
      `${PKG.build?.publish?.[0]?.owner ?? ''}/${PKG.build?.publish?.[0]?.repo ?? ''}`
    ),
    __RELEASE_PRIVATE__: JSON.stringify(PKG.build?.publish?.[0]?.private === true),
  },
  resolve: {
    alias: { '@': path.resolve(ROOT, 'src') },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          flow: ['@xyflow/react'],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
});
