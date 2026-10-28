/*
 * LIVE Claude adapter (Anthropic API). Requires ANTHROPIC_API_KEY — API usage is billed
 * separately from a Claude.ai subscription.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "../../env";
import { AdapterError, type ClaudeAdapter, type DraftInput, type EditDraft } from "../types";
import { SYSTEM_PROMPT, userPrompt } from "./prompt";

const DraftSchema = z.object({
  clips: z.array(z.object({ footageId: z.string(), inMs: z.number().int(), outMs: z.number().int() })),
  subtitles: z.array(z.object({ startMs: z.number().int(), endMs: z.number().int(), text: z.string() })),
  captionTh: z.string(),
  factsUsed: z.array(z.string()),
  rationale: z.string(),
});

export class AnthropicClaudeAdapter implements ClaudeAdapter {
  readonly mode = "live" as const;
  private client: Anthropic;

  constructor() {
    if (!env.anthropicApiKey) throw new AdapterError("not_configured", "ANTHROPIC_API_KEY is not set");
    this.client = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  async draftEdit(input: DraftInput): Promise<EditDraft> {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const clip of input.clips) {
      for (const [i, jpeg] of (clip.keyframesJpeg ?? []).entries()) {
        content.push({ type: "text", text: `Keyframe ${i + 1} of ${clip.footageId} (${clip.name})` });
        content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } });
      }
    }
    content.push({ type: "text", text: userPrompt(input) });

    let response;
    try {
      response = await this.client.messages.parse({
        model: env.claudeModel,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
        output_config: { format: zodOutputFormat(DraftSchema), effort: "medium" },
      });
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new AdapterError("auth_expired", "Anthropic API key was rejected");
      if (e instanceof Anthropic.PermissionDeniedError) throw new AdapterError("permission_denied", "Anthropic API key lacks access");
      if (e instanceof Anthropic.RateLimitError) throw new AdapterError("rate_limited", "Anthropic rate limit reached");
      if (e instanceof Anthropic.BadRequestError) throw new AdapterError("invalid_request", e.message);
      if (e instanceof Anthropic.APIConnectionError) throw new AdapterError("network", "Could not reach the Anthropic API");
      if (e instanceof Anthropic.APIError) throw new AdapterError("server_error", e.message);
      throw e;
    }
    if (response.stop_reason === "refusal") throw new AdapterError("invalid_request", "Claude declined this request");
    const parsed = response.parsed_output;
    if (!parsed) throw new AdapterError("server_error", "Claude returned an unparseable draft");

    // Defensive validation: only known clips, trims within bounds.
    const byId = new Map(input.clips.map((c) => [c.footageId, c]));
    const clips = parsed.clips
      .filter((c) => byId.has(c.footageId))
      .map((c) => {
        const d = byId.get(c.footageId)!.durationMs;
        const inMs = Math.max(0, Math.min(c.inMs, d - 500));
        const outMs = Math.max(inMs + 500, Math.min(c.outMs, d));
        return { footageId: c.footageId, inMs, outMs };
      });
    if (!clips.length) throw new AdapterError("server_error", "Claude's draft did not reference any provided clip");

    return {
      clips,
      subtitles: parsed.subtitles.map((s, i) => ({ id: `sub_${i + 1}`, ...s })),
      captionTh: parsed.captionTh,
      rationale: parsed.rationale,
      generatedBy: "claude",
      model: response.model,
    };
  }
}
