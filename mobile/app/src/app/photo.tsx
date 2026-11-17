import { Redirect } from "expo-router";

/** Preserve old bookmarks without retaining a separate recognition flow. */
export default function LegacyPhotoRoute() {
  return <Redirect href="/local-photo" />;
}
