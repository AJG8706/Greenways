/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import { CacheFirst, ExpirationPlugin, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

// PWA service worker (stack convention): offline after first load. The app
// shell and static assets precache; visited walk pages and their signed
// photo URLs runtime-cache so the walk keeps working when the signal drops.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Capture-protocol photos come as signed Supabase Storage URLs; cache
      // them so stake photos show offline for the rest of the walk.
      matcher: ({ url }) => url.pathname.includes("/storage/v1/object/sign/"),
      handler: new CacheFirst({
        cacheName: "walk-photos",
        plugins: [
          new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 60 * 60 * 6 }),
        ],
      }),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
