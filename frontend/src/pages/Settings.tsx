import { useEffect, useState } from "react";
import { apiBase } from "../api";

type Status = "checking" | "ok" | "down";

/** Settings page: shows whether the API and its database answer. */
export default function Settings() {
  const [api, setApi] = useState<Status>("checking");
  const [db, setDb] = useState<Status>("checking");

  useEffect(() => {
    const probe = (path: string, set: (s: Status) => void) =>
      fetch(apiBase + path)
        .then((r) => set(r.ok ? "ok" : "down"))
        .catch(() => set("down"));
    probe("/api/health", setApi);
    probe("/api/health/db", setDb);
  }, []);

  return (
    <>
      <h1>Settings</h1>
      <ul>
        <li>API: {api}</li>
        <li>Database: {db}</li>
      </ul>
    </>
  );
}
