import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import { isExpoGoEnvironment } from "./environment";

export function isExpoGoHost(): boolean {
  return isExpoGoEnvironment(Constants.executionEnvironment, isRunningInExpoGo());
}
