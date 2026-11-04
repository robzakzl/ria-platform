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
const toggle = () => screen.getByRole("button", { name: /^Switch to (light|dark) theme$/ });
const icon = () => toggle().querySelector("svg")?.dataset.icon;

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

test("the top bar holds one icon button, not a Light/Dark/System group", () => {
  render(<App />);
  expect(screen.queryByRole("group", { name: "Theme" })).toBeNull();
  expect(toggle().closest("header")).toBeTruthy();
  expect(toggle().textContent).toBe("");
  expect(toggle().querySelector("svg")).toBeTruthy();
});

test("light shows a sun and offers dark; dark shows a moon and offers light", () => {
  render(<App />);
  expect(theme()).toBe("light");
  expect(icon()).toBe("sun");
  expect(toggle().getAttribute("aria-label")).toBe("Switch to dark theme");
  fireEvent.click(toggle());
  expect(theme()).toBe("dark");
  expect(icon()).toBe("moon");
  expect(toggle().getAttribute("aria-label")).toBe("Switch to light theme");
  fireEvent.click(toggle());
  expect(theme()).toBe("light");
  expect(icon()).toBe("sun");
});

test("before any click the theme follows the device, including when it changes", () => {
  deviceDark = true;
  render(<App />);
  expect(theme()).toBe("dark");
  expect(icon()).toBe("moon");
  setDevice(false);
  expect(theme()).toBe("light");
  expect(icon()).toBe("sun");
});

test("a click overrides the device until the page reloads", () => {
  deviceDark = true;
  render(<App />);
  fireEvent.click(toggle());
  expect(theme()).toBe("light");
  setDevice(true);
  expect(theme()).toBe("light");
  setDevice(false);
  fireEvent.click(toggle());
  expect(theme()).toBe("dark");

  // A fresh load starts from the device theme again; nothing is remembered.
  cleanup();
  render(<App />);
  expect(theme()).toBe("light");
  expect(icon()).toBe("sun");
});
