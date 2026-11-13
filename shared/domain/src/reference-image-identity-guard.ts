import { z } from "zod";
import type { ReferenceMatchResultV2 } from "./reference-image-matcher-v2";

/** A catalogue's own references may share a brand/design without establishing
 * the same exact SKU. Connected conflicts quarantine all linked identities.
 * No product names/GTINs, learned weights or outcome-tuned thresholds here. */
export const REFERENCE_IDENTITY_GUARD_VERSION = "reference-self-confusion-guard-v1" as const;
const token = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/u);
const schema = z.strictObject({
  inventory: z
    .array(z.strictObject({ referenceId: token, productId: token }))
    .min(1)
    .max(32),
  observations: z
    .array(
      z.strictObject({
        referenceId: token,
        productId: token,
        possibleProductIds: z.array(token).max(16),
      }),
    )
    .min(1)
    .max(32),
});
export type ReferenceConfusionGroup = {
  readonly productIds: readonly string[];
  readonly referenceIds: readonly string[];
};
export type ReferenceIdentityGuard = {
  readonly version: typeof REFERENCE_IDENTITY_GUARD_VERSION;
  readonly groups: readonly ReferenceConfusionGroup[];
};

/** Bounded serialized metadata only. Callers must obtain self observations from
 * their real bound gallery, not fabricate them. This is not identity review. */
export function deriveReferenceIdentityGuard(
  serialized: unknown,
):
  | { readonly status: "invalid" }
  | { readonly status: "ready"; readonly guard: ReferenceIdentityGuard } {
  try {
    if (typeof serialized !== "string" || serialized.length > 65536) return { status: "invalid" };
    const parsed = schema.safeParse(JSON.parse(serialized));
    if (!parsed.success) return { status: "invalid" };
    const { inventory, observations } = parsed.data;
    const refs = new Map(inventory.map((row) => [row.referenceId, row.productId]));
    const products = new Set(inventory.map((row) => row.productId));
    if (
      refs.size !== inventory.length ||
      observations.length !== refs.size ||
      products.size > 16 ||
      new Set(observations.map((row) => row.referenceId)).size !== refs.size
    )
      return { status: "invalid" };
    const adjacency = new Map([...products].map((id) => [id, new Set<string>()]));
    const conflicts: { referenceId: string; ids: string[] }[] = [];
    for (const row of observations) {
      if (
        refs.get(row.referenceId) !== row.productId ||
        new Set(row.possibleProductIds).size !== row.possibleProductIds.length ||
        row.possibleProductIds.some((id) => !products.has(id))
      )
        return { status: "invalid" };
      const others = row.possibleProductIds.filter((id) => id !== row.productId);
      if (!others.length) continue;
      const ids = [row.productId, ...others];
      conflicts.push({ referenceId: row.referenceId, ids });
      for (const other of others) {
        adjacency.get(row.productId)?.add(other);
        adjacency.get(other)?.add(row.productId);
      }
    }
    const visited = new Set<string>(),
      groups: ReferenceConfusionGroup[] = [];
    for (const id of [...products].sort()) {
      if (visited.has(id)) continue;
      const stack = [id],
        component = new Set<string>();
      while (stack.length) {
        const current = stack.pop();
        if (!current || visited.has(current)) continue;
        visited.add(current);
        component.add(current);
        for (const neighbour of adjacency.get(current) ?? [])
          if (!visited.has(neighbour)) stack.push(neighbour);
      }
      if (component.size > 1)
        groups.push(
          Object.freeze({
            productIds: Object.freeze([...component].sort()),
            referenceIds: Object.freeze(
              conflicts
                .filter((row) => row.ids.some((value) => component.has(value)))
                .map((row) => row.referenceId)
                .sort(),
            ),
          }),
        );
    }
    return {
      status: "ready",
      guard: Object.freeze({
        version: REFERENCE_IDENTITY_GUARD_VERSION,
        groups: Object.freeze(groups),
      }),
    };
  } catch {
    return { status: "invalid" };
  }
}

/** A strict safety layer: never upgrades an abstention, chooses a different
 * product or increases confidence. A known-confusable candidate must abstain. */
export function guardReferenceIdentity(
  match: ReferenceMatchResultV2,
  guard: ReferenceIdentityGuard,
): ReferenceMatchResultV2 {
  if (match.status !== "candidate") return match;
  const group = guard.groups.find((entry) => entry.productIds.includes(match.productId));
  if (!group) return match;
  return {
    status: "ambiguous",
    productIds: [...group.productIds],
    algorithmVersion: match.algorithmVersion,
    featureVersion: match.featureVersion,
    verificationStatus: "inferred",
    confidence: "uncalibrated_visual_similarity",
  };
}
