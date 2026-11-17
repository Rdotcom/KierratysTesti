import { preparePhotoBase64 } from "@kierratysappi/contracts/photo-image";
import {
  NetworkImageRequestSchema,
  NetworkResultSchema,
  networkRecognitionPath,
  networkCapabilitiesPath,
  networkConsentVersion,
  networkModelId,
} from "@kierratysappi/contracts/network-recognition";
import type { ObjectImageRecognizer } from "@kierratysappi/data-providers/siglip-recognition";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

export function registerObjectImageRoutes(
  app: FastifyInstance,
  recognizer?: ObjectImageRecognizer,
): void {
  let active = false;
  app.get(networkCapabilitiesPath, async (_request, reply) => {
    reply.header("Cache-Control", "no-store");
    return {
      enabled: Boolean(recognizer),
      consentVersion: networkConsentVersion,
      modelId: networkModelId,
      execution: "server",
      retention: "memory-only",
      maxImageBytes: 1_500_000,
    };
  });
  app.post(
    networkRecognitionPath,
    {
      bodyLimit: 2_001_024,
      config: { rateLimit: { max: 4, timeWindow: "1 minute" } },
      schema: {
        body: z.toJSONSchema(NetworkImageRequestSchema, { target: "draft-7", io: "input" }),
      },
    },
    async (request, reply) => {
      reply.header("Cache-Control", "private, no-store");
      if (!recognizer) return reply.code(503).send({ status: "unavailable", reason: "disabled" });
      const body = NetworkImageRequestSchema.safeParse(request.body);
      if (!body.success)
        return reply.code(400).send({ status: "unavailable", reason: "invalid_image" });
      let clean: string;
      try {
        clean = preparePhotoBase64(body.data.jpegBase64);
      } catch {
        return reply.code(400).send({ status: "unavailable", reason: "invalid_image" });
      }
      if (active) return reply.code(429).send({ status: "unavailable", reason: "busy" });
      active = true;
      const controller = new AbortController();
      const abort = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      request.raw.once("aborted", abort);
      reply.raw.once("close", abort);
      try {
        const result = NetworkResultSchema.parse(
          await recognizer.recognize(clean, controller.signal),
        );
        return reply.code(result.status === "observed" ? 200 : 503).send(result);
      } catch {
        return reply.code(503).send({ status: "unavailable", reason: "failed" });
      } finally {
        active = false;
        request.raw.off("aborted", abort);
        reply.raw.off("close", abort);
      }
    },
  );
}
