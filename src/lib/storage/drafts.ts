"use client";

import { openDB, IDBPDatabase } from "idb";

const DB_NAME = "judgix.v1";
const STORE_DRAFTS = "drafts";
const STORE_INDEX = "campaign_index";

let _db: Promise<IDBPDatabase> | null = null;

function db() {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (!_db) {
    _db = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE_DRAFTS)) d.createObjectStore(STORE_DRAFTS);
        if (!d.objectStoreNames.contains(STORE_INDEX)) d.createObjectStore(STORE_INDEX);
      },
    });
  }
  return _db;
}

export async function saveDraft(key: string, value: unknown) {
  try {
    const d = await db();
    await d.put(STORE_DRAFTS, value, key);
  } catch {}
}

export async function loadDraft<T>(key: string): Promise<T | null> {
  try {
    const d = await db();
    const v = await d.get(STORE_DRAFTS, key);
    return (v as T) ?? null;
  } catch { return null; }
}

export async function clearDraft(key: string) {
  try {
    const d = await db();
    await d.delete(STORE_DRAFTS, key);
  } catch {}
}

export async function knownCampaignIds(): Promise<string[]> {
  try {
    const d = await db();
    const v = (await d.get(STORE_INDEX, "ids")) as string[] | undefined;
    return v ?? [];
  } catch { return []; }
}

export async function rememberCampaignId(id: string) {
  try {
    const d = await db();
    const cur = ((await d.get(STORE_INDEX, "ids")) as string[] | undefined) ?? [];
    if (!cur.includes(id)) {
      cur.push(id);
      await d.put(STORE_INDEX, cur, "ids");
    }
  } catch {}
}
