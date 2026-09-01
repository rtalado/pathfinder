/**
 * De terminalversie van Pathfinder.
 *
 * Dezelfde leerpaden, dezelfde voortgang en dezelfde synchronisatie als de
 * grafische app, maar dan met het toetsenbord. Elk scherm levert een lijst regels
 * op; screen.mjs zet die in één keer op de terminal.
 */
import { spawn } from 'node:child_process';
import { pad, truncate, width as visibleWidth, wrap } from './ansi.mjs';
import { createScreen, bar, scrollView, spread } from './screen.mjs';
import { glyphs, plural } from './glyphs.mjs';
import { findTheme, palette, THEMES } from './theme.mjs';
import { createStore, DEFAULT_SYNC } from './store.mjs';
import { contentDir, paths } from './paths.mjs';
import {
  collectCards,
  listRoadmaps,
  loadCollection,
  loadDocument,
  loadManifest,
  loadNodeBody,
  loadRoadmap,
  outline,
  roadmapProgress,
} from './content.mjs';
import { renderMarkdown } from './markdown.mjs';
import { STATUS_LABELS, computeStreak, describeInterval, isDue } from './progress.mjs';
import { backendFor, pingServer, pullContent, syncLibrary, syncProgress, SyncError } from './sync.mjs';

/** Het vakje voor de status van een onderwerp. */
const STATUS_MARK = {
  todo: glyphs.todo,
  doing: glyphs.doing,
  done: glyphs.done,
  skipped: glyphs.skipped,
};

function statusColor(status, p) {
  if (status === 'done') return p.done;
  if (status === 'doing') return p.doing;
  if (status === 'skipped') return p.skipped;
  return p.muted;
}

