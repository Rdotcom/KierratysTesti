import { IBMPlexMono_600SemiBold } from "@expo-google-fonts/ibm-plex-mono";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { BottomNavigation } from "@/components/bottom-navigation";
import { navigationAnimation } from "@/features/accessibility/motion";
import { readDeviceLocation } from "@/features/nearby/device-location";
import { NearbySearchProvider } from "@/features/nearby/search-context";
import { SortingRegionProvider } from "@/features/region/context";
import { ScanSessionProvider } from "@/features/scan/session-context";
import { LanguageProvider } from "@/i18n/language-context";
import { AppThemeProvider, useAppTheme } from "@/theme/tokens";

void SplashScreen.preventAutoHideAsync();

function Navigation() {
  const { palette, isDark } = useAppTheme();
  const reducedMotion = useReducedMotion();
  return (
    <View nativeID="app-navigation-surface" style={{ flex: 1, backgroundColor: palette.bgCanvas }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.bgCanvas },
          animation: navigationAnimation(reducedMotion),
          animationDuration: 180,
        }}
      >
        <Stack.Screen name="guide" options={{ animation: "none" }} />
        <Stack.Screen name="result" options={{ animation: "none" }} />
      </Stack>
      <BottomNavigation />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    IBMPlexMono_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <AppThemeProvider>
      <LanguageProvider>
        <SortingRegionProvider readFix={readDeviceLocation}>
          <ScanSessionProvider>
            <NearbySearchProvider>
              <Navigation />
            </NearbySearchProvider>
          </ScanSessionProvider>
        </SortingRegionProvider>
      </LanguageProvider>
    </AppThemeProvider>
  );
}
