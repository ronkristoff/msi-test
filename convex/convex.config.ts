import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import agent from "@convex-dev/agent/convex.config";
import stagehand from "@browserbasehq/convex-stagehand/convex.config";
import actionCache from "@convex-dev/action-cache/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

const app = defineApp();
app.use(betterAuth);
app.use(agent);
app.use(stagehand, { name: "stagehand" });
app.use(actionCache, { name: "actionCache" });
app.use(rateLimiter, { name: "rateLimiter" });

export default app;
