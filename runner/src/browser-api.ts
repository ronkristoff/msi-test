import * as http from "http";
import { BrowserSessionManager, type AuthConfig } from "./browser-sessions";

interface RouteRequest {
  body: Record<string, unknown>;
  sendJson: (status: number, data: Record<string, unknown>) => void;
}

type RouteHandler = (req: RouteRequest) => Promise<void>;

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

export function createBrowserApiServer(
  sessionManager: BrowserSessionManager,
  secret: string,
  log: (msg: string) => void,
): http.Server {
  const routes: Route[] = [
    {
      method: "POST",
      path: "/browser/navigate",
      handler: async ({ body, sendJson }) => {
        const { project_id, url, ...authFields } = body;

        if (!project_id || typeof project_id !== "string") {
          return sendJson(400, { error: "project_id is required" });
        }
        if (!url || typeof url !== "string") {
          return sendJson(400, { error: "url is required" });
        }

        const authConfig = buildAuthConfig(authFields, url);

        try {
          const result = await sessionManager.navigateAndSnapshot(project_id, url, authConfig);
          log(`Browser API: navigate ${project_id} → ${url} (snapshot ${result.snapshot.length} chars)`);
          sendJson(200, { snapshot: result.snapshot, url: result.url, title: result.title });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log(`Browser API: navigate error for ${project_id}: ${message}`);
          sendJson(500, { error: `Navigation failed: ${message}` });
        }
      },
    },
    {
      method: "POST",
      path: "/browser/snapshot",
      handler: async ({ body, sendJson }) => {
        const { project_id, ...authFields } = body;

        if (!project_id || typeof project_id !== "string") {
          return sendJson(400, { error: "project_id is required" });
        }

        const authConfig = buildAuthConfig(authFields, "");

        if (!sessionManager.hasSession(project_id)) {
          return sendJson(404, { error: "No active session for this project. Call /browser/navigate first." });
        }

        try {
          const result = await sessionManager.getSnapshot(project_id, authConfig);
          sendJson(200, { snapshot: result.snapshot, url: result.url, title: result.title });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendJson(500, { error: `Snapshot failed: ${message}` });
        }
      },
    },
    {
      method: "POST",
      path: "/browser/interact",
      handler: async ({ body, sendJson }) => {
        const { project_id, url, actions, ...authFields } = body;

        if (!project_id || typeof project_id !== "string") {
          return sendJson(400, { error: "project_id is required" });
        }
        if (!url || typeof url !== "string") {
          return sendJson(400, { error: "url is required" });
        }

        const rawActions = Array.isArray(actions) ? actions : [];
        const authConfig = buildAuthConfig(authFields, url);

        try {
          const results = await sessionManager.interactAndCapture(
            project_id,
            url,
            authConfig,
            rawActions as Array<{ action: string; role?: string; name?: string; value?: string }>,
          );
          log(`Browser API: interact ${project_id} → ${url} (${results.length} snapshots)`);
          sendJson(200, { steps: results });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log(`Browser API: interact error for ${project_id}: ${message}`);
          sendJson(500, { error: `Interaction failed: ${message}` });
        }
      },
    },
    {
      method: "POST",
      path: "/browser/login",
      handler: async ({ body, sendJson }) => {
        const { project_id, ...authFields } = body;

        if (!project_id || typeof project_id !== "string") {
          return sendJson(400, { error: "project_id is required" });
        }

        const authConfig = buildAuthConfig(authFields, "");

        try {
          const { success } = await sessionManager.login(project_id, authConfig);
          sendJson(200, { success });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          sendJson(500, { error: `Login failed: ${message}` });
        }
      },
    },
    {
      method: "POST",
      path: "/browser/context/close",
      handler: async ({ body, sendJson }) => {
        const { project_id } = body;

        if (!project_id || typeof project_id !== "string") {
          return sendJson(400, { error: "project_id is required" });
        }

        await sessionManager.closeSession(project_id);
        log(`Browser API: closed session for ${project_id}`);
        sendJson(200, { closed: true });
      },
    },
  ];

  function matchRoute(method: string, path: string): RouteHandler | null {
    for (const route of routes) {
      if (route.method === method && route.path === path) {
        return route.handler;
      }
    }
    return null;
  }

  const server = http.createServer((req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${secret}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    const handler = matchRoute(req.method ?? "", req.url?.split("?")[0] ?? "");
    if (!handler) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      let body: Record<string, unknown>;
      try {
        const raw = Buffer.concat(chunks).toString("utf-8");
        body = raw ? JSON.parse(raw) : {};
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
        return;
      }

      const sendJson = (status: number, data: Record<string, unknown>) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };

      handler({ body, sendJson }).catch((err) => {
        log(`Browser API: unhandled error: ${err}`);
        sendJson(500, { error: "Internal server error" });
      });
    });
  });

  return server;
}

function buildAuthConfig(fields: Record<string, unknown>, fallbackUrl: string): AuthConfig {
  return {
    auth_mode: (fields.auth_mode as AuthConfig["auth_mode"]) ?? "none",
    login_url: fields.login_url as string | undefined,
    username: fields.username as string | undefined,
    password: fields.password as string | undefined,
    cookie_name: fields.cookie_name as string | undefined,
    cookie_value: fields.cookie_value as string | undefined,
    app_url: (fields.app_url as string) || fallbackUrl,
  };
}
