import type { LocalizedCopy } from '@lezzet/i18n';
import type { NeighborWelcomeView } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { claimPendingInvite } from '@/lib/invite/invite-api';
import { rememberNeighborInvite } from '@/lib/invite/invite-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import { formatDeliveryDate } from '@/screens/orders/order-format';
import messages from './messages.json';
import { useNeighborWelcome } from './use-neighbor-welcome.hook';

/*
  KOMŞU DAVETİ KARŞILAMASI (21.45) — sefer davetinin uygulamada indiği yer.

  ── GETİREN DAVETİNİN KARDEŞİ AMA AYNI EKRAN DEĞİL ──────────────────────────
  Getiren daveti bir KİŞİYE çağırır ("seni şu kişi davet etti"); bu bir GÜNE çağırır ("aracımız
  Salı günü sokağında"). Ekranı ayırmanın sebebi kozmetik değil: buradaki davetin seferi GEÇEBİLİR
  ve kontenjanı DOLABİLİR — getiren davetinde ikisinin de karşılığı yok. Ortak ekrana sığdırmak,
  hiç dolmayan dallar taşıyan bir bileşen olurdu.

  ── KULLANICININ VURGUSU: GÜN GÖRÜNSÜN ──────────────────────────────────────
  *"Komşunuz Yaman sizi davet etti. Salı günü aracımız sokağınızda olacak."* Günü söylemeyen bir
  komşu daveti, davet değil sadece bir bağlantıdır. Reddedilen hâllerde bile tarih yazılıyor —
  "sefer geçti" cümlesi hangi seferin geçtiğini söyleyebilmeli.

  ── "SEFER" KELİMESİ EKRANDA GEÇMEZ ─────────────────────────────────────────
  Kullanıcı kararı: o bizim lojistik kelimemiz. Müşteriye gün söylenir — *"14 Ağustos Perşembe
  teslimatı"*. Sözlükte de öyle yazılı.

  ── KABUL AÇILIŞTA DEĞİL, DOKUNUŞTA ─────────────────────────────────────────
  Belirteç cihaza ancak davetli bir düğmeye bastığında yazılır; girişten sonra kişiye devredilir
  (`claimPendingInvite`). Bağlantıyı açmak bir NİYET değildir — web çerezinin aynı kararı.

  ── ZATEN GİRİŞLİYSE DE AYNI KAPI, AMA HEMEN ────────────────────────────────
  Girişli müşteride de belirteç cihaza yazılıp AYNI devir kapısından geçiyor — ekran ikinci bir
  "kabul" yolu kurmuyor. Fark yalnız ZAMAN: kabul anında bir kez denenir, düşerse girişte yeniden.
  İlk yazımda bu deneme YOKTU ve cihazda ölçüldü (12.08): oturumu açık müşteri daveti kabul edince
  sunucuya hiçbir şey yazılmıyordu (`accept` künyesi).
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
   * Daveti KABUL eder ve gidilecek yere götürür.
   *
   * **Kabul yazıldıktan HEMEN SONRA devir denenir** ve bu ölçülmüş bir arızanın düzeltmesi
   * (12.08, cihazda): oturumu AÇIK bir müşteri daveti kabul edince sunucuya hiçbir şey
   * yazılmıyordu — belirteç cihazda bekliyor, devir yalnız bir sonraki GİRİŞTE koşuyordu ve
   * oturum kalıcı olduğu için o an hiç gelmeyebiliyordu. Komşu davetinin alıcısı ise çoğu zaman
   * ZATEN müşterimiz (kullanıcı kararı 11.08) — yani akışın en olası yolu sessizce ölüydü.
   *
   * Kapı giriş yolunu bilmediği gibi "ne zaman" sorusunu da bilmiyor: oturum VARSA şimdi yazar,
   * yoksa 401'e düşer ve belirteç cihazda kalır (`claimPendingInvite` künyesi: yalnız başarıda
   * tüketir). İki hâl için iki ayrı kod yazmaya gerek yok.
   *
   * Beklenmiyor (`void`): yazma düşse de davetli yoluna devam etmeli.
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
  const icon = (name: 'truck' | 'check' | 'coupon') => <CustomerIcon name={name} size={44} color={iconColor} />;

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
              <PrimaryButton label={t.ok.primary} onPress={() => accept('/catalog')} testID="neighbor-accept-catalog" />
              <SecondaryButton label={t.ok.secondary} onPress={() => accept('/login')} testID="neighbor-accept-login" />
            </View>
          }
        />
      );
    case 'self':
      return (
        <EmptyState
          testID="neighbor-self"
          icon={icon('check')}
          title={t.self.title}
          description={t.self.body}
          action={<PrimaryButton label={t.self.primary} onPress={() => router.replace('/orders')} />}
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
          action={<PrimaryButton label={t.runClosed.primary} onPress={() => router.replace('/catalog')} />}
        />
      );
    case 'full':
      return (
        <EmptyState
          testID="neighbor-full"
          icon={icon('coupon')}
          title={t.full.title.replace('{day}', day(welcome.deliveryDate))}
          description={t.full.body}
          action={<PrimaryButton label={t.full.primary} onPress={() => router.replace('/catalog')} />}
        />
      );
    case 'unknown':
      return (
        <EmptyState
          testID="neighbor-unknown"
          icon={icon('coupon')}
          title={t.unknown.title}
          description={t.unknown.body}
          action={<PrimaryButton label={t.unknown.primary} onPress={() => router.replace('/catalog')} />}
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
