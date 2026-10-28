"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveDraftAction } from "@/app/actions";
import { toPatch, type EditorDraft } from "./types";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict" | "offline";

const key = (id: string) => `brs:draft:${id}`;

interface LocalCopy {
  baseVersion: number;
  draft: EditorDraft;
  savedAt: number;
}

function readLocal(id: string): LocalCopy | null {
  try {
    const raw = localStorage.getItem(key(id));
    return raw ? (JSON.parse(raw) as LocalCopy) : null;
  } catch {
    return null;
  }
}
function writeLocal(id: string, v: LocalCopy | null) {
  try {
    if (v) localStorage.setItem(key(id), JSON.stringify(v));
    else localStorage.removeItem(key(id));
  } catch {
    /* storage unavailable (private mode) — server save still works */
  }
}

/**
 * Autosave with optimistic concurrency and a local safety copy:
 * - edits are saved ~1s after typing stops
 * - an unsaved copy is kept in localStorage until the server confirms, so nothing is lost if the
 *   tab closes, the iPad sleeps or the network drops
 * - if another device saved a newer version, we stop and ask instead of overwriting
 */
export function useAutosave(projectId: string, serverVersion: number, serverDraft: EditorDraft) {
  const [draft, setDraftState] = useState<EditorDraft>(serverDraft);
  const [version, setVersion] = useState(serverVersion);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<LocalCopy | null>(null);
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(draft);
  const versionRef = useRef(version);
  const inflight = useRef(false);
  latest.current = draft;
  versionRef.current = version;

  // Offer to restore unsaved work from a previous session on this device.
  useEffect(() => {
    const local = readLocal(projectId);
    if (local && JSON.stringify(local.draft) !== JSON.stringify(serverDraft)) setRecovered(local);
    else if (local) writeLocal(projectId, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Adopt server changes (from another device or a Claude draft) when we have no local edits.
  useEffect(() => {
    if (serverVersion > versionRef.current && (state === "idle" || state === "saved")) {
      setDraftState(serverDraft);
      setVersion(serverVersion);
    } else if (serverVersion > versionRef.current && state === "dirty") {
      setConflictVersion(serverVersion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverVersion]);

  const save = useCallback(
    async (overrideVersion?: number) => {
      if (inflight.current) return;
      inflight.current = true;
      setState("saving");
      const snapshot = latest.current;
      const res = await saveDraftAction(projectId, overrideVersion ?? versionRef.current, toPatch(snapshot)).catch(() => null);
      inflight.current = false;
      if (!res) {
        setState(typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "error");
        setError("Couldn’t reach the server. Your changes are kept on this device.");
        return;
      }
      if (res.ok) {
        setVersion(res.data!.version);
        versionRef.current = res.data!.version;
        setError(null);
        setConflictVersion(null);
        if (latest.current === snapshot) {
          setState("saved");
          writeLocal(projectId, null);
        } else {
          setState("dirty");
          schedule();
        }
      } else if (res.conflict) {
        setState("conflict");
        setConflictVersion(res.conflict.currentVersion);
        setError(res.error);
      } else {
        setState("error");
        setError(res.error);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  );

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1000);
  }, [save]);

  const setDraft = useCallback(
    (updater: (d: EditorDraft) => EditorDraft) => {
      setDraftState((d) => {
        const next = updater(d);
        writeLocal(projectId, { baseVersion: versionRef.current, draft: next, savedAt: Date.now() });
        return next;
      });
      setState((s) => (s === "conflict" ? s : "dirty"));
      schedule();
    },
    [projectId, schedule],
  );

  // Retry automatically when the connection comes back.
  useEffect(() => {
    const onOnline = () => {
      if (state === "offline" || state === "error") void save();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [state, save]);

  // Warn before closing with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "saving" || state === "error" || state === "offline" || state === "conflict") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (state === "dirty" || state === "error" || state === "offline") await save();
  }, [save, state]);

  return {
    draft,
    setDraft,
    version,
    state,
    error,
    flush,
    retry: () => save(),
    recovered,
    restoreRecovered: () => {
      if (!recovered) return;
      setDraftState(recovered.draft);
      setRecovered(null);
      setState("dirty");
      schedule();
    },
    discardRecovered: () => {
      writeLocal(projectId, null);
      setRecovered(null);
    },
    conflictVersion,
    keepMine: () => conflictVersion != null && save(conflictVersion),
    loadLatest: () => {
      writeLocal(projectId, null);
      setDraftState(serverDraft);
      setVersion(serverVersion);
      setConflictVersion(null);
      setState("idle");
      window.location.reload();
    },
  };
}
