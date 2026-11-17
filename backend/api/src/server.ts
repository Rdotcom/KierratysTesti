import { ProductResolutionService } from "@kierratysappi/application";
import { OpenFoodFactsProvider } from "@kierratysappi/data-providers";
import { buildApp } from "./app";
import { parseEnvironment } from "./config";

const environment = parseEnvironment(process.env);
const service = new ProductResolutionService({
  providers: [
    new OpenFoodFactsProvider({ userAgent: environment.OFF_USER_AGENT, productScope: "all" }),
  ],
});
const app = await buildApp({
  lookupService: service,
  allowedWebOrigins: environment.WEB_ALLOWED_ORIGINS,
  logger: environment.LOG_LEVEL === "silent" ? false : { level: environment.LOG_LEVEL },
});

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  process.exitCode = 0;
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: environment.HOST, port: environment.PORT });
} catch (error) {
  app.log.error({ err: error }, "API failed to start");
  process.exitCode = 1;
}
