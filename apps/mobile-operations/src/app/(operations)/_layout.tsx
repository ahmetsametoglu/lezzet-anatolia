import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { signOut } from '@lezzet/mobile-kit/src/lib/auth/sign-out';
import { OperationsShellScrollProvider } from '@/lib/operations/shell-scroll';
import { operationsCopy } from '@/screens/operations/copy';
import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import { useOperationsAccess } from '@/screens/operations/use-operations-access.hook';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';

/*
  OPERASYON KABUĞUNUN KAPISI — uygulamanın navigasyon ağacının kökü (21.310'dan beri ayrı uygulama).

  GRUP (`(operations)`), segment değil: parantezli klasör adrese YAZILMAZ, yani bölümler
  `/courier` · `/warehouse` · `/management` · `/money` adreslerinde durur ve grubun `index`i uygulamanın
  kökü olur (`/` → ilk bölüm). Giriş (`/login`) ve OAuth dönüşü grubun DIŞINDA: kapısız açılırlar.

  KAPI TEK YERDE: `/me` BURADA bir kez okunur, sonuç bağlamla altına dağılır. Her ekranın kendi
  kontrolünü yapması, ekran başına bir uçuş ve ekranlar arası çelişki demekti.

  BEŞ HÂL — dördü ekrana, biri yönlendirmeye çıkar:
  · yükleniyor → halka (kapıyı geçmeden içerik çizilmez; yanlış yüzeyin bir kare bile görünmesi
    "girdim sandım" hissi verir)
  · oturum yok (401) → GİRİŞ ekranına yönlendirme. Tek uygulama iki yüzeyi taşırken oturumsuz kişi
    müşteri kabuğuna dönüyordu (02-mimari §4); bu uygulamanın müşteri yüzeyi yok.
  · oturum var, bölüm yok → "bu hesabın operasyon yetkisi yok" + çıkış. Sessiz bir yönlendirme,
    müşteri hesabıyla giren kişiye neden içeri alınmadığını hiç söylemezdi; çıkış da başka hesapla
    girmenin tek yolu.
  · okunamadı → hata bloğu + tekrar dene. "Yetkin yok" DEMİYORUZ, çünkü bilmiyoruz (CLAUDE §1).
  · yetkili → bölümler bağlama konur, yığın açılır.

  TEMA KÖKTE (21.310): operasyon teması uygulamanın kökünde, ilk kareden önce seçilir (`app/_layout.tsx`).
  Tek uygulamada bu geçiş burada, odağa bağlı bir dikişti (21.97): kabuk odaktan düşünce müşteri temasına
  dönülüyordu. Ayrı uygulamada dönülecek bir yüzey yok, dikiş söküldü.

  GİRİŞİN İNİŞ KURALI tek dosyada (`post-login-route`): giriş ve OAuth dönüşü onu sorar, grubun `index`i
  de. Push dokunuşunun ekrana açılması köktedir (`usePushNavigation` + `notification-map`).
*/

const t = operationsCopy;

export default function OperationsLayout() {
  const access = useOperationsAccess();
  const router = useRouter();
  const pathname = usePathname();
  const signedOut = access.status === 'signed_out';

  /* OTURUM YOK → GİRİŞ, ama giriş zaten ekrandaysa DEĞİL (ölçüldü 14.09, reddedilen oturum testi).
     Sıra: kapı `signed_out` çizdi → kökteki kanca girişi SEBEBİYLE üste açtı (21.304,
     `lib/auth/use-session-ended-login`) → `<Redirect>`in ertelenmiş `replace`i en üstteki sebepli girişi
     sebepsiz bir kopyayla değiştirdi; kişi neden çıkarıldığını göremedi. Yönlendirme bu yüzden kapının
     kendi commit'inde koşar ve CANLI yola bakar: giriş açıksa dokunmaz. `replace`: geçmişe kayıt düşmez,
     geri tuşu girişten kapıya dönmez. */
  useEffect(() => {
    if (signedOut && pathname !== '/login') router.replace('/login');
  }, [signedOut, pathname, router]);

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

  // Yönlendirme yukarıdaki efektte; bu karede kabuk çizilmez.
  if (signedOut) return null;

  if (access.status === 'forbidden') {
    return (
      <View style={styles.gate}>
        {/* Kitin "hata" dili: kişi bir engelle karşılaştı. Düğme çıkış ve metni menününkiyle aynı sözlük
            anahtarı; sonucu beklenmez — oturum düşünce kapı `signed_out`a döner ve giriş ekranı açılır
            (`use-operations-access` dinleyicisi). */}
        <OperationsNoticeBlock
          variant="error"
          title={t.gate.forbidden.title}
          description={t.gate.forbidden.body}
          retry={{ label: t.staff.signOut, onPress: () => void signOut() }}
          testID="operations-gate-forbidden"
        />
      </View>
    );
  }

  return (
    <OperationsSessionProvider
      value={{
        sections: access.sections,
        userName: access.userName,
        userEmail: access.userEmail,
        warehouses: access.warehouses,
        resolvedWarehouseId: access.resolvedWarehouseId,
      }}
    >
      {/* KAYDIRMA DURUMU KABUĞUN TAMAMINI SARAR (Komponent Envanteri M1): yapışkan mikro başlık
          ve sekme çubuğu gizlemesi aynı karardan beslenir. Sağlayıcı burada, çünkü tüketenler iki
          ayrı ağaçta duruyor — şerit ekranın içinde, çubuk bölüm kabuğunda. */}
      <OperationsShellScrollProvider>
        <Stack
          screenOptions={{
            // Başlıkları ekranlar kendi çiziyor (v2: zeminle aynı renkte, çizgisiz, sayfayla kayan).
            headerShown: false,
            contentStyle: { backgroundColor: operationsTheme.colors.cream },
          }}
        />
      </OperationsShellScrollProvider>
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
