import cors from "cors";
import express, { ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { join } from "node:path";
import { ZodError } from "zod";
import { env } from "./config/env.js";
import { MetaApiError } from "./meta/metaError.js";
import { router } from "./http/routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN === "*" ? "*" : env.CORS_ORIGIN.split(",").map((item) => item.trim())
    })
  );
  app.use(
    rateLimit({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      limit: env.RATE_LIMIT_MAX,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(join(process.cwd(), "public")));
  app.use(router);
  app.use(errorHandler);

  return app;
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      message: "Entrada inválida.",
      issues: error.issues
    });
    return;
  }

  if (error instanceof MetaApiError) {
    res.status(error.status).json({
      error: "meta_api_error",
      message: error.friendlyMessage(),
      meta: {
        code: error.code,
        subcode: error.subcode,
        type: error.type,
        userTitle: error.userTitle,
        userMessage: error.userMessage,
        fbtraceId: error.fbtraceId
      }
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Erro interno.";
  const status = message.startsWith("Missing required environment variable") ? 500 : 500;
  res.status(status).json({
    error: "internal_error",
    message
  });
};
