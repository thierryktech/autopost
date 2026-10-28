import type { Job } from "../db/schema";

export type HandlerResult =
  | { kind: "done"; result?: Record<string, unknown> }
  | { kind: "reschedule"; at: Date; note?: string }
  | { kind: "blocked"; reason: string };

export type JobHandler = (job: Job) => Promise<HandlerResult>;