/** Opent een link in de browser van het besturingssysteem. */
function openExternal(url) {
  const command =
    process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

/** Een bron met een zoekopdracht in plaats van een link krijgt er zelf een. */
function resourceUrl(resource) {
  if (resource.url) return resource.url;
  if (!resource.query) return null;
  const query = encodeURIComponent(resource.query);
  return resource.searchOn === 'youtube'
    ? `https://www.youtube.com/results?search_query=${query}`
    : `https://duckduckgo.com/?q=${query}`;
}

export function createApp(options = {}) {
  const store = createStore();
  const screen = createScreen();

  let manifest = loadManifest();
  let theme = palette(findTheme(options.theme ?? store.settings.theme));

  const state = {
    view: 'dashboard',
    /** Waar we vandaan kwamen, zodat escape altijd een stap terug is. */
    stack: [],
    status: null,
    busy: null,

    roadmapIndex: 0,
    entry: null,
    roadmap: null,
    rows: [],
    rowIndex: 0,
    rowOffset: 0,

    node: null,
    nodeScroll: 0,
    resourceIndex: 0,
    nodePane: 'tekst',

    queue: [],
    queueIndex: 0,
    revealed: false,

    collectionIndex: 0,
    documentIndex: 0,
    collection: null,
    document: null,
    documentScroll: 0,

    settingsIndex: 0,
    input: null,
    help: false,
    helpScroll: 0,
  };

  const say = (text, tone = 'info') => {
    state.status = { text, tone };
  };

  // -------------------------------------------------------------------------
  // Chroom: kop, voetregel en de lege ruimte ertussen
  // -------------------------------------------------------------------------

  function chrome(title, subtitle, body, hints) {
    const columns = screen.width;
    const lines = [];

    const left = `${theme.bold}${theme.accent} Pathfinder ${theme.reset}${theme.muted}${title}`;
    const right = `${syncLabel()} `;
    lines.push(`${theme.barBg}${spread(left, right, columns, theme)}`);
    lines.push(`${theme.border}${glyphs.rule.repeat(columns)}${theme.reset}`);

    const height = screen.height;
    // Kop (2), voet (2) en eventueel een subtitel en een melding.
    const chromeRows = 4 + (subtitle ? 1 : 0) + (state.status || state.busy ? 1 : 0);
    const room = Math.max(1, height - chromeRows);

    if (subtitle) lines.push(` ${theme.muted}${truncate(subtitle, columns - 2)}${theme.reset}`);

    const content = body(room, columns);
    for (let index = 0; index < room; index += 1) lines.push(content[index] ?? '');

    if (state.busy) {
      lines.push(` ${theme.doing}${state.busy}${theme.reset}`);
    } else if (state.status) {
      const color =
        state.status.tone === 'error'
          ? theme.danger
          : state.status.tone === 'ok'
            ? theme.done
            : theme.muted;
      lines.push(` ${color}${truncate(state.status.text, columns - 2)}${theme.reset}`);
    }

    lines.push(`${theme.border}${glyphs.rule.repeat(columns)}${theme.reset}`);
    lines.push(`${theme.barBg} ${theme.muted}${truncate(hints, columns - 2)}${theme.reset}`);
    return lines;
  }

  function syncLabel() {
    const sync = store.sync;
    if (!sync.enabled) return `${theme.faint}niet gekoppeld`;
    const where = sync.backend === 'github' ? `${sync.owner}/${sync.repo}` : sync.serverUrl;
    return `${theme.muted}${truncate(where || 'ingesteld', 32)}`;
  }

  /** Een lijst met een cursor erin, die meeschuift met de selectie. */
  function listView(items, index, offsetKey, room, columns) {
    let offset = state[offsetKey] ?? 0;
    if (index < offset) offset = index;
    if (index >= offset + room) offset = index - room + 1;
    state[offsetKey] = Math.max(0, offset);

    return items.slice(state[offsetKey], state[offsetKey] + room).map((item, position) => {
      const active = state[offsetKey] + position === index;
      const line = truncate(item, columns - 2);
      const filler = ' '.repeat(Math.max(0, columns - 2 - visibleWidth(line)));
      return active
        ? `${theme.selectionBg}${theme.accent}${glyphs.cursor}${theme.reset}${theme.selectionBg}${line}${filler} ${theme.reset}`
        : ` ${line}`;
    });
  }

  // -------------------------------------------------------------------------
  // Overzicht
  // -------------------------------------------------------------------------

  function roadmapEntries() {
    return listRoadmaps(manifest, store.library);
  }

  function dueCards() {
    const now = Date.now();
    const due = [];
    for (const entry of roadmapEntries()) {
      let roadmap;
      try {
        roadmap = loadRoadmap(entry);
      } catch {
        continue;
      }
      for (const item of collectCards(roadmap)) {
        if (isDue(store.cardOf(item.roadmapId, item.nodeId, item.card.id), now)) due.push(item);
      }
    }
    return due;
  }

  function viewDashboard() {
    const entries = roadmapEntries();
    state.roadmapIndex = Math.min(state.roadmapIndex, Math.max(0, entries.length - 1));

    return chrome('overzicht', null, (room, columns) => {
      const lines = [];
      const streak = computeStreak(store.progress.activity);

      let done = 0;
      let total = 0;
      for (const entry of entries) {
        try {
          const progress = roadmapProgress(loadRoadmap(entry), store);
          done += progress.done;
          total += progress.total;
        } catch {
          // Een leerpad dat niet te lezen is, telt gewoon niet mee.
        }
      }

      const percent = total ? Math.round((done / total) * 100) : 0;
      const cijfers = [
        `${theme.bold}${theme.text}${done}${theme.reset}${theme.muted} afgerond`,
        `${theme.bold}${theme.text}${percent}%${theme.reset}${theme.muted} van alles`,
        `${theme.bold}${theme.text}${streak.current}${theme.reset}${theme.muted} dagen op rij`,
        `${theme.bold}${theme.text}${dueCards().length}${theme.reset}${theme.muted} te overhoren`,
      ];
      lines.push('');
      lines.push(` ${cijfers.join(`${theme.reset}${theme.border}  ${glyphs.divider}  `)}${theme.reset}`);
      lines.push('');
      lines.push(` ${theme.faint}LEERPADEN${theme.reset}`);

      if (!entries.length) {
        lines.push('');
        lines.push(` ${theme.muted}Nog geen leerpaden gevonden in ${contentDir()}${theme.reset}`);
        return lines;
      }

      const width = Math.max(16, Math.min(28, columns - 46));
      const items = entries.map((entry) => {
        let progress = { done: 0, total: 0, percent: 0 };
        try {
          progress = roadmapProgress(loadRoadmap(entry), store);
        } catch {
          // Zie boven.
        }
        const title = pad(truncate(entry.title, 34), 34);
        const marker = entry.source === 'user' ? `${theme.accent}${glyphs.dot}` : ' ';
        const count = `${progress.done}/${progress.total}`;
        return `${marker}${theme.reset}${theme.text}${title}${theme.reset} ${bar(progress.percent, width, theme)} ${theme.muted}${pad(count, 7)}${Math.round(progress.percent * 100)}%${theme.reset}`;
      });

      return [...lines, ...listView(items, state.roadmapIndex, 'roadmapOffset', room - lines.length, columns)];
    }, 'enter openen  o overhoren  d documenten  i instellingen  s synchroniseren  ? hulp  q stoppen');
  }

  // -------------------------------------------------------------------------
  // Een leerpad
  // -------------------------------------------------------------------------

  function openRoadmap(entry) {
    try {
      state.roadmap = loadRoadmap(entry);
    } catch (error) {
      say(`Dit leerpad is niet te lezen: ${error.message}`, 'error');
      return;
    }
    state.entry = entry;
    state.rows = outline(state.roadmap);
    state.rowIndex = 0;
    state.rowOffset = 0;
    state.stack.push('dashboard');
    state.view = 'roadmap';
  }

  function viewRoadmap() {
    const roadmap = state.roadmap;
    const progress = roadmapProgress(roadmap, store);
    const subtitle = `${progress.done} van ${progress.total} afgerond  ${bar(progress.percent, 20, theme)} ${Math.round(progress.percent * 100)}%`;

    return chrome(
      truncate(roadmap.title, 40),
      subtitle,
      (room, columns) => {
        const items = state.rows.map(({ node, depth }) => {
          const status = store.statusOf(roadmap.id, node.id);
          const box =
            node.kind === 'label'
              ? `${theme.faint}  ${theme.reset}`
              : `${statusColor(status, theme)}[${STATUS_MARK[status]}]${theme.reset}`;
          const indent = '  '.repeat(depth);
          const emphasis = node.kind === 'milestone' ? `${theme.bold}${theme.text}` : theme.text;
          const extras = [];
          if (node.optional) extras.push('optioneel');
          if (node.flashcards?.length) extras.push(plural(node.flashcards.length, 'kaart', 'kaarten'));
          if (store.noteOf(roadmap.id, node.id)) extras.push('notitie');
          const tail = extras.length ? ` ${theme.faint}(${extras.join(', ')})` : '';
          return `${box} ${indent}${emphasis}${node.title}${theme.reset}${tail}${theme.reset}`;
        });
        return listView(items, state.rowIndex, 'rowOffset', room, columns);
      },
      'enter lezen  spatie status  n notitie  o overhoren  esc terug'
    );
  }

  // -------------------------------------------------------------------------
  // Een onderwerp lezen
  // -------------------------------------------------------------------------

  function openNode(node) {
    state.node = node;
    state.nodeScroll = 0;
    state.resourceIndex = 0;
    state.stack.push('roadmap');
    state.view = 'node';
  }

  /** De hele pagina van een onderwerp als regels: tekst, bronnen en je notitie. */
  function nodeLines(columns) {
    const roadmap = state.roadmap;
    const node = state.node;
    const width = columns - 4;
    const lines = [];

    if (node.summary) {
      for (const line of wrap(node.summary, width)) {
        lines.push(`  ${theme.muted}${line}${theme.reset}`);
      }
      lines.push('');
    }

    const body = loadNodeBody(roadmap.id, node);
    if (body.trim()) {
      lines.push(...renderMarkdown(body, width, theme).map((line) => `  ${line}`));
    } else if (!node.summary) {
      lines.push(`  ${theme.faint}Bij dit onderwerp staat nog geen tekst.${theme.reset}`);
    }

    const resources = node.resources ?? [];
    if (resources.length) {
      lines.push('');
      lines.push(`  ${theme.faint}BRONNEN${theme.reset}`);
      resources.forEach((resource, index) => {
        const id = resource.id ?? resource.url ?? resource.title;
        const read = store.isResourceRead(roadmap.id, node.id, id);
        const cursor = index === state.resourceIndex ? `${theme.accent}${glyphs.cursor}` : ' ';
        const box = read ? `${theme.done}[x]` : `${theme.muted}[ ]`;
        const minutes = resource.minutes ? ` ${theme.faint}${resource.minutes} min` : '';
        const kind = `${theme.faint}${resource.type}`;
        lines.push(
          `  ${cursor}${theme.reset} ${box}${theme.reset} ${theme.text}${resource.title}${theme.reset} ${kind}${minutes}${theme.reset}`
        );
        if (resource.note) {
          for (const line of wrap(resource.note, width - 8)) {
            lines.push(`        ${theme.faint}${line}${theme.reset}`);
          }
        }
      });
    }

    const cards = node.flashcards ?? [];
    if (cards.length) {
      lines.push('');
      lines.push(
        `  ${theme.faint}OVERHOREN${theme.reset}  ${theme.muted}${plural(cards.length, 'kaart', 'kaarten')}, o start ze${theme.reset}`
      );
    }

    const note = store.noteOf(roadmap.id, node.id);
    lines.push('');
    lines.push(`  ${theme.faint}NOTITIE${theme.reset}`);
    if (note) {
      for (const line of wrap(note, width)) lines.push(`  ${theme.text}${line}${theme.reset}`);
    } else {
      lines.push(`  ${theme.faint}Nog niets; druk op n.${theme.reset}`);
    }

    return lines;
  }

  function viewNode() {
    const roadmap = state.roadmap;
    const node = state.node;
    const status = store.statusOf(roadmap.id, node.id);

    return chrome(
      truncate(node.title, 40),
      `${statusColor(status, theme)}${STATUS_LABELS[status]}${theme.reset}${theme.muted}  ${node.kind}${node.optional ? ', optioneel' : ''}`,
      (room, columns) => {
        const lines = nodeLines(columns);
        const maximum = Math.max(0, lines.length - room);
        state.nodeScroll = Math.max(0, Math.min(state.nodeScroll, maximum));
        return scrollView(lines, state.nodeScroll, room, columns, theme);
      },
      'spatie status  n notitie  tab bron  enter bron openen  j/k schuiven  esc terug'
    );
  }

  // -------------------------------------------------------------------------
  // Overhoren
  // -------------------------------------------------------------------------

  function startReview(scope) {
    const cards =
      scope === 'roadmap' && state.roadmap
        ? collectCards(state.roadmap).filter((item) =>
            isDue(store.cardOf(item.roadmapId, item.nodeId, item.card.id))
          )
        : dueCards();

    if (!cards.length) {
      say('Er staat op dit moment niets klaar om te overhoren.', 'ok');
      return;
    }
    state.queue = cards;
    state.queueIndex = 0;
    state.revealed = false;
    state.stack.push(state.view);
    state.view = 'review';
  }

  function viewReview() {
    const item = state.queue[state.queueIndex];
    const remaining = state.queue.length - state.queueIndex;

    return chrome(
      'overhoren',
      `${plural(remaining, 'kaart', 'kaarten')} te gaan  ${theme.faint}${item.nodeTitle}`,
      (room, columns) => {
        const width = Math.min(72, columns - 8);
        const lines = ['', ''];
        for (const line of wrap(item.card.question, width)) {
          lines.push(`  ${theme.bold}${theme.text}${line}${theme.reset}`);
        }
        if (item.card.hint && !state.revealed) {
          lines.push('');
          for (const line of wrap(`Hint: ${item.card.hint}`, width)) {
            lines.push(`  ${theme.faint}${line}${theme.reset}`);
          }
        }
        lines.push('');
        lines.push(`  ${theme.border}${'-'.repeat(Math.min(width, columns - 4))}${theme.reset}`);
        lines.push('');
        if (state.revealed) {
          for (const line of wrap(item.card.answer, width)) {
            lines.push(`  ${theme.text}${line}${theme.reset}`);
          }
        } else {
          lines.push(`  ${theme.faint}Druk op spatie voor het antwoord.${theme.reset}`);
        }
        return lines.slice(0, room);
      },
      state.revealed
        ? '1 opnieuw  2 lastig  3 wist ik  esc stoppen'
        : 'spatie antwoord  esc stoppen'
    );
  }

  // -------------------------------------------------------------------------
  // Documenten
  // -------------------------------------------------------------------------

  function viewCollections() {
    const collections = manifest.collections ?? [];
    return chrome(
      'documenten',
      collections.length ? null : 'Er zijn nog geen documenten omgezet.',
      (room, columns) => {
        if (!collections.length) {
          return [
            '',
            `  ${theme.muted}Zet Word- en Excelbestanden om met het script convert-docs,${theme.reset}`,
            `  ${theme.muted}dan verschijnen ze hier en in de grafische app.${theme.reset}`,
          ];
        }
        const items = collections.map(
          (collection) =>
            `${theme.text}${pad(truncate(collection.title, 40), 42)}${theme.reset}${theme.muted}${plural(collection.documentCount, 'document', 'documenten')}${theme.reset}`
        );
        return listView(items, state.collectionIndex, 'collectionOffset', room, columns);
      },
      'enter openen  esc terug'
    );
  }

  function viewDocuments() {
    const documents = state.collection?.documents ?? [];
    return chrome(
      truncate(state.collection?.title ?? 'documenten', 40),
      plural(documents.length, 'document', 'documenten'),
      (room, columns) => {
        const items = documents.map((document) => {
          const code = document.code ? `${theme.faint}${pad(document.code, 8)}` : '        ';
          const version = document.version ? ` ${theme.faint}v${document.version}` : '';
          return `${code}${theme.reset}${theme.text}${truncate(document.title, columns - 24)}${theme.reset}${version}${theme.reset}`;
        });
        return listView(items, state.documentIndex, 'documentOffset', room, columns);
      },
      'enter lezen  esc terug'
    );
  }

  function viewDocument() {
    const { meta, body } = state.document;
    return chrome(
      truncate(meta.title ?? 'document', 40),
      [meta.code, meta.version && `v${meta.version}`].filter(Boolean).join('  ') || null,
      (room, columns) => {
        const lines = renderMarkdown(body, columns - 4, theme).map((line) => `  ${line}`);
        const maximum = Math.max(0, lines.length - room);
        state.documentScroll = Math.max(0, Math.min(state.documentScroll, maximum));
        return scrollView(lines, state.documentScroll, room, columns, theme);
      },
      'j/k schuiven  pgup/pgdn bladeren  esc terug'
    );
  }

  // -------------------------------------------------------------------------
  // Instellingen
  // -------------------------------------------------------------------------

  /** De instellingen als een lijst, zodat er maar één manier van bedienen is. */
  function settingsItems() {
    const sync = store.sync;
    const items = [
      { kind: 'kop', label: 'WEERGAVE' },
      {
        kind: 'thema',
        label: 'Thema',
        value: () => `${findTheme(theme.id).name}${theme.reset}${theme.faint}  (links/rechts wisselt)`,
      },
      { kind: 'kop', label: 'SYNCHRONISATIE' },
      {
        kind: 'schakelaar',
        label: 'Synchroniseren',
        value: () => (sync.enabled ? 'aan' : 'uit'),
        toggle: () => store.setSync({ enabled: !sync.enabled }),
      },
      {
        kind: 'keuze',
        label: 'Opslag',
        value: () => (sync.backend === 'github' ? 'prive repository op GitHub' : 'eigen server'),
        toggle: () => store.setSync({ backend: sync.backend === 'github' ? 'server' : 'github' }),
      },
    ];

    if (sync.backend === 'github') {
      items.push(
        { kind: 'tekst', label: 'GitHub-gebruikersnaam', value: () => sync.owner || '(leeg)', edit: 'owner' },
        { kind: 'tekst', label: 'Repository', value: () => sync.repo || '(leeg)', edit: 'repo' },
        { kind: 'tekst', label: 'Branch', value: () => sync.branch || 'main', edit: 'branch' },
        { kind: 'tekst', label: 'Pad in de repo', value: () => sync.path, edit: 'path' },
        {
          kind: 'schakelaar',
          label: 'Content ophalen',
          value: () => (sync.pullContent ? 'aan' : 'uit'),
          toggle: () => store.setSync({ pullContent: !sync.pullContent }),
        }
      );
    } else {
      items.push({
        kind: 'tekst',
        label: 'Adres van je server',
        value: () => sync.serverUrl || '(leeg)',
        edit: 'serverUrl',
      });
    }

    items.push(
      {
        kind: 'geheim',
        label: 'Token',
        value: () => (store.readToken() ? 'ingesteld' : '(leeg)'),
      },
      { kind: 'actie', label: 'Nu synchroniseren', run: () => void doSync() },
      {
        kind: 'actie',
        label: sync.backend === 'github' ? 'Verbinding testen' : 'Server testen',
        run: () => void doTest(),
      },
      { kind: 'kop', label: 'OP DIT APPARAAT' },
      { kind: 'info', label: 'Instellingen', value: () => paths.config },
      { kind: 'info', label: 'Leerpaden', value: () => contentDir() }
    );

    return items;
  }

  function firstSelectable(items, from = 0, direction = 1) {
    for (let index = from; index >= 0 && index < items.length; index += direction) {
      if (items[index].kind !== 'kop' && items[index].kind !== 'info') return index;
    }
    return from;
  }

  function viewSettings() {
    const items = settingsItems();
    if (items[state.settingsIndex]?.kind === 'kop') {
      state.settingsIndex = firstSelectable(items, state.settingsIndex);
    }

    return chrome(
      'instellingen',
      null,
      (room, columns) => {
        const rendered = items.map((item) => {
          if (item.kind === 'kop') return `${theme.faint}${item.label}${theme.reset}`;
          const label = pad(truncate(item.label, 26), 27);
          const value = item.value ? item.value() : '';
          return `${theme.text}${label}${theme.reset}${theme.muted}${truncate(value, columns - 32)}${theme.reset}`;
        });
        return listView(rendered, state.settingsIndex, 'settingsOffset', room, columns);
      },
      'enter wijzigen  spatie omzetten  esc terug'
    );
  }

  // -------------------------------------------------------------------------
  // Invoerregel en hulp
  // -------------------------------------------------------------------------

  function ask({ label, value = '', secret = false, multiline = false, onSubmit }) {
    state.input = { label, value, secret, multiline, onSubmit };
  }

  function viewInput(lines) {
    const columns = screen.width;
    const input = state.input;
    const shown = input.secret ? '*'.repeat(input.value.length) : input.value;
    const room = columns - input.label.length - 6;
    // Bij een lange waarde schuift het venster mee met het einde van de tekst.
    const tail = shown.length > room ? shown.slice(shown.length - room) : shown;

    const hint = input.multiline
      ? 'enter bewaren  esc annuleren'
      : 'enter bewaren  esc annuleren';
    lines[lines.length - 2] = `${theme.border}${glyphs.rule.repeat(columns)}${theme.reset}`;
    lines[lines.length - 1] =
      `${theme.barBg} ${theme.accent}${input.label}${theme.reset}${theme.barBg} ${theme.text}${tail}${theme.accent}_${theme.reset}${theme.barBg}  ${theme.faint}${hint}${theme.reset}`;
    return lines;
  }

  const HELP = [
    ['Overal', ''],
    ['  q of ctrl-c', 'stoppen'],
    ['  ?', 'deze hulp'],
    ['  esc', 'een stap terug'],
    ['  i', 'instellingen'],
    ['  s', 'nu synchroniseren'],
    ['  t', 'volgend thema'],
    ['', ''],
    ['In een lijst', ''],
    ['  pijltjes of j/k', 'bewegen'],
    ['  pgup/pgdn, home/end', 'bladeren'],
    ['  enter', 'openen'],
    ['', ''],
    ['In een leerpad', ''],
    ['  spatie', 'status: te doen, mee bezig, afgerond, overgeslagen'],
    ['  n', 'notitie bij dit onderwerp'],
    ['  o', 'de kaarten van dit leerpad overhoren'],
    ['', ''],
    ['Bij een onderwerp', ''],
    ['  tab', 'volgende bron'],
    ['  enter', 'de gekozen bron in je browser openen'],
    ['  r', 'de bron als gelezen aanvinken'],
    ['', ''],
    ['Bij het overhoren', ''],
    ['  spatie', 'antwoord tonen'],
    ['  1 / 2 / 3', 'opnieuw / lastig / wist ik'],
  ];

  function viewHelp() {
    return chrome(
      'hulp',
      'Pathfinder in de terminal',
      (room, columns) => {
        // De lijst is langer dan een klein venster; daarom schuift hij mee.
        const lines = [''];
        for (const [key, description] of HELP) {
          if (!key && !description) {
            lines.push('');
          } else if (!description) {
            lines.push(` ${theme.faint}${key.toUpperCase()}${theme.reset}`);
          } else {
            lines.push(
              ` ${theme.accent}${pad(key, 24)}${theme.reset}${theme.muted}${truncate(description, columns - 27)}${theme.reset}`
            );
          }
        }
        const maximum = Math.max(0, lines.length - room);
        state.helpScroll = Math.max(0, Math.min(state.helpScroll, maximum));
        return scrollView(lines, state.helpScroll, room, columns, theme);
      },
      'j/k schuiven  esc sluiten'
    );
  }

  // -------------------------------------------------------------------------
  // Synchroniseren
  // -------------------------------------------------------------------------

  async function doSync() {
    const sync = store.sync;
    if (!sync.enabled) {
      say('Zet synchroniseren eerst aan bij de instellingen.', 'error');
      return;
    }
    const token = store.readToken();
    if (!token) {
      say('Er is nog geen token ingesteld.', 'error');
      return;
    }

    state.busy = 'Synchroniseren...';
    draw();
    try {
      const backend = backendFor(sync, token);
      const progress = await syncProgress(backend, store.progress);
      store.replaceProgress(progress.state);
      const library = await syncLibrary(backend, store.library);
      store.replaceLibrary(library.state);

      let extra = '';
      if (sync.backend === 'github' && sync.pullContent) {
        const ref = { owner: sync.owner, repo: sync.repo, branch: sync.branch || 'main' };
        const result = await pullContent(token, ref, (done, total) => {
          state.busy = `Content ophalen... ${done}/${total}`;
          draw();
        });
        if (result.status === 'updated') {
          manifest = loadManifest();
          extra = `, ${plural(result.changedFiles, 'bestand', 'bestanden')} opgehaald`;
        }
      }

      const pulled = progress.pulled + library.pulled;
      const pushed = progress.pushed + library.pushed;
      say(`Bijgewerkt: ${pulled} binnen, ${pushed} verstuurd${extra}.`, 'ok');
    } catch (error) {
      say(error instanceof SyncError ? error.message : `Synchroniseren mislukte: ${error.message}`, 'error');
    } finally {
      state.busy = null;
      draw();
    }
  }

  async function doTest() {
    const sync = store.sync;
    const token = store.readToken();
    if (!token) {
      say('Er is nog geen token ingesteld.', 'error');
      return;
    }

    state.busy = 'Verbinding testen...';
    draw();
    try {
      if (sync.backend === 'server') {
        const info = await pingServer(sync.serverUrl, token);
        say(
          `Server ${info.version} bereikbaar, ${plural(info.documents, 'document', 'documenten')}.`,
          'ok'
        );
      } else {
        const backend = backendFor(sync, token);
        const document = await backend.read('progress');
        say(
          document
            ? `${sync.owner}/${sync.repo} gelezen; er staat al voortgang in.`
            : `${sync.owner}/${sync.repo} bereikbaar; er staat nog niets in.`,
          'ok'
        );
      }
    } catch (error) {
      say(error.message, 'error');
    } finally {
      state.busy = null;
      draw();
    }
  }

  // -------------------------------------------------------------------------
  // Toetsen
  // -------------------------------------------------------------------------

  function move(field, delta, length) {
    if (!length) return;
    state[field] = Math.max(0, Math.min(length - 1, state[field] + delta));
  }

  function back() {
    const previous = state.stack.pop();
    state.view = previous ?? 'dashboard';
    state.status = null;
  }

  function nextTheme(direction) {
    const index = THEMES.findIndex((entry) => entry.id === theme.id);
    const next = THEMES[(index + direction + THEMES.length) % THEMES.length];
    theme = palette(next);
    store.setTheme(next.id);
    say(`Thema: ${next.name}`, 'ok');
  }

  function editNote() {
    const roadmap = state.roadmap;
    const node = state.node ?? state.rows[state.rowIndex]?.node;
    if (!node) return;
    ask({
      label: `Notitie bij ${truncate(node.title, 24)}:`,
      value: store.noteOf(roadmap.id, node.id),
      onSubmit: (value) => {
        store.setNote(roadmap.id, node.id, value);
        say(value.trim() ? 'Notitie bewaard.' : 'Notitie verwijderd.', 'ok');
      },
    });
  }

  function handleInput(key) {
    const input = state.input;
    if (key.name === 'escape') {
      state.input = null;
      return;
    }
    if (key.name === 'enter') {
      state.input = null;
      input.onSubmit(input.value);
      return;
    }
    if (key.name === 'backspace') {
      input.value = input.value.slice(0, -1);
      return;
    }
    if (key.name === 'ctrl-u') {
      input.value = '';
      return;
    }
    if (key.name === 'ctrl-w') {
      input.value = input.value.replace(/\s*\S+\s*$/, '');
      return;
    }
    if (key.char) input.value += key.char;
  }

  function handleSettings(key) {
    const items = settingsItems();
    const item = items[state.settingsIndex];

    if (key.name === 'up' || key.name === 'k') {
      state.settingsIndex = firstSelectable(items, Math.max(0, state.settingsIndex - 1), -1);
      return;
    }
    if (key.name === 'down' || key.name === 'j') {
      state.settingsIndex = firstSelectable(
        items,
        Math.min(items.length - 1, state.settingsIndex + 1),
        1
      );
      return;
    }
    if (!item) return;

    if (item.kind === 'thema' && (key.name === 'left' || key.name === 'right')) {
      nextTheme(key.name === 'right' ? 1 : -1);
      return;
    }
    if (key.name === 'space' && item.toggle) {
      item.toggle();
      return;
    }
    if (key.name !== 'enter') return;

    if (item.kind === 'thema') nextTheme(1);
    else if (item.toggle) item.toggle();
    else if (item.run) item.run();
    else if (item.kind === 'geheim') {
      ask({
        label: 'Token:',
        secret: true,
        onSubmit: (value) => {
          store.writeToken(value.trim());
          say(
            value.trim()
              ? `Token bewaard in ${store.secretsFile} (alleen voor jou leesbaar).`
              : 'Token verwijderd.',
            'ok'
          );
        },
      });
    } else if (item.edit) {
      ask({
        label: `${item.label}:`,
        value: String(store.sync[item.edit] ?? ''),
        onSubmit: (value) => {
          store.setSync({ [item.edit]: value.trim() || DEFAULT_SYNC[item.edit] });
          say(`${item.label} bijgewerkt.`, 'ok');
        },
      });
    }
  }

  function handleKey(key) {
    if (state.input) {
      handleInput(key);
      return;
    }
    if (key.name === 'ctrl-c' || key.name === 'ctrl-d') {
      stop();
      return;
    }
    if (state.help) {
      if (key.name === 'escape' || key.name === '?' || key.name === 'q') {
        state.help = false;
        state.helpScroll = 0;
      } else if (key.name === 'down' || key.name === 'j') state.helpScroll += 1;
      else if (key.name === 'up' || key.name === 'k') state.helpScroll -= 1;
      else if (key.name === 'pagedown') state.helpScroll += 10;
      else if (key.name === 'pageup') state.helpScroll -= 10;
      return;
    }

    // Meldingen verdwijnen bij de eerste toets die er niets mee te maken heeft.
    if (state.status && key.name !== 'escape') state.status = null;

    if (key.name === 'q') {
      stop();
      return;
    }
    if (key.name === '?') {
      state.help = true;
      return;
    }
    if (key.name === 't') {
      nextTheme(1);
      return;
    }
    if (key.name === 's' && state.view !== 'review') {
      void doSync();
      return;
    }
    if (key.name === 'i' && state.view !== 'settings' && state.view !== 'review') {
      state.stack.push(state.view);
      state.view = 'settings';
      return;
    }

    switch (state.view) {
      case 'dashboard': {
        const entries = roadmapEntries();
        if (key.name === 'up' || key.name === 'k') move('roadmapIndex', -1, entries.length);
        else if (key.name === 'down' || key.name === 'j') move('roadmapIndex', 1, entries.length);
        else if (key.name === 'home') state.roadmapIndex = 0;
        else if (key.name === 'end') state.roadmapIndex = Math.max(0, entries.length - 1);
        else if (key.name === 'enter' && entries.length) openRoadmap(entries[state.roadmapIndex]);
        else if (key.name === 'o') startReview('alles');
        else if (key.name === 'd') {
          state.stack.push('dashboard');
          state.view = 'collections';
        }
        break;
      }

      case 'roadmap': {
        const rows = state.rows;
        if (key.name === 'up' || key.name === 'k') move('rowIndex', -1, rows.length);
        else if (key.name === 'down' || key.name === 'j') move('rowIndex', 1, rows.length);
        else if (key.name === 'pageup') move('rowIndex', -10, rows.length);
        else if (key.name === 'pagedown') move('rowIndex', 10, rows.length);
        else if (key.name === 'home') state.rowIndex = 0;
        else if (key.name === 'end') state.rowIndex = Math.max(0, rows.length - 1);
        else if (key.name === 'enter' && rows.length) openNode(rows[state.rowIndex].node);
        else if (key.name === 'space' && rows.length) {
          const node = rows[state.rowIndex].node;
          if (node.kind === 'label') break;
          const next = store.cycleStatus(state.roadmap.id, node.id);
          say(`${truncate(node.title, 40)}: ${STATUS_LABELS[next].toLowerCase()}`);
        } else if (key.name === 'n' && rows.length) {
          state.node = null;
          editNote();
        } else if (key.name === 'o') startReview('roadmap');
        else if (key.name === 'escape') back();
        break;
      }

      case 'node': {
        const resources = state.node.resources ?? [];
        if (key.name === 'down' || key.name === 'j') state.nodeScroll += 1;
        else if (key.name === 'up' || key.name === 'k') state.nodeScroll -= 1;
        else if (key.name === 'pagedown') state.nodeScroll += screen.height - 6;
        else if (key.name === 'pageup') state.nodeScroll -= screen.height - 6;
        else if (key.name === 'home') state.nodeScroll = 0;
        else if (key.name === 'space') {
          const next = store.cycleStatus(state.roadmap.id, state.node.id);
          say(`Status: ${STATUS_LABELS[next].toLowerCase()}`);
        } else if (key.name === 'n') editNote();
        else if (key.name === 'tab' && resources.length) {
          state.resourceIndex = (state.resourceIndex + 1) % resources.length;
        } else if (key.name === 'r' && resources.length) {
          const resource = resources[state.resourceIndex];
          const id = resource.id ?? resource.url ?? resource.title;
          const read = store.toggleResource(state.roadmap.id, state.node.id, id);
          say(read ? 'Bron aangevinkt als gelezen.' : 'Vinkje weggehaald.');
        } else if (key.name === 'enter' && resources.length) {
          const url = resourceUrl(resources[state.resourceIndex]);
          if (!url) {
            say('Bij deze bron staat geen link.', 'error');
          } else if (openExternal(url)) {
            say(`Geopend: ${truncate(url, 50)}`, 'ok');
          } else {
            say('Kon de browser niet starten.', 'error');
          }
        } else if (key.name === 'o') startReview('roadmap');
        else if (key.name === 'escape') back();
        break;
      }

      case 'review': {
        const item = state.queue[state.queueIndex];
        if (key.name === 'escape') {
          back();
        } else if (!state.revealed && key.name === 'space') {
          state.revealed = true;
        } else if (state.revealed && ['1', '2', '3'].includes(key.name)) {
          const grade = key.name === '1' ? 'again' : key.name === '2' ? 'hard' : 'good';
          const card = store.gradeCard(item.roadmapId, item.nodeId, item.card.id, grade);
          // "Opnieuw" zet de kaart achteraan in deze ronde; de rest is klaar.
          if (grade === 'again') state.queue.push(item);
          state.queueIndex += 1;
          state.revealed = false;
          if (state.queueIndex >= state.queue.length) {
            back();
            say('Klaar met overhoren.', 'ok');
          } else {
            say(`Terug ${describeInterval(card)}.`);
          }
        }
        break;
      }

      case 'collections': {
        const collections = manifest.collections ?? [];
        if (key.name === 'up' || key.name === 'k') move('collectionIndex', -1, collections.length);
        else if (key.name === 'down' || key.name === 'j') move('collectionIndex', 1, collections.length);
        else if (key.name === 'enter' && collections.length) {
          const collection = loadCollection(manifest, collections[state.collectionIndex].id);
          if (!collection) {
            say('Deze verzameling is niet te lezen.', 'error');
            break;
          }
          state.collection = collection;
          state.documentIndex = 0;
          state.stack.push('collections');
          state.view = 'documents';
        } else if (key.name === 'escape') back();
        break;
      }

      case 'documents': {
        const documents = state.collection?.documents ?? [];
        if (key.name === 'up' || key.name === 'k') move('documentIndex', -1, documents.length);
        else if (key.name === 'down' || key.name === 'j') move('documentIndex', 1, documents.length);
        else if (key.name === 'pageup') move('documentIndex', -10, documents.length);
        else if (key.name === 'pagedown') move('documentIndex', 10, documents.length);
        else if (key.name === 'enter' && documents.length) {
          state.document = loadDocument(documents[state.documentIndex]);
          state.documentScroll = 0;
          state.stack.push('documents');
          state.view = 'document';
        } else if (key.name === 'escape') back();
        break;
      }

      case 'document': {
        if (key.name === 'down' || key.name === 'j') state.documentScroll += 1;
        else if (key.name === 'up' || key.name === 'k') state.documentScroll -= 1;
        else if (key.name === 'pagedown') state.documentScroll += screen.height - 6;
        else if (key.name === 'pageup') state.documentScroll -= screen.height - 6;
        else if (key.name === 'home') state.documentScroll = 0;
        else if (key.name === 'escape') back();
        break;
      }

      case 'settings': {
        if (key.name === 'escape') back();
        else handleSettings(key);
        break;
      }

      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Tekenen en starten
  // -------------------------------------------------------------------------

  function draw() {
    if (stopped) return;
    let lines;
    if (state.help) lines = viewHelp();
    else if (state.view === 'roadmap') lines = viewRoadmap();
    else if (state.view === 'node') lines = viewNode();
    else if (state.view === 'review') lines = viewReview();
    else if (state.view === 'collections') lines = viewCollections();
    else if (state.view === 'documents') lines = viewDocuments();
    else if (state.view === 'document') lines = viewDocument();
    else if (state.view === 'settings') lines = viewSettings();
    else lines = viewDashboard();

    if (state.input) lines = viewInput(lines);
    screen.render(lines, `${theme.appBg}${theme.text}`, theme.reset);
  }

  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    screen.close();
    options.onExit?.();
  }

  function start() {
    screen.onKey((key) => {
      try {
        handleKey(key);
      } catch (error) {
        say(`Er ging iets mis: ${error.message}`, 'error');
      }
      draw();
    });
    screen.onResize(draw);
    draw();
  }

  return { start, stop, get view() {
    return state.view;
  } };
}
