import { useCallback, useEffect, useState } from "react";
import { listEncounters } from "@/domain/repository";
import { withStorageRetry } from "@/domain/db";
import { onUserChange } from "@/domain/session";
import type { EncounterRecord } from "@/domain/types";
import { onSyncChange } from "./sync-runner";

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const u = () => setOnline(navigator.onLine);
    u();
    window.addEventListener("online", u);
    window.addEventListener("offline", u);
    return () => {
      window.removeEventListener("online", u);
      window.removeEventListener("offline", u);
    };
  }, []);
  return online;
}

/** Encounters visible to the current account (own + unowned demo). Reloads on account change and sync. */
export function useEncounters() {
  const [records, setRecords] = useState<EncounterRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setRecords(await withStorageRetry(() => listEncounters()));
      setError(null);
    } catch (e) {
      const err = e as Error;
      setError(`${err.name && err.name !== "Error" ? err.name + ": " : ""}${err.message || "Local storage unavailable"}`);
      setRecords([]);
    }
  }, []);
  useEffect(() => {
    void reload();
    const a = onUserChange(() => void reload());
    const b = onSyncChange((o) => o && void reload());
    return () => {
      a();
      b();
    };
  }, [reload]);
  return { records, error, reload };
}

export interface StorageStatus {
  indexedDB: "checking" | "ok" | "failed";
  error: string | null;
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

export function useStorageStatus() {
  const [s, setS] = useState<StorageStatus>({ indexedDB: "checking", error: null, persisted: null, usage: null, quota: null });
  const check = useCallback(async () => {
    let idb: StorageStatus["indexedDB"] = "ok";
    let error: string | null = null;
    try {
      await withStorageRetry(() => listEncounters());
    } catch (e) {
      idb = "failed";
      error = (e as Error).message;
    }
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    setS({ indexedDB: idb, error, persisted, usage: est?.usage ?? null, quota: est?.quota ?? null });
  }, []);
  useEffect(() => {
    void check();
  }, [check]);
  const requestPersist = async () => {
    if (navigator.storage?.persist) await navigator.storage.persist();
    await check();
  };
  return { status: s, requestPersist, recheck: check };
}
