import { useEffect, useState } from "react";

/** The state of one API load: loading, failed, or done with its data. */
export type Load<T> =
  { state: "loading" } | { state: "error"; message: string } | { state: "ok"; data: T };

export function useLoad<T>(load: () => Promise<T>, key: string): Load<T> {
  const [result, setResult] = useState<Load<T>>({ state: "loading" });
  // Reload only when `key` (what is being loaded) changes, not on every new `load` closure.
  useEffect(() => {
    let live = true;
    setResult({ state: "loading" });
    load()
      .then((data) => live && setResult({ state: "ok", data }))
      .catch((e: Error) => live && setResult({ state: "error", message: e.message }));
    return () => {
      live = false;
    };
  }, [key]);
  return result;
}
