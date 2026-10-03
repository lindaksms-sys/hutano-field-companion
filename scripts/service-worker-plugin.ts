// Build-time app-shell service worker generation (Workbox generateSW).
// Runs after the *client* environment bundle is written and emits sw.js + workbox-*.js into that
// environment's real outDir (dist/client locally, .vercel/output/static on Vercel), so the worker
// and every precached file ship in the deployed static output. Registered only by src/lib/pwa.ts.
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

export function appShellServiceWorker(): Plugin {
  let root = process.cwd();
  return {
    name: "hutano-app-shell-sw",
    apply: "build",
    configResolved(config: ResolvedConfig) {
      root = config.root;
    },
    async writeBundle() {
      // Only the browser bundle gets a worker.
      const env = (this as unknown as { environment?: { name: string; config: { build: { outDir: string } } } })
        .environment;
      if (!env || env.name !== "client") return;
      const outDir = path.resolve(root, env.config.build.outDir);
      const { generateSW } = await import("workbox-build");
      const { count, size, warnings } = await generateSW({
        swDest: path.join(outDir, "sw.js"),
        globDirectory: outDir,
        // Same-origin static app shell only. No HTML documents, no data.
        globPatterns: ["**/*.{js,css,png,ico,svg,webmanifest,woff2}"],
        globIgnores: ["sw.js", "workbox-*.js"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Gentle updates: no skipWaiting; a new worker waits until all Hutano tabs are closed.
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: null,
        sourcemap: false,
        mode: "production",
        runtimeCaching: [
          {
            // App-shell pages: network first, cached copy only offline. Excludes /auth, OAuth
            // callbacks, /api and any token/code-bearing URL. Cross-origin (Supabase) never matches.
            urlPattern: ({ request, url, sameOrigin }) =>
              sameOrigin &&
              request.mode === "navigate" &&
              !url.pathname.startsWith("/auth") &&
              !url.pathname.startsWith("/~oauth") &&
              !url.pathname.startsWith("/api") &&
              !/(^|[?&#])(code|token|access_token|refresh_token|error_description|type)=/.test(url.search + url.hash),
            handler: "NetworkFirst",
            options: {
              cacheName: "hutano-pages",
              networkTimeoutSeconds: 4,
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      });
      warnings.forEach((w) => console.warn(`[hutano-sw] ${w}`));
      console.log(`[hutano-sw] ${path.join(outDir, "sw.js")} — precache ${count} files, ${Math.round(size / 1024)} KiB`);
    },
  };
}
