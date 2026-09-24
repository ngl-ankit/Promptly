import assert from "node:assert/strict";
import { request } from "node:http";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { afterEach, test, mock } from "node:test";

const trackedEnvKeys = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "XAI_API_KEY",
];
const originalEnv = new Map(
  trackedEnvKeys.map((key) => [key, process.env[key]]),
);

process.env.OPENROUTER_MODEL = "openai/gpt-oss-20b";
const { askGrok, parseGrokJson } = await import("../src/ai/grok.ts");

async function loadPromptlyRouteApp() {
  const testDirectory = fileURLToPath(new URL(".", import.meta.url));
  const bundlePath = resolve(testDirectory, `.route-app-${process.pid}.mjs`);
  const apiZodEntry = fileURLToPath(
    new URL("../../../lib/api-zod/src/index.ts", import.meta.url),
  );

  await build({
    stdin: {
      contents: [
        'import express from "express";',
        'import router from "../src/routes/promptly.ts";',
        "const app = express();",
        "app.use(express.json());",
        'app.use("/api", router);',
        "export default app;",
      ].join("\n"),
      resolveDir: testDirectory,
      sourcefile: "route-app-test-entry.js",
    },
    outfile: bundlePath,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["express"],
    plugins: [
      {
        name: "workspace-api-zod",
        setup(esbuild) {
          esbuild.onResolve(
            { filter: /^@workspace\/api-zod$/ },
            () => ({ path: apiZodEntry }),
          );
        },
      },
    ],
  });

  try {
    return (await import(pathToFileURL(bundlePath).href)).default;
  } finally {
    await unlink(bundlePath).catch(() => {});
  }
}

afterEach(() => {
  mock.restoreAll();
  for (const [key, value] of originalEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

test("prompt generation sends OpenRouter JSON mode and parses the completion", async () => {
  process.env.OPENROUTER_API_KEY = "test-only-openrouter-key";

  let requestUrl;
  let requestHeaders;
  let requestBody;
  mock.method(globalThis, "fetch", async (url, init) => {
    requestUrl = String(url);
    requestHeaders = new Headers(init.headers);
    requestBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        model: "openai/gpt-oss-20b",
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: [
                {
                  type: "text",
                  text: '{"title":"Plan a launch","prompt":"Create a launch plan."}',
                },
              ],
            },
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 24,
          total_tokens: 36,
        },
      }),
      { headers: { "content-type": "application/json" } },
    );
  });

  const result = await askGrok(
    [
      { role: "system", content: "Return a JSON prompt object." },
      { role: "user", content: "Help launch my product." },
    ],
    { json: true },
  );

  assert.equal(requestUrl, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(
    requestHeaders.get("authorization"),
    "Bearer test-only-openrouter-key",
  );
  assert.equal(requestBody.model, "openai/gpt-oss-20b");
  assert.equal(requestBody.max_tokens, 8192);
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.deepEqual(parseGrokJson(result.content), {
    title: "Plan a launch",
    prompt: "Create a launch plan.",
  });
  assert.equal(result.model, "openai/gpt-oss-20b");
  assert.deepEqual(result.usage, {
    promptTokens: 12,
    completionTokens: 24,
    totalTokens: 36,
  });
});

test("POST /api/generate returns a schema-valid prompt from the OpenRouter completion", async () => {
  process.env.OPENROUTER_API_KEY = "test-only-route-key";
  const app = await loadPromptlyRouteApp();
  const completedPrompt = {
    title: "Launch planner",
    prompt: "Create a focused launch plan for the product.",
    promptType: "Planning",
    intent: "Prepare a product launch.",
    context: "A new product is ready to launch.",
    requirements: ["Include a launch timeline"],
    constraints: ["Keep the plan practical"],
    outputFormat: "A phased checklist",
    missingInformation: [],
    suggestions: ["Add the launch date"],
    qualityNotes: ["The goal and format are explicit"],
  };

  let forwardedRequest;
  mock.method(globalThis, "fetch", async (url, init) => {
    forwardedRequest = { url: String(url), init };
    return new Response(
      JSON.stringify({
        model: "openai/gpt-oss-20b",
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(completedPrompt) },
          },
        ],
      }),
      { headers: { "content-type": "application/json" } },
    );
  });

  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolveListening) =>
    server.once("listening", resolveListening),
  );

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await new Promise((resolveResponse, rejectResponse) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: address.port,
          path: "/api/generate",
          method: "POST",
          headers: { "content-type": "application/json" },
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolveResponse({
              status: res.statusCode,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            }),
          );
        },
      );
      req.on("error", rejectResponse);
      req.end(
        JSON.stringify({
          input: "Help me launch a new product",
          preset: "General AI",
        }),
      );
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, completedPrompt);
    assert.equal(
      forwardedRequest.url,
      "https://openrouter.ai/api/v1/chat/completions",
    );
    assert.equal(
      new Headers(forwardedRequest.init.headers).get("authorization"),
      "Bearer test-only-route-key",
    );
    const requestBody = JSON.parse(forwardedRequest.init.body);
    assert.equal(requestBody.model, "openai/gpt-oss-20b");
    assert.deepEqual(requestBody.response_format, { type: "json_object" });
  } finally {
    await new Promise((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose())),
    );
  }
});

test("legacy Render key name remains a secure server-side fallback", async () => {
  delete process.env.OPENROUTER_API_KEY;
  process.env.XAI_API_KEY = "test-only-legacy-openrouter-key";

  let authorization;
  mock.method(globalThis, "fetch", async (_url, init) => {
    authorization = new Headers(init.headers).get("authorization");
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "Generated prompt" } }],
      }),
      { headers: { "content-type": "application/json" } },
    );
  });

  const result = await askGrok([{ role: "user", content: "A short idea" }]);

  assert.equal(authorization, "Bearer test-only-legacy-openrouter-key");
  assert.equal(result.content, "Generated prompt");
});

test("provider errors do not expose the API key", async () => {
  const testKey = "test-only-key-that-must-not-leak";
  process.env.OPENROUTER_API_KEY = testKey;
  mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: {
            message: `Rejected token ${testKey}`,
          },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
  );

  await assert.rejects(
    askGrok([{ role: "user", content: "A short idea" }]),
    (error) => {
      assert.match(error.message, /AI service rejected the request/);
      assert.equal(error.message.includes(testKey), false);
      return true;
    },
  );
});