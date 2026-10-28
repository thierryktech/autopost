/*
 * Central, typed access to server-side configuration. Nothing in this file is ever sent to the
 * browser; only booleans/labels derived from it are exposed via getPublicConfig().
 */
export type AdapterMode = "demo" | "live";

function bool(v: string | undefined, fallback = false): boolean {
  if (v == null || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export const env = {
  get appUrl() {
    return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get authSecret() {
    return process.env.AUTH_SECRET ?? "";
  },
  get allowedEmail() {
    return (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
  },
  get googleClientId() {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  },
  get googleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET ?? "";
  },
  /** Local development convenience: skip sign-in. Refused in production unless explicitly forced. */
  get authDisabled() {
    const wanted = bool(process.env.AUTH_DISABLED, !process.env.GOOGLE_CLIENT_ID);
    if (!wanted) return false;
    if (process.env.NODE_ENV === "production" && !bool(process.env.ALLOW_INSECURE_NO_AUTH)) return false;
    return true;
  },
  get tokenEncryptionKey() {
    return process.env.TOKEN_ENCRYPTION_KEY ?? "";
  },
  get driveMode(): AdapterMode {
    return process.env.DRIVE_ADAPTER === "google" ? "live" : "demo";
  },
  get claudeMode(): AdapterMode {
    return process.env.CLAUDE_ADAPTER === "anthropic" ? "live" : "demo";
  },
  get facebookMode(): AdapterMode {
    return process.env.FACEBOOK_ADAPTER === "graph" ? "live" : "demo";
  },
  get renderMode(): "ffmpeg" | "simulated" {
    return process.env.RENDER_ADAPTER === "simulated" ? "simulated" : "ffmpeg";
  },
  get claudeModel() {
    return process.env.CLAUDE_MODEL ?? "claude-opus-5-5";
  },
  get anthropicApiKey() {
    return process.env.ANTHROPIC_API_KEY ?? "";
  },
  get facebookAppId() {
    return process.env.FACEBOOK_APP_ID ?? "";
  },
  get facebookAppSecret() {
    return process.env.FACEBOOK_APP_SECRET ?? "";
  },
  get graphApiVersion() {
    return process.env.FACEBOOK_GRAPH_VERSION ?? "v26.0";
  },
  /** "embedded": job runner inside the web server (demo/local). "external": separate worker process. */
  get workerMode(): "embedded" | "external" {
    if (process.env.WORKER_MODE === "external") return "external";
    if (process.env.WORKER_MODE === "embedded") return "embedded";
    return process.env.DATABASE_URL?.startsWith("postgres") ? "external" : "embedded";
  },
  get dataDir() {
    return process.env.DATA_DIR ?? ".data";
  },
};

export function isDemoEverything() {
  return env.driveMode === "demo" && env.claudeMode === "demo" && env.facebookMode === "demo";
}
