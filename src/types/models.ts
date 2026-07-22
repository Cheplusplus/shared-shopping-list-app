/**
 * Firestore data model types for Listpad.
 *
 * These mirror the shapes stored in Firestore exactly — field names matter,
 * since other agents' UI code depends on them. See
 * `docs/spec.md` ("Firestore data model") for the authoritative description.
 *
 * Timestamp fields hold `Timestamp` once read back from Firestore. When
 * *writing* a new/updated doc, callers typically pass `serverTimestamp()`
 * (a `FieldValue`) instead — see the `*ForCreate` write-payload types below,
 * which reflect that.
 */
import type { FieldValue, Timestamp } from 'firebase/firestore';

/** A member's role within a workspace. */
export type WorkspaceRole = 'owner' | 'member';

/** `users/{uid}` — created client-side immediately after sign-up. */
export interface User {
  displayName: string;
  email: string;
  createdAt: Timestamp;
  activeWorkspaceId: string | null;
}

/** Write payload for creating a `users/{uid}` doc. */
export type UserForCreate = Omit<User, 'createdAt'> & { createdAt: FieldValue };

/**
 * `workspaces/{workspaceId}`.
 *
 * `inviteCode` is only ever read server-side (by the `redeemInviteCode`
 * Cloud Function) — no client security rule exposes querying workspaces by
 * invite code, to avoid enumeration.
 */
export interface Workspace {
  name: string;
  createdBy: string;
  createdAt: Timestamp;
  inviteCode: string;
  inviteCodeActive: boolean;
}

/** Write payload for creating a `workspaces/{workspaceId}` doc. */
export type WorkspaceForCreate = Omit<Workspace, 'createdAt'> & { createdAt: FieldValue };

/**
 * `workspaceMembers/{workspaceId}_{uid}` — top-level collection, deterministic
 * doc ID. Lets security rules check membership with a cheap `exists()` and
 * lets the workspace switcher list a user's workspaces with a single query
 * (via denormalized `workspaceName`, avoiding extra reads).
 */
export interface WorkspaceMember {
  workspaceId: string;
  uid: string;
  displayName: string;
  workspaceName: string;
  joinedAt: Timestamp;
  role: WorkspaceRole;
}

/** Write payload for creating a `workspaceMembers/{workspaceId}_{uid}` doc. */
export type WorkspaceMemberForCreate = Omit<WorkspaceMember, 'joinedAt'> & { joinedAt: FieldValue };

/**
 * `workspaces/{workspaceId}/items/{itemId}` — subcollection, always accessed
 * scoped to one workspace.
 */
export interface Item {
  text: string;
  normalizedText: string;
  checked: boolean;
  checkedAt: Timestamp | null;
  addedBy: string;
  addedByName: string;
  createdAt: Timestamp;
  archived: boolean;
  archivedAt: Timestamp | null;
}

/** Write payload for creating a new (unchecked, unarchived) item. */
export type ItemForCreate = Omit<Item, 'checkedAt' | 'createdAt' | 'archivedAt'> & {
  createdAt: FieldValue;
  checkedAt: null;
  archivedAt: null;
};

/**
 * `userItemHistory/{uid}_{sanitizedNormalizedText}` — top-level, deterministic
 * ID. One doc per unique item a user has ever added, across all their
 * workspaces; upserted (increment `useCount`) every time they add that item
 * anywhere.
 */
export interface UserItemHistory {
  uid: string;
  text: string;
  normalizedText: string;
  useCount: number;
  lastUsedAt: Timestamp;
}

/**
 * `workspaceItemHistory/{workspaceId}_{sanitizedNormalizedText}` — top-level,
 * deterministic ID. Upserted alongside `userItemHistory` on every add; makes
 * "anyone in this workspace has added X before" queryable without scanning.
 */
export interface WorkspaceItemHistory {
  workspaceId: string;
  text: string;
  normalizedText: string;
  useCount: number;
  lastUsedAt: Timestamp;
  lastAddedBy: string;
}

/** A Firestore document plus its ID — convenient shape for UI consumption. */
export type WithId<T> = T & { id: string };
