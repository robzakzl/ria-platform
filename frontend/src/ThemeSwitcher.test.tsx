import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import App from "./App";

// A controllable stand-in for the device's prefers-color-scheme setting.
let deviceDark = false;
let listeners: (() => void)[] = [];

const setDevice = (dark: boolean) => {
  deviceDark = dark;
  act(() => listeners.forEach((l) => l()));
};

const theme = () => document.documentElement.dataset.theme;
const option = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  window.location.hash = "";
  deviceDark = false;
  listeners = [];
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })));
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(prefers-color-scheme: dark)" && deviceDark;
    },
    addEventListener: (_: string, l: () => void) => listeners.push(l),
    removeEventListener: (_: string, l: () => void) => (listeners = listeners.filter((x) => x !== l)),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

test("the top bar offers Light, Dark and System, starting on System", () => {
  render(<App />);
  const group = screen.getByRole("group", { name: "Theme" });
  expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
    "Light",
    "Dark",
    "System",
  ]);
  expect(group.closest("header")).toBeTruthy();
  expect(option("System").getAttribute("aria-pressed")).toBe("true");
});

test("System follows the device theme, including when it changes", () => {
  deviceDark = true;
  render(<App />);
  expect(theme()).toBe("dark");
  setDevice(false);
  expect(theme()).toBe("light");
});

test("picking Light or Dark overrides the device until the page reloads", () => {
  deviceDark = true;
  render(<App />);
  fireEvent.click(option("Light"));
  expect(theme()).toBe("light");
  expect(option("Light").getAttribute("aria-pressed")).toBe("true");
  setDevice(true);
  expect(theme()).toBe("light");
  fireEvent.click(option("Dark"));
  expect(theme()).toBe("dark");
  setDevice(false);
  fireEvent.click(option("System"));
  expect(theme()).toBe("light");

  // A fresh load starts from the device theme again; nothing is remembered.
  cleanup();
  setDevice(false);
  render(<App />);
  expect(option("System").getAttribute("aria-pressed")).toBe("true");
  expect(theme()).toBe("light");
});
