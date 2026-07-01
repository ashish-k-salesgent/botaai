const THEME_KEY = "botaai-theme";

export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(mode) {
  const dark = mode === "dark";
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    /* ignore */
  }
  return dark ? "dark" : "light";
}

export function toggleTheme() {
  return applyTheme(getTheme() === "dark" ? "light" : "dark");
}

applyTheme(getTheme());
