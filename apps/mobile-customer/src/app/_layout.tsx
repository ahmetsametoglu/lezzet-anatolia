// Unistyles tema kaydı yan etkili import'tur ve girişte bir kez yüklenmelidir.
import '@lezzet/mobile-kit/src/theme/unistyles';

import { loadAsync } from 'expo-font';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ToastHost } from '@lezzet/mobile-kit/src/components/ui/toast-host';
import { registerSignInEffect } from '@lezzet/mobile-kit/src/lib/auth/sign-in-effects';
import { DEV_CUSTOMER_EMAIL } from '@lezzet/mobile-kit/src/lib/auth/dev-login';
import { useDevAutoLogin } from '@lezzet/mobile-kit/src/lib/auth/use-dev-auto-login.hook';
import { useSessionEndedLogin } from '@lezzet/mobile-kit/src/lib/auth/use-session-ended-login.hook';
import { initAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { claimPendingInvite } from '@/lib/invite/invite-api';
import { useOnboardingGate } from '@/lib/onboarding/use-onboarding-gate.hook';
import { useVisitPoints } from '@/lib/points/use-visit-points.hook';
import { usePushNavigation } from '@lezzet/mobile-kit/src/lib/push/use-push-navigation.hook';
import { usePushRegistration } from '@lezzet/mobile-kit/src/lib/push/use-push-registration.hook';
import { applyFontScale, readFontScale } from '@lezzet/mobile-kit/src/lib/settings/font-scale';
import { ensureFreshInstall } from '@lezzet/mobile-kit/src/lib/storage/device-store';
import { useCartSync } from '@/screens/customer-kit/cart-store';
import { notificationHref } from '@/screens/notifications/notification-copy';
import { appFontAssets } from '@lezzet/mobile-kit/src/theme/fonts';

/*
  `(tabs)` dışındaki rotalar sekme çubuğu olmadan açılır. `expo-font` aileleri küresel kaydettiği için fontlar yalnız kökte yüklenir.
*/

/**
 * Sepet eşitlemesinin açılmadığı ağaçlar: kimliği bağlantıdaki jeton olan oturumsuz ziyaretçiler. Hariç tutma listesi, ki yeni müşteri
 * rotası kapıyı takmayı unutmadan açık gelsin.
 */
const CARTLESS_TREES = new Set(['feedback', 'invite']);

/* Bekleyen davet, uygulama hangi ekrandan açılırsa açılsın ilk girişte bağlanmalı; bu yüzden kayıt modül yüklenirken kökte yapılır. */
registerSignInEffect(claimPendingInvite);

export default function RootLayout() {
  const { theme } = useUnistyles();

  /* iOS Keychain uygulama silinince silinmez; temizlik bitmeden ağaç çizilmez, yoksa kullanıcı bir an girişli görünüp atılırdı. */
  const [installReady, setInstallReady] = useState(false);
  useEffect(() => {
    ensureFreshInstall()
      .then(() => setInstallReady(true))
      // Kapalı kalan kapı uygulamayı hiç açmazdı; iç adımlar hatalarını kendileri karşılar.
      .catch(() => setInstallReady(true));
  }, []);

  /* `useFonts` bu sürümde yüklemeyi tamamlamıyor ve ekranlar kök yeniden çizimine karşı ezberli; ilk kare fontlar hazırken çizilir.
     Yükleme düşerse uygulama sistem fontuyla açılır, çünkü müşteri tarafında hata kaydı altyapısı yok. */
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    loadAsync(appFontAssets)
      .then(() => setFontsReady(true))
      .catch(() => setFontsReady(true));
  }, []);

  // İlk açılış yönlendirmesi; bayrak okunana dek ağaç çizilmez.
  const onboardingReady = useOnboardingGate();

  // Kayıtlı yazı ölçeği ilk kareden önce uygulanır, yoksa ekran bir an normal boyda çizilip sıçrardı.
  const [scaleReady, setScaleReady] = useState(false);
  useEffect(() => {
    void readFontScale().then((scale) => {
      applyFontScale(scale);
      setScaleReady(true);
    });
  }, []);

  // Kayıtlı dil ilk kareden önce okunur, yoksa ekran bir an cihaz dilinde çizilirdi.
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    void initAppLocale().then(() => setLocaleReady(true));
  }, []);

  // Yalnız `__DEV__` derlemesinde ve oturumsuzken seed'in müşteri hesabıyla girer.
  useDevAutoLogin(DEV_CUSTOMER_EMAIL);

  // Sunucunun kesin reddettiği oturum her yüzeyden gelebilir; giriş ekranı bu yüzden kökten açılır.
  useSessionEndedLogin();

  // Kökte yan etkiler: hiçbiri tek bir ekrana bağlanamaz. Push jetonu müşteri uygulamasınındır.
  useVisitPoints();
  usePushRegistration('customer');
  usePushNavigation(notificationHref);

  /* Sepet eşitlemesi kökte, çünkü derin bağlantıyla açılan sepet ve checkout rotaları sekme kabuğunu hiç monte etmez; kapı kapalı
     kalırsa yazmalar sunucuya gitmez ve checkout müşterinin görmediği sepeti onaylar. */
  const segments = useSegments();
  useCartSync(!CARTLESS_TREES.has(segments[0] ?? ''));

  if (!installReady || !fontsReady || !onboardingReady || !scaleReady || !localeReady) return null;

  // Hareket kökü tek kopya: jestler yalnız onun altında çalışır. `app-root` uçtan uca akışların açılışı beklediği kancadır.
  return (
    <GestureHandlerRootView style={styles.root} testID="app-root">
      {/* Çekmeceler native modal yerine bu portala asılır; iOS kapanan modalın üstüne yenisini sunmadığı için çekmece asılı kalıyordu. */}
      <BottomSheetModalProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.colors['sand-50'] } }} />
      </BottomSheetModalProvider>
      <ToastHost />
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  /** Hareket kökü ekranı doldurur; yoksa altındaki yığın ölçüsüz kalır. */
  root: { flex: 1 },
});
