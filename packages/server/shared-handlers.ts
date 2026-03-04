/**
 * Shared Route Handlers
 *
 * Image serving, file upload, agent listing, and server-ready behavior
 * shared across all three servers (plan, review, annotate).
 */

import { mkdirSync } from "fs";
import { validateImagePath, validateUploadExtension, UPLOAD_DIR } from "./image";
import { openBrowser } from "./browser";

// --- Types ---

/** Shape of the OpenCode client used for agent listing */
export interface OpencodeClient {
  app: {
    agents: (options?: object) => Promise<{
      data?: Array<{
        name: string;
        description?: string;
        mode: string;
        hidden?: boolean;
      }>;
    }>;
  };
}

// --- Handlers ---

/** Serve images from local paths or temp uploads */
export async function handleImageRequest(url: URL): Promise<Response> {
  const imagePath = url.searchParams.get("path");
  if (!imagePath) {
    return new Response("Missing path parameter", { status: 400 });
  }
  const validation = validateImagePath(imagePath);
  if (!validation.valid) {
    return new Response(validation.error!, { status: 403 });
  }
  try {
    const file = Bun.file(validation.resolved);
    if (!(await file.exists())) {
      return new Response("File not found", { status: 404 });
    }
    return new Response(file);
  } catch {
    return new Response("Failed to read file", { status: 500 });
  }
}

/** Upload image to temp directory, return path */
export async function handleUploadRequest(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return new Response("No file provided", { status: 400 });
    }

    const extResult = validateUploadExtension(file.name);
    if (!extResult.valid) {
      return Response.json({ error: extResult.error }, { status: 400 });
    }
    mkdirSync(UPLOAD_DIR, { recursive: true });
    const tempPath = `${UPLOAD_DIR}/${crypto.randomUUID()}.${extResult.ext}`;

    await Bun.write(tempPath, file);
    return Response.json({ path: tempPath, originalName: file.name });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

/** List available agents (OpenCode only) */
export async function handleAgentsRequest(
  opencodeClient?: OpencodeClient
): Promise<Response> {
  if (!opencodeClient) {
    return Response.json({ agents: [] });
  }

  try {
    const result = await opencodeClient.app.agents({});
    const agents = (result.data ?? [])
      .filter((a) => a.mode === "primary" && !a.hidden)
      .map((a) => ({ id: a.name, name: a.name, description: a.description }));

    return Response.json({ agents });
  } catch {
    return Response.json({ agents: [], error: "Failed to fetch agents" });
  }
}

/** Open browser for local sessions (shared across all servers) */
export async function handleServerReady(
  url: string,
  isRemote: boolean,
  _port: number
): Promise<void> {
  if (!isRemote) {
    await openBrowser(url);
  }
}
