import { OfflineApp } from "@/components/offline-app";

/**
 * The offline application shell.
 *
 * `public/sw.js` serves this document for any app page asked for without a
 * network — including one this device has never visited — and `OfflineApp`
 * then renders the requested screen from the local copy of the school. The
 * page itself carries no data: it must load from the cache with no server.
 */
export default function OfflinePage() {
  return <OfflineApp />;
}
