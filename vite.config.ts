// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        strategies: "generateSW",
        // "prompt" = no skipWaiting: an updated worker waits until every Hutano tab is closed,
        // so an open session never loses the chunks it was loaded with.
        registerType: "prompt",
        injectRegister: null, // src/lib/pwa.ts is the only registrar
        manifest: false, // public/manifest.webmanifest
        filename: "sw.js",
        // Root cause of the production 404: TanStack Start/Nitro builds the browser bundle into
        // dist/client, but the plugin defaulted to dist/ (and prefixed precache URLs with "client/").
        // Emit the worker and precache relative to the public client output instead.
        outDir: "dist/client",
        devOptions: { enabled: false },
        workbox: {
          globDirectory: "dist/client",
          globPatterns: ["**/*.{js,css,png,ico,svg,webmanifest,woff2}"],
          globIgnores: ["**/sw.js", "**/workbox-*.js"],
          navigateFallback: null,
          cleanupOutdatedCaches: true,
          skipWaiting: false,
          clientsClaim: true, // first install controls the open page so offline works without a reload
          runtimeCaching: [
            {
              // Same-origin app-shell HTML only: network first, cached copy when offline.
              // Excludes /auth (and its callbacks), /api, /~oauth and any token/code-bearing URL.
              urlPattern: ({ request, url, sameOrigin }) =>
                sameOrigin &&
                request.mode === "navigate" &&
                !/^\/(auth|api|~oauth)(\/|$)/.test(url.pathname) &&
                !/(access_token|refresh_token|token|code|type)=/.test(url.search),
              handler: "NetworkFirst",
              options: {
                cacheName: "hutano-pages",
                networkTimeoutSeconds: 4,
                cacheableResponse: { statuses: [200] },
                matchOptions: { ignoreSearch: true, ignoreVary: true },
              },
            },
          ],
        },
      }),
    ],
  },
});
