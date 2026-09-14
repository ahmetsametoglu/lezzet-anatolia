// Kök layout (operasyon uygulaması). Unistyles tema kaydı uygulama girişinde BİR KEZ yüklenir (yan etkili import).
import '@lezzet/mobile-kit/src/theme/unistyles';

import { loadAsync } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

import { ToastHost } from '@lezzet/mobile-kit/src/components/ui/toast-host';
import { DEV_ALL_SECTIONS_EMAIL } from '@lezzet/mobile-kit/src/lib/auth/dev-login';
import { registerSessionCleanup } from '@lezzet/mobile-kit/src/lib/auth/session-end';
import { useDevAutoLogin } from '@lezzet/mobile-kit/src/lib/auth/use-dev-auto-login.hook';
import { useSessionEndedLogin } from '@lezzet/mobile-kit/src/lib/auth/use-session-ended-login.hook';
import { initAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { usePushNavigation } from '@lezzet/mobile-kit/src/lib/push/use-push-navigation.hook';
import { usePushRegistration } from '@lezzet/mobile-kit/src/lib/push/use-push-registration.hook';
import { ensureFreshInstall } from '@lezzet/mobile-kit/src/lib/storage/device-store';
import { appFontAssets } from '@lezzet/mobile-kit/src/theme/fonts';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { clearWarehouseChoice } from '@/lib/operations/warehouse-choice';
import { operationsNotificationHref } from '@/screens/operations/notification-map';

/*
  KÖK YIĞIN — operasyon uygulaması (21.310): giriş (`/login`), OAuth dönüşü (`/auth/callback`) ve operasyon
  kabuğu (`(operations)` — kapı, bölüm sekmeleri, yığın ekranları). Müşteri kökünün iki kapısı burada da var
  ve aynı gerekçeyle (yeniden kurulum · font); dil kapısı ortak giriş ekranı için. Müşteriye özgü olanlar YOK:
  onboarding, ödeme, sepet, puan, davet, yazı ölçeği.
*/

/* TEMA — modül yüklenirken, ilk kareden ÖNCE (21.310). Kit açılışı müşteri temasıyla kaydeder
   (`theme/unistyles.ts`); bu uygulamanın her ekranı operasyon yüzeyidir, giriş dahil. Tek uygulama iki
   yüzeyi taşırken bu geçiş operasyon kapısında, odağa bağlı bir dikişti ve kapı odaktan düşünce müşteri
   temasına dönüyordu; ayrı uygulamada dönülecek bir yüzey yok. */
UnistylesRuntime.setTheme('operations');

/* OTURUM SONU TEMİZLİĞİ — depo seçimi cihazda kendi anahtarında durur ve oturumla birlikte silinmez. Çıkışta
   da reddedilen oturumda da bırakılır (kitin `session-end` kaydı): paylaşılan cihazda sonraki personel bir
   öncekinin deposuyla açılmasın. Kapı seçimi kapsama karşı zaten doğruluyor (`use-operations-access`); bu
   kayıt eski seçimin cihazda kalmasını kapatır. */
registerSessionCleanup(clearWarehouseChoice);

export default function RootLayout() {
  /* YENİDEN KURULUM KAPISI — müşteri kökünün aynısı ve aynı gerekçeyle: iOS Keychain kaydı uygulama silinince
     silinmez (`lib/storage/device-store.ts`); temizlik bitmeden ağaç çizilmez. */
  const [installReady, setInstallReady] = useState(false);
  useEffect(() => {
    ensureFreshInstall()
      .then(() => setInstallReady(true))
      // Son emniyet: iç adımlar hatalarını zaten karşılıyor; kapalı bir kapı, arızanın kendisinden beter olurdu.
      .catch(() => setInstallReady(true));
  }, []);

  /* FONT KAPISI — müşteri kökünün ölçülmüş gerekçesiyle (08.08: `useFonts` tamamlanmıyor, memoize ekranlar
     yeniden çizilmiyor). Yükleme düşerse kapı açılır ve uygulama sistem fontunda açık kalır. */
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    loadAsync(appFontAssets)
      .then(() => setFontsReady(true))
      .catch(() => setFontsReady(true));
  }, []);

  /* DİL KAPISI — operasyon metinleri tek dilli; ortak giriş ekranı ve toast'lar uygulama dilini okur. Okuma
     düşerse cihaz diliyle açılır (`initAppLocale` künyesi). */
  const [localeReady, setLocaleReady] = useState(false);
  useEffect(() => {
    void initAppLocale().then(() => setLocaleReady(true));
  }, []);

  /* OTOMATİK DEV GİRİŞİ — yalnız `__DEV__`, yalnız OTURUMSUZ hâlde: dört bölümü de gören personel (sekme
     çubuğunun dolu hâli ancak onunla denenir). Gerekçe ve kapatma anahtarı kancanın künyesinde. */
  useDevAutoLogin(DEV_ALL_SECTIONS_EMAIL);

  /* REDDEDİLEN OTURUM → GİRİŞ (21.304) — kökte, çünkü ret her yerden gelebilir; kökteki push kaydı dahil. */
  useSessionEndedLogin();

  /* Push kaydı kökte (bir ekrana bağlanamayan yan etki). Jeton OPERASYON uygulamasının (21.311): sunucu
     müşteri bildirimini bu jetona göndermez. */
  usePushRegistration('operations');
  /* Bildirime dokunuş → hedef ekran: adres uygulama içi bildirim listesiyle AYNI tablodan (`notification-map`). */
  usePushNavigation(operationsNotificationHref);

  if (!installReady || !fontsReady || !localeReady) return null;

  return (
    /* `app-root`: uygulamanın ÇİZİLDİĞİNİ söyleyen tek kanca — Maestro açılışı burada bekler
       (`maestro/common/launch.yaml`); oturum yoksa giriş ekranı, varsa ilk bölüm açılır ve ikisini de
       bekleyen tek kanca bu. Hareket kökü tek kopya ve kökte (müşteri kökünün künyesi, 09.08). */
    <GestureHandlerRootView style={styles.root} testID="app-root">
      {/* Çekmece portalı hareket kökünün İÇİNDE — gerekçe müşteri kökünün künyesinde (01.09). */}
      <BottomSheetModalProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: operationsTheme.colors.cream } }} />
      </BottomSheetModalProvider>
      {/* Toast KÖKTE tek kopya: her ekranın üstünde, dokunuş yutmaz (host'un künyesi). */}
      <ToastHost />
      <StatusBar style="auto" />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  /** Hareket kökü ekranı doldurur; yoksa altındaki yığın ölçüsüz kalır. */
  root: { flex: 1 },
});
