import { formatPrice } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import { useRouter } from 'expo-router';
import { Linking, ScrollView, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BackButton } from '@/components/ui/back-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Note } from '@/components/ui/note';
import { PrimaryButton } from '@/components/ui/primary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextAction } from '@/components/ui/text-action';
import type { OrderDetail } from '@/lib/api/orders';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { OrderStatusTag } from '@/screens/customer-kit/order-status-tag';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { DeliveryMap } from './delivery-map';
import { formatDeliveryDate, formatStamp } from './order-format';
import { OrderTimeline } from './order-timeline';
import messages from './messages.json';
import { useOrder } from './use-order.hook';

/*
  SİPARİŞ DETAY (v3 `vOrder`) — GERÇEK UÇTAN okur (`GET /api/v1/me/orders/:reference`): canlı takip
  şeridi (yalnız kurye yoldayken), zaman çizgisi, kalemler, tutar özeti ve destek bağı.

  ── ADRES REFERANSTIR ───────────────────────────────────────────────────────
  Rota parametresi sipariş NUMARASIDIR (`LA-26-…`), kimlik değil: müşteriye gösterilen ve destekle
  konuşurken kullanılan numara odur (sözleşme künyesi). Bulunamayan · başkasına ait · taslak —
  üçü de aynı cevabı alır ve ekran "bu sipariş bulunamadı" bloğunu çizer; ayrım sunucuda bilerek
  söylenmiyor.

  ── ŞABLONDAN SAPMALAR (hepsi bilinçli) ─────────────────────────────────────
  1. **"↻ Tekrar sipariş ver" (v3:64) ve "★ Ürünleri değerlendir" (v3:65) ÇİZİLMEDİ.**
     · Tekrar sipariş: kural henüz terfi etmedi ve uç yok — gerekçe liste ekranının künyesinde
       (donmuş fiyatla sepet doldurmak sessizce eski fiyatı satmaktır).
     · Değerlendirme: geri bildirim akışının kimliği bir TOKEN'dır (davet e-postasıyla gelir,
       `GET /api/v1/feedback/:token`) ve sipariş numarasından token'a giden bir yol YOK. Düğmeyi
       çizip hiçbir yere götürmemek ya da uydurma bir adrese gitmek, verilmiş bir sözü tutmamaktı.
     İkisi de kendi uçları geldiği gün şablondaki yerlerine döner.
  2. **"Bize yazın" doğru yere gidiyor** (v3 `od.talep` → `openTalepNew(o.ref)`): önceki UI-only
     sürüm `/legal/faq`ye gidiyordu. Artık `/support?order=<referans>` — yeni talep bir sayfa değil,
     Taleplerim ekranının ÇEKMECESİDİR (kullanıcı kararı 09.08) ve parametre çekmeceyi doğrudan bu
     siparişle açar. Eski `/support/new` adresi de çalışır (yönlendiren ince kabuk), ama içeriden
     bir ara durağa uğramaya gerek yok.
  3. **Harita şeridinde TAHMİNİ SÜRE YOK** (v3:29 "· tahmini {eta}"). Şablonun `eta`sı sabit bir el
     yazısıydı ("30–40 dk"); gerçek veride kuryenin varış tahmini diye bir ölçüm yok. Uydurmak
     müşteriye tutamayacağımız bir zaman sözü vermek olurdu (CLAUDE §1: ölçülemeyen değer sıfır
     değildir — burada da bir süre değildir). Şerit "Kurye yolda" der, ne zaman demez.
  4. **Tutar özetine PARA SATIRLARI eklendi** (ara toplam · indirim · teslimat ücreti). Şablonun
     paneli yalnız Teslimat/Adres/Ödeme + Toplam çiziyor çünkü el yazısı verisinde indirim ve
     kargo ücreti YOKTU; gerçek siparişte ikisi de var ve onlarsız toplam AÇIKLANAMAZ hâle gelir
     (kalemler 50 € toplarken toplam 55 € görünür). Panel şablonun kendi bileşeni, eklenen şey
     satır — yeni bir görsel dil değil.
  5. **Kargo künyesi eklendi** (taşıyıcı · takip no · takip bağı). Şablonun üç örnek siparişi de
     rota teslimatıydı, kargo hâli hiç çizilmemiş; gerçek siparişlerin çoğu kargo. Web sipariş
     detayının kararı birebir alındı: adres bilinmiyorsa (taşıyıcı `other`, boş numara) düğme
     çizilmez ama NUMARA yazılır — müşteri taşıyıcıyı kendisi arayabilir.
  6. **İptal/iadede çizgi yerine tek durum bloğu** (tasarımın kendi kuralı; kararı motor veriyor:
     `timeline === null`). Blok kitin `Note`u ile çizildi.
  7. **İskelet şablonda tanımlı değil**; paket detayının bekleme diliyle asgari bloklar çizildi.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Kalem satırının küçük resmi — v3:52'de 44 dp; kitin `md` durağı (46) en yakın karşılık. */
const LINE_THUMB_SIZE = 'md';

/** `{key}` yer tutucularını doldurur. */
function fill(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.replace(`{${key}}`, value), template);
}

/**
 * Ödeme hâli — web sipariş detayının beş hapı, AYNI SIRAYLA. Sıra anlamlı: iade her şeyi ezer
 * (para geri döndüyse "kapıda ödenecek" demek yanlış olur), vade yöntemden önce gelir (vadeli
 * sipariş de kapıda kapanabilir).
 */
function paymentKey(order: OrderDetail): keyof Messages['detail']['pay'] {
  if (order.paymentStatus === 'refunded') return 'refunded';
  if (order.onAccount) return 'credit';
  if (order.paymentMethod === 'online') return order.paymentStatus === 'paid' ? 'online' : 'transfer';
  if (order.paymentMethod === 'bank_transfer') return 'transfer';
  return 'door';
}

interface OrderDetailScreenProps {
  reference: string;
  /** Testlerin ve demo hâllerinin kapısı; verilmezse uygulamanın dili (`useAppLocale`). */
  locale?: Locale;
}

export function OrderDetailScreen({ reference, locale: forcedLocale }: OrderDetailScreenProps) {
  const appLocale = useAppLocale();
  const locale = forcedLocale ?? appLocale;
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();
  const router = useRouter();
  const { status, detail, retry } = useOrder(reference, locale);

  /* Başlık her hâlde durur (şablonda da yüklenen sayfanın üstünde): geri yolu ekran boşken de açık. */
  const appBar = (right?: React.ReactNode) => (
    <AppBar
      title={reference}
      left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="order-back" />}
      right={right}
      testID="order-appbar"
    />
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen} testID="order-loading">
        {appBar()}
        <View style={styles.skeletonBody}>
          <Skeleton width="100%" height={140} radius="card" />
          <Skeleton width="60%" height={18} radius="full" />
          <Skeleton width="100%" height={62} radius="card" />
          <Skeleton width="100%" height={62} radius="card" />
        </View>
      </View>
    );
  }

  if (status !== 'ready' || detail === null) {
    /* Üç ayrı hâl, üç ayrı cümle: misafir bir kapıdır (giriş), 404 eski bir bağlantıdır (listeye
       dön), hata bir arızadır (tekrar dene). Tek "hata"ya indirmek üçünü de yanlış anlatırdı. */
    const guest = status === 'guest';
    const missing = status === 'missing';
    return (
      <View style={styles.screen}>
        {appBar()}
        <EmptyState
          icon={
            missing ? (
              <Icon name="orders" size={theme.size.emptyIcon} color={theme.colors['sand-600']} />
            ) : (
              <Icon
                name={guest ? 'orders' : 'connection-off'}
                size={guest ? theme.size.emptyIcon : theme.size.errorIcon}
                color={theme.colors['sand-600']}
              />
            )
          }
          title={guest ? t.guest.title : missing ? t.detail.notFound : t.error.title}
          description={guest ? t.guest.body : missing ? t.detail.notFoundBody : t.error.body}
          action={
            <PrimaryButton
              label={guest ? t.guest.cta : missing ? t.detail.notFoundCta : t.error.retry}
              shape="pill"
              onPress={guest ? () => router.push('/login') : missing ? () => router.push('/orders') : retry}
              testID="order-error-action"
            />
          }
          testID={guest ? 'order-guest' : missing ? 'order-not-found' : 'order-error'}
        />
      </View>
    );
  }

  const address = detail.address;
  const addressLine =
    address === null
      ? null
      : [address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(' ')]
          .filter((part) => Boolean(part) && part !== '')
          .join(', ');

  /* Özet satırları: önce PARA (toplamı açıklayan üçlü), sonra LOJİSTİK (v3'ün kendi üç satırı),
     en sonda kargo künyesi. İndirim yoksa satırı hiç çizilmez — "0,00 €" bir indirim değildir. */
  const summaryRows: SummaryRow[] = [
    { key: 'subtotal', label: t.detail.subtotal, value: formatPrice(detail.subtotalCents, locale) },
    ...(detail.discountCents > 0
      ? [
          {
            key: 'discount',
            label: detail.discountLabel ? `${t.detail.discount} — ${detail.discountLabel}` : t.detail.discount,
            value: `−${formatPrice(detail.discountCents, locale)}`,
            tone: 'olive' as const,
          },
        ]
      : []),
    {
      key: 'shipping',
      label: t.detail.shipping,
      value: detail.shippingFeeCents > 0 ? formatPrice(detail.shippingFeeCents, locale) : t.detail.shippingFree,
    },
    {
      key: 'delivery',
      label: t.detail.delivery,
      // Teslim türü + (varsa) gün. Gün yoksa TÜR YALNIZ BAŞINA yazılır: kargoda teslim günü
      // taşıyıcının işidir ve biz söz veremeyiz (web'in aynı kararı).
      value: [
        detail.deliveryType === 'route' ? t.detail.deliveryRoute : t.detail.deliveryShipping,
        detail.deliveryDate === null ? null : formatDeliveryDate(detail.deliveryDate, locale),
      ]
        .filter(Boolean)
        .join(' — '),
    },
    ...(addressLine ? [{ key: 'address', label: t.detail.address, value: addressLine }] : []),
    { key: 'payment', label: t.detail.payment, value: t.detail.pay[paymentKey(detail)] },
    ...(detail.shipment
      ? [
          { key: 'carrier', label: t.detail.carrierLabel, value: t.detail.carrier[detail.shipment.carrier] },
          ...(detail.shipment.trackingNumber
            ? [{ key: 'tracking', label: t.detail.trackingNumber, value: detail.shipment.trackingNumber }]
            : []),
        ]
      : []),
  ];

  const trackingUrl = detail.shipment?.trackingUrl ?? null;

  return (
    <View style={styles.screen} testID="order-detail">
      {appBar(<OrderStatusTag status={detail.status} label={t.status[detail.status]} testID="order-status" />)}
      <ScrollView contentContainerStyle={styles.content} testID="order-scroll">
        {/* Harita YALNIZ kurye yoldayken: durmuş bir siparişin üstünde hareketli bir takip
            görüntüsü, olmayan bir şeyi oluyormuş gibi gösterirdi. */}
        {detail.status === 'on_the_way' ? (
          <DeliveryMap trackingLabel={t.detail.tracking} liveLabel={t.detail.trackingLive} testID="order-map" />
        ) : null}

        {/* Çizgi mi tek blok mu — kararı MOTOR veriyor (`timeline === null` ⇒ iptal/iade). */}
        {detail.timeline === null ? (
          <Note
            description={detail.status === 'cancelled' ? t.detail.cancelled : t.detail.returning}
            tone={detail.status === 'cancelled' ? 'error' : 'terracotta'}
            testID="order-closed-state"
          />
        ) : (
          <OrderTimeline
            steps={detail.timeline}
            labels={t.detail.milestone}
            notes={t.detail.note}
            formatAt={(iso) => formatStamp(iso, locale)}
            testID="order-timeline"
          />
        )}

        <View style={styles.items}>
          <Text style={styles.eyebrow}>{t.detail.itemsEyebrow.toLocaleUpperCase('tr-TR')}</Text>
          {detail.lines.map((line) => (
            <View key={line.id} style={styles.itemBlock} testID={`order-line-${line.id}`}>
              <View style={styles.itemRow}>
                <AvatarThumb
                  initial={line.name.slice(0, 1)}
                  accessibilityLabel={line.name}
                  photoUri={line.image.url}
                  size={LINE_THUMB_SIZE}
                />
                <View style={styles.itemText}>
                  <Text style={styles.itemName}>
                    {fill(t.detail.line, { quantity: String(line.qty), name: line.name })}
                  </Text>
                  {/* İkinci satır: paket satırında içerik künyesi, varyant satırında boy etiketi.
                      Paket hapı ayrı bir rozet olarak değil bu satırın başında yazılıyor — dar
                      ekranda ad + rozet + tutar üçlüsü tek satıra sığmıyor. */}
                  {line.bundle === null ? (
                    line.unitLabel.length === 0 ? null : <Text style={styles.itemDetail}>{line.unitLabel}</Text>
                  ) : (
                    <Text style={styles.itemDetail}>
                      {[
                        fill(t.detail.bundlePill, { count: String(line.bundle.itemCount) }),
                        ...line.bundle.contents,
                      ].join(' · ')}
                    </Text>
                  )}
                </View>
                <Text style={styles.itemPrice}>{formatPrice(line.lineTotalCents, locale)}</Text>
              </View>

              {/* Eksik karşılama: miktar + PARA ÇÖZÜMÜ. Sebep anlatılmaz (tasarımın sözleşmesi) —
                  müşterinin sorusu "hesabım doğru mu", "neden eksik" değil. */}
              {line.shortfall ? (
                <Note
                  description={fill(
                    detail.paymentMethod === 'online' ? t.detail.shortfallRefund : t.detail.shortfallDoor,
                    {
                      ordered: String(line.qty),
                      fulfilled: String(line.billedQty),
                      amount: formatPrice(line.shortfallCents, locale),
                    },
                  )}
                  tone="terracotta"
                  testID={`order-shortfall-${line.id}`}
                />
              ) : null}
            </View>
          ))}
        </View>

        <SummaryPanel
          rows={summaryRows}
          totalLabel={t.detail.total}
          totalValue={formatPrice(detail.totalCents, locale)}
          totalTone="terracotta"
          testID="order-summary"
        />

        {/* Takip bağı YALNIZ adres bilindiğinde: `other` taşıyıcıda ve boş numarada sözleşme
            `trackingUrl: null` gönderir ve tıklandığında hiçbir yere gitmeyen bir düğme, verilmiş
            bir söz olmazdı. Numara yukarıdaki özette yine görünüyor. */}
        {trackingUrl === null ? null : (
          <View style={styles.actionRow}>
            <TextAction
              label={t.detail.trackingCta}
              onPress={() => void Linking.openURL(trackingUrl)}
              tone="olive"
              testID="order-tracking"
            />
          </View>
        )}

        <View style={styles.actionRow}>
          <TextAction
            label={t.detail.support}
            onPress={() => router.push({ pathname: '/support', params: { order: detail.reference } })}
            tone="terracotta"
            testID="order-support"
          />
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
    padding: theme.space['4xl'],
    paddingBottom: rt.insets.bottom + theme.space['8xl'],
    gap: theme.space['3xl'],
  },
  skeletonBody: {
    padding: theme.space['4xl'],
    gap: theme.space.xl,
  },
  items: { gap: theme.space.md },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  itemBlock: { gap: theme.space.md },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
    paddingVertical: theme.space.lg,
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  itemText: { flex: 1, gap: theme.space['2xs'] },
  itemName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  itemDetail: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  itemPrice: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  actionRow: { alignItems: 'center' },
}));
