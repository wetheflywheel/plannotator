/**
 * Archive Server
 *
 * Read-only browser for saved plan decisions (~/.plannotator/plans/).
 * Follows the annotate server pattern: reuses plan editor HTML with mode:"archive".
 *
 * Environment variables:
 *   PLANNOTATOR_REMOTE - Set to "1" or "true" for remote/devcontainer mode
 *   PLANNOTATOR_PORT   - Fixed port to use (default: random locally, 19432 for remote)
 */

import { isRemoteSession, getServerPort } from "./remote";
import { handleImage, handleFavicon } from "./shared-handlers";
import { listArchivedPlans, readArchivedPlan, type ArchivedPlan } from "./storage";

// Re-export utilities
export { isRemoteSession, getServerPort } from "./remote";
export { openBrowser } from "./browser";
export { handleServerReady as handleArchiveServerReady } from "./shared-handlers";

// --- Types ---

export interface ArchiveServerOptions {
  /** HTML content to serve for the UI */
  htmlContent: string;
  /** Origin identifier for UI customization */
  origin?: "opencode" | "claude-code" | "pi" | "codex";
  /** Custom plan save path (user setting) */
  customPlanPath?: string | null;
  /** Whether URL sharing is enabled (default: true) */
  sharingEnabled?: boolean;
  /** Custom base URL for share links */
  shareBaseUrl?: string;
  /** Called when server starts */
  onReady?: (url: string, isRemote: boolean, port: number) => void;
}

export interface ArchiveServerResult {
  /** The port the server is running on */
  port: number;
  /** The full URL to access the server */
  url: string;
  /** Whether running in remote mode */
  isRemote: boolean;
  /** Wait for user to close the archive browser */
  waitForDone: () => Promise<void>;
  /** Stop the server */
  stop: () => void;
}

// --- Server Implementation ---

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 500;

export async function startArchiveServer(
  options: ArchiveServerOptions
): Promise<ArchiveServerResult> {
  const {
    htmlContent,
    origin,
    customPlanPath,
    sharingEnabled = true,
    shareBaseUrl,
    onReady,
  } = options;

  const isRemote = isRemoteSession();
  const configuredPort = getServerPort();

  // Load plan list once at startup
  const archivePlans: ArchivedPlan[] = listArchivedPlans(customPlanPath);

  // Initial plan: most recent entry
  const initialPlan = archivePlans.length > 0
    ? readArchivedPlan(archivePlans[0].filename, customPlanPath) ?? ""
    : "";

  // Done promise
  let resolveDone: () => void;
  const donePromise = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  // Start server with retry logic
  let server: ReturnType<typeof Bun.serve> | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      server = Bun.serve({
        port: configuredPort,

        async fetch(req) {
          const url = new URL(req.url);

          // API: Get initial plan + archive list
          if (url.pathname === "/api/plan" && req.method === "GET") {
            return Response.json({
              plan: initialPlan,
              origin,
              mode: "archive",
              archivePlans,
              sharingEnabled,
              shareBaseUrl,
            });
          }

          // API: List archived plans
          if (url.pathname === "/api/archive/plans" && req.method === "GET") {
            return Response.json({ plans: archivePlans });
          }

          // API: Get specific archived plan
          if (url.pathname === "/api/archive/plan" && req.method === "GET") {
            const filename = url.searchParams.get("filename");
            if (!filename) {
              return Response.json({ error: "Missing filename parameter" }, { status: 400 });
            }
            const content = readArchivedPlan(filename, customPlanPath);
            if (content === null) {
              return Response.json({ error: "Plan not found" }, { status: 404 });
            }
            return Response.json({ markdown: content, filepath: filename });
          }

          // API: Close archive browser
          if (url.pathname === "/api/done" && req.method === "POST") {
            resolveDone();
            return Response.json({ ok: true });
          }

          // API: Serve images
          if (url.pathname === "/api/image") {
            return handleImage(req);
          }

          // Favicon
          if (url.pathname === "/favicon.svg") return handleFavicon();

          // Serve embedded HTML for all other routes (SPA)
          return new Response(htmlContent, {
            headers: { "Content-Type": "text/html" },
          });
        },
      });

      break;
    } catch (err: unknown) {
      const isAddressInUse =
        err instanceof Error && err.message.includes("EADDRINUSE");

      if (isAddressInUse && attempt < MAX_RETRIES) {
        await Bun.sleep(RETRY_DELAY_MS);
        continue;
      }

      if (isAddressInUse) {
        const hint = isRemote
          ? " (set PLANNOTATOR_PORT to use different port)"
          : "";
        throw new Error(
          `Port ${configuredPort} in use after ${MAX_RETRIES} retries${hint}`
        );
      }

      throw err;
    }
  }

  if (!server) {
    throw new Error("Failed to start server");
  }

  const serverUrl = `http://localhost:${server.port}`;

  if (onReady) {
    onReady(serverUrl, isRemote, server.port);
  }

  return {
    port: server.port,
    url: serverUrl,
    isRemote,
    waitForDone: () => donePromise,
    stop: () => server.stop(),
  };
}
