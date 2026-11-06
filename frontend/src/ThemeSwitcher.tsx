import { useEffect, useId, useLayoutEffect, useRef, useState, type JSX, type KeyboardEvent } from "react";

type Theme = "light" | "dark" | "olive";

const darkQuery = "(prefers-color-scheme: dark)";

/** The device's own theme; light where the browser cannot tell (e.g. jsdom). */
function deviceIsDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(darkQuery).matches;
}

const SunIcon = () => (
  <svg data-icon="sun" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
    <path
      d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg data-icon="moon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path
      d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const LeafIcon = () => (
  <svg data-icon="leaf" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
    <path
      d="M5 19C5 10 10.5 4.5 20 4c-.5 9.5-6 15-15 15z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M5 19l8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const themes: { id: Theme; label: string; Icon: () => JSX.Element }[] = [
  { id: "light", label: "Light", Icon: SunIcon },
  { id: "dark", label: "Dark", Icon: MoonIcon },
  { id: "olive", label: "Olive", Icon: LeafIcon },
];

/**
 * An icon button showing the current theme (sun, moon or leaf) that opens a menu of Light, Dark and Olive.
 * Every visit starts on the device's light or dark theme and follows it until the first pick; a pick is not
 * stored and lasts until the page reloads. Sets data-theme="light"|"dark"|"olive" on <html>, which App.css
 * keys on.
 */
export default function ThemeSwitcher() {
  const [picked, setPicked] = useState<Theme | null>(null);
  const [dark, setDark] = useState(deviceIsDark);
  const [open, setOpen] = useState(false);
  // Which item gets focus when the menu opens: the current theme, or the first or last item from the arrows.
  const focusAt = useRef(0);
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(darkQuery);
    const onChange = () => setDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const theme: Theme = picked ?? (dark ? "dark" : "light");
  // Layout effect: the theme is in place before the first paint, so a dark device sees no light flash.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // An open menu takes focus and closes on a click anywhere outside it.
  useEffect(() => {
    if (!open) return;
    items.current[focusAt.current]?.focus();
    const onDown = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return;
      const hadFocus = root.current?.contains(document.activeElement);
      setOpen(false);
      if (hadFocus) button.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const openAt = (i: number) => {
    focusAt.current = i;
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const onTriggerKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openAt(e.key === "ArrowDown" ? 0 : themes.length - 1);
    }
  };

  const onMenuKey = (e: KeyboardEvent) => {
    const at = items.current.indexOf(document.activeElement as HTMLButtonElement);
    const move = (i: number) => items.current[(i + themes.length) % themes.length]?.focus();
    if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(at + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(at - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      move(0);
    } else if (e.key === "End") {
      e.preventDefault();
      move(themes.length - 1);
    }
  };

  const currentAt = themes.findIndex((t) => t.id === theme);
  const current = themes[currentAt];
  const label = `Theme: ${current.label}`;
  return (
    <div className="theme-switcher" ref={root}>
      <button
        ref={button}
        type="button"
        className="theme-toggle"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openAt(currentAt))}
        onKeyDown={onTriggerKey}
      >
        <current.Icon />
      </button>
      {open && (
        <div id={menuId} className="theme-menu" role="menu" aria-label="Theme" onKeyDown={onMenuKey}>
          {themes.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={t.id === theme}
              tabIndex={-1}
              className="theme-option"
              onClick={() => {
                setPicked(t.id);
                close();
              }}
            >
              <t.Icon />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
