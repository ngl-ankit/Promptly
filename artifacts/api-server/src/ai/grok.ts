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

const MODEL =
  process.env["OPENROUTER_MODEL"] || "openai/gpt-oss-20b";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

type OpenRouterMessageContent =
  | string
  | Array<{ type?: string; text?: string }>
  | null;

type OpenRouterResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: OpenRouterMessageContent };
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function readMessageContent(content: OpenRouterMessageContent): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .filter((part) => part.type === undefined || part.type === "text")
      .map((part) => part.text ?? "")
      .join("")
      .trim();
  }
  return "";
}

function readProviderError(errorText: string): string {
  try {
    const parsed = JSON.parse(errorText) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    const error =
      typeof parsed.error === "string"
        ? parsed.error
        : parsed.error && typeof parsed.error === "object"
          ? parsed.error.message
          : parsed.message;
    return typeof error === "string" ? error : "";
  } catch {
    return "";
  }
}

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
  // XAI_API_KEY is retained as a compatibility alias for existing Render
  // services that already store the OpenRouter key under the old variable name.
  const key =
    process.env["OPENROUTER_API_KEY"]?.trim() ||
    process.env["XAI_API_KEY"]?.trim();
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
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/ngl-ankit/Promptly",
        "X-Title": "Promptly",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.25,
        max_tokens: 8192,
        messages,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      const providerMessage = readProviderError(errorText);
      const detail = providerMessage
        .replaceAll(key, "[redacted]")
        .replace(/\s+/g, " ")
        .slice(0, 180);
      throw new Error(
        response.status === 429
          ? "AI service rate limit reached"
          : detail
            ? `AI service rejected the request: ${detail}`
            : `AI service returned ${response.status}`,
      );
    }

    let payload: OpenRouterResponse;
    try {
      payload = (await response.json()) as OpenRouterResponse;
    } catch {
      throw new Error("AI service returned an invalid response");
    }
    const choice = payload.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new Error("AI response exceeded the output limit");
    }
    const content = readMessageContent(choice?.message?.content ?? null);
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