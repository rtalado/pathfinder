const { app, BrowserWindow, ipcMain, shell, protocol, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const isDev = !app.isPackaged;
const DIST = path.join(__dirname, '..', 'dist');
const SECRETS_FILE = path.join(app.getPath('userData'), 'secrets.json');

/** Eigen protocol in plaats van file://, anders werkt fetch() naar content/ niet. */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

// ---------------------------------------------------------------------------
// Tokenopslag
// ---------------------------------------------------------------------------

function readSecrets() {
  try {
    return JSON.parse(fs.readFileSync(SECRETS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeSecrets(secrets) {
  fs.mkdirSync(path.dirname(SECRETS_FILE), { recursive: true });
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets), { mode: 0o600 });
}

function getSecret(key) {
  const entry = readSecrets()[key];
  if (!entry) return null;
  if (entry.encrypted) {
    if (!safeStorage.isEncryptionAvailable()) return null;
    try {
      return safeStorage.decryptString(Buffer.from(entry.value, 'base64'));
    } catch {
      return null;
    }
  }
  return entry.value;
}

function setSecret(key, value) {
  const secrets = readSecrets();
  if (value === null || value === undefined || value === '') {
    delete secrets[key];
  } else if (safeStorage.isEncryptionAvailable()) {
    // Windows versleutelt dit met DPAPI, gekoppeld aan je gebruikersaccount.
    secrets[key] = { encrypted: true, value: safeStorage.encryptString(value).toString('base64') };
  } else {
    secrets[key] = { encrypted: false, value };
  }
  writeSecrets(secrets);
}

// ---------------------------------------------------------------------------
// Venster
// ---------------------------------------------------------------------------

let mainWindow = null;

function sendUpdateEvent(event) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:event', event);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: '#0d1117',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Externe links horen in de systeembrowser, niet in het app-venster.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void mainWindow.loadURL('http://localhost:5173');
  } else {
    void mainWindow.loadURL('app://learnpath/index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let target = path.join(DIST, relative);

    // Buiten dist/ mag niets gelezen worden.
    if (!target.startsWith(DIST)) {
      return new Response('Forbidden', { status: 403 });
    }

    // Onbekende paden vallen terug op de app zelf; de router doet de rest.
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      target = path.join(DIST, 'index.html');
    }

    // Bewust via fs en niet via net.fetch: in de geinstalleerde app staan deze
    // bestanden in het asar-archief, en fs kan daar wel doorheen kijken.
    try {
      const body = await fs.promises.readFile(target);
      return new Response(body, {
        headers: {
          'Content-Type': MIME_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
        },
      });
    } catch {
      return new Response(`Niet gevonden: ${relative}`, { status: 404 });
    }
  });
}

// ---------------------------------------------------------------------------
// Automatisch bijwerken
// ---------------------------------------------------------------------------

let autoUpdater = null;

function setupUpdater() {
  if (isDev) return;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => sendUpdateEvent({ type: 'checking' }));
  autoUpdater.on('update-available', (info) =>
    sendUpdateEvent({ type: 'available', info: { version: info.version, notes: String(info.releaseNotes ?? '') } })
  );
  autoUpdater.on('update-not-available', () => sendUpdateEvent({ type: 'none' }));
  autoUpdater.on('download-progress', (progress) =>
    sendUpdateEvent({ type: 'progress', percent: progress.percent })
  );
  autoUpdater.on('update-downloaded', (info) =>
    sendUpdateEvent({ type: 'ready', info: { version: info.version } })
  );
  autoUpdater.on('error', (error) =>
    sendUpdateEvent({ type: 'error', message: error?.message ?? 'Bijwerken mislukt.' })
  );

  // Bij een publieke repository kan de controle meteen. Is de repository prive,
  // dan heeft het pas zin zodra de renderer het token heeft doorgegeven; die komt
  // doorgaans binnen een seconde. Deze poging kost verder niets.
  setTimeout(() => {
    if (!updaterConfigured) autoUpdater.checkForUpdates().catch(() => undefined);
  }, 8_000);
}

let updaterConfigured = false;

/**
 * Alleen het token, niet de repository: waar de updates vandaan komen staat vast
 * in de build (app-update.yml). Dat is belangrijk voor de publieke versie, waar
 * iedereen zijn updates uit dezelfde repo haalt maar zijn gegevens in zijn eigen.
 */
function configureUpdater(token) {
  if (!autoUpdater || !token) return false;
  // electron-updater leest dit bij een prive repository automatisch uit.
  process.env.GH_TOKEN = token;
  updaterConfigured = true;
  return true;
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

ipcMain.handle('secret:get', (_event, key) => getSecret(key));
ipcMain.handle('secret:set', (_event, key, value) => setSecret(key, value));
ipcMain.handle('shell:openExternal', (_event, url) => {
  if (/^https?:/i.test(url)) return shell.openExternal(url);
  return undefined;
});
ipcMain.handle('shell:openPath', (_event, filePath) => shell.openPath(filePath));
ipcMain.handle('shell:showInFolder', (_event, filePath) => shell.showItemInFolder(filePath));
ipcMain.handle('updater:configure', (_event, token) => {
  const ok = configureUpdater(token);
  if (ok) autoUpdater.checkForUpdates().catch(() => undefined);
  return ok;
});
ipcMain.handle('updater:check', async () => {
  if (!autoUpdater) {
    sendUpdateEvent({ type: 'error', message: 'Bijwerken werkt alleen in de geinstalleerde app.' });
    return;
  }
  await autoUpdater.checkForUpdates();
});
ipcMain.handle('updater:install', () => {
  // Stil installeren en daarna zelf weer opstarten. Zonder die twee vlaggen toont
  // NSIS het setup-venster en blijft de app na afloop dicht; dan moet je hem elke
  // keer met de hand door de installatie heen loodsen.
  if (autoUpdater) autoUpdater.quitAndInstall(true, true);
});

// ---------------------------------------------------------------------------
// Levenscyclus
// ---------------------------------------------------------------------------

// Twee vensters zouden twee kopieen van je voortgang bijhouden.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    registerAppProtocol();
    createWindow();
    setupUpdater();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
