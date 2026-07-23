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
 * `workspaces/{workspaceId}/lists/{listId}` — a named list (board column)
 * within a workspace. Every workspace has at least one; `ensureDefaultList`
 * in `src/firebase/lists.ts` creates a `default` one on first load.
 *
 * `order` is a fractional index (see `src/lib/ordering.ts`) and is shared by
 * all members — everyone in a workspace sees the same column order.
 */
export interface List {
  name: string;
  order: number;
  createdBy: string;
  createdAt: Timestamp;
}

/** Write payload for creating a `workspaces/{workspaceId}/lists/{listId}` doc. */
export type ListForCreate = Omit<List, 'createdAt'> & { createdAt: FieldValue };

/**
 * A photo attached to an item, stored in Cloud Storage and pointed at from
 * the item doc.
 *
 * `url` is a download URL carrying its own access token, so an `<img>` can
 * render it without the Storage SDK. `path` is kept alongside it because a
 * download URL can't be turned back into an object reference — and deleting
 * the old object when a photo is replaced or removed needs one.
 *
 * `width`/`height` are the *compressed* dimensions (see `src/lib/image.ts`),
 * recorded so the viewer can size itself before the image arrives.
 */
export interface ItemImage {
  url: string;
  path: string;
  width: number;
  height: number;
}

/**
 * `workspaces/{workspaceId}/items/{itemId}` — subcollection, always accessed
 * scoped to one workspace *and* one list (`listId`).
 *
 * Items are deliberately stored flat under the workspace with a `listId`
 * field rather than nested under `lists/{listId}/items`: moving an item
 * between lists is then a single-field update that keeps the doc id,
 * `addedBy`, and history linkage intact.
 *
 * `order` is a fractional index within the list (see `src/lib/ordering.ts`).
 * Rows still sort `checked` first, so `order` only orders items within the
 * unchecked and checked groups respectively.
 */
export interface Item {
  listId: string;
  order: number;
  text: string;
  normalizedText: string;
  checked: boolean;
  checkedAt: Timestamp | null;
  addedBy: string;
  addedByName: string;
  createdAt: Timestamp;
  archived: boolean;
  archivedAt: Timestamp | null;
  /**
   * Optional rather than `| null` alone: items added before photos existed
   * have no such field at all, so reads must cope with `undefined` even
   * though every write since sets it explicitly.
   */
  image?: ItemImage | null;
}

/** Write payload for creating a new (unchecked, unarchived) item. */
export type ItemForCreate = Omit<Item, 'checkedAt' | 'createdAt' | 'archivedAt' | 'image'> & {
  createdAt: FieldValue;
  checkedAt: null;
  archivedAt: null;
  image: null;
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
