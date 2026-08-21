/**
 * Minimale GitHub-client. De prive repo doet dienst als opslag voor de voortgang
 * en als bron voor content-updates, zodat er geen eigen server nodig is.
 */

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly documentationUrl?: string
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

function headers(token: string, accept = 'application/vnd.github+json'): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: accept,
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function fail(response: Response): Promise<never> {
  let message = `${response.status} ${response.statusText}`;
  let documentationUrl: string | undefined;
  try {
    const body = await response.json();
    if (body?.message) message = body.message;
    documentationUrl = body?.documentation_url;
  } catch {
    // Geen JSON-body; de statustekst is dan het beste wat we hebben.
  }
  if (response.status === 401) message = 'Token afgewezen. Controleer of hij nog geldig is.';
  if (response.status === 403 && /rate limit/i.test(message)) {
    message = 'GitHub-limiet bereikt. Probeer het over een paar minuten opnieuw.';
  }
  throw new GitHubError(message, response.status, documentationUrl);
}

export function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  // In stukken, anders loopt String.fromCharCode bij grote bestanden op de stack vast.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export interface RemoteFile {
  text: string;
  sha: string;
}

/** Geeft null bij 404, zodat "bestaat nog niet" geen foutafhandeling vraagt. */
export async function getFile(
  token: string,
  ref: RepoRef,
  path: string
): Promise<RemoteFile | null> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref.branch)}`;
  const response = await fetch(url, { headers: headers(token) });
  if (response.status === 404) return null;
  if (!response.ok) await fail(response);
  const body = await response.json();
  if (Array.isArray(body)) throw new GitHubError(`${path} is een map, geen bestand.`, 400);
  return { text: decodeBase64(body.content ?? ''), sha: body.sha as string };
}

/** Haalt de ruwe inhoud op; scheelt base64-werk bij het binnenhalen van content. */
export async function getRawFile(token: string, ref: RepoRef, path: string): Promise<string> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(ref.branch)}`;
  const response = await fetch(url, { headers: headers(token, 'application/vnd.github.raw+json') });
  if (!response.ok) await fail(response);
  return response.text();
}

export interface PutResult {
  sha: string;
}

/**
 * Schrijft een bestand weg. `sha` is de versie die je dacht te overschrijven; laat
 * GitHub met 409 afwijzen als een ander apparaat er intussen tussen kwam. De
 * synclaag mergt dan opnieuw en probeert het nog eens.
 */
export async function putFile(
  token: string,
  ref: RepoRef,
  path: string,
  text: string,
  sha: string | null,
  message: string
): Promise<PutResult> {
  const url = `${API}/repos/${ref.owner}/${ref.repo}/contents/${encodeURI(path)}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: encodeBase64(text),
      branch: ref.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!response.ok) await fail(response);
  const body = await response.json();
  return { sha: body.content.sha as string };
}

export interface RepoInfo {
  fullName: string;
  private: boolean;
  defaultBranch: string;
  permissions?: { push?: boolean };
}

export async function getRepo(token: string, owner: string, repo: string): Promise<RepoInfo> {
  const response = await fetch(`${API}/repos/${owner}/${repo}`, { headers: headers(token) });
  if (!response.ok) await fail(response);
  const body = await response.json();
  return {
    fullName: body.full_name,
    private: body.private,
    defaultBranch: body.default_branch,
    permissions: body.permissions,
  };
}

export async function getViewer(token: string): Promise<{ login: string }> {
  const response = await fetch(`${API}/user`, { headers: headers(token) });
  if (!response.ok) await fail(response);
  const body = await response.json();
  return { login: body.login };
}

export interface ReleaseAsset {
  name: string;
  url: string;
  size: number;
}

export interface Release {
  tag: string;
  name: string;
  notes: string;
  publishedAt: string;
  assets: ReleaseAsset[];
}

/**
 * Voor de update-controle op Android. Bij een publieke repository is een token
 * niet nodig; bij een prive repository wel.
 */
export async function getLatestRelease(
  token: string | null,
  owner: string,
  repo: string
): Promise<Release | null> {
  const response = await fetch(`${API}/repos/${owner}/${repo}/releases/latest`, {
    headers: token
      ? headers(token)
      : { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (response.status === 404) return null;
  if (!response.ok) await fail(response);
  const body = await response.json();
  return {
    tag: body.tag_name,
    name: body.name ?? body.tag_name,
    notes: body.body ?? '',
    publishedAt: body.published_at,
    assets: (body.assets ?? []).map((asset: Record<string, unknown>) => ({
      name: asset.name as string,
      url: asset.browser_download_url as string,
      size: asset.size as number,
    })),
  };
}
