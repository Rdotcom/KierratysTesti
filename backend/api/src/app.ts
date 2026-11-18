import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import {
  ProductLookupBodySchema,
  type ProductLookupInput,
  type ProductLookupResult,
  ProductLookupResultSchema,
  productLookupPath,
} from "@kierratysappi/contracts/lookup-schema";
import type { ObjectImageRecognizer } from "@kierratysappi/data-providers/siglip-recognition";
import { isLocalDevelopmentHost, parseGtin } from "@kierratysappi/domain";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyLoggerOptions,
  LogController,
} from "fastify";
import { z } from "zod";
import { registerObjectImageRoutes } from "./object-image-routes";

export interface LookupService {
  lookup(input: ProductLookupInput, signal?: AbortSignal): Promise<ProductLookupResult>;
}

export type LookupObservation = {
  readonly status: ProductLookupResult["status"];
  readonly providerId: string | undefined;
  readonly cacheHit: boolean;
  readonly durationMs: number;
};

export function clientErrorLogFields(statusCode: number): { readonly statusCode: number } {
  return { statusCode };
}

export type BuildAppOptions = {
  readonly objectImageRecognizer?: ObjectImageRecognizer;
  readonly lookupService: LookupService;
  readonly logger?: false | FastifyLoggerOptions;
  readonly allowedWebOrigins?: readonly string[];
  readonly localOnly?: boolean;
  readonly observeLookup?: (observation: LookupObservation) => void;
};

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 2_048,
    logController: new LogController({ disableRequestLogging: true }),
    logger: options.logger ?? false,
    trustProxy: false,
    requestIdHeader: false,
    connectionTimeout: 20_000,
    requestTimeout: 20_000,
    handlerTimeout: 15_000,
    keepAliveTimeout: 5_000,
    maxRequestsPerSocket: 100,
    ajv: {
      customOptions: {
        allErrors: false,
        removeAdditional: false,
      },
    },
  });
  app.server.maxConnections = 128;

  const allowedOrigins = new Set(options.allowedWebOrigins ?? []);
  // CORS alone only controls browser access to responses. Reject disallowed
  // browser origins before body parsing, quotas, providers or image inference.
  app.addHook("onRequest", async (request, reply) => {
    if (options.localOnly && !isLocalDevelopmentHost(request.hostname)) {
      return reply
        .code(403)
        .send({ error: { code: "host_not_allowed", message: "Host not allowed." } });
    }
    const origin = request.headers.origin;
    if (origin !== undefined && !allowedOrigins.has(origin)) {
      return reply
        .code(403)
        .send({ error: { code: "origin_not_allowed", message: "Origin not allowed." } });
    }
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginEmbedderPolicy: false,
  });
  if (options.allowedWebOrigins && options.allowedWebOrigins.length > 0) {
    await app.register(cors, {
      origin: [...options.allowedWebOrigins],
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Accept"],
      credentials: false,
      maxAge: 600,
    });
  }
  await app.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: "1 minute",
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: { code: "rate_limited", message: "Too many requests. Try again shortly." },
    }),
  });
  await app.register(swagger, {
    openapi: {
      info: {
        title: "KeepItGreen API",
        version: "0.1.0",
        description: "Privacy-conscious product and Finnish packaging-sorting resolution.",
      },
      servers: [{ url: "/" }],
    },
  });

  app.get(
    "/v1/health",
    {
      schema: {
        description: "Liveness check with no external dependency access.",
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["status", "version"],
            properties: {
              status: { const: "ok" },
              version: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({ status: "ok" as const, version: "0.1.0" }),
  );

  app.get(
    "/v1/openapi.json",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { hide: true },
    },
    async (_request, reply) => reply.send(app.swagger()),
  );

  app.post(
    productLookupPath,
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        description:
          "Resolve one canonical or manually formatted GTIN without logging it in the URL.",
        body: z.toJSONSchema(ProductLookupBodySchema, { target: "draft-7", io: "input" }),
        response: {
          200: {
            type: "object",
            additionalProperties: true,
            required: ["status", "gtin"],
            properties: {
              status: { type: "string", enum: ["resolved", "packaging_missing"] },
              gtin: { type: "string" },
            },
          },
          400: errorResponseSchema("invalid_request"),
          429: errorResponseSchema("rate_limited"),
          404: statusResponseSchema("not_found"),
          503: statusResponseSchema("provider_unavailable"),
        },
      },
    },
    async (request, reply) => {
      const startedAt = Date.now();
      const body = ProductLookupBodySchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          error: { code: "invalid_request", message: "Request body is invalid." },
        });
      }

      const parsedGtin = parseGtin(body.data.gtin);
      if (!parsedGtin.ok) {
        return reply.code(400).send({
          error: { code: "invalid_gtin", message: "Barcode is not a valid GTIN." },
        });
      }

      const controller = new AbortController();
      const abort = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      request.raw.once("aborted", abort);
      reply.raw.once("close", abort);
      try {
        const result = ProductLookupResultSchema.parse(
          await options.lookupService.lookup(
            {
              gtin: parsedGtin.value,
              country: "FI",
              language: body.data.language,
            },
            controller.signal,
          ),
        );

        const observation: LookupObservation = {
          status: result.status,
          providerId:
            result.status === "resolved" || result.status === "packaging_missing"
              ? result.provider.id
              : undefined,
          cacheHit:
            result.status === "resolved" || result.status === "packaging_missing"
              ? result.cache.hit
              : false,
          durationMs: Math.max(0, Date.now() - startedAt),
        };
        options.observeLookup?.(observation);
        request.log.info({ lookup: observation }, "Lookup completed");

        reply.header("Cache-Control", "private, no-store");
        if (result.status === "not_found") {
          return reply.code(404).send(result);
        }
        if (result.status === "provider_unavailable") {
          return reply.code(503).send(result);
        }
        return reply.code(200).send(result);
      } finally {
        request.raw.off("aborted", abort);
        reply.raw.off("close", abort);
      }
    },
  );

  registerObjectImageRoutes(app, options.objectImageRecognizer);

  app.setNotFoundHandler(async (_request, reply) =>
    reply.code(404).send({
      error: { code: "route_not_found", message: "Route not found." },
    }),
  );

  app.setErrorHandler(async (error: FastifyError, request, reply) => {
    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ statusCode }, "Unhandled request error");
    } else {
      request.log.warn(clientErrorLogFields(statusCode), "Request rejected");
    }
    const response =
      statusCode === 413
        ? { code: "payload_too_large", message: "Request body is too large." }
        : statusCode === 429
          ? { code: "rate_limited", message: "Too many requests. Try again shortly." }
          : statusCode === 400
            ? { code: "invalid_request", message: "Request body is invalid." }
            : { code: "internal_error", message: "Unexpected server error." };
    return reply.code(statusCode).send({
      error: {
        code: response.code,
        message: response.message,
      },
    });
  });

  await app.ready();
  return app;
}

function errorResponseSchema(code: string) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["error"],
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message"],
        properties: {
          code: { type: "string", examples: [code] },
          message: { type: "string" },
        },
      },
    },
  } as const;
}

function statusResponseSchema(status: "not_found" | "provider_unavailable") {
  return {
    type: "object",
    required: ["status", "gtin"],
    properties: {
      status: { const: status },
      gtin: { type: "string" },
      retryable: { type: "boolean" },
    },
  } as const;
}
