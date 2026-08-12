import type { LocalizedCopy } from '@lezzet/i18n';
import type { InviteWelcomeView } from '@lezzet/types';
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
import { rememberInvite } from '@/lib/invite/invite-store';
import { CustomerIcon } from '@/screens/customer-kit/customer-icon';
import messages from './messages.json';
import { useInviteWelcome } from './use-invite-welcome.hook';

/*
  DAVET KARŞILAMASI (21.43) — paylaşılan davet bağlantısının uygulamada indiği yer.

  ── NİYE UYGULAMADA DA VAR, WEB SAYFASI DURURKEN ────────────────────────────
  Bağlantı bir WEB adresidir ve uygulaması olmayan davetli onu tarayıcıda açar — doğrusu budur.
  Ama iki davet türünden biri, komşu daveti, çoğu zaman ZATEN müşterimiz olan birine gider
  (kullanıcı kararı 11.08). Uygulaması olan o kişiyi tarayıcıya atıp yeniden giriş yaptırmak,
  elimizdeki en kolay yolu en zor hâline getirmek olurdu. Aynı adres, işletim sisteminin kendi
  davranışıyla iki yere birden gider: uygulaması olanda buraya, olmayanda web sayfasına. Yani
  "web mi uygulama mı" diye bir seçim yok — ekran iki yüzeyde de yazılır, web olan yalnız ADRESTİR.

  ── DÖRT HÂL, DÖRDÜ DE ÇİZİLİ (web sayfasıyla birebir) ──────────────────────
  Hâller sunucudan gelir (`readInviteWelcome`), burada hesaplanmaz — iki yüzeyin aynı soruya
  farklı cevap vermesi ancak böyle engellenir.
  · `ok`               — davet çizilir; getirenin YALNIZ adı geçer.
  · `self`             — müşteri kendi bağlantısını açtı; ona söylenecek şey bağlantısının
                         ÇALIŞTIĞIDIR, "zaten müşterimizsin" değil (sunucudaki sıra kararı).
  · `already_customer` — zaten müşteri; davet yeni müşteri içindir, bağ kurulmaz.
  · `unknown`          — kod tanınmıyor. **HATA EKRANI DEĞİL:** bağlantı WhatsApp'ta kırpılmış
                         olabilir ve davetliyi kapıda çevirmek olurdu; katalog kapısı açık kalır.

  ── KABUL AÇILIŞTA DEĞİL, DOKUNUŞTA ─────────────────────────────────────────
  Kod cihaza ancak davetli bir düğmeye bastığında yazılır (`rememberInvite`). Bağlantıyı açmak bir
  NİYET değildir — mesajı yanlışlıkla açan da onu açar. Web çerezinin aynı kararı, aynı gerekçe.

  ── TASARIMDA YOK, KİTİN DİLİYLE KURULDU ────────────────────────────────────
  v3'te bu ekran çizilmemiş. Yeni bir görsel dil üretilmedi: başlık çubuğu · boş durum bloğu ·
  düğmeler · hata kutusu — hepsi kitin mevcut komponentleri, ölçü ve renkler token'dan (teslimat
  bölgeleri ekranının aynı sapması; `design/KARARLAR.md`).
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
   * Daveti KABUL eder ve gidilecek yere götürür. Kod yazımı beklenmiyor (`void`): yazma düşse de
   * davetli yoluna devam etmeli — bedeli ölçülü ve künyesi depoda (bağ kurulmaz, akış kesilmez).
   */
  const accept = (target: '/catalog' | '/login') => {
    void rememberInvite(code);
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
  const icon = (name: 'coupon' | 'check') => <CustomerIcon name={name} size={44} color={iconColor} />;

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
              <PrimaryButton label={t.ok.primary} onPress={() => accept('/catalog')} testID="invite-accept-catalog" />
              <SecondaryButton label={t.ok.secondary} onPress={() => accept('/login')} testID="invite-accept-login" />
            </View>
          }
        />
      );
    case 'self':
      return (
        <EmptyState
          testID="invite-self"
          icon={icon('check')}
          title={t.self.title}
          description={t.self.body}
          action={<PrimaryButton label={t.self.primary} onPress={() => router.replace('/account')} />}
        />
      );
    case 'already_customer':
      return (
        <EmptyState
          testID="invite-already-customer"
          icon={icon('check')}
          title={t.alreadyCustomer.title}
          description={t.alreadyCustomer.body}
          action={<PrimaryButton label={t.alreadyCustomer.primary} onPress={() => router.replace('/catalog')} />}
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
