import { useCallback, useEffect, useState } from "react";
import { listEncounters } from "@/domain/repository";
import type { EncounterRecord } from "@/domain/types";

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

export function useEncounters() {
  const [records, setRecords] = useState<EncounterRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setRecords(await listEncounters());
      setError(null);
    } catch (e) {
      setError((e as Error).message || "Local storage unavailable");
      setRecords([]);
    }
  }, []);
  useEffect(() => {
    void reload();
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
  const [s, setS] = useState<StorageStatus>({
    indexedDB: "checking",
    error: null,
    persisted: null,
    usage: null,
    quota: null,
  });
  const check = useCallback(async () => {
    let idb: StorageStatus["indexedDB"] = "ok";
    let error: string | null = null;
    try {
      await listEncounters();
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
  return { status: s, requestPersist };
}
