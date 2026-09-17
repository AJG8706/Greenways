import "server-only";

import { linkColumnValue } from "@/lib/integrations/monday/value";

/**
 * Monday.com Inventory-board integration — all vendor specifics live in this
 * folder (one-folder isolation rule, same as lib/media/provider and
 * lib/analytics). Speaks the GraphQL API directly with MONDAY_API_TOKEN
 * (server-side only; unset = integration off and the admin card hides).
 *
 * It touches exactly one column ("Greenways Walk", created on first use) on
 * the one row the admin picked — never the marketing team's other columns.
 */

const API_URL = "https://api.monday.com/v2";
const BOARD_ID = process.env.MONDAY_BOARD_ID ?? "18418085202"; // Inventory Information
const WALK_COLUMN_TITLE = "Greenways Walk";

export function isMondayConfigured(): boolean {
  return Boolean(process.env.MONDAY_API_TOKEN);
}

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.MONDAY_API_TOKEN ?? "",
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: T;
    errors?: { message?: string }[];
    error_message?: string;
  };
  if (!res.ok || body.errors?.length || body.error_message) {
    throw new Error(
      body.errors?.[0]?.message ?? body.error_message ?? `Monday API ${res.status}`,
    );
  }
  return body.data as T;
}

export type MondayItem = { id: string; name: string; group: string };

/** Board rows for the Publish tab picker. */
export async function listBoardItems(): Promise<MondayItem[]> {
  const data = await gql<{
    boards: { items_page: { items: { id: string; name: string; group: { title: string } }[] } }[];
  }>(
    `query ($board: [ID!]) {
       boards(ids: $board) {
         items_page(limit: 500) { items { id name group { title } } }
       }
     }`,
    { board: [BOARD_ID] },
  );
  return (data.boards[0]?.items_page.items ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    group: i.group?.title ?? "",
  }));
}

export async function getItemName(itemId: string): Promise<string | null> {
  try {
    const data = await gql<{ items: { name: string }[] }>(
      `query ($ids: [ID!]) { items(ids: $ids) { name } }`,
      { ids: [itemId] },
    );
    return data.items[0]?.name ?? null;
  } catch {
    return null;
  }
}

// The column id is stable once created; cache it across invocations.
const cache = (globalThis as Record<string, unknown>) as { __gwMondayColId?: string };

/** Find or create the "Greenways Walk" link column; returns its id. */
async function ensureWalkColumn(): Promise<string> {
  if (cache.__gwMondayColId) return cache.__gwMondayColId;

  const data = await gql<{
    boards: { columns: { id: string; title: string; type: string }[] }[];
  }>(
    `query ($board: [ID!]) { boards(ids: $board) { columns { id title type } } }`,
    { board: [BOARD_ID] },
  );
  const existing = data.boards[0]?.columns.find(
    (c) => c.title === WALK_COLUMN_TITLE && c.type === "link",
  );
  if (existing) {
    cache.__gwMondayColId = existing.id;
    return existing.id;
  }

  const created = await gql<{ create_column: { id: string } }>(
    `mutation ($board: ID!, $title: String!) {
       create_column(board_id: $board, title: $title, column_type: link) { id }
     }`,
    { board: BOARD_ID, title: WALK_COLUMN_TITLE },
  );
  cache.__gwMondayColId = created.create_column.id;
  return created.create_column.id;
}

/**
 * Write (or clear, url = null) the walk link on the picked row.
 * Best-effort by contract: callers treat a failure as a note, never a block.
 */
export async function setWalkLink(
  itemId: string,
  url: string | null,
  label?: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const columnId = await ensureWalkColumn();
    await gql(
      `mutation ($board: ID!, $item: ID!, $column: String!, $value: JSON!) {
         change_column_value(board_id: $board, item_id: $item, column_id: $column, value: $value) { id }
       }`,
      { board: BOARD_ID, item: itemId, column: columnId, value: linkColumnValue(url, label) },
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Monday sync failed" };
  }
}
