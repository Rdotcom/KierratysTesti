import { type NativeModule, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { isExpoGoHost } from "@/features/runtime/host";
import { type AndroidEvidenceReader, createAndroidEvidenceRecognizer } from "./android-evidence";
import { offlineCatalogue } from "./catalogue";
import {
  type CameraProductResponse,
  createCameraProductRecognizer,
  createObjectRecognizer,
  type ObjectNativeReader,
} from "./object-candidates";
import { createOfflineProductRecognizer, type OfflineProductReader } from "./offline-product";
import { createLocalReadinessInspector } from "./readiness";
import { createLocalRecognizer, type LocalVisionNativeReader } from "./recognizer";
import { createNativeReferenceRuntimePorts, type ReferenceNativeReader } from "./reference-ports";

function reader(): LocalVisionNativeReader | undefined {
  if (Platform.OS !== "ios" || isExpoGoHost()) return undefined;
  try {
    const module = requireOptionalNativeModule<NativeModule & LocalVisionNativeReader>(
      "KierratysLocalVision",
    );
    return module && typeof module.recognize === "function" ? module : undefined;
  } catch {
    return undefined;
  }
}

function androidReader():
  | (NativeModule &
      AndroidEvidenceReader &
      ObjectNativeReader & { inspectReadiness(): Promise<unknown> })
  | undefined {
  if (Platform.OS !== "android" || isExpoGoHost()) return undefined;
  try {
    const module = requireOptionalNativeModule<
      NativeModule &
        AndroidEvidenceReader &
        ObjectNativeReader & { inspectReadiness(): Promise<unknown> }
    >("KierratysLocalVision");
    return module &&
      [
        module.recognizeObjectCandidates,
        module.cancelObjectCandidates,
        module.recognizeAndroidEvidence,
        module.cancelAndroidEvidence,
        module.inspectReadiness,
      ].every((v) => typeof v === "function")
      ? module
      : undefined;
  } catch {
    return undefined;
  }
}
export const isLocalVisionAvailable = () => reader() !== undefined || androidReader() !== undefined;
export const recognizeLocalPhoto = createLocalRecognizer(reader);
export const inspectLocalVisionReadiness = createLocalReadinessInspector(() =>
  Platform.OS === "android" ? androidReader() : reader(),
);
export const recognizeAndroidEvidence = createAndroidEvidenceRecognizer(androidReader);

const recognizeCataloguePhoto = createOfflineProductRecognizer(() => {
  if (Platform.OS !== "ios" || isExpoGoHost()) return undefined;
  return (
    requireOptionalNativeModule<NativeModule & OfflineProductReader>("KierratysLocalVision") ??
    undefined
  );
}, offlineCatalogue);

const objectRecognizer = createObjectRecognizer(() => {
  if (Platform.OS !== "ios" || isExpoGoHost()) return undefined;
  return (
    requireOptionalNativeModule<NativeModule & ObjectNativeReader>("KierratysLocalVision") ??
    undefined
  );
});
const recognizeIosProduct = createCameraProductRecognizer(
  recognizeCataloguePhoto,
  objectRecognizer,
);
const androidObjects = createObjectRecognizer(androidReader);
export const recognizeOfflineProduct = async (
  jpeg: string,
  signal: AbortSignal,
): Promise<CameraProductResponse> => {
  if (Platform.OS !== "android") return recognizeIosProduct(jpeg, signal);
  const started = performance.now();
  const evidence = await recognizeAndroidEvidence(jpeg, signal);
  if (evidence.status !== "observed") return evidence;
  const result = evidence.observation.codes.length
    ? (offlineCatalogue?.lookup(evidence.observation.codes) ?? { status: "unknown" as const })
    : { status: "unknown" as const };
  if (result.status === "catalogue_match" || result.status === "ambiguous_barcode")
    return { status: "observed", result, androidEvidence: evidence.observation };
  const hint = await androidObjects.recognize(
    jpeg,
    signal,
    Math.min(12000, 15000 - (performance.now() - started)),
  );
  if (signal.aborted) return { status: "unavailable", reason: "cancelled" };
  if (hint.status !== "observed") return hint;
  return { status: "observed", result, objectHint: hint, androidEvidence: evidence.observation };
};

/** Experimental capability only; the normal photo/UI path does not call it. */
export const inspectReferenceRuntimePorts = (signal?: AbortSignal) =>
  createNativeReferenceRuntimePorts(() => {
    if (Platform.OS !== "ios" || isExpoGoHost()) return undefined;
    return (
      requireOptionalNativeModule<NativeModule & ReferenceNativeReader>("KierratysLocalVision") ??
      undefined
    );
  }, signal);
