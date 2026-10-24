// Vortex sync module: the private "mailbox" between devices (contracts/ANDREW.md Appendix E).
//
// Every table is private. Devices only read through per-viewer views that check who is asking
// (ctx.sender). Only the trusted API (the identity that published this module) may bind devices,
// publish briefs and create deliveries; the API has already verified tokens and pairing. Phones
// may only acknowledge deliveries addressed to them.
import { schema, table, t, SenderError, type InferSchema, type ReducerCtx, type ViewCtx } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';

// ---------- tables (all private) ----------

// The trusted API identity. Set once when the module is first published.
const admin = table(
  { name: 'admin' },
  {
    identity: t.identity().primaryKey(),
  }
);

// Which SpacetimeDB connection identity belongs to which Vortex user and device.
const deviceBinding = table(
  { name: 'device_binding' },
  {
    identity: t.identity().primaryKey(),
    userId: t.string().index('btree'),
    deviceId: t.string().unique(),
    kind: t.string(), // "desktop" | "phone" | "agent"
    revoked: t.bool(),
  }
);

// Brief content, immutable per version. `pointsJson` holds the contract's GroundedPoint[] as JSON.
const brief = table(
  { name: 'brief' },
  {
    key: t.string().primaryKey(), // `${briefId}:${version}`
    briefId: t.string().index('btree'),
    version: t.u32(),
    ownerUserId: t.string().index('btree'),
    title: t.string(),
    format: t.string(), // "reading" | "project_handoff"
    audience: t.string(), // "self" | "selected_teammate"
    pointsJson: t.string(),
    originalUrls: t.array(t.string()),
    excerpt: t.string(),
    createdAt: t.timestamp(),
  }
);

const delivery = table(
  { name: 'delivery' },
  {
    deliveryId: t.string().primaryKey(),
    operationId: t.string(),
    briefId: t.string().index('btree'),
    briefVersion: t.u32(),
    ownerUserId: t.string().index('btree'),
    recipientDeviceId: t.string().index('btree'), // "" when sent to a person
    recipientUserId: t.string().index('btree'), // "" when sent to a device
    status: t.string(), // "available" | "received" | "read" | "revoked" | "expired"
    expiresAt: t.timestamp(),
  }
);

const spacetimedb = schema({ admin, deviceBinding, brief, delivery });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const DAY = 24n * 3600n * 1_000_000n; // microseconds

// ---------- helpers ----------

function requireAdmin(ctx: Ctx) {
  if (!ctx.db.admin.identity.find(ctx.sender)) throw new SenderError('Only the Vortex API can do this');
}

function requireDevice(ctx: Ctx) {
  const binding = ctx.db.deviceBinding.identity.find(ctx.sender);
  if (!binding || binding.revoked) throw new SenderError('This device is not paired');
  return binding;
}

// ---------- lifecycle ----------

// The identity that publishes the module becomes the trusted API identity.
export const init = spacetimedb.init((ctx) => {
  ctx.db.admin.insert({ identity: ctx.sender });
});

// ---------- reducers ----------

// Called by the API after it has confirmed a pairing.
export const bindDevice = spacetimedb.reducer(
  { identity: t.identity(), userId: t.string(), deviceId: t.string(), kind: t.string() },
  (ctx, { identity, userId, deviceId, kind }) => {
    requireAdmin(ctx);
    const existing = ctx.db.deviceBinding.deviceId.find(deviceId);
    if (existing) ctx.db.deviceBinding.identity.delete(existing.identity);
    ctx.db.deviceBinding.insert({ identity, userId, deviceId, kind, revoked: false });
  }
);

