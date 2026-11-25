import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { migrate } from '@/lib/db';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SQLiteProvider databaseName="scrapbin.db" onInit={migrate}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Inventory' }} />
          <Stack.Screen name="scan/[id]" options={{ title: 'Review scan' }} />
          <Stack.Screen name="part/[id]" options={{ title: 'Part' }} />
        </Stack>
      </SQLiteProvider>
    </ThemeProvider>
  );
}
