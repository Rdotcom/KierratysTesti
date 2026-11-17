import { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useAppTheme } from "@/theme/tokens";
import { AppText } from "./ui";
export function ChoiceChip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { palette } = useAppTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? palette.pineSoft : palette.bgSurface,
          borderColor: focused
            ? palette.actionLink
            : selected
              ? palette.actionPrimary
              : palette.borderSubtle,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      <AppText variant="small" style={{ color: selected ? palette.actionPrimary : palette.ink }}>
        {label}
      </AppText>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    maxWidth: "100%",
  },
});
