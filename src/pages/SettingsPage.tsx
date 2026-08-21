import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCopy,
  Download,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { Topbar } from '@/components/Topbar';
import { getRepo, getViewer } from '@/lib/github';
import { APP_VERSION, openExternal, platformKind } from '@/lib/platform';
import { useUpdater } from '@/lib/updates';
import { loadManifest } from '@/lib/content';
import { useProgress } from '@/store/progressStore';
import { readToken, useSettings, type ThemeChoice } from '@/store/settingsStore';

const TOKEN_URL =
  'https://github.com/settings/personal-access-tokens/new';

const PLATFORM_LABELS: Record<string, string> = {
  desktop: 'Windows-app',
  android: 'Android-app',
  web: 'browser',
};

export function SettingsPage() {
  const sync = useSettings((store) => store.sync);
  const setSync = useSettings((store) => store.setSync);
  const theme = useSettings((store) => store.theme);
  const setTheme = useSettings((store) => store.setTheme);
  const hasToken = useSettings((store) => store.hasToken);
  const saveToken = useSettings((store) => store.saveToken);
  const clearToken = useSettings((store) => store.clearToken);

  const syncStatus = useProgress((store) => store.sync);
  const syncNow = useProgress((store) => store.syncNow);
  const startAutoSync = useProgress((store) => store.startAutoSync);
  const progress = useProgress((store) => store.state);

  const updater = useUpdater();

  const [tokenInput, setTokenInput] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [contentVersion, setContentVersion] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadManifest()
      .then((manifest) =>
        setContentVersion(
          `${manifest.contentVersion} · ${manifest.roadmaps.length} leerpaden · ` +
            new Date(manifest.generatedAt).toLocaleDateString('nl-NL')
        )
      )
      .catch(() => setContentVersion('onbekend'));
  }, []);

  async function testConnection() {
    setChecking(true);
    setCheck(null);
    try {
      const token = tokenInput.trim() || (await readToken());
      if (!token) throw new Error('Vul eerst een token in.');
      const viewer = await getViewer(token);
      const owner = sync.owner.trim() || viewer.login;
      if (!sync.owner.trim()) setSync({ owner });
      const repo = await getRepo(token, owner, sync.repo.trim());

      if (!repo.permissions?.push) {
        throw new Error(`Het token mag niet schrijven in ${repo.fullName}.`);
      }
      setCheck({
        ok: true,
        message:
          `Verbonden als ${viewer.login} met ${repo.fullName}` +
          (repo.private ? ' (prive).' : '. Let op: deze repo is publiek.'),
      });
    } catch (error) {
      setCheck({
        ok: false,
        message: error instanceof Error ? error.message : 'Verbinden mislukt.',
      });
    } finally {
      setChecking(false);
    }
  }

  function exportProgress() {
    const text = JSON.stringify(progress, null, 2);
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => undefined);
  }

  return (
    <>
      <Topbar title="Instellingen" subtitle={`versie ${APP_VERSION} · ${PLATFORM_LABELS[platformKind()]}`} />
      <div className="content">
        <div className="page stack" style={{ gap: 20 }}>
          {/* ---------- Sync ---------- */}
          <section className="card stack">
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Synchronisatie</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Je voortgang wordt als JSON-bestand in je eigen prive repository bewaard. Zet je op
                je telefoon een onderwerp op afgerond, dan staat het bij de volgende sync ook op je
                pc. Er komt geen andere dienst aan te pas.
              </p>
            </div>

            <label className="switch">
              <input
                type="checkbox"
                checked={sync.enabled}
                onChange={(event) => {
                  setSync({ enabled: event.target.checked });
                  if (event.target.checked) {
                    void syncNow();
                    startAutoSync();
                  }
                }}
              />
              <span>Synchroniseren via GitHub</span>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field" style={{ margin: 0 }}>
                <span className="field__label">GitHub-gebruikersnaam</span>
                <input
                  className="input"
                  value={sync.owner}
                  placeholder="je GitHub-gebruikersnaam"
                  onChange={(event) => setSync({ owner: event.target.value })}
                />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <span className="field__label">Repository</span>
                <input
                  className="input"
                  value={sync.repo}
                  onChange={(event) => setSync({ repo: event.target.value })}
                />
              </div>
            </div>

            <div className="field" style={{ margin: 0 }}>
              <span className="field__label">Persoonlijk toegangstoken</span>
              <div className="row">
                <input
                  className="input"
                  type="password"
                  value={tokenInput}
                  placeholder={hasToken ? 'Er is een token opgeslagen' : 'github_pat_...'}
                  onChange={(event) => setTokenInput(event.target.value)}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={!tokenInput.trim()}
                  onClick={async () => {
                    await saveToken(tokenInput);
                    setTokenInput('');
                    setCheck({ ok: true, message: 'Token opgeslagen.' });
                  }}
                >
                  Opslaan
                </button>
                {hasToken && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void clearToken()}
                  >
                    Wissen
                  </button>
                )}
              </div>
              <span className="field__hint">
                Maak een fine-grained token met alleen toegang tot deze ene repository en de
                rechten Contents: read and write.{' '}
                <a
                  href={TOKEN_URL}
                  onClick={(event) => {
                    event.preventDefault();
                    openExternal(TOKEN_URL);
                  }}
                >
                  Token aanmaken
                </a>
              </span>
            </div>

            <div className="row">
              <button type="button" className="btn" onClick={testConnection} disabled={checking}>
                {checking ? <span className="spinner" /> : <CheckCircle2 size={14} />} Verbinding
                testen
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void syncNow()}
                disabled={!sync.enabled || syncStatus.phase === 'syncing'}
              >
                <RefreshCw size={14} /> Nu synchroniseren
              </button>
            </div>

            {check && (
              <div className={`banner ${check.ok ? 'banner--ok' : 'banner--error'}`}>
                {check.ok ? <CheckCircle2 size={15} /> : <TriangleAlert size={15} />}
                <span>{check.message}</span>
              </div>
            )}

            {sync.enabled && syncStatus.message && (
              <div className={`banner ${syncStatus.phase === 'error' ? 'banner--error' : ''}`}>
                {syncStatus.message}
              </div>
            )}

            <details>
              <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
                Geavanceerd
              </summary>
              <div style={{ paddingTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field">
                    <span className="field__label">Branch</span>
                    <input
                      className="input"
                      value={sync.branch}
                      onChange={(event) => setSync({ branch: event.target.value })}
                    />
                  </div>
                  <div className="field">
                    <span className="field__label">Pad in de repo</span>
                    <input
                      className="input"
                      value={sync.path}
                      onChange={(event) => setSync({ path: event.target.value })}
                    />
                  </div>
                </div>
                <div className="field">
                  <span className="field__label">Automatisch synchroniseren (minuten)</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={120}
                    value={sync.autoSyncMinutes}
                    onChange={(event) => {
                      setSync({ autoSyncMinutes: Number(event.target.value) || 10 });
                      startAutoSync();
                    }}
                  />
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={sync.pullContent}
                    onChange={(event) => setSync({ pullContent: event.target.checked })}
                  />
                  <span>Nieuwe leerpaden ook meteen ophalen uit de repo</span>
                </label>
              </div>
            </details>
          </section>

          {/* ---------- Weergave ---------- */}
          <section className="card stack">
            <h2 style={{ margin: 0, fontSize: 16 }}>Weergave</h2>
            <div className="field" style={{ margin: 0, maxWidth: 260 }}>
              <span className="field__label">Thema</span>
              <select
                className="select"
                value={theme}
                onChange={(event) => setTheme(event.target.value as ThemeChoice)}
              >
                <option value="dark">Donker</option>
                <option value="light">Licht</option>
                <option value="system">Volg het systeem</option>
              </select>
            </div>
          </section>

          {/* ---------- Bijwerken ---------- */}
          <section className="card stack">
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Bijwerken</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {platformKind() === 'desktop'
                  ? 'De Windows-app controleert bij het opstarten op nieuwe versies en installeert die bij het afsluiten.'
                  : 'De Android-app kijkt of er een nieuwere APK klaarstaat. Installeren doe je zelf; Android vraagt daarbij eenmalig om toestemming.'}
              </p>
            </div>

            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => void updater.check()}
                disabled={updater.state.kind === 'checking'}
              >
                {updater.state.kind === 'checking' ? <span className="spinner" /> : <RefreshCw size={14} />}
                Controleren
              </button>
              {(updater.state.kind === 'available' || updater.state.kind === 'ready') && (
                <button type="button" className="btn btn--primary" onClick={updater.install}>
                  <Download size={14} />
                  {updater.state.kind === 'ready' ? 'Nu installeren' : 'Ophalen'}
                </button>
              )}
            </div>

            {updater.state.kind === 'none' && (
              <div className="banner banner--ok">Je hebt de nieuwste versie.</div>
            )}
            {updater.state.kind === 'available' && (
              <div className="banner">Versie {updater.state.version} staat klaar.</div>
            )}
            {updater.state.kind === 'downloading' && (
              <div className="banner">Downloaden… {updater.state.percent}%</div>
            )}
            {updater.state.kind === 'ready' && (
              <div className="banner banner--ok">
                Versie {updater.state.version} is gedownload en wordt geinstalleerd zodra je de app
                afsluit.
              </div>
            )}
            {updater.state.kind === 'error' && (
              <div className="banner banner--error">{updater.state.message}</div>
            )}

            <p className="dim" style={{ margin: 0, fontSize: 12 }}>
              Content: {contentVersion}
            </p>
          </section>

          {/* ---------- Gegevens ---------- */}
          <section className="card stack">
            <h2 style={{ margin: 0, fontSize: 16 }}>Gegevens</h2>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {Object.keys(progress.nodes).length} onderwerpen, {Object.keys(progress.notes).length}{' '}
              notities en {Object.keys(progress.cards).length} kaarten staan op dit apparaat.
            </p>
            <div className="row">
              <button type="button" className="btn" onClick={exportProgress}>
                <ClipboardCopy size={14} /> {copied ? 'Gekopieerd' : 'Voortgang kopieren'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
