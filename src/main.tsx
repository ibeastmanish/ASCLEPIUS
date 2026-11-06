import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import { hermes, inDesktopApp } from "./storage/hermes";
import { applyTheme, getThemeMode } from "./ui/ui";
import "./styles.css";

// Light / dark: follows the device unless the viewer picked one in Settings.
applyTheme(getThemeMode());

function render() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

if (inDesktopApp()) {
  // Desktop build: the app files ship inside the installed app, so no service worker is needed.
  hermes.mode()
    .then((m) => (m.selftest
      ? import("./app/selftest").then((t) => t.runSelfTest()).catch((e) => hermes.selftestDone(false, { crash: String(e) }))
      : render()))
    .catch(render);
} else {
  // Offline-first: cache the whole app after the first load (NFR-01).
  // Skipped in video mode so recordings never depend on a cached build.
  if (!new URLSearchParams(location.search).has("video")) registerSW({ immediate: true });
  render();
}
