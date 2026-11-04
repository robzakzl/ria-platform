import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router";
import "./App.css";
import { AccountDetail, AccountList, NewAccountForm } from "./pages/Accounts";
import Commissions from "./pages/Commissions";
import Settings from "./pages/Settings";
import Logo from "./Logo";
import ThemeSwitcher from "./ThemeSwitcher";

// The main pages. Accounts and Commissions have their own routes below; the others show only their title for now.
const pages = [
  { path: "/", title: "Home" },
  { path: "/accounts", title: "Accounts" },
  { path: "/commissions", title: "Commissions" },
  { path: "/positions", title: "Positions" },
  { path: "/security-master", title: "Security Master" },
];
const placeholders = pages.filter((p) => p.path !== "/accounts" && p.path !== "/commissions");

/**
 * App shell: a left navigation bar, a top bar holding the theme switch, and the routed page. Hash routing
 * (/#/accounts) because the deployed build is static files on GitHub Pages, which cannot serve a deep link
 * like /accounts on refresh.
 */
export default function App() {
  return (
    <HashRouter>
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <Logo />
          </div>
          <nav className="nav" aria-label="Main">
            {pages.map((p) => (
              <NavLink key={p.path} to={p.path} end={p.path === "/"}>
                {p.title}
              </NavLink>
            ))}
          </nav>
          <nav className="nav nav-secondary" aria-label="Secondary">
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </aside>
        <div className="main-col">
          <header className="topbar">
            <ThemeSwitcher />
          </header>
          <main className="content">
            <Routes>
              {placeholders.map((p) => (
                <Route key={p.path} path={p.path} element={<h1>{p.title}</h1>} />
              ))}
              <Route path="/accounts" element={<AccountList />} />
              <Route path="/accounts/new" element={<NewAccountForm />} />
              <Route path="/accounts/:id" element={<AccountDetail />} />
              <Route path="/commissions" element={<Commissions />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  );
}
