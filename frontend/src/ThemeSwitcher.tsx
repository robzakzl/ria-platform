import { useEffect, useLayoutEffect, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";

const choices: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const darkQuery = "(prefers-color-scheme: dark)";

/** The device's own theme; light where the browser cannot tell (e.g. jsdom). */
function deviceIsDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(darkQuery).matches;
}

/**
 * Light / Dark / System switch. Every visit starts on System (the device's theme); a manual pick is not
 * stored and lasts until the page reloads. Sets data-theme="light"|"dark" on <html>, which App.css keys on.
 */
export default function ThemeSwitcher() {
  const [choice, setChoice] = useState<ThemeChoice>("system");
  const [dark, setDark] = useState(deviceIsDark);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(darkQuery);
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme = choice === "system" ? (dark ? "dark" : "light") : choice;
  // Layout effect: the theme is in place before the first paint, so a dark device sees no light flash.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {choices.map((c) => (
        <button
          key={c.value}
          type="button"
          aria-pressed={choice === c.value}
          onClick={() => setChoice(c.value)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
