import { describe, it, expect, vi } from "vitest";
import { createLanguagePreference } from "./preference";
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
describe("language preference lifecycle", () => {
  it("does not let an old saved Finnish read overwrite a newly selected English", async () => {
    const read = deferred<string>(),
      changed = vi.fn(),
      issue = vi.fn(),
      write = vi.fn(async () => {}),
      p = createLanguagePreference({ read: () => read.promise, write, changed, issue });
    const hydration = p.hydrate();
    p.select("en");
    read.resolve("fi");
    await hydration;
    await p.settled();
    expect(changed.mock.calls).toEqual([["en"]]);
    expect(write).toHaveBeenCalledWith("en");
  });
  it("serializes rapid changes and keeps the last explicit language across relaunch", async () => {
    const first = deferred<void>();
    let stored = "fi",
      writes = 0;
    const write = vi.fn(async (v: string) => {
      if (writes++ === 0) await first.promise;
      stored = v;
    });
    const p = createLanguagePreference({
      read: async () => stored,
      write,
      changed: vi.fn(),
      issue: vi.fn(),
    });
    p.select("en");
    p.select("fi");
    await Promise.resolve();
    first.resolve();
    await p.settled();
    expect(write.mock.calls).toEqual([["en"], ["fi"]]);
    const changed = vi.fn();
    await createLanguagePreference({
      read: async () => stored,
      write,
      changed,
      issue: vi.fn(),
    }).hydrate();
    expect(changed).toHaveBeenCalledWith("fi");
  });
  it("contains read/write failures without resetting the visible choice", async () => {
    const changed = vi.fn(),
      issue = vi.fn(),
      p = createLanguagePreference({
        read: async () => {
          throw Error("fixture");
        },
        write: async () => {
          throw Error("fixture");
        },
        changed,
        issue,
      });
    await p.hydrate();
    p.select("en");
    await p.settled();
    expect(changed).toHaveBeenCalledExactlyOnceWith("en");
    expect(issue).toHaveBeenLastCalledWith(true);
  });
  it("ignores stale reads after unmount and unsupported stored languages", async () => {
    const pending = deferred<string>(),
      changed = vi.fn(),
      p = createLanguagePreference({
        read: () => pending.promise,
        write: async () => {},
        changed,
        issue: vi.fn(),
      });
    const h = p.hydrate();
    p.dispose();
    pending.resolve("en");
    await h;
    expect(changed).not.toHaveBeenCalled();
    await createLanguagePreference({
      read: async () => "sv",
      write: async () => {},
      changed,
      issue: vi.fn(),
    }).hydrate();
    expect(changed).not.toHaveBeenCalled();
  });
});
