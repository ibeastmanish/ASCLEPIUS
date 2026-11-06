/// <reference types="vitest/config" />
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves the app from /hygiea/; local dev and preview use /.
const base = process.env.HYGIEA_BASE ?? "/";

export default defineConfig(({ command }) => ({
  base,
  plugins: [
    react(),
    // Dev-only, self-signed HTTPS. WebCrypto (the vault) and the camera
    // perfusion check both require a "secure context", which `localhost`
    // gets for free but a LAN IP like http://192.168.x.x does not - so a
    // phone/tablet opening the dev server over plain HTTP sees every
    // crypto.subtle / getUserMedia call silently fail. The browser will
    // show a self-signed-certificate warning once; "Advanced > Proceed" is
    // expected and safe on your own network. Never runs during `vite build`.
    ...(command === "serve" ? [basicSsl()] : []),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"],
      manifest: {
        name: "HYGIEA: astronaut health self-check",
        short_name: "HYGIEA",
        description: "Offline daily health self-check for astronauts. Decision support, not a medical device.",
        theme_color: "#0B3D91",
        background_color: "#F4F6FA",
        display: "standalone",
        orientation: "any",
        start_url: base,
        scope: base,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "favicon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,json,woff2}"],
        navigateFallback: `${base}index.html`,
      },
    }),
  ],
  worker: { format: "es" },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["src/test/setup.ts"],
  },
}));
