import { useEffect, useState } from "react";

type Status = "checking" | "ok" | "down";

// Where the API lives. Empty (same origin, the default) locally; the deployed build, served by GitHub
// Pages, sets VITE_API_BASE_URL to the API's own HTTPS URL at build time (scripts/deploy.sh).
const apiBase = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

/** Starter page: shows whether the API and its database answer. */
export default function App() {
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
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640 }}>
      <h1>ria-platform</h1>
      <p>Investment adviser platform — starter app.</p>
      <ul>
        <li>API: {api}</li>
        <li>Database: {db}</li>
      </ul>
    </main>
  );
}
