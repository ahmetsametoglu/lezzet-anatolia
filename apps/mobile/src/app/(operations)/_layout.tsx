import { Redirect, Stack } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { LoadingState } from '@/components/ui/loading-state';
import { operationsCopy } from '@/screens/operations/copy';
import { OperationsSectionsProvider } from '@/screens/operations/sections-context';
import { useOperationsAccess } from '@/screens/operations/use-operations-access.hook';
import { operationsTheme } from '@/theme/unistyles';

/*
  OPERASYON KABUĞUNUN KAPISI — uygulamanın İKİNCİ navigasyon ağacının kökü.

  GRUP (`(operations)`), segment değil: parantezli klasör adrese YAZILMAZ, yani bölümler
  `/courier` · `/warehouse` · `/management` · `/money` adreslerinde durur ve müşteri kabuğunun
  (`(tabs)`) adresleriyle çakışmaz. İki yüzey iki ayrı ağaçtır (02-mimari §4) — ortak bir kök
  yığın altında, ama kendi kapısı, kendi teması ve kendi sekme kabuğuyla.

  KAPI TEK YERDE: `/me` BURADA bir kez okunur, sonuç bağlamla altına dağılır. Her ekranın kendi
  kontrolünü yapması, ekran başına bir uçuş ve ekranlar arası çelişki demekti.

  DÖRT HÂL — üçü ekrana, biri yönlendirmeye çıkar:
  · yükleniyor → halka (kapıyı geçmeden içerik çizilmez; yanlış yüzeyin bir kare bile görünmesi
    "girdim sandım" hissi verir)
  · yetki yok / oturum yok → MÜŞTERİ kabuğuna yönlendirme. Karar 02-mimari §4: oturumsuz kullanım
    müşteri gezinmesidir, uygulama giriş kapısıyla açılmaz.
  · okunamadı → hata bloğu + tekrar dene. "Yetkin yok" DEMİYORUZ, çünkü bilmiyoruz (CLAUDE §1).
  · yetkili → bölümler bağlama konur, yığın açılır.

  TEMA GEÇİŞİ BURADA: `setTheme('operations')` yalnız kapı açıldığında koşar ve çıkışta müşteri
  temasına döner. Paylaşılan kit (`PressableSurface`, `Icon`, `LoadingState`) etkin temayı okuduğu
  için operasyon farkları (`cream`, `olive-bg`) onlara böyle ulaşır. Operasyon komponentleri
  token'larını sabitten okur — gerekçe `theme/unistyles.ts` künyesinde — yani bu çağrı DÜŞSE bile
  ekranlar doğru çizilir; dikişin işi paylaşılan kiti hizalamaktır, ekranı ayakta tutmak değil.
  DİKİŞİN SINIRI (inceleme bulgusu 08.08): geri dönüş UNMOUNT'a bağlı — kabuk yığında dururken
  ÜSTÜNE bir müşteri rotası açılırsa o ekran operasyon temasıyla çizilir. Bugün kabuktan müşteri
  rotasına giden hiçbir bağlantı yok (ölçüldü), o yüzden odak-dinleyici makinesi KURULMADI;
  kabuk-içi ilk çapraz bağlantıyı ekleyen dilim bu geçişi focus/blur'a bağlamak zorundadır.

  GİRİŞ AKIŞI BU DİLİMDE DEĞİL: personel giriş yaptığında buraya YÖNLENDİRİLMESİ (web'in tek
  `/connexion` modelinin karşılığı) oturum diliminin işi; bugün kabuk adresle/derin bağla açılır ve
  kapı her hâlükârda burada duruyor.
  BEKLEYEN(21.13): girişten sonra operasyon kabuğuna otomatik yönlendirme + push dokunuşunun
  ekrana açılması aynı oturum/bildirim hattının parçası.
*/

const t = operationsCopy;

export default function OperationsLayout() {
  const access = useOperationsAccess();
  const granted = access.status === 'granted';

  useEffect(() => {
    if (!granted) return;
    UnistylesRuntime.setTheme('operations');
    return () => UnistylesRuntime.setTheme('light');
  }, [granted]);

  if (access.status === 'loading') {
    return (
      <View style={styles.gate}>
        <LoadingState accessibilityLabel={t.gate.loading} testID="operations-gate-loading" />
      </View>
    );
  }

  if (access.status === 'error') {
    return (
      <View style={styles.gate}>
        <OperationsNoticeBlock
          variant="error"
          title={t.gate.error.title}
          description={t.gate.error.body}
          retry={{ label: t.gate.error.retry, onPress: access.retry }}
          testID="operations-gate-error"
        />
      </View>
    );
  }

  if (access.status === 'denied') {
    // Müşteri kabuğunun kökü. `Redirect` (yönlendirme etkisi değil): geçmişe kayıt düşmez, yani
    // geri tuşu kullanıcıyı giremediği kapıya geri fırlatmaz.
    return <Redirect href="/" />;
  }

  return (
    <OperationsSectionsProvider value={access.sections}>
      <Stack
        screenOptions={{
          // Başlıkları ekranlar kendi çiziyor (v2: zeminle aynı renkte, çizgisiz, sayfayla kayan).
          headerShown: false,
          contentStyle: { backgroundColor: operationsTheme.colors.cream },
        }}
      />
    </OperationsSectionsProvider>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: operationsTheme.space['6xl'],
    backgroundColor: operationsTheme.colors.cream,
  },
});
