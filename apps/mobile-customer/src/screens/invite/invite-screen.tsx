import type { LocalizedCopy } from '@lezzet/i18n';
import type { InviteWelcomeView } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@lezzet/mobile-kit/src/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { claimPendingInvite } from '@/lib/invite/invite-api';
import { rememberInvite } from '@/lib/invite/invite-store';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import messages from './messages.json';
import { useInviteWelcome } from './use-invite-welcome.hook';

/*
  Davet karşılaması, paylaşılan davet bağlantısının uygulamada indiği yer: bağlantı bir web adresidir, uygulaması olan davetli buraya,
  olmayan web sayfasına iner. Dört hâl (`ok`, `self`, `already_customer`, `unknown`) sunucudan gelir ki iki yüzey aynı soruya aynı
  cevabı versin; kod cihaza ancak düğmeye basılınca yazılır, çünkü bağlantıyı açmak bir niyet değildir.
*/

type Messages = LocalizedCopy<typeof messages>;

interface InviteScreenProps {
  /** Adresteki davet kodu; boş dize = bozuk bağlantı (rota dosyasının indirgemesi). */
  code: string;
}

export function InviteScreen({ code }: InviteScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const welcome = useInviteWelcome(code);

  /**
   * Daveti kabul eder ve gidilecek yere götürür; kabulden hemen sonra devir denenir: oturum varsa şimdi yazar, yoksa kod cihazda
   * kalıp ilk girişte yazılır. Beklenmez, çünkü yazma düşse de davetli yoluna devam etmeli.
   */
  const accept = (target: '/catalog' | '/login') => {
    void rememberInvite(code).then(() => claimPendingInvite());
    router.replace(target);
  };

  return (
    <View style={styles.screen}>
      <AppBar title={t.title} left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} />} />
      <View style={styles.body} testID="invite-body">
        {welcome.status === 'loading' ? <LoadingState accessibilityLabel={t.loading} label={t.loading} /> : null}

        {welcome.status === 'error' ? (
          /* Ağ hatası GERÇEKTEN hatadır ve `unknown`dan ayrı çizilir: biri "kodu tanımadık" der ve
             kataloğa yollar, öteki "tekrar deneyin" der — ikisini birleştirmek, geçici bir bağlantı
             sorununda davetliye kodunun geçersiz olduğunu söylemek olurdu. */
          <Note
            tone="error"
            description={t.errorBody}
            action={<SecondaryButton label={t.retry} onPress={welcome.retry} shape="pill" />}
            testID="invite-error"
          />
        ) : null}

        {welcome.status === 'ready' ? <InviteFace welcome={welcome.data} t={t} accept={accept} iconColor={theme.colors.terracotta} /> : null}
      </View>
    </View>
  );
}

interface InviteFaceProps {
  welcome: InviteWelcomeView;
  t: Messages;
  accept: (target: '/catalog' | '/login') => void;
  iconColor: string;
}

/** Hâlin yüzü — dördü de aynı bloğu kullanır; ekran bir DURUM ekranıdır, dört ayrı sayfa değil. */
function InviteFace({ welcome, t, accept, iconColor }: InviteFaceProps) {
  const router = useRouter();
  const icon = (name: 'coupon' | 'check-wide') => <Icon name={name} size={44} color={iconColor} />;

  switch (welcome.status) {
    case 'ok':
      return (
        <EmptyState
          testID="invite-ok"
          icon={icon('coupon')}
          /* Ad BOŞ olabilir (WhatsApp'tan açılmış kayıtta yalnız telefon vardır): o hâlde davet
             İSİMSİZ ama düzgün bir cümleyle çizilir — boş yer tutucu cümleyi bozuk okuturdu. */
          title={t.ok.title.replace('{name}', welcome.referrerName || t.ok.someone)}
          description={t.ok.body}
          action={
            <View style={styles.actions}>
              {/* HAP: boş hâl çağrısının biçimi (tasarım kuralı — `radius:22`, gölgesiz). */}
              <PrimaryButton label={t.ok.primary} shape="pill" onPress={() => accept('/catalog')} testID="invite-accept-catalog" />
              <SecondaryButton label={t.ok.secondary} onPress={() => accept('/login')} testID="invite-accept-login" />
            </View>
          }
        />
      );
    case 'self':
      return (
        <EmptyState
          testID="invite-self"
          icon={icon('check-wide')}
          title={t.self.title}
          description={t.self.body}
          action={<PrimaryButton label={t.self.primary} shape="pill" onPress={() => router.replace('/account')} />}
        />
      );
    case 'already_customer':
      return (
        <EmptyState
          testID="invite-already-customer"
          icon={icon('check-wide')}
          title={t.alreadyCustomer.title}
          description={t.alreadyCustomer.body}
          action={<PrimaryButton label={t.alreadyCustomer.primary} shape="pill" onPress={() => router.replace('/catalog')} />}
        />
      );
    case 'unknown':
      /* Kod yazılmaz: kabul edilecek bir davet yok. Ama kapı açık kalır — davetli, tanımadığımız
         bir kodun sahibi değil, kapımızdaki kişidir. */
      return (
        <EmptyState
          testID="invite-unknown"
          icon={icon('coupon')}
          title={t.unknown.title}
          description={t.unknown.body}
          action={<PrimaryButton label={t.unknown.primary} shape="pill" onPress={() => router.replace('/catalog')} />}
        />
      );
  }
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingBottom: rt.insets.bottom,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  /** İki düğme alt alta ve tam genişlikte — boş durum bloğu kendi yatay payını zaten veriyor. */
  actions: {
    alignSelf: 'stretch',
    gap: theme.space.md,
  },
}));
