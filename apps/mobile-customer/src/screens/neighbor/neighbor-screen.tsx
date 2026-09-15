import type { LocalizedCopy } from '@lezzet/i18n';
import type { NeighborWelcomeView } from '@lezzet/types';
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
import { rememberNeighborInvite } from '@/lib/invite/invite-store';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { formatDeliveryDate } from '@/screens/orders/order-format';
import messages from './messages.json';
import { useNeighborWelcome } from './use-neighbor-welcome.hook';

/*
  Komşu daveti karşılaması, bir güne çağıran davetin uygulamada indiği yer: getiren davetinden ayrı ekran, çünkü günün seferi geçebilir
  ve kontenjanı dolabilir. Gün her hâlde yazılır ve "sefer" kelimesi geçmez, çünkü o bizim lojistik kelimemiz; belirteç cihaza ancak
  düğmeye basılınca yazılır ve girişli müşteride kabul anında hemen devredilir.
*/

type Messages = LocalizedCopy<typeof messages>;

interface NeighborScreenProps {
  /** Adresteki davet belirteci; boş dize = bozuk bağlantı (rota dosyasının indirgemesi). */
  token: string;
}

export function NeighborScreen({ token }: NeighborScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const welcome = useNeighborWelcome(token);

  /**
   * Daveti kabul eder ve gidilecek yere götürür; kabul yazıldıktan hemen sonra devir denenir, çünkü komşu davetinin alıcısı çoğu
   * zaman zaten girişli müşteridir ve devri bir sonraki girişe bırakmak o yolu sessizce öldürürdü. Beklenmez, yazma düşse de
   * davetli yoluna devam etmeli.
   */
  const accept = (target: '/catalog' | '/login') => {
    void rememberNeighborInvite(token).then(() => claimPendingInvite());
    router.replace(target);
  };

  return (
    <View style={styles.screen}>
      <AppBar title={t.title} left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} />} />
      <View style={styles.body} testID="neighbor-body">
        {welcome.status === 'loading' ? <LoadingState accessibilityLabel={t.loading} label={t.loading} /> : null}

        {welcome.status === 'error' ? (
          /* Ağ hatası, "sefer geçti"den AYRI çizilir: ikisini birleştirmek, geçici bir bağlantı
             sorununda komşuya seferi kaçırdığını söylemek olurdu. */
          <Note
            tone="error"
            description={t.errorBody}
            action={<SecondaryButton label={t.retry} onPress={welcome.retry} shape="pill" />}
            testID="neighbor-error"
          />
        ) : null}

        {welcome.status === 'ready' ? (
          <NeighborFace welcome={welcome.data} t={t} accept={accept} iconColor={theme.colors.terracotta} day={(iso) => formatDeliveryDate(iso, locale)} />
        ) : null}
      </View>
    </View>
  );
}

interface NeighborFaceProps {
  welcome: NeighborWelcomeView;
  t: Messages;
  accept: (target: '/catalog' | '/login') => void;
  iconColor: string;
  /** ISO günü müşterinin diline çevirir — "14 Ağustos Perşembe". */
  day: (iso: string) => string;
}

/** Hâlin yüzü — beşi de aynı bloğu kullanır; ekran bir DURUM ekranıdır, beş ayrı sayfa değil. */
function NeighborFace({ welcome, t, accept, iconColor, day }: NeighborFaceProps) {
  const router = useRouter();
  const icon = (name: 'truck' | 'check-wide' | 'coupon') => <Icon name={name} size={44} color={iconColor} />;

  switch (welcome.status) {
    case 'ok':
      return (
        <EmptyState
          testID="neighbor-ok"
          icon={icon('truck')}
          /* Ad boş olabilir (WhatsApp'tan açılmış kayıtta yalnız telefon vardır): o hâlde davet
             İSİMSİZ ama düzgün bir cümleyle çizilir — "Komşunuz sizi … çağırdı". */
          title={t.ok.title.replace('{name}', welcome.inviterName || t.ok.someone).replace('{day}', day(welcome.deliveryDate))}
          description={t.ok.body}
          action={
            <View style={styles.actions}>
              {/* HAP: boş hâl çağrısının biçimi (tasarım kuralı — `radius:22`, gölgesiz). */}
              <PrimaryButton label={t.ok.primary} shape="pill" onPress={() => accept('/catalog')} testID="neighbor-accept-catalog" />
              <SecondaryButton label={t.ok.secondary} onPress={() => accept('/login')} testID="neighbor-accept-login" />
            </View>
          }
        />
      );
    case 'self':
      return (
        <EmptyState
          testID="neighbor-self"
          icon={icon('check-wide')}
          title={t.self.title}
          description={t.self.body}
          action={<PrimaryButton label={t.self.primary} shape="pill" onPress={() => router.replace('/orders')} />}
        />
      );
    case 'run_closed':
      /* Belirteç YAZILMAZ: kabul edilecek bir şey kalmadı. Ama kapı açık — komşu yaklaşan bir güne
         sipariş verebilir; onu boş bir ekranda bırakmak, gelmiş müşteriyi geri çevirmektir. */
      return (
        <EmptyState
          testID="neighbor-run-closed"
          icon={icon('coupon')}
          title={t.runClosed.title.replace('{day}', day(welcome.deliveryDate))}
          description={t.runClosed.body}
          action={<PrimaryButton label={t.runClosed.primary} shape="pill" onPress={() => router.replace('/catalog')} />}
        />
      );
    case 'full':
      return (
        <EmptyState
          testID="neighbor-full"
          icon={icon('coupon')}
          title={t.full.title.replace('{day}', day(welcome.deliveryDate))}
          description={t.full.body}
          action={<PrimaryButton label={t.full.primary} shape="pill" onPress={() => router.replace('/catalog')} />}
        />
      );
    case 'unknown':
      return (
        <EmptyState
          testID="neighbor-unknown"
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
