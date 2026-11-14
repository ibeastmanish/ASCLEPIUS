import { lazy, Suspense, useEffect } from "react";
import { AppProvider, useApp } from "./app/store";
import { Body } from "./screens/Body";
import { Check } from "./screens/Check";
import { Crew } from "./screens/Crew";
import { CrewPulse } from "./screens/CrewPulse";
import { Story } from "./screens/Story";
import { Home } from "./screens/Home";
import { Settings } from "./screens/Settings";
import { Unlock } from "./screens/Unlock";

// Chart screens pull in Recharts; load them on demand (still precached for offline).
const Trends = lazy(() => import("./screens/Trends").then((m) => ({ default: m.Trends })));
const Outbox = lazy(() => import("./screens/Outbox").then((m) => ({ default: m.Outbox })));
import { Shell, useRoute, type Route } from "./ui/ui";

const VIDEO_ROUTE: Record<string, Route> = { check: "check", bodymap: "body", proof: "crew", outbox: "outbox", alert: "body", pulse: "pulse", story: "story" };

function Screens() {
  const app = useApp();
  const [route, go] = useRoute();

  useEffect(() => {
    if (app.video && VIDEO_ROUTE[app.video] && app.phase === "ready") go(VIDEO_ROUTE[app.video]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.video, app.phase]);

  useEffect(() => {
    document.documentElement.classList.toggle("video-mode", !!app.video);
    document.documentElement.classList.toggle("show-cursor", app.video === "bodymap");
  }, [app.video]);

  if (app.phase === "loading") return <div className="loading"><span className="spinner" aria-label="Loading" /></div>;
  if (app.phase !== "ready" || !app.state.profile) return <Unlock />;

  const p = app.state.profile;
  return (
    <Shell route={route} sim={p.simulated}
      who={<><b>{p.name}</b> · {p.role}<br />{app.store?.persistent ? "Vault unlocked · offline-ready" : "Video mode · nothing stored"}</>}>
      {route === "home" && <Home />}
      {route === "check" && <Check key={app.state.checks.length} />}
      {route === "body" && <Body />}
      <Suspense fallback={<span className="spinner" aria-label="Loading" />}>
        {route === "trends" && <Trends />}
        {route === "outbox" && <Outbox />}
      </Suspense>
      {route === "pulse" && <CrewPulse />}
      {route === "crew" && <Crew />}
      {route === "story" && <Story />}
      {route === "settings" && <Settings />}
    </Shell>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Screens />
    </AppProvider>
  );
}
