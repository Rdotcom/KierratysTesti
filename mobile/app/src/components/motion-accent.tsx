import { useEffect, useRef, type PropsWithChildren } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
/** One decorative settle, never delays content or triggers inference/audio. */
export function MotionAccent({
  children,
  style,
  from = 0.96,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; from?: number }>) {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let active = true,
      preferenceChanged = false,
      latestReduced = true,
      foreground = AppState.currentState === "active";
    const reset = () => {
      scale.stopAnimation();
      scale.setValue(1);
    };
    const preference = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      preferenceChanged = true;
      latestReduced = enabled;
      if (enabled) reset();
    });
    const app = AppState.addEventListener("change", (state) => {
      foreground = state === "active";
      if (state !== "active") reset();
    });
    void (async () => {
      try {
        const reduced = await AccessibilityInfo.isReduceMotionEnabled();
        if (!active || (preferenceChanged ? latestReduced : reduced) || !foreground) return;
        scale.setValue(from);
        Animated.timing(scale, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        }).start();
      } catch {
        reset();
      }
    })();
    return () => {
      active = false;
      reset();
      preference.remove();
      app.remove();
    };
  }, [from, scale]);
  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}
