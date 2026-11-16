import { GuideLibrarySchema } from "@kierratysappi/recycling-engine";
import snapshot from "../../../assets/data/hsy-guide.json";
const parsed = GuideLibrarySchema.safeParse(snapshot);
export const guideLibrary = parsed.success ? parsed.data : undefined;
