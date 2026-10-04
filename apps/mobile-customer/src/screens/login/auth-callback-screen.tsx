import { useNavigation, useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { fetchMe } from '@lezzet/mobile-kit/src/lib/api/me';
import { exchangeOAuthCode } from '@lezzet/mobile-kit/src/lib/auth/oauth';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { publishMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import messages from '@lezzet/i18n/customer/login';

/*
  Google dönüşünün derin bağlantısı (`/auth/callback`) burada karşılanır ve kod yalnız burada oturuma çevrilir (`lib/auth/oauth.ts`).
  Başarıda giriş bir ekranın üstüne açıldıysa o ekrana, değilse eve dönülür; tek kullanımlık kod taşıyan bu ara ekran geçmişte kalmaz.
*/

interface AuthCallbackScreenProps {
  /** Derin bağlantının `?code=` parametresi; yoksa akış bozuk demektir (elle açılmış URL). */
  code: string | null;
  /** Girişten sonra dönülen ev — müşteri uygulamasında hesap sekmesi. */
  homeRoute: Href;
}

export function AuthCallbackScreen({ code, homeRoute }: AuthCallbackScreenProps) {
  const locale = useAppLocale();
  const t = messages[locale];
  const router = useRouter();
  const navigation = useNavigation();

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
      /* Profil yönlendirmeden önce okunup yayınlanır, çünkü `useMe` oturum olayını geç işler ve dönülen ekran kendini misafir
         sanabilir. Okuma patlarsa akış sürer; profil okuması yardımcı, giriş asıl iştir. */
      const me = await fetchMe().catch(() => null);
      if (me !== null && me.error === null) publishMe(me.data);
      toastSuccess(t.verifiedToast);

      // Girişin altındaki ekrana dönülür, ki bildirimden açılan talep girişten sonra kaybolmasın; altta ekran yoksa ev.
      const { routes, index } = navigation.getState() ?? { routes: [], index: 0 };
      const login = routes
        .slice(0, index)
        .map((route) => route.name)
        .lastIndexOf('login');
      if (login > 0) router.dismiss(index - login + 1);
      else router.replace(homeRoute);
    });
  }, [code, router, navigation, t.verifiedToast, homeRoute]);

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
