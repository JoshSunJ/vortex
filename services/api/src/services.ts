// The one service boundary behind every interface (HTTP routes, desktop, ASI:One adapter).
// Nova implements the intelligence methods, Josh the local effects, Andrew auth/persistence wiring.
// Every method receives the verified AuthContext and throws ApiError for typed failures.
import type { Delivery, Operation, PlanOrClarification, ReadProgress, Snapshot, Workspace } from "@vortex/contracts";
import type { AuthContext } from "./auth";
import type {
  Approval,
  ApproveRequest,
  BriefRequest,
  BriefView,
  CheckpointRequest,
  DeletionReceipt,
  DeliveryRequest,
  Device,
  ExecuteRequest,
  Pairing,
  PairingClaimRequest,
  PendingPairing,
  PlanRequest,
  ReadProgressRequest,
  ResumeRequest,
  Revoked,
  WorkspaceCreateRequest,
  WorkspaceList,
  WorkspacePlanRequest,
  WorkspaceUpdateRequest,
} from "./schemas";

export interface Services {
  /** "fixture" responses carry the X-Vortex-Services: fixture header and never count as live evidence. */
  readonly label: "fixture" | "live";

  getSnapshot(auth: AuthContext, deviceId: string): Promise<Snapshot>;

  // Workspaces (revision 1.3). Andrew persists them; focus/resume plans come from Josh's
  // planWorkspaceFocus/planWorkspaceResume and run through the ordinary approve/execute path.
  listWorkspaces(auth: AuthContext, deviceId?: string): Promise<WorkspaceList>;
  createWorkspace(auth: AuthContext, req: WorkspaceCreateRequest): Promise<Workspace>;
  updateWorkspace(auth: AuthContext, workspaceId: string, req: WorkspaceUpdateRequest): Promise<Workspace>;
  planWorkspaceFocus(auth: AuthContext, workspaceId: string, req: WorkspacePlanRequest): Promise<PlanOrClarification>;
  planWorkspaceResume(auth: AuthContext, workspaceId: string, req: WorkspacePlanRequest): Promise<PlanOrClarification>;

  createPlan(auth: AuthContext, req: PlanRequest): Promise<PlanOrClarification>;
  approvePlan(auth: AuthContext, planId: string, req: ApproveRequest): Promise<Approval>;
  executePlan(auth: AuthContext, planId: string, req: ExecuteRequest): Promise<Operation>;
  getOperation(auth: AuthContext, operationId: string): Promise<Operation>;
  cancelOperation(auth: AuthContext, operationId: string): Promise<Operation>;
  createCheckpoint(auth: AuthContext, req: CheckpointRequest): Promise<Operation>;
  deleteCheckpoint(auth: AuthContext, checkpointId: string): Promise<DeletionReceipt>;
  resumeCheckpoint(auth: AuthContext, checkpointId: string, req: ResumeRequest): Promise<PlanOrClarification>;
  createBrief(auth: AuthContext, req: BriefRequest): Promise<Operation>;
  getBrief(auth: AuthContext, briefId: string, version?: number): Promise<BriefView>;
  createDelivery(auth: AuthContext, req: DeliveryRequest): Promise<Delivery>;
  updateReadProgress(auth: AuthContext, req: ReadProgressRequest): Promise<ReadProgress>;
  createPairing(auth: AuthContext, desktopDeviceId: string): Promise<Pairing>;
  claimPairing(auth: AuthContext, pairingId: string, req: PairingClaimRequest): Promise<PendingPairing>;
  confirmPairing(auth: AuthContext, pairingId: string): Promise<Device>;
  revokeDevice(auth: AuthContext, deviceId: string): Promise<Revoked>;
}
