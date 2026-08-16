import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { LoadingState } from '@/components/ui/loading-state';
import { fetchMe } from '@/lib/api/me';
import { exchangeOAuthCode } from '@/lib/auth/oauth';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { publishToast } from '@/lib/toast/toast-store';
import { publishMe } from '@/screens/customer-kit/use-me.hook';
import { operationsHomeRoute } from './post-login-route';
import messages from './messages.json';

/*
  OAUTH DÖNÜŞ EKRANI (`/auth/callback`) — Google'dan dönen derin bağlantının İNDİĞİ yer.
  Değişimin TEK sahibi burasıdır (gerekçe ve cihaz kanıtı `lib/auth/oauth.ts` künyesinde:
  dinleyici kurgusunda expo-router URL'i navigasyona çevirip 404 basıyordu, kod hiç
  kullanılmıyordu).

  Başarıda hesap sekmesine `replace` — geri tuşu bu ara ekrana dönmesin (tek kullanımlık kod
  taşıyan bir URL'in geçmişte işi yok). Retler login'e adlı `notice` parametresiyle döner;
  cümleyi login ekranı kendi sözlüğünden kurar.
*/

interface AuthCallbackScreenProps {
  /** Derin bağlantının `?code=` parametresi; yoksa akış bozuk demektir (elle açılmış URL). */
  code: string | null;
}

export function AuthCallbackScreen({ code }: AuthCallbackScreenProps) {
  const locale = useAppLocale();
  const t = messages[locale];
  const router = useRouter();

  useEffect(() => {
    if (code === null) {
      router.replace({ pathname: '/login', params: { notice: 'oauth_failed' } });
      return;
    }
    void exchangeOAuthCode(code).then(async (result) => {
      if (result.error !== null) {
        router.replace({ pathname: '/login', params: { notice: result.error } });
        return;
      }
      /* Hesaba geçmeden profil OKUNUP YAYINLANIR (cihaz bulgusu 09.08): `useMe` oturum olayını
         gecikmeli işliyor ve hesap sekmesi o aralıkta "misafir" sanıp otomatik login'e geri
         itiyordu — giriş başarılı, yönlendirme yarışı kaybediyordu. Profil çekmecesinin
         `publishMe` deseni aynı yarışı burada da kapatır. */
      /* Okuma PATLARSA ekran bekleme çarkında ASILI kalırdı (giriş bitti, ekran kapanmadı):
         beklenmedik hata `null`a çevrilir ve akış hesaba devam eder — profil okuması yardımcı,
         giriş ise asıl iştir. Sessiz değil, ADLI bir "okunamadı" hâli (CLAUDE §1). */
      const me = await fetchMe().catch(() => null);
      if (me !== null && me.error === null) publishMe(me.data);
      publishToast(t.verifiedToast);
      /* PERSONEL OPERASYON KABUĞUNA GİDER (21.32) — OTP girişiyle AYNI karardan (`post-login-route`).
         İki kapı da aynı soruyu soruyor; kural kopyalansaydı "Google ile girince neden operasyona
         gitmiyor" diye aranan bir fark doğardı. */
      const operationsRoute = me !== null && me.error === null ? operationsHomeRoute(me.data) : null;
      if (operationsRoute !== null) {
        router.replace(operationsRoute);
        return;
      }
      /* GİRİŞTE KÜNYE SORULMAZ (kullanıcı kararı 15.08) — burada `/profile-setup`e bir yönlendirme
         vardı, OTP kapısındakiyle birlikte kaldırıldı. Ad ve telefon artık ilk siparişte, gerekçesi
         yazılı olarak isteniyor. İki kapı yine AYNI davranışta: kural kopyalanmadığı gibi kaldırma
         da tek elden yapıldı. */
      router.replace('/account');
    });
  }, [code, router, t.verifiedToast]);

  return (
    <View style={styles.screen}>
      <LoadingState size="md" label={t.verifying} accessibilityLabel={t.verifying} testID="auth-callback-busy" />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
