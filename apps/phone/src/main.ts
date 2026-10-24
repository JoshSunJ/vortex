// Vortex phone brief reader. Talks straight to SpacetimeDB through this page's own origin
// (server.mjs forwards /v1), subscribes to the per-viewer views my_deliveries + my_briefs,
// re-renders from the local cache on every change, and acknowledges each brief it shows.
// Brief content is untrusted: everything is rendered with textContent, links must be http(s).
import { DbConnection, tables } from '../../../services/sync/src/module_bindings';

const params = new URLSearchParams(location.search);
const STDB_URI = params.get('stdb') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
const DB_NAME = params.get('db') ?? 'vortex-sync';
const TOKEN_KEY = `vortex-phone-token-${DB_NAME}`;
const SEEN_KEY = `vortex-phone-seen-delivery-${DB_NAME}`;

type Ts = { microsSinceUnixEpoch: bigint };
type Point = { text: string; sourceIds?: string[]; basis?: 'observed' | 'user_stated' | 'inferred' };

const $ = (id: string) => document.getElementById(id)!;

let connected = false;
let subscribed = false;
let identityHex = '';
// Views can't tell "not paired" from "paired, nothing sent yet", so remember whether this
// device has ever received a delivery.
let everSawDelivery = storageGet(SEEN_KEY) === '1';
const acked = new Set<string>();

const conn = DbConnection.builder()
  .withUri(STDB_URI)
  .withDatabaseName(DB_NAME)
  .withToken(storageGet(TOKEN_KEY) ?? undefined)
  .onConnect((c, identity, token) => {
    storageSet(TOKEN_KEY, token);
    identityHex = identity.toHexString();
    connected = true;
    c.subscriptionBuilder()
      .onApplied(() => {
        subscribed = true;
        scheduleRender();
      })
      .subscribe([tables.myDeliveries, tables.myBriefs]);
    scheduleRender();
  })
  .onConnectError((_ctx, err) => {
    connected = false;
    console.error(`Can't reach SpacetimeDB at ${STDB_URI}:`, err);
    scheduleRender();
  })
  .onDisconnect(() => {
    connected = false;
    scheduleRender();
  })
  .build();

for (const table of [conn.db.myDeliveries, conn.db.myBriefs] as any[]) {
  table.onInsert(scheduleRender);
  table.onDelete(scheduleRender);
  table.onUpdate?.(scheduleRender);
}
setInterval(scheduleRender, 30_000); // expiry + relative times

// ---------- render ----------
let queued = false;
function scheduleRender() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    render();
  });
}

function render() {
  const chip = $('conn');
  chip.textContent = connected ? 'Live' : identityHex ? 'Offline' : 'Connecting…';
  chip.className = `chip ${connected ? 'ok' : identityHex ? 'bad' : ''}`;
  $('banner').hidden = connected || !identityHex; // only after we've been connected once
  if (identityHex) $('foot-identity').textContent = `Device identity ${shortId(identityHex)}`;

  if (!subscribed) {
    show('state-connecting');
    return;
  }

  const briefs = new Map([...conn.db.myBriefs.iter()].map((b) => [b.key, b]));
  const items = [...conn.db.myDeliveries.iter()]
    .map((d) => ({ d, b: briefs.get(`${d.briefId}:${d.briefVersion}`) }))
    .filter((x): x is { d: (typeof x)['d']; b: NonNullable<(typeof x)['b']> } => !!x.b)
    .sort((x, y) => Number(y.b.createdAt.microsSinceUnixEpoch - x.b.createdAt.microsSinceUnixEpoch));

  if (items.length && !everSawDelivery) {
    everSawDelivery = true;
    storageSet(SEEN_KEY, '1');
  }

  if (!items.length) {
    if (everSawDelivery) {
      show('state-empty');
    } else {
      $('identity-short').textContent = shortId(identityHex);
      $('identity-full').textContent = identityHex;
      show('state-unpaired');
    }
    return;
  }

  const list = $('briefs');
  list.replaceChildren(...items.map(({ d, b }) => briefCard(d, b)));
  show('briefs');

  if (connected) {
    for (const { d } of items) {
      if (d.status === 'available' && !isExpired(d.expiresAt) && !acked.has(d.deliveryId)) {
        acked.add(d.deliveryId);
        acknowledge(d.deliveryId);
      }
    }
  }
}

function briefCard(d: { status: string; expiresAt: Ts; deliveryId: string }, b: { title: string; format: string; pointsJson: string; originalUrls: string[]; excerpt: string; createdAt: Ts }) {
  const li = el('li', 'card brief');
  li.append(el('h2', '', b.title || 'Untitled brief'));

  const meta = el('div', 'meta');
  const status = isExpired(d.expiresAt) ? 'expired' : d.status;
  meta.append(el('span', `chip ${statusClass(status)}`, statusLabel(status)));
  meta.append(el('span', '', b.format === 'project_handoff' ? 'Project handoff' : 'Reading'));
  meta.append(el('span', '', when(b.createdAt)));
  li.append(meta);

  const points = parsePoints(b.pointsJson);
  if (points.length) {
    const ul = el('ul', 'points');
    for (const p of points) {
      const item = el('li', '', p.text);
      if (p.basis === 'inferred') item.append(el('span', 'label', 'inferred'));
      else if (p.basis === 'user_stated') item.append(el('span', 'label', 'you said'));
      ul.append(item);
    }
    li.append(ul);
  } else if (b.excerpt) {
    li.append(el('p', 'excerpt', b.excerpt));
  }

  const href = safeUrl(b.originalUrls[0]);
  if (href) {
    const a = el('a', 'source', 'Open source') as HTMLAnchorElement;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    li.append(a);
  }
  return li;
}

function acknowledge(deliveryId: string) {
  try {
    const r: any = (conn.reducers as any).acknowledgeDelivery({ deliveryId });
    r?.catch?.((err: unknown) => {
      console.warn('acknowledgeDelivery failed', err);
      acked.delete(deliveryId);
    });
  } catch (err) {
    console.warn('acknowledgeDelivery failed', err);
    acked.delete(deliveryId);
  }
}

// ---------- helpers ----------
const SECTIONS = ['state-connecting', 'state-unpaired', 'state-empty', 'briefs'];
function show(id: string) {
  for (const s of SECTIONS) $(s).hidden = s !== id;
}

function el(tag: string, cls: string, text?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function parsePoints(json: string): Point[] {
  try {
    const raw = JSON.parse(json);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p) => p && typeof p.text === 'string' && p.text.trim())
      .map((p) => ({ text: p.text, sourceIds: Array.isArray(p.sourceIds) ? p.sourceIds : [], basis: p.basis }));
  } catch {
    return [];
  }
}

function safeUrl(u: string | undefined): string | null {
  if (!u) return null;
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const tsMs = (t: Ts) => Number(t.microsSinceUnixEpoch / 1000n);
const isExpired = (t: Ts) => tsMs(t) < Date.now();

function when(t: Ts) {
  const ms = tsMs(t);
  const mins = Math.round((Date.now() - ms) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusLabel(s: string) {
  return ({ available: 'New', received: 'Received', read: 'Read', revoked: 'Revoked', expired: 'Expired' } as Record<string, string>)[s] ?? s;
}
function statusClass(s: string) {
  return s === 'available' ? 'ok' : s === 'expired' || s === 'revoked' ? 'bad' : '';
}

function shortId(hex: string) {
  return hex ? `${hex.slice(0, 8)}…${hex.slice(-4)}` : '';
}

function storageGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function storageSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}
