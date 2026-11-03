import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows API and database status from the health endpoints", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn((path: string) => Promise.resolve({ ok: path === "/api/health" })),
  );
  render(<App />);
  expect(await screen.findByText("API: ok")).toBeTruthy();
  expect(await screen.findByText("Database: down")).toBeTruthy();
});
