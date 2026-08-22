import { Redirect, Stack, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';
import { StyleSheet, UnistylesRuntime } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { LoadingState } from '@/components/ui/loading-state';
import { operationsCopy } from '@/screens/operations/copy';
import { OperationsSessionProvider } from '@/screens/operations/sections-context';
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
  DİKİŞİN SINIRI KAPANDI (21.97): dönüş eskiden UNMOUNT'a bağlıydı ve kabuk yığında dururken
  üstüne açılan bir müşteri rotası operasyon temasıyla çizilirdi (inceleme bulgusu 08.08). O gün
  kabuktan müşteri rotasına giden hiçbir bağlantı YOKTU, bu yüzden makine kurulmamış ama borç
  yazılmıştı; kimlik menüsünün "Müşteri uygulamasına geç"i ilk çapraz bağlantı olunca `useEffect`
  `useFocusEffect`e çevrildi — kabuk odaktan düştüğünde de tema müşteriye döner.

  GİRİŞ AKIŞI BU DİLİMDE DEĞİL: personelin buraya yönlendirilmesi oturum diliminin işi ve İKİ
  yerden koşuyor — girişte (`post-login-route`, 21.32) ve AÇILIŞTA
  (`use-staff-landing.hook`, 21.97). İkisi de aynı kurala (`operationsHomeRoute`) sorar; ayrı
  hesaplasalardı "girince operasyona gidiyor ama açınca gitmiyor" diye bir fark doğardı — nitekim
  21.97'den önce tam olarak o vardı. `BEKLEYEN(21.13)`ün yönlendirme yarısı böylece kapandı;
  push dokunuşunun ekrana açılması bildirim hattıyla (21.88) gelecek.
*/

const t = operationsCopy;

export default function OperationsLayout() {
  const access = useOperationsAccess();
  const granted = access.status === 'granted';

  /* TEMA DİKİŞİ ODAĞA BAĞLI, MONTAJA DEĞİL (21.97).
     Eskiden `useEffect` idi ve künyenin kendisi sınırını yazmıştı: dönüş UNMOUNT'a bağlıydı, yani
     kabuk yığında dururken üstüne bir müşteri rotası açılsa o ekran operasyon temasıyla çizilirdi.
     O gün kabuktan müşteri yüzeyine giden hiçbir bağlantı YOKTU ve künye şunu şart koşmuştu:
     "kabuk-içi ilk çapraz bağlantıyı ekleyen dilim bu geçişi focus/blur'a bağlamak zorundadır."
     Kimlik menüsünün "Müşteri uygulamasına geç"i o ilk bağlantıdır — borç burada ödeniyor.
     `useFocusEffect` kabuk odaktan DÜŞTÜĞÜNDE de temizler; sökülmeyi beklemez. */
  useFocusEffect(
    useCallback(() => {
      if (!granted) return;
      UnistylesRuntime.setTheme('operations');
      return () => UnistylesRuntime.setTheme('light');
    }, [granted]),
  );

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
    <OperationsSessionProvider
      value={{ sections: access.sections, userName: access.userName, userEmail: access.userEmail }}
    >
      <Stack
        screenOptions={{
          // Başlıkları ekranlar kendi çiziyor (v2: zeminle aynı renkte, çizgisiz, sayfayla kayan).
          headerShown: false,
          contentStyle: { backgroundColor: operationsTheme.colors.cream },
        }}
      />
    </OperationsSessionProvider>
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
