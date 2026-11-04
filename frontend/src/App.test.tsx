import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  window.location.hash = "";
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) => Promise.resolve({ ok: path === "/api/health" })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("left navigation lists the pages and opens Home by default", () => {
  render(<App />);
  expect(screen.getByRole("img", { name: "Asterly" }).closest(".brand")).toBeTruthy();
  const main = screen.getByRole("navigation", { name: "Main" });
  const links = main.querySelectorAll("a");
  expect([...links].map((a) => a.textContent)).toEqual([
    "Home",
    "Accounts",
    "Commissions",
    "Positions",
    "Security Master",
  ]);
  expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Home");
});

test.each(["Positions", "Security Master"])(
  "clicking %s shows its empty page",
  (title) => {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: title }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    expect(screen.getByRole("link", { name: title }).getAttribute("aria-current")).toBe("page");
  },
);

test("Settings shows API and database status from the health endpoints", async () => {
  render(<App />);
  fireEvent.click(screen.getByRole("link", { name: "Settings" }));
  expect(await screen.findByText("API: ok")).toBeTruthy();
  expect(await screen.findByText("Database: down")).toBeTruthy();
});

test("a deep link opens its page directly", () => {
  window.location.hash = "#/positions";
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Positions");
});

test("an unknown page redirects to Home", () => {
  window.location.hash = "#/nope";
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Home");
});

test("the menu shows the Asterly crest logo", () => {
  render(<App />);
  expect(screen.getByRole("img", { name: "Asterly" }).textContent).toContain("ASTERLY");
});
