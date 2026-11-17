export function usesNetworkRecognition(platform: string, expoGo: boolean): boolean {
  return platform === "web" || expoGo;
}
