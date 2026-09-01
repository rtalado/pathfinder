import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCopy,
  Download,
  Github,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Server,
  TriangleAlert,
} from 'lucide-react';
import type { SyncBackendKind } from '@/types';
import { Topbar } from '@/components/Topbar';
import { getRepo, getViewer } from '@/lib/github';
import { pingServer } from '@/lib/syncBackend';
import { APP_VERSION, IS_DESKTOP, openExternal, platformKind } from '@/lib/platform';
import { RELEASE_SOURCE, useUpdate } from '@/store/updateStore';
import { clearPulledContent, loadManifest, usingPulledContent } from '@/lib/content';
import { useProgress } from '@/store/progressStore';
import { readToken, useSettings } from '@/store/settingsStore';
import { findTheme } from '@/lib/themes';
import { ThemePicker } from '@/components/ThemePicker';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

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
  const resolvedTheme = useSettings((store) => store.resolvedTheme);
  const crt = useSettings((store) => store.crt);
  const setCrt = useSettings((store) => store.setCrt);
  const hasToken = useSettings((store) => store.hasToken);
  const saveToken = useSettings((store) => store.saveToken);
  const clearToken = useSettings((store) => store.clearToken);

  const syncStatus = useProgress((store) => store.sync);
  const syncNow = useProgress((store) => store.syncNow);
  const startAutoSync = useProgress((store) => store.startAutoSync);
  const progress = useProgress((store) => store.state);
  // Loopt op zodra er content is opgehaald, zodat het overzicht hieronder klopt.
  const loadedContent = useProgress((store) => store.contentVersion);

  const update = useUpdate((store) => store.state);
  const checkUpdate = useUpdate((store) => store.check);
  const installUpdate = useUpdate((store) => store.install);

  const [tokenInput, setTokenInput] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [contentVersion, setContentVersion] = useState('');
  const [fromRepo, setFromRepo] = useState(false);
  const [copied, setCopied] = useState(false);

  const onServer = sync.backend === 'server';
  // De beeldbuisknop heeft alleen zin bij een thema dat de app als terminal tekent.
  const onTerminal = findTheme(resolvedTheme).terminal === true;

  useEffect(() => {
    loadManifest()
      .then((manifest) => {
        setContentVersion(
          `${manifest.contentVersion} · ${manifest.roadmaps.length} leerpaden · ` +
            new Date(manifest.generatedAt).toLocaleDateString('nl-NL')
        );
        setFromRepo(usingPulledContent());
      })
      .catch(() => setContentVersion('onbekend'));
  }, [loadedContent]);

  /** Gooit de opgehaalde content weg en toont weer wat er met de app is meegeleverd. */
  async function resetContent() {
    await clearPulledContent();
    setFromRepo(false);
    useProgress.setState({ contentVersion: useProgress.getState().contentVersion + 1 });
  }

  function chooseBackend(backend: SyncBackendKind) {
    setSync({ backend });
    setCheck(null);
    setTokenInput('');
  }

  async function testConnection() {
    setChecking(true);
    setCheck(null);
    try {
      const token = tokenInput.trim() || (await readToken());
      if (!token) throw new Error('Vul eerst een sleutel in.');

      if (onServer) {
        const info = await pingServer(sync.serverUrl, token);
        setCheck({
          ok: true,
          message: `Verbonden met je server (versie ${info.version}, ${info.documents} document(en)).`,
        });
        return;
      }

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
    void navigator.clipboard
      .writeText(JSON.stringify(progress, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => undefined);
  }

  return (
    <>
      <Topbar
        title="Instellingen"
        subtitle={`versie ${APP_VERSION} · ${PLATFORM_LABELS[platformKind()]}`}
      />
      <div className="content">
        <div className="page stack" style={{ gap: 20 }}>
          {/* ---------- Sync ---------- */}
          <section className="card stack">
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Synchronisatie</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Je voortgang en je eigen leerpaden worden bewaard op een plek die jij kiest. Zet je
                op je telefoon een onderwerp op afgerond, dan staat het bij de volgende sync ook op
                je pc.
              </p>
            </div>

            <div className="backendpick">
              <button
                type="button"
                className={`backendpick__option${!onServer ? ' backendpick__option--active' : ''}`}
                onClick={() => chooseBackend('github')}
              >
                <Github size={18} />
                <span className="backendpick__title">Prive GitHub-repository</span>
                <span className="backendpick__note">
                  Geen server nodig. Werkt overal waar je internet hebt.
                </span>
              </button>
              <button
                type="button"
                className={`backendpick__option${onServer ? ' backendpick__option--active' : ''}`}
                onClick={() => chooseBackend('server')}
              >
                <Server size={18} />
                <span className="backendpick__title">Eigen server</span>
                <span className="backendpick__note">
                  Bijvoorbeeld een Raspberry Pi. Je gegevens verlaten je huis niet.
                </span>
              </button>
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
              <span>Synchroniseren aan</span>
            </label>

            {onServer ? (
              <div className="field" style={{ margin: 0 }}>
                <span className="field__label">Adres van je server</span>
                <input
                  className="input"
                  value={sync.serverUrl}
                  placeholder="http://raspberrypi.local:8787"
                  onChange={(event) => setSync({ serverUrl: event.target.value })}
                />
                <span className="field__hint">
                  Het adres waarop je de Pathfinder-server draait. Een IP-adres mag ook, bijvoorbeeld
                  http://192.168.1.20:8787.
                </span>
              </div>
            ) : (
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
            )}

            <div className="field" style={{ margin: 0 }}>
              <span className="field__label">
                {onServer ? 'Toegangssleutel' : 'Persoonlijk toegangstoken'}
              </span>
              <div className="row">
                <input
                  className="input"
                  type="password"
                  value={tokenInput}
                  placeholder={
                    hasToken
                      ? 'Er is een sleutel opgeslagen'
                      : onServer
                        ? 'de sleutel uit je server'
                        : 'github_pat_...'
                  }
                  onChange={(event) => setTokenInput(event.target.value)}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={!tokenInput.trim()}
                  onClick={async () => {
                    await saveToken(tokenInput);
                    setTokenInput('');
                    setCheck({ ok: true, message: 'Sleutel opgeslagen.' });
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
                {onServer ? (
                  <>
                    De server toont bij de eerste start een sleutel. Die staat ook in het bestand
                    token.txt naast zijn gegevens.
                  </>
                ) : (
                  <>
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
                  </>
                )}
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
                {!onServer && (
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
                )}
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
                {!onServer && (
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={sync.pullContent}
                      onChange={(event) => setSync({ pullContent: event.target.checked })}
                    />
                    <span>Meegeleverde leerpaden ook bijwerken vanuit de repo</span>
                  </label>
                )}
              </div>
            </details>
          </section>

          {/* ---------- Weergave ---------- */}
          <section className="card stack">
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Thema</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                Geldt voor de hele app en blijft op dit apparaat staan; hij gaat niet mee in de
                synchronisatie. De terminalversie kent dezelfde thema's.
              </p>
            </div>
            <ThemePicker value={theme} onChange={setTheme} />

            {onTerminal && (
              <label className="switch" style={{ alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={crt}
                  onChange={(event) => setCrt(event.target.checked)}
                />
                <span>
                  <span style={{ fontWeight: 600 }}>Beeldbuis</span>
                  <span className="field__hint" style={{ display: 'block' }}>
                    De scanlijnen, de donkere rand en het lichte flakkeren van een oude monitor.
                    Uit gezet blijft de rest van de terminalvorm staan en leest langere tekst
                    rustiger.
                  </span>
                </span>
              </label>
            )}
          </section>

          {/* ---------- Bijwerken ---------- */}
          <section className="card stack">
            <div>
              <h2 style={{ margin: '0 0 4px', fontSize: 16 }}>Bijwerken</h2>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                {platformKind() === 'desktop'
                  ? 'De app controleert bij het opstarten op een nieuwe versie en haalt die op de achtergrond op. Klik daarna op herstarten: hij werkt zichzelf stil bij en komt terug.'
                  : 'De Android-app kijkt of er een nieuwere APK klaarstaat. Installeren doe je zelf; Android vraagt daarbij eenmalig om toestemming.'}
              </p>
            </div>

            <div className="row">
              <button
                type="button"
                className="btn"
                onClick={() => void checkUpdate()}
                disabled={update.kind === 'checking' || update.kind === 'downloading'}
              >
                {update.kind === 'checking' ? <span className="spinner" /> : <RefreshCw size={14} />}
                Controleren
              </button>
              {update.kind === 'ready' && (
                <button type="button" className="btn btn--primary" onClick={installUpdate}>
                  <RotateCw size={14} /> Herstarten en bijwerken
                </button>
              )}
              {update.kind === 'available' && !IS_DESKTOP && (
                <button type="button" className="btn btn--primary" onClick={installUpdate}>
                  <Download size={14} /> APK ophalen
                </button>
              )}
            </div>

            {update.kind === 'none' && (
              <div className="banner banner--ok">Je hebt de nieuwste versie ({APP_VERSION}).</div>
            )}
            {update.kind === 'norelease' && (
              <div className="banner banner--warn">
                <TriangleAlert size={15} />
                <span>
                  In {RELEASE_SOURCE} staat nog geen enkele release. Zolang daar niets staat, kan de
                  app niets ophalen. Publiceer er een release met een versietag.
                </span>
              </div>
            )}
            {update.kind === 'available' && (
              <div className="banner">
                Versie {update.version} staat klaar
                {IS_DESKTOP ? ' en wordt op de achtergrond opgehaald.' : '.'}
              </div>
            )}
            {update.kind === 'downloading' && (
              <>
                <div className="banner">Ophalen… {update.percent}%</div>
                <div className="progress">
                  <div className="progress__bar" style={{ width: `${update.percent}%` }} />
                </div>
              </>
            )}
            {update.kind === 'ready' && (
              <div className="banner banner--ok">
                Versie {update.version} is opgehaald. Klik op herstarten; de app sluit, werkt zichzelf
                stil bij en start opnieuw op. Je hoeft geen installatiebestand te draaien.
              </div>
            )}
            {update.kind === 'error' && (
              <div className="banner banner--error">{update.message}</div>
            )}

            <p className="dim" style={{ margin: 0, fontSize: 12 }}>
              Updates komen uit {RELEASE_SOURCE}. Content: {contentVersion} (
              {fromRepo ? 'opgehaald uit je repository' : 'meegeleverd met de app'})
            </p>
            {fromRepo && (
              <div className="row">
                <button type="button" className="btn" onClick={() => void resetContent()}>
                  <RotateCcw size={14} /> Terug naar de meegeleverde leerpaden
                </button>
              </div>
            )}
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
