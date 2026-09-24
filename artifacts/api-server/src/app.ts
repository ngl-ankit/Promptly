import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true }));
app.use((_, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

const frontendCandidates = [
  path.resolve(process.cwd(), "artifacts/promptly/dist/public"),
  path.resolve(process.cwd(), "../promptly/dist/public"),
];
const frontendRoot = frontendCandidates.find((candidate) => existsSync(candidate));
if (frontendRoot) {
  app.use(express.static(frontendRoot, { index: "index.html" }));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(frontendRoot, "index.html"));
  });
}

export default app;
