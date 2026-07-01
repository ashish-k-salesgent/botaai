import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, getTheme } from "@/lib/theme";

export default function ThemeToggle() {
  const [dark, setDark] = useState(() => getTheme() === "dark");

  useEffect(() => {
    setDark(getTheme() === "dark");
  }, []);

  const toggle = () => {
    const next = applyTheme(dark ? "light" : "dark");
    setDark(next === "dark");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      className="p-2 hover:bg-[var(--bg-soft)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
