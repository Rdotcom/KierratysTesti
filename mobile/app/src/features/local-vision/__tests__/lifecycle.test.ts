import { afterEach, expect, it, vi } from "vitest";
import { shouldClearLocalPhotoState, waitForCameraPermissionResume } from "../lifecycle";
afterEach(() => vi.useRealTimers());

it("only tolerates a native permission interruption, preserving ordinary background/photo clearing", () => {
  for (const platform of ["ios", "android"]) {
    expect(shouldClearLocalPhotoState("active", platform, false)).toBe(false);
    expect(shouldClearLocalPhotoState("background", platform, false)).toBe(true);
    expect(shouldClearLocalPhotoState("inactive", platform, false)).toBe(true);
    expect(shouldClearLocalPhotoState("inactive", platform, true)).toBe(false);
  }
  expect(shouldClearLocalPhotoState("background", "ios", true)).toBe(true);
  expect(shouldClearLocalPhotoState("background", "android", true)).toBe(false);
});

function source(currentState = "background") {
  let listener = (_state: string) => {};
  const remove = vi.fn();
  return {
    currentState,
    remove,
    subscribe: (next: typeof listener) => {
      listener = next;
      return { remove };
    },
    emit: (state: string) => listener(state),
  };
}

it("resumes after the Android permission Activity and removes its listener", async () => {
  const activity = source();
  const result = waitForCameraPermissionResume(activity, new AbortController().signal);
  activity.emit("active");
  expect(await result).toBe(true);
  expect(activity.remove).toHaveBeenCalledOnce();
});

it("does not reopen after leaving or a delayed resume beyond the bounded deadline", async () => {
  vi.useFakeTimers();
  const activity = source();
  const result = waitForCameraPermissionResume(activity, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(1500);
  expect(await result).toBe(false);
  activity.emit("active");
  expect(activity.remove).toHaveBeenCalledOnce();
});

it("cancels on blur and avoids listeners when already active or aborted", async () => {
  const activity = source(),
    controller = new AbortController();
  const result = waitForCameraPermissionResume(activity, controller.signal);
  controller.abort();
  expect(await result).toBe(false);
  expect(activity.remove).toHaveBeenCalledOnce();
  expect(await waitForCameraPermissionResume(source("active"), new AbortController().signal)).toBe(
    true,
  );
  expect(await waitForCameraPermissionResume(activity, controller.signal)).toBe(false);
});
