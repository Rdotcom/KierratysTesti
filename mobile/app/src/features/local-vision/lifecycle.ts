/** Permission dialogs pause the Android Activity; no captured photo exists yet. */
export function shouldClearLocalPhotoState(state: string, platform: string, prompting: boolean) {
  if (state === "active") return false;
  if (prompting && (state === "inactive" || platform === "android")) return false;
  return true;
}

interface ActivitySource {
  readonly currentState: string | null | undefined;
  subscribe(listener: (state: string) => void): { remove(): void };
}

/** Never open the camera behind another app or after a late permission result. */
export async function waitForCameraPermissionResume(
  source: ActivitySource,
  signal: AbortSignal,
  deadlineMs = 1500,
): Promise<boolean> {
  if (signal.aborted) return false;
  if (source.currentState === "active") return true;
  return new Promise((resolve) => {
    let settled = false;
    let subscription: { remove(): void } | undefined;
    const finish = (active: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription?.remove();
      signal.removeEventListener("abort", abort);
      resolve(active);
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(false), deadlineMs);
    signal.addEventListener("abort", abort, { once: true });
    subscription = source.subscribe((state) => {
      if (state === "active") finish(true);
    });
    if (settled) subscription.remove();
    if (signal.aborted) abort();
  });
}
