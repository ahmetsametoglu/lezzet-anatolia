// Kök layout. Unistyles tema kaydı uygulama girişinde BİR KEZ yüklenir (yan etkili import).
import '@/theme/unistyles';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </>
  );
}
