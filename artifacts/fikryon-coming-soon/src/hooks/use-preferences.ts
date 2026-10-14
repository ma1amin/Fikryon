import { useCallback, useEffect, useState } from "react";
import { copy, type Lang } from "@/config/i18n";

export type Theme = "light" | "dark";
const LANG_KEY = "fikryon-lang";
const THEME_KEY = "fikryon-theme";

function read(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, v: string) {
  try { localStorage.setItem(key, v); } catch { /* ignore */ }
}

function initialLang(): Lang {
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "ar" || q === "en") { write(LANG_KEY, q); return q; }
  const s = read(LANG_KEY);
  if (s === "ar" || s === "en") return s;
  return "ar";
}
function initialTheme(): Theme {
  const q = new URLSearchParams(window.location.search).get("theme");
  if (q === "light" || q === "dark") { write(THEME_KEY, q); return q; }
  const s = read(THEME_KEY);
  if (s === "light" || s === "dark") return s;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function setMeta(sel: string, content: string) {
  document.querySelectorAll<HTMLMetaElement>(sel).forEach((m) => (m.content = content));
}

export function usePreferences() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = lang === "ar" ? "rtl" : "ltr";
    const t = copy[lang];
    document.title = t.title;
    setMeta('meta[name="description"]', t.metaDescription);
    setMeta('meta[property="og:title"], meta[name="twitter:title"]', t.title);
    setMeta('meta[property="og:description"], meta[name="twitter:description"]', t.metaDescription);
    setMeta('meta[property="og:locale"]', lang === "ar" ? "ar_SA" : "en_US");
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-switching");
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    setMeta('meta[name="theme-color"]', theme === "dark" ? "#03241f" : "#FAF7EF");
    const id = window.setTimeout(() => root.classList.remove("theme-switching"), 450);
    return () => window.clearTimeout(id);
  }, [theme]);

  const changeLang = useCallback((l: Lang) => { setLang(l); write(LANG_KEY, l); }, []);
  const toggleTheme = useCallback(() => {
    setTheme((p) => { const n = p === "dark" ? "light" : "dark"; write(THEME_KEY, n); return n; });
  }, []);

  return { lang, theme, changeLang, toggleTheme };
}
