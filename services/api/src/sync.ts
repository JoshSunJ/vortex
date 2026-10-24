// The API's only connection to SpacetimeDB (services/sync). The API has already checked tokens,
// pairing and ownership; this writer just records the result in the private mailbox so paired
// devices receive it live. It connects with the admin token: the identity that published the
// module, which is the only identity allowed to bind devices and create deliveries.
import type { Brief, Delivery } from "@vortex/contracts";
import { DbConnection } from "@vortex/sync/bindings";
import { Identity } from "spacetimedb";

export interface SyncWriter {
  bindDevice(input: { syncIdentity: string; userId: string; deviceId: string; kind: "desktop" | "phone" | "agent" }): Promise<void>;
  /** Publishes the brief version if this writer hasn't already, then creates the delivery. */
  deliver(brief: Brief & { ownerUserId: string }, delivery: Delivery): Promise<void>;
  revokeDevice(deviceId: string): Promise<void>;
  close(): void;
}

export type SpacetimeSyncOptions = { uri: string; database: string; adminToken: string; timeoutMs?: number };

export async function createSpacetimeSyncWriter({ uri, database, adminToken, timeoutMs = 10_000 }: SpacetimeSyncOptions): Promise<SyncWriter> {
  const conn = await withTimeout(
    new Promise<DbConnection>((resolve, reject) => {
      DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(database)
        .withToken(adminToken)
        .onConnect((c) => resolve(c))
        .onConnectError((_ctx, err) => reject(new Error(`SpacetimeDB unreachable at ${uri}/${database}: ${String(err)}`)))
        .build();
    }),
    timeoutMs,
    "connect",
  );
  const published = new Set<string>();

  return {
    async bindDevice({ syncIdentity, userId, deviceId, kind }) {
      await withTimeout(conn.reducers.bindDevice({ identity: Identity.fromString(syncIdentity), userId, deviceId, kind }), timeoutMs, "bindDevice");
    },

    async deliver(brief, delivery) {
      const key = `${brief.id}:${brief.version}`;
      if (!published.has(key)) {
        try {
          await withTimeout(
            conn.reducers.publishBrief({
              briefId: brief.id,
              version: brief.version,
              ownerUserId: brief.ownerUserId,
              title: brief.title,
              format: brief.format,
              audience: brief.audience,
              pointsJson: JSON.stringify(brief.points),
              originalUrls: brief.originalUrls,
              excerpt: brief.excerpt ?? "",
            }),
            timeoutMs,
            "publishBrief",
          );
        } catch (err) {
          // Versions are immutable: an existing copy (e.g. published before an API restart) is fine.
          if (!/immutable/i.test(String(err))) throw err;
        }
        published.add(key);
      }
      const recipient = delivery.recipient;
      await withTimeout(
        conn.reducers.createDelivery({
          deliveryId: delivery.id,
          operationId: delivery.operationId,
          briefId: delivery.briefId,
          briefVersion: delivery.briefVersion,
          recipientDeviceId: "deviceId" in recipient ? recipient.deviceId : "",
          recipientUserId: "userId" in recipient ? recipient.userId : "",
        }),
        timeoutMs,
        "createDelivery",
      );
    },

    async revokeDevice(deviceId) {
      try {
        await withTimeout(conn.reducers.revokeDevice({ deviceId }), timeoutMs, "revokeDevice");
      } catch (err) {
        // A device that was never bound in SpacetimeDB has nothing to revoke there.
        if (!/unknown device/i.test(String(err))) throw err;
      }
    },

    close() {
      conn.disconnect();
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`SpacetimeDB ${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