// Revoking blocks future access: the device's views go empty and its deliveries are revoked.
export const revokeDevice = spacetimedb.reducer({ deviceId: t.string() }, (ctx, { deviceId }) => {
  requireAdmin(ctx);
  const binding = ctx.db.deviceBinding.deviceId.find(deviceId);
  if (!binding) throw new SenderError('Unknown device');
  ctx.db.deviceBinding.identity.update({ ...binding, revoked: true });
  for (const d of [...ctx.db.delivery.recipientDeviceId.filter(deviceId)]) {
    if (d.status !== 'read') ctx.db.delivery.deliveryId.update({ ...d, status: 'revoked' });
  }
});

export const publishBrief = spacetimedb.reducer(
  {
    briefId: t.string(),
    version: t.u32(),
    ownerUserId: t.string(),
    title: t.string(),
    format: t.string(),
    audience: t.string(),
    pointsJson: t.string(),
    originalUrls: t.array(t.string()),
    excerpt: t.string(),
  },
  (ctx, args) => {
    requireAdmin(ctx);
    const key = `${args.briefId}:${args.version}`;
    if (ctx.db.brief.key.find(key)) throw new SenderError('Brief versions are immutable; publish a new version');
    ctx.db.brief.insert({ key, ...args, createdAt: ctx.timestamp });
  }
);

export const createDelivery = spacetimedb.reducer(
  {
    deliveryId: t.string(),
    operationId: t.string(),
    briefId: t.string(),
    briefVersion: t.u32(),
    recipientDeviceId: t.string(),
    recipientUserId: t.string(),
  },
  (ctx, args) => {
    requireAdmin(ctx);
    if ((args.recipientDeviceId === '') === (args.recipientUserId === '')) {
      throw new SenderError('Send to exactly one device or one person');
    }
    const b = ctx.db.brief.key.find(`${args.briefId}:${args.briefVersion}`);
    if (!b) throw new SenderError('Unknown brief version');
    if (ctx.db.delivery.deliveryId.find(args.deliveryId)) return; // retry of the same delivery: no duplicate
    ctx.db.delivery.insert({
      ...args,
      ownerUserId: b.ownerUserId,
      status: 'available',
      expiresAt: new Timestamp(ctx.timestamp.microsSinceUnixEpoch + DAY),
    });
  }
);

// The phone confirms it received the brief. Only the recipient can do this.
export const acknowledgeDelivery = spacetimedb.reducer({ deliveryId: t.string() }, (ctx, { deliveryId }) => {
  const me = requireDevice(ctx);
  const d = ctx.db.delivery.deliveryId.find(deliveryId);
  if (!d || !isRecipient(d, me)) throw new SenderError('Delivery not found');
  if (d.status === 'available') ctx.db.delivery.deliveryId.update({ ...d, status: 'received' });
});

// ---------- views (what each device is allowed to see) ----------

type Binding = { userId: string; deviceId: string };
type DeliveryRow = { recipientDeviceId: string; recipientUserId: string; status: string };

function isRecipient(d: DeliveryRow, me: Binding) {
  return d.recipientDeviceId === me.deviceId || d.recipientUserId === me.userId;
}

function visibleDeliveries(ctx: ViewCtx<InferSchema<typeof spacetimedb>>) {
  const me = ctx.db.deviceBinding.identity.find(ctx.sender);
  if (!me || me.revoked) return [];
  const rows = [...ctx.db.delivery.recipientDeviceId.filter(me.deviceId), ...ctx.db.delivery.recipientUserId.filter(me.userId)];
  return rows.filter((d) => d.status !== 'revoked' && d.status !== 'expired');
}

// Deliveries addressed to this device, or to this person.
export const myDeliveries = spacetimedb.view({ name: 'my_deliveries', public: true }, t.array(delivery.rowType), (ctx) =>
  visibleDeliveries(ctx)
);

// Only the brief versions that were actually delivered to this viewer.
export const myBriefs = spacetimedb.view({ name: 'my_briefs', public: true }, t.array(brief.rowType), (ctx) =>
  visibleDeliveries(ctx).flatMap((d) => {
    const b = ctx.db.brief.key.find(`${d.briefId}:${d.briefVersion}`);
    return b ? [b] : [];
  })
);
