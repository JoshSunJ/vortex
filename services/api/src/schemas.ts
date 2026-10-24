// Request bodies and API-only response shapes from contracts/ANDREW.md Appendix D (Andrew owns these).
// Wire types (Plan, Brief, Delivery, ...) come from @vortex/contracts and are not redefined here.
import { Brief, ISODate, Id, Recipient, Scope, Source } from "@vortex/contracts";
import { z } from "zod";
import { DeviceKind } from "./auth";

const Revision = z.number().int().nonnegative();
const BriefVersion = z.number().int().positive();

export const PlanRequest = z.object({
  commandId: Id,
  text: z.string().min(1).max(2_000),
  deviceId: Id,
  snapshotRevision: Revision,
  selectedResourceIds: z.array(Id).max(100),
});
export type PlanRequest = z.infer<typeof PlanRequest>;

export const ApproveRequest = z.object({ planHash: z.string().min(1).max(200), confirmed: z.literal(true) });
export type ApproveRequest = z.infer<typeof ApproveRequest>;
export const Approval = z.object({ approvalId: Id, expiresAt: ISODate });
export type Approval = z.infer<typeof Approval>;

export const ExecuteRequest = z.object({ operationId: Id, expectedRevision: Revision, approvalId: Id.optional() });
export type ExecuteRequest = z.infer<typeof ExecuteRequest>;

export const CheckpointRequest = z.object({
  taskId: Id,
  resourceIds: z.array(Id).max(100),
  sourceIds: z.array(Id).max(5),
  consentId: Id,
});
export type CheckpointRequest = z.infer<typeof CheckpointRequest>;

export const BriefRequest = z.object({
  sourceIds: z.array(Id).min(1).max(5),
  taskId: Id.optional(),
  checkpointId: Id.optional(),
  format: Brief.shape.format,
  audience: Brief.shape.audience,
  consentId: Id,
});
export type BriefRequest = z.infer<typeof BriefRequest>;

export const DeliveryRequest = z.object({
  operationId: Id,
  briefId: Id,
  briefVersion: BriefVersion,
  recipient: Recipient,
  approvalId: Id.optional(),
});
export type DeliveryRequest = z.infer<typeof DeliveryRequest>;

export const ResumeRequest = z.object({ deviceId: Id, snapshotRevision: Revision });
export type ResumeRequest = z.infer<typeof ResumeRequest>;

/** Authorized brief plus scoped source metadata. Source text is never returned here. */
export const SourceMeta = Source.omit({ text: true });
export const BriefView = z.object({ brief: Brief, sources: z.array(SourceMeta) });
export type BriefView = z.infer<typeof BriefView>;

export const ReadProgressRequest = z.object({
  briefId: Id,
  briefVersion: BriefVersion,
  deviceId: Id,
  fraction: z.number().min(0).max(1),
  expectedRevision: Revision,
});
export type ReadProgressRequest = z.infer<typeof ReadProgressRequest>;

export const PairingCreateRequest = z.object({ desktopDeviceId: Id });
export type PairingCreateRequest = z.infer<typeof PairingCreateRequest>;
export const Pairing = z.object({ pairingId: Id, nonce: z.string().min(32), expiresAt: ISODate });
export type Pairing = z.infer<typeof Pairing>;

export const PairingClaimRequest = z.object({ nonce: z.string().min(32).max(200), phoneDeviceName: z.string().min(1).max(100) });
export type PairingClaimRequest = z.infer<typeof PairingClaimRequest>;
export const PendingPairing = z.object({ pairingId: Id, status: z.literal("pending_confirmation"), phoneDeviceName: z.string() });
export type PendingPairing = z.infer<typeof PendingPairing>;

export const PairingConfirmRequest = z.object({ approved: z.literal(true) });
export type PairingConfirmRequest = z.infer<typeof PairingConfirmRequest>;

export const Device = z.object({
  id: Id,
  userId: Id,
  name: z.string(),
  kind: DeviceKind,
  scopes: z.array(Scope),
  pairedAt: ISODate,
});
export type Device = z.infer<typeof Device>;

export const Revoked = z.object({ revoked: z.literal(true) });
export type Revoked = z.infer<typeof Revoked>;

export const DeletionReceipt = z.object({
  checkpointId: Id,
  deleted: z.literal(true),
  searchProjection: z.enum(["pending", "removed", "failed"]),
});
export type DeletionReceipt = z.infer<typeof DeletionReceipt>;
