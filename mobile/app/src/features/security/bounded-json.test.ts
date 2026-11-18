import { describe, expect, it, vi } from "vitest";
import { readBoundedJson } from "./bounded-json";

describe("network response memory bound", () => {
  it("parses a valid bounded streamed response", async () => {
    expect(await readBoundedJson(Response.json({ status: "not_found" }), 100)).toEqual({
      status: "not_found",
    });
  });
  it("cancels a declared oversized response without parsing", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ cancel });
    await expect(
      readBoundedJson(new Response(body, { headers: { "content-length": "1000" } }), 100),
    ).rejects.toThrow("response_bound");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("bounds a chunked response that lies about content length and cancels its producer", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(64));
      },
      cancel,
    });
    await expect(
      readBoundedJson(new Response(body, { headers: { "content-length": "1" } }), 100),
    ).rejects.toThrow("response_bound");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects malformed JSON and absent bodies, not an unbounded text fallback", async () => {
    await expect(readBoundedJson(new Response("{bad"), 100)).rejects.toThrow();
    await expect(readBoundedJson(new Response(null), 100)).rejects.toThrow();
    await expect(readBoundedJson(new Response("{}"), Infinity)).rejects.toThrow();
  });
});
