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
const trigger = () => screen.getByRole("button", { name: /^Theme: (Light|Dark|Olive)$/ });
const icon = () => trigger().querySelector("svg")?.dataset.icon;
const pick = (name: string) => {
  fireEvent.click(trigger());
  fireEvent.click(screen.getByRole("menuitemradio", { name }));
};

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

test("the top bar holds one icon button that opens a Light/Dark/Olive menu", () => {
  render(<App />);
  expect(trigger().closest("header")).toBeTruthy();
  expect(trigger().textContent).toBe("");
  expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
  expect(trigger().getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("menu")).toBeNull();

  fireEvent.click(trigger());
  expect(trigger().getAttribute("aria-expanded")).toBe("true");
  const items = screen.getAllByRole("menuitemradio");
  expect(items.map((i) => i.textContent)).toEqual(["Light", "Dark", "Olive"]);
  expect(items.map((i) => i.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
  expect(document.activeElement).toBe(items[0]);
});

test("each pick sets the theme, its icon and its label, and closes the menu", () => {
  render(<App />);
  expect(theme()).toBe("light");
  expect(icon()).toBe("sun");

  pick("Olive");
  expect(theme()).toBe("olive");
  expect(icon()).toBe("leaf");
  expect(trigger().getAttribute("aria-label")).toBe("Theme: Olive");
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger());

  pick("Dark");
  expect(theme()).toBe("dark");
  expect(icon()).toBe("moon");

  pick("Light");
  expect(theme()).toBe("light");
  expect(icon()).toBe("sun");
});

test("the menu works from the keyboard and closes on Escape or an outside click", () => {
  render(<App />);
  fireEvent.click(trigger());
  const menu = screen.getByRole("menu");
  const [light, dark, olive] = screen.getAllByRole("menuitemradio");
  fireEvent.keyDown(menu, { key: "ArrowDown" });
  expect(document.activeElement).toBe(dark);
  fireEvent.keyDown(menu, { key: "ArrowDown" });
  expect(document.activeElement).toBe(olive);
  fireEvent.keyDown(menu, { key: "ArrowDown" });
  expect(document.activeElement).toBe(light);
  fireEvent.keyDown(menu, { key: "ArrowUp" });
  expect(document.activeElement).toBe(olive);
  fireEvent.keyDown(menu, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger());
  expect(theme()).toBe("light");

  fireEvent.click(trigger());
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

test("Home, End and Tab in the menu; arrow keys on the button open it at either end", () => {
  render(<App />);
  fireEvent.keyDown(trigger(), { key: "ArrowUp" });
  const [light, , olive] = screen.getAllByRole("menuitemradio");
  expect(document.activeElement).toBe(olive);
  fireEvent.keyDown(olive, { key: "Home" });
  expect(document.activeElement).toBe(light);
  fireEvent.keyDown(light, { key: "End" });
  expect(document.activeElement).toBe(olive);
  fireEvent.keyDown(olive, { key: "Tab" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger());

  fireEvent.keyDown(trigger(), { key: "ArrowDown" });
  expect(document.activeElement).toBe(screen.getAllByRole("menuitemradio")[0]);
  fireEvent.click(trigger());
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(trigger());
});

test("on a dark device the menu opens with Dark checked and focused", () => {
  deviceDark = true;
  render(<App />);
  fireEvent.click(trigger());
  const dark = screen.getByRole("menuitemradio", { name: "Dark" });
  expect(dark.getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(dark);
});

test("before any pick the theme follows the device, including when it changes", () => {
  deviceDark = true;
  render(<App />);
  expect(theme()).toBe("dark");
  expect(icon()).toBe("moon");
  setDevice(false);
  expect(theme()).toBe("light");
  expect(icon()).toBe("sun");
});

test("a pick overrides the device until the page reloads", () => {
  deviceDark = true;
  render(<App />);
  pick("Olive");
  expect(theme()).toBe("olive");
  setDevice(false);
  expect(theme()).toBe("olive");
  setDevice(true);
  expect(theme()).toBe("olive");

  // A fresh load starts from the device theme again; nothing is remembered.
  cleanup();
  setDevice(false);
  render(<App />);
  expect(theme()).toBe("light");
  expect(icon()).toBe("sun");
});
