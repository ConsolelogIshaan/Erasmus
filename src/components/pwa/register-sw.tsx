"use client";

import * as React from "react";

/**
 * Actively purges legacy service workers and stale CacheStorage
 * across all client browsers to prevent reload loops and stale JS bundles.
 */
export function RegisterServiceWorker() {
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => {
          for (const reg of registrations) {
            reg.unregister().catch(() => {});
          }
        })
        .catch(() => {});
    }

    if ("caches" in window) {
      caches
        .keys()
        .then((keys) => {
          for (const key of keys) {
            caches.delete(key).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }, []);

  return null;
}
