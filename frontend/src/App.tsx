import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router";
import "./App.css";
import Settings from "./pages/Settings";

// The four main pages. Their content is empty for now: each shows only its title.
const pages = [
  { path: "/", title: "Home" },
  { path: "/accounts", title: "Accounts" },
  { path: "/positions", title: "Positions" },
  { path: "/security-master", title: "Security Master" },
];

/**
 * App shell: a left navigation bar and the routed page. Hash routing (/#/accounts) because the deployed
 * build is static files on GitHub Pages, which cannot serve a deep link like /accounts on refresh.
 */
export default function App() {
  return (
    <HashRouter>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">ria-platform</div>
          <nav className="nav" aria-label="Main">
            {pages.map((p) => (
              <NavLink key={p.path} to={p.path} end>
                {p.title}
              </NavLink>
            ))}
          </nav>
          <nav className="nav nav-secondary" aria-label="Secondary">
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </aside>
        <main className="content">
          <Routes>
            {pages.map((p) => (
              <Route key={p.path} path={p.path} element={<h1>{p.title}</h1>} />
            ))}
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
