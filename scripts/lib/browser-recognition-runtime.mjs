import path from "node:path";
export function browserRecognitionRuntime(
  root,
  environment = {},
  platform = process.platform,
  paths = path,
) {
  const webPort = Number(environment.WEB_AI_PORT ?? 8097),
    apiPort = Number(environment.SIGLIP_PORT ?? 3004);
  if (
    [webPort, apiPort].some((port) => !Number.isInteger(port) || port < 1024 || port > 65535) ||
    webPort === apiPort
  )
    throw Error("invalid_recognition_ports");
  return {
    python: paths.resolve(
      environment.SIGLIP_PYTHON ??
        paths.join(
          root,
          "work",
          "siglip-server-venv",
          platform === "win32" ? "Scripts" : "bin",
          platform === "win32" ? "python.exe" : "python",
        ),
    ),
    assets: paths.resolve(environment.SIGLIP_ASSETS ?? paths.join(root, "work", "network-model")),
    webPort,
    apiPort,
    webOrigin: `http://localhost:${webPort}`,
    apiOrigin: `http://127.0.0.1:${apiPort}`,
  };
}
