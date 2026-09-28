import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { OfflineNotice } from '@/components/ui/offline-notice';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { AccountScreen } from '@/screens/account/account-screen';
import { accountData } from '@/screens/account/account-fixture';
import messages from '@lezzet/i18n/customer/account';
import { useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';

/*
  Kimlik burada bağlanır: ekran prop'la çalışır ki testleri sabit veriyle koşsun, gerçek oturumu rota okur. Gerçek hesapta
  sabit verinin kişisel blokları taşınmaz, kurgu veri gerçek bir hesabın altında hazır kullanıcı gibi okunurdu.
*/
export default function AccountRoute() {
  const meState = useMe();
  const locale = useAppLocale();
  const router = useRouter();
  const isGuest = meState.status === 'guest';

  /* Misafir sekmeye gelince giriş doğrudan açılır. Bayrak misafirken sıfırlanmaz ki girişten vazgeçen kişi her dönüşte yeniden
     login'e itilmesin; giriş başarılı olunca sıfırlanır. */
  const autoOpened = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (isGuest && !autoOpened.current) {
        autoOpened.current = true;
        router.push('/login');
      }
      return () => {
        if (!isGuest) autoOpened.current = false;
      };
    }, [isGuest, router]),
  );

  /* Yüklenirken ne misafir ne girişli hâl iddia edilir; nabız atan yer tutucu beklemeyi, sessizce misafire düşen oturumdan
     ayırt edilebilir kılar. */
  if (meState.status === 'loading') return <AccountLoading />;

  /* Okunamadı misafir değildir: sunucuya ulaşamayan girişli müşteriye "doğrulanın" demek, atıldığını sanıp yeniden girişe
     yöneltirdi. Metin "çıkış yapmadınız" cümlesini açıkça taşır. */
  if (meState.status === 'error') {
    const t = messages[locale].error;
    return (
      <OfflineNotice
        title={t.title}
        description={t.body}
        retryLabel={t.retry}
        onRetry={meState.refresh}
        testID="account-error"
      />
    );
  }

  if (meState.status !== 'ready' || meState.me === null) {
    return <AccountScreen signedIn={false} />;
  }

  const me = meState.me;
  return (
    <AccountScreen
      /* Aşağı çekilince kimliği tazeleyen kapı: `/me`yi ekran değil rota okuyor. */
      onRefreshIdentity={meState.refresh}
      /* Fatura adresi rolünün ölçütü `type: 'company'`; B2B onayında yazıldığı için bekleyen başvuru kapıyı açmaz. */
      companyAccount={me.type === 'company'}
      data={accountData({
        /* Ad olduğu gibi taşınır, girilmemişse boş: e-postaya düşülseydi ekran satırın gerçek ad mı yedek mi olduğunu bilemez ve
           aynı adresi iki kez yazardı. */
        name: me.name.trim(),
        email: me.email ?? '',
        phone: me.phone ?? '',
        company: me.companyInfo ? { ...me.companyInfo, vatNumber: me.vatNumber } : null,
        referralCode: me.referralCode,
        /* Dil buradan geçmez: tek kaynağı `lib/i18n/app-locale`; ikinci yol çipin arayüzden farklı bir dili işaretlemesine kapı açardı. */
        marketingEmail: me.marketingConsent?.email?.granted ?? false,
        marketingWhatsApp: me.marketingConsent?.whatsapp?.granted ?? false,
      })}
    />
  );
}

/*
  Kimlik okunurken sayfa düzeyi yer tutucu: yalnız misafir ve girişli hâlin ortak iskeleti (başlık + ilk blok), çünkü girişli
  sayfayı taklit etmek "girişlisiniz" demek olur ve misafir çıkınca ekran zıplardı. Ölçüler `account-screen`in stillerinden.
*/
function AccountLoading() {
  const { theme } = useUnistyles();

  return (
    <View
      style={styles.screen}
      testID="account-loading"
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      <Skeleton width="42%" height={theme.text['card-title'] * theme.text['h1--line-height']} />
      <Skeleton width="100%" height={theme.size.avatarLg + theme.space['3xl'] * 2} radius="card" />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top + theme.space.sm,
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space['2xl'],
  },
}));
