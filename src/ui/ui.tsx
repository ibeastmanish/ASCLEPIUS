import { useEffect, useState, type ReactNode } from "react";
import type { Status } from "../engine/types";

// ------------------------------------------------------------------ router
export type Route = "home" | "check" | "body" | "trends" | "outbox" | "pulse" | "crew" | "story" | "settings" | "eyes";
const ROUTES: Route[] = ["home", "check", "body", "trends", "outbox", "pulse", "crew", "story", "settings", "eyes"];

export function currentRoute(): Route {
  const h = location.hash.replace(/^#\/?/, "").split("?")[0] as Route;
  return ROUTES.includes(h) ? h : "home";
}

export function useRoute(): [Route, (r: Route) => void] {
  const [r, setR] = useState<Route>(currentRoute);
  useEffect(() => {
    const on = () => { setR(currentRoute()); window.scrollTo({ top: 0 }); };
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  return [r, (to) => { location.hash = `#/${to}`; }];
}

// ------------------------------------------------------------------ theme (per-viewer convenience)
export type ThemeMode = "system" | "light" | "dark";
const THEME_KEY = "asclepius-theme";

export function getThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(m: ThemeMode) {
  const root = document.documentElement;
  if (m === "system") delete root.dataset.theme;
  else root.dataset.theme = m;
}

export function setThemeMode(m: ThemeMode) {
  try { localStorage.setItem(THEME_KEY, m); } catch { /* private mode: still applies for this visit */ }
  applyTheme(m);
  dispatchEvent(new Event("asclepius-theme"));
}

/** Resolved appearance, for things drawn with attributes (charts) rather than CSS. */
export function useDark(): boolean {
  const q = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  const calc = () => { const m = getThemeMode(); return m === "dark" || (m === "system" && !!q?.matches); };
  const [dark, setDark] = useState(calc);
  useEffect(() => {
    const on = () => setDark(calc());
    q?.addEventListener("change", on);
    addEventListener("asclepius-theme", on);
    return () => { q?.removeEventListener("change", on); removeEventListener("asclepius-theme", on); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return dark;
}

export function chartColors(dark: boolean) {
  return dark
    ? { ink: "#ffffff", ink3: "#9ba3b2", hair: "#2a303b", personal: "#6fa3ff", personalFill: "#6fa3ff", line: "#ffffff", page: "#000000" }
    : { ink: "#000000", ink3: "#565c6b", hair: "#d3d7de", personal: "#0b3d91", personalFill: "#6fa3ff", line: "#000000", page: "#ffffff" };
}

// ------------------------------------------------------------------ drawn glyphs (one stroke family)
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2.5, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const };
export const G = {
  check: <svg viewBox="0 0 24 24" {...S} strokeWidth={3.2}><path d="M4.5 12.5l5 5L19.5 6.5" /></svg>,
  alert: <svg viewBox="0 0 24 24" {...S} strokeWidth={3.4}><path d="M12 3.5v11" /><path d="M12 19.5v1" /></svg>,
  cross: <svg viewBox="0 0 24 24" {...S} strokeWidth={3.2}><path d="M5.5 5.5l13 13M18.5 5.5l-13 13" /></svg>,
  question: <svg viewBox="0 0 24 24" {...S} strokeWidth={3}><path d="M8 8.5a4 4 0 1 1 5.5 3.7c-1 .4-1.5 1.2-1.5 2.3v.5" /><path d="M12 19.5v1" /></svg>,
  dash: <svg viewBox="0 0 24 24" {...S} strokeWidth={3}><path d="M6 12h12" /></svg>,
  info: <svg viewBox="0 0 24 24" {...S} strokeWidth={2}><rect x="3" y="3" width="18" height="18" /><path d="M12 10.5v6.5M12 7v.5" /></svg>,
  sun: <svg viewBox="0 0 24 24" {...S} strokeWidth={2.4}><circle cx="12" cy="12" r="4" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>,
  chev: <svg viewBox="0 0 24 24" {...S} strokeWidth={2.4}><path d="M9 5l7 7-7 7" /></svg>,
  arrow: <svg viewBox="0 0 24 24" {...S} strokeWidth={2.4}><path d="M4 12h15M13 6l6 6-6 6" /></svg>,
  close: <svg viewBox="0 0 24 24" {...S} strokeWidth={2.6}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  plus: <svg viewBox="0 0 24 24" {...S} strokeWidth={3}><path d="M12 4.5v15M4.5 12h15" /></svg>,
  minus: <svg viewBox="0 0 24 24" {...S} strokeWidth={3}><path d="M4.5 12h15" /></svg>,
  send: <svg viewBox="0 0 24 24" {...S} strokeWidth={2.4}><path d="M3 11.5L21 3l-7 18-3-7.5z" /><path d="M11 13.5L21 3" /></svg>,
  digest: <svg viewBox="0 0 24 24" {...S} strokeWidth={2.6}><path d="M4 6h16M4 12h16M4 18h10" /></svg>,
  lock: <svg viewBox="0 0 24 24" {...S} strokeWidth={2.4}><rect x="4.5" y="10.5" width="15" height="10" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></svg>,
};

/** Mood faces, drawn: 1 very low to 5 great. */
export function Face({ level }: { level: number }) {
  const mouth = ["M8 17.2q4-4 8 0", "M8.5 16.6q3.5-2 7 0", "M8.5 16h7", "M8.5 15.2q3.5 2.2 7 0", "M7.5 14.6q4.5 4.4 9 0"][level - 1];
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" />
      {level === 1 ? <path d="M8 9.5l2 1M16 9.5l-2 1" /> : <path d="M9 10v.5M15 10v.5" strokeWidth={2.6} />}
      <path d={mouth} />
    </svg>
  );
}

// ------------------------------------------------------------------ status
const WORD: Record<Status | "none", string> = { green: "Good", yellow: "Check", red: "Act now", invalid: "Re-measure", none: "Not checked" };
export const STATUS_GLYPH: Record<Status | "none", ReactNode> = { green: G.check, yellow: G.alert, red: G.cross, invalid: G.question, none: G.dash };

export function StatusBadge({ status, word, large, pop }: { status: Status | "none"; word?: string; large?: boolean; pop?: boolean }) {
  return (
    <span className={`status status-${status}${large ? " status-lg" : ""}${pop ? " pop" : ""}`} role={large || pop ? "status" : undefined}>
      <span className="ico" aria-hidden="true">{STATUS_GLYPH[status]}</span>
      {word ?? WORD[status]}
      {word === "" && <span className="sr-only">{WORD[status]}</span>}
    </span>
  );
}

export const OVERALL_WORD: Record<Status | "none", string> = {
  green: "All good", yellow: "Check this", red: "Act now", invalid: "Re-measure", none: "Not checked yet",
};

export function Disclaimer() {
  return (
    <p className="disclaimer">
      <span aria-hidden="true">{G.info}</span>
      <span>Decision support, not a medical device. ASCLEPIUS does not diagnose. When in doubt, tell your crew medical officer.</span>
    </p>
  );
}

export function SimTag() {
  return (
    <span className="tag tag-sim" title="This crew member and their data are simulated">
      <span className="long">Simulated crew data</span><span className="short" aria-hidden="true">Sim data</span>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  // A bowl-and-orbit mark: Hygieia's bowl, circled by a mission orbit (favicon and app icon).
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="#0B3D91" stroke="#fff" strokeWidth="2.5" />
      <ellipse cx="32" cy="32" rx="25" ry="9" fill="none" stroke="#6FA3FF" strokeWidth="2.5" transform="rotate(-24 32 32)" />
      <path d="M19 30h26a13 13 0 0 1-26 0z" fill="#fff" />
      <rect x="29" y="42" width="6" height="6" rx="1" fill="#fff" />
      <circle cx="51" cy="21" r="3.4" fill="#FC3D21" />
    </svg>
  );
}

// ------------------------------------------------------------------ shell
export const NAV: { r: Route; n: string; label: string; title: string; tab?: boolean }[] = [
  { r: "home", n: "1.0", label: "Today", title: "Today", tab: true },
  { r: "check", n: "2.0", label: "Check", title: "Daily check", tab: true },
  { r: "body", n: "3.0", label: "Body map", title: "Body map", tab: true },
  { r: "trends", n: "4.0", label: "Trends", title: "Trends", tab: true },
  { r: "outbox", n: "5.0", label: "Outbox", title: "Earth outbox", tab: true },
  { r: "pulse", n: "6.0", label: "Crew Pulse", title: "Crew Pulse" },
  { r: "crew", n: "7.0", label: "Proof", title: "Crew reference" },
  { r: "story", n: "8.0", label: "Story", title: "Mission Story" },
  { r: "settings", n: "9.0", label: "Settings", title: "Settings" },
];

export function Shell({ route, children, who, sim }: { route: Route; children: ReactNode; who?: ReactNode; sim?: boolean }) {
  const link = (n: (typeof NAV)[number], short = false) => (
    <a key={n.r} className="nav-item" href={`#/${n.r}`} aria-current={route === n.r ? "page" : undefined}>
      <span className="num">{n.n}</span>
      <span>{short && n.r === "outbox" ? "Earth" : n.label}</span>
    </a>
  );
  return (
    <div className="shell">
      <header className="band">
        <a className="band-mark" href="#/home" aria-label="ASCLEPIUS, today">
          <span className="sq" aria-hidden="true" />
          <b>ASCLEPIUS</b>
        </a>
        <nav className="band-nav" aria-label="Main">{NAV.map((n) => link(n))}</nav>
        <nav className="band-more" aria-label="More">
          {NAV.filter((n) => !n.tab).map((n) => (
            <a key={n.r} href={`#/${n.r}`} aria-current={route === n.r ? "page" : undefined}>{n.label}</a>
          ))}
        </nav>
        <div className="band-right">
          {who && <div className="band-who">{who}</div>}
          {sim && <SimTag />}
        </div>
      </header>
      <main className="main">{children}</main>
      <nav className="tabbar" aria-label="Main">{NAV.filter((n) => n.tab).map((n) => link(n, true))}</nav>
    </div>
  );
}

/** Section head: the manual's numeral and heading on one baseline, over a 2px rule. */
export function TopBar({ title, children }: { title: string; children?: ReactNode }) {
  const n = NAV.find((x) => x.r === currentRoute())?.n;
  return (
    <header className="topbar">
      {n && <span className="sec-num" aria-hidden="true">{n}</span>}
      <h1>{title}</h1>
      {children && <div className="topbar-meta">{children}</div>}
    </header>
  );
}

export function fmtMinutes(min: number): string {
  if (min < 1) return `${Math.max(0, Math.round(min * 60))} s`;
  if (min < 60) return `${min.toFixed(1)} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${Math.round(min - h * 60)} min`;
}
