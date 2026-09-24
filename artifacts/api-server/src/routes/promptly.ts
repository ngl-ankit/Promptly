import { Router, type IRouter, type Request, type Response } from "express";
import {
  AnalyzePromptBody,
  AnalyzePromptResponse,
  GeneratePromptBody,
  GeneratePromptResponse,
  ImprovePromptBody,
  ImprovePromptResponse,
  OptimizePromptBody,
  OptimizePromptResponse,
  RunPlaygroundBody,
  RunPlaygroundResponse,
} from "@workspace/api-zod";
import { askGrok, MODEL, parseGrokJson } from "../ai/grok";
import {
  analysisShape,
  resultSystemInstruction,
} from "../ai/prompt-instructions";

const router: IRouter = Router();

function sendError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : "AI service unavailable";
  const isClientError =
    message === "AI service is not configured" ||
    message === "AI request timed out" ||
    message === "AI service rate limit reached" ||
    message === "AI returned an empty response" ||
    message === "AI returned an invalid structured response";
  res.status(isClientError ? 502 : 502).json({
    error: message,
    code: message.includes("rate limit")
      ? "RATE_LIMITED"
      : message.includes("timed out")
        ? "TIMEOUT"
        : "AI_UNAVAILABLE",
  });
}

async function structuredResult(
  req: Request,
  res: Response,
  body: { input: string; preset?: string; action?: string },
  mode: "generate" | "optimize" | "improve",
) {
  try {
    const modeInstruction =
      mode === "generate"
        ? "Create a new prompt from this rough request."
        : mode === "optimize"
          ? "Understand the existing prompt first, then rewrite it to be clearer, more useful, and no longer than necessary."
          : `Apply this focused improvement action: ${body.action}. Preserve the original intent and return the complete improved prompt.`;
    const ai = await askGrok(
      [
        {
          role: "system",
          content: `${resultSystemInstruction(body.preset)}\n${modeInstruction}`,
        },
        { role: "user", content: body.input },
      ],
      { json: true },
    );
    const result = GeneratePromptResponse.parse(parseGrokJson(ai.content));
    res.json(result);
  } catch (error) {
    req.log.warn({ err: error }, "Prompt operation failed");
    sendError(res, error);
  }
}

router.post("/generate", async (req, res) => {
  const parsed = GeneratePromptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a request before generating", code: "INVALID_INPUT" });
    return;
  }
  await structuredResult(req, res, parsed.data, "generate");
});

router.post("/optimize", async (req, res) => {
  const parsed = OptimizePromptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Paste a prompt before optimizing", code: "INVALID_INPUT" });
    return;
  }
  await structuredResult(req, res, parsed.data, "optimize");
});

router.post("/improve", async (req, res) => {
  const parsed = ImprovePromptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Paste a prompt and choose an improvement", code: "INVALID_INPUT" });
    return;
  }
  await structuredResult(req, res, parsed.data, "improve");
});

router.post("/analyze", async (req, res) => {
  const parsed = AnalyzePromptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Paste a prompt before analyzing", code: "INVALID_INPUT" });
    return;
  }
  try {
    const ai = await askGrok(
      [
        {
          role: "system",
          content: `You are Promptly, an expert prompt reviewer. Analyze the prompt without exposing hidden reasoning. Return ONLY valid JSON matching this exact shape:\n${analysisShape}`,
        },
        { role: "user", content: parsed.data.input },
      ],
      { json: true },
    );
    res.json(AnalyzePromptResponse.parse(parseGrokJson(ai.content)));
  } catch (error) {
    req.log.warn({ err: error }, "Prompt analysis failed");
    sendError(res, error);
  }
});

router.post("/playground", async (req, res) => {
  const parsed = RunPlaygroundBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Add a prompt before running the playground", code: "INVALID_INPUT" });
    return;
  }
  try {
    const input = parsed.data.input
      ? `\n\nUser input:\n${parsed.data.input}`
      : "";
    const ai = await askGrok([
      {
        role: "system",
        content:
          "Execute the user's prompt directly. Return only the useful answer, with no commentary about being an AI or about this playground.",
      },
      { role: "user", content: `${parsed.data.prompt}${input}` },
    ]);
    res.json(
      RunPlaygroundResponse.parse({
        response: ai.content,
        model: ai.model || MODEL,
        generationTimeMs: ai.generationTimeMs,
        usage: ai.usage,
      }),
    );
  } catch (error) {
    req.log.warn({ err: error }, "Playground request failed");
    sendError(res, error);
  }
});

export default router;