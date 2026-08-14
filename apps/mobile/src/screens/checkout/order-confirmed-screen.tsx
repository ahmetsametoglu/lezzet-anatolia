import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { ScrollView, Share, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { customerMetrics } from '@/screens/customer-kit/customer-metrics';
import { SummaryPanel } from '@/screens/customer-kit/summary-panel';
import messages from './messages.json';
import { useOrderNeighborInvite } from './use-neighbor-invite.hook';

/*
  SİPARİŞ ONAYI (v3 `vConfirm`) — büyük onay işareti, sipariş numarası, teslimat/ödeme/toplam
  özeti ve iki çıkış yolu.

  ── PUAN SATIRI KALDIRILDI (MB-49, 14.08) ───────────────────────────────────
  Ekran *"✦ Teslimatta +{n} puan kazanacaksınız"* diyordu ve sayıyı KENDİSİ hesaplıyordu
  (`tutar ÷ 100`), oysa motor `points_order` ayarını okuyup sabit yazıyordu — cihazda ölçüldü
  (11.08): ekran 47, defter 10. Sonra kullanıcı kararıyla (11.08) SİPARİŞ PUANI TÜMDEN KALKTI,
  yani vaat edilecek bir puan da kalmadı. Satır geri gelmez; yerine bir sayı KONMAZ da —
  bu ekranın puandan haberi olmaması bilinçli. Puanın anlatıldığı yer hesap ekranı ve
  onboarding'in ortak listesidir (`customer-kit/points-earn-list.tsx`).

  ── DEĞERLER GERÇEK SİPARİŞTEN (21.14 ikinci etap) ──────────────────────────
  Tutar ve teslimat/ödeme künyesi checkout'un AÇTIĞI siparişten geliyor (`POST /me/checkout/order`
  cevabı). Değerler rota PARAMETRESİYLE taşınıyor (durum deposuyla değil) çünkü bu ekranın hayatı
  tek bir geçişten ibarettir: geri gelinemez (`replace` ile açılır), yenilenmez, paylaşılmaz.

  ── SİPARİŞ NUMARASI HENÜZ TAŞINMIYOR ───────────────────────────────────────
  Sözleşme sipariş açıldığında yalnız `orderId` (uuid) döndürüyor; müşteriye gösterilen numara
  (`LA-26-…`) `reference_no` alanıdır ve sipariş uçları YALNIZ o numarayla adreslenebiliyor
  (`GET /me/orders/:reference`) — yani uuid'den numaraya giden bir yol YOK. Numara bilinmiyorsa
  satır ÇİZİLMEZ: "bilinmiyor" yazan bir sipariş numarası, olmayan bir numaradan kötüdür.
  Doğru çözüm `CheckoutOrderResultSchema`nın `placed`/`payment_required` dallarına `referenceNo`
  eklemek — sözleşme bu şeridin yazma alanı değil, terfi ihtiyacı olarak raporlandı.

  ── SAPMA: onay işaretinin "pop" animasyonu çizilmedi ───────────────────────
  Şablonda işaret 0,5 sn'lik bir yay ile büyüyerek geliyor. RN'de karşılığı `Animated`; tek bir
  giriş efekti için ekranın ömrüne bir animasyon döngüsü bağlamak bu etabın kazancından büyük.
  İşaret ilk kareden itibaren tam boyuyla duruyor — söylediği şey aynı.
*/

type Messages = LocalizedCopy<typeof messages>;

interface OrderConfirmedScreenProps {
  /**
   * Açılan siparişin kimliği — **ekranda GÖRÜNMEZ**, yalnız komşu davetini açmak için (21.45).
   * `null` = parametre gelmedi; şerit çizilmez. Uuid müşteriye gösterilecek bir numara değil
   * (dosya künyesindeki `reference` ayrımı).
   */
  orderId: string | null;
  /** Müşteriye gösterilen sipariş numarası; `null` = bilinmiyor → satır çizilmez (dosya künyesi). */
  reference: string | null;
  /** Genel toplam (cent); `null` = parametre okunamadı — sıfır YAZILMAZ (CLAUDE §1). */
  totalCents: number | null;
  /** Teslimat satırı: seçilen gün ya da kargo yazısı. */
  deliveryLabel: string;
  paymentLabel: string;
}

export function OrderConfirmedScreen({
  orderId,
  reference,
  totalCents,
  deliveryLabel,
  paymentLabel,
}: OrderConfirmedScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const router = useRouter();
  const neighborInviteUrl = useOrderNeighborInvite(orderId, locale);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} testID="confirmed-scroll">
        <View style={styles.mark}>
          <Text style={styles.markGlyph}>✓</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {t.confirmed.title}
        </Text>
        {reference === null ? null : (
          <Text style={styles.reference} testID="confirmed-reference">
            {t.confirmed.reference.replace('{reference}', reference)}
          </Text>
        )}

        <SummaryPanel
          rows={[
            { key: 'delivery', label: t.confirmed.delivery, value: deliveryLabel },
            { key: 'payment', label: t.confirmed.payment, value: paymentLabel },
          ]}
          totalLabel={t.confirmed.total}
          totalValue={totalCents === null ? t.confirmed.unknown : formatPrice(totalCents, locale)}
          testID="confirmed-summary"
        />

        <Text style={styles.note}>{t.confirmed.note}</Text>

        {/*
          KOMŞUNU BU GÜNE ÇAĞIR (21.45) — kullanıcının işaret ettiği an: *"nerede görünür — sipariş
          tamamlandı ekranında; en değerli an orası, sefer somut, gün belli."* Hesap sayfasındaki
          durgun kutu bu anı hiç yakalamıyordu.

          Sistem paylaşım sayfası kullanılıyor, kendi çekmecemiz çizilmiyor: davet WhatsApp'a
          gidiyor ve uygulama sırasını işletim sistemi bizden iyi biliyor (hesap ekranının aynı
          kararı). Bağlantı YOKSA şerit hiç çizilmez — boş bir şerit "burada bir şey vardı ama
          çalışmıyor" der.
        */}
        {neighborInviteUrl === null ? null : (
          <View style={styles.neighbor} testID="confirmed-neighbor">
            <Text style={styles.neighborTitle}>{t.confirmed.neighborTitle}</Text>
            <Text style={styles.neighborBody}>{t.confirmed.neighborBody}</Text>
            <SecondaryButton
              label={t.confirmed.neighborShare}
              onPress={() => void Share.share({ message: t.confirmed.neighborMessage.replace('{url}', neighborInviteUrl) })}
              tone="olive"
              shape="pill"
              testID="confirmed-neighbor-share"
            />
          </View>
        )}

        <View style={styles.actions}>
          <PrimaryButton label={t.confirmed.orders} onPress={() => router.replace('/orders')} testID="confirmed-orders" />
          <SecondaryButton label={t.confirmed.home} onPress={() => router.replace('/')} testID="confirmed-home" />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
  },
  content: {
    alignItems: 'center',
    gap: theme.space['2xl'],
    paddingTop: rt.insets.top + theme.space['9xl'],
    paddingHorizontal: theme.space['8xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
  },
  mark: {
    width: customerMetrics.confirmMark,
    height: customerMetrics.confirmMark,
    borderRadius: customerMetrics.confirmMark / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.olive,
  },
  markGlyph: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text['page-title-sm'],
    color: theme.colors.card,
  },
  title: {
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  reference: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.muted,
  },
  note: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: theme.space.lg,
    marginTop: theme.space.md,
  },
  /* Şerit kitin BİLGİ KUTUSU dilinde (zeytin zemin, kart yarıçapı) — yeni bir blok dili icat
     edilmedi (CLAUDE §3: improvise etme). Web'in `NeighborBand`i de yardım şeridinin gramerini
     ödünç aldı; iki yüzey aynı kararı verdi. */
  neighbor: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: theme.space.md,
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['4xl'],
  },
  neighborTitle: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.ink,
    textAlign: 'center',
  },
  neighborBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.muted,
    textAlign: 'center',
  },
}));
