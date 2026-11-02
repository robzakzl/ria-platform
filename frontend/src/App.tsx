import { useEffect, useState } from "react";

type Status = "checking" | "ok" | "down";

/** Starter page: shows whether the API and its database answer. */
export default function App() {
  const [api, setApi] = useState<Status>("checking");
  const [db, setDb] = useState<Status>("checking");

  useEffect(() => {
    const probe = (path: string, set: (s: Status) => void) =>
      fetch(path)
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
