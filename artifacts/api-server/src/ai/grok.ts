import { performance } from "node:perf_hooks";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type GrokUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

type GrokResponse = {
  content: string;
  model: string;
  usage: GrokUsage | null;
  generationTimeMs: number;
};

const MODEL = process.env["XAI_MODEL"] || "grok-4-fast";
const XAI_URL = "https://api.x.ai/v1/chat/completions";

function extractJson(content: string): unknown {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstObject = cleaned.indexOf("{");
    const lastObject = cleaned.lastIndexOf("}");
    if (firstObject >= 0 && lastObject > firstObject) {
      return JSON.parse(cleaned.slice(firstObject, lastObject + 1));
    }
    throw new Error("AI returned an invalid structured response");
  }
}

export async function askGrok(
  messages: ChatMessage[],
  options: { json?: boolean; timeoutMs?: number } = {},
): Promise<GrokResponse> {
  const key = process.env["XAI_API_KEY"];
  if (!key) {
    throw new Error("AI service is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 45000,
  );
  const started = performance.now();

  try {
    const response = await fetch(XAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.25,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let providerMessage = "";
      try {
        const parsed = JSON.parse(errorText) as {
          error?: { message?: string } | string;
        };
        providerMessage =
          typeof parsed.error === "string"
            ? parsed.error
            : parsed.error?.message || "";
      } catch {
        providerMessage = "";
      }
      const detail = providerMessage.replace(/\s+/g, " ").slice(0, 180);
      throw new Error(
        response.status === 429
          ? "AI service rate limit reached"
          : detail
            ? `AI service rejected the request: ${detail}`
            : `AI service returned ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("AI returned an empty response");
    }

    return {
      content,
      model: payload.model || MODEL,
      generationTimeMs: Math.round(performance.now() - started),
      usage: payload.usage
        ? {
            promptTokens: payload.usage.prompt_tokens,
            completionTokens: payload.usage.completion_tokens,
            totalTokens: payload.usage.total_tokens,
          }
        : null,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("AI request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseGrokJson(content: string): unknown {
  return extractJson(content);
}

export { MODEL };