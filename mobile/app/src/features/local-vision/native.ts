import { type NativeModule, requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { offlineCatalogue } from "./catalogue";
import {
  createCameraProductRecognizer,
  createObjectRecognizer,
  type ObjectNativeReader,
} from "./object-candidates";
import { createOfflineProductRecognizer, type OfflineProductReader } from "./offline-product";
import { createLocalReadinessInspector } from "./readiness";
import { createLocalRecognizer, type LocalVisionNativeReader } from "./recognizer";
import { createNativeReferenceRuntimePorts, type ReferenceNativeReader } from "./reference-ports";

function reader(): LocalVisionNativeReader | undefined {
  if (Platform.OS !== "ios") return undefined;
  try {
    const module = requireOptionalNativeModule<NativeModule & LocalVisionNativeReader>(
      "KierratysLocalVision",
    );
    return module && typeof module.recognize === "function" ? module : undefined;
  } catch {
    return undefined;
  }
}

export const isLocalVisionAvailable = () => reader() !== undefined;
export const recognizeLocalPhoto = createLocalRecognizer(reader);
export const inspectLocalVisionReadiness = createLocalReadinessInspector(reader);

const recognizeCataloguePhoto = createOfflineProductRecognizer(() => {
  if (Platform.OS !== "ios") return undefined;
  return (
    requireOptionalNativeModule<NativeModule & OfflineProductReader>("KierratysLocalVision") ??
    undefined
  );
}, offlineCatalogue);

const objectRecognizer = createObjectRecognizer(() => {
  if (Platform.OS !== "ios") return undefined;
  return (
    requireOptionalNativeModule<NativeModule & ObjectNativeReader>("KierratysLocalVision") ??
    undefined
  );
});
export const recognizeOfflineProduct = createCameraProductRecognizer(
  recognizeCataloguePhoto,
  objectRecognizer,
);

/** Experimental capability only; the normal photo/UI path does not call it. */
export const inspectReferenceRuntimePorts = (signal?: AbortSignal) =>
  createNativeReferenceRuntimePorts(() => {
    if (Platform.OS !== "ios") return undefined;
    return (
      requireOptionalNativeModule<NativeModule & ReferenceNativeReader>("KierratysLocalVision") ??
      undefined
    );
  }, signal);
