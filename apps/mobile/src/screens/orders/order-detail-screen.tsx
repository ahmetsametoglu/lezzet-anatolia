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
import { TextAction } from '@/components/ui/text-action';
import type { OrderDetail } from '@/lib/api/orders';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { upperIn } from '@/lib/i18n/locale';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import { OrderStatusTag } from '@/screens/customer-kit/order-status-tag';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { DeliveryMap } from './delivery-map';
import { OrderDetailSkeleton } from './order-detail-skeleton';
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
  1. **"↻ Tekrar sipariş ver" (v3:64) ÇİZİLMEDİ; "★ Ürünleri değerlendir" (v3:65) 27.08'de GELDİ.**
     · Tekrar sipariş: kural henüz terfi etmedi ve uç yok — gerekçe liste ekranının künyesinde
       (donmuş fiyatla sepet doldurmak sessizce eski fiyatı satmaktır). Kendi ucu geldiği gün
       şablondaki yerine döner.
     · ~~Değerlendirme: … sipariş numarasından token'a giden bir yol YOK~~ → **yol açıldı**
       (`readOrderFeedbackInvite`, kullanıcı kararı 27.08): yorum daveti bildirimi artık bu sayfaya
       götürüyor, dolayısıyla burada yazacak bir kapı olmalıydı — yoksa bildirim boş vaat olurdu.
       Şablonun düğmesi tek başına değil, TEŞVİK BLOĞU olarak geldi (kullanıcı isteği: puan
       kazanımını söyleyen ifadelerle) ve kitin davet kartı desenini kullanıyor — yeni görsel dil
       icat edilmedi. Blok yalnız AÇIK davet varken çizilir (aşağıdaki künye).
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

/**
 * **TAŞIYICI ADI** (07.12) — iki kaynak, tek arama.
 *
 * Sağlayıcıdan gelen ad özel isimdir ("Chronopost") ve çeviri istemez; elle girilen taşıyıcı ise
 * bir anahtardır ve ister (`other` → "Kargo firması"). Tanıdığımız anahtar çevrilir, tanımadığımız
 * OLDUĞU GİBİ basılır — webin `carrierLabel` kararının aynısı.
 *
 * Eski `carrier` enum'una geri düşmenin sebebi geçiş: sözleşme onu geriye uyum için hâlâ taşıyor
 * ve `carrierName` boş gelen bir gönderi (henüz duyurulmamış, elle girilmiş) hâlâ mümkün.
 */
function carrierLabel(t: Messages, shipment: NonNullable<OrderDetail['shipment']>): string {
  const known = t.detail.carrier as Record<string, string | undefined>;
  if (shipment.carrierName) return known[shipment.carrierName] ?? shipment.carrierName;
  return t.detail.carrier[shipment.carrier];
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

  /* İLK YÜK: başlık GERÇEK kalır (yukarıdaki kural), sayfanın geri kalanının yerini skeleton tutar
     (`order-detail-skeleton`). Ekranın içine gömülü dört çubuk sökülüp oraya taşındı: dört
     ölçünün dördü de hamdı ve sayfanın hiçbir bölümü tanınmıyordu. */
  if (status === 'loading') {
    return (
      <View style={styles.screen}>
        {appBar()}
        <OrderDetailSkeleton testID="order-loading" />
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
          { key: 'carrier', label: t.detail.carrierLabel, value: carrierLabel(t, detail.shipment) },
          /* KOLİ BAŞINA TAKİP (07.12): çok kolili gönderide her kutunun AYRI numarası var.
             Eskiden tek numara basılıyordu ve üç kutulu bir siparişin ikisi ekranda HİÇ
             görünmüyordu. Sıra (`2/3`) yalnız birden çok kutuda yazılır — `1/1` olmayan bir
             bölünmeyi varmış gibi gösterirdi (webin aynı kararı). */
          ...detail.shipment.parcels.map((parcel) => ({
            key: `tracking-${parcel.trackingNumber}`,
            label:
              parcel.ordinal === null
                ? t.detail.trackingNumber
                : `${t.detail.trackingNumber} ${parcel.ordinal}`,
            value: parcel.trackingNumber,
          })),
        ]
      : []),
  ];

  /*
    TAKİP BAĞLANTILARI — adresi olan her koli için bir eylem satırı.

    Tek kutuda görüntü BİREBİR eskisi gibi kalıyor (tek "Kargoyu takip et ↗" düğmesi); çok kutuda
    her kutu kendi satırını alıyor ve etiketinde sırası yazıyor. Web aynı kararı verdi ve orada
    numaralar satır içi bağlantı oldu — burada `TextAction` satırı, çünkü mobil özet paneli
    dokunulabilir satır taşımıyor ve onu dokunulabilir yapmak paylaşılan komponenti bu ekranın
    ihtiyacına göre değiştirmek olurdu (CLAUDE §1).

    Adresi olmayan koli satır AÇMAZ (`other` taşıyıcıda `trackingUrl` null gelir): tıklanınca
    hiçbir yere gitmeyen bir düğme, verilmiş bir söz olmazdı. Numarası yukarıdaki özette yine
    görünüyor.
  */
  const trackable = (detail.shipment?.parcels ?? []).filter(
    (parcel): parcel is typeof parcel & { trackingUrl: string } => parcel.trackingUrl !== null,
  );

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
          <Text style={styles.eyebrow}>{upperIn(t.detail.itemsEyebrow, locale)}</Text>
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
                    line.unitLabel.length === 0 && !line.shortfall ? null : (
                      <Text style={styles.itemDetail}>
                        {line.unitLabel}
                        {/*
                          EKSİK, GRAMAJIN YANINDA (kullanıcı kararı 01.09) — ayrı bir kutu değil.

                          Önce buraya kitin `Note`u konmuştu: tam genişlik, terracotta, iki satır
                          metinli bir SAYFA DÜZEYİ kutusu, üstelik ayırıcı çizginin altında kaldığı
                          için anlattığı satıra değil BİR SONRAKİNE bağlanmış görünüyordu. Sonra
                          tasarımın kendi şeridine çevrildi ve o da kullanıcıda düştü: satır düzeyi
                          bir bilginin kendi başına kutusu olmasına gerek yok — bilgi zaten satırın
                          ikinci sesidir, gramajın yanına yazılır.

                          "Kaç sipariş edildi" BURAYA YAZILMAZ: ad satırı zaten "2×" diyor. Cümle
                          yalnız EKSİĞİ söyler, çünkü bilinmeyen tek şey odur.

                          Para çözümü de metne yazılmaz — tutar sütununda ÜSTÜ ÇİZİLİ eski değerle
                          gösteriliyor (künye orada). Bir tur burada "tahsilat {tutar}" yazıyordu:
                          o sipariş DÜZEYİNDE bir sayıdır, satırın altında yeri yok ve birden çok
                          eksik satırda aynı sayı defalarca tekrarlanırdı.
                        */}
                        {line.shortfall ? (
                          <Text style={styles.itemShortfall}>
                            {`${line.unitLabel.length === 0 ? '' : ' · '}${fill(t.detail.shortfallLine, {
                              missing: String(line.qty - line.billedQty),
                            })}`}
                          </Text>
                        ) : null}
                      </Text>
                    )
                  ) : (
                    <Text style={styles.itemDetail}>
                      {[
                        fill(t.detail.bundlePill, { count: String(line.bundle.itemCount) }),
                        ...line.bundle.contents,
                      ].join(' · ')}
                    </Text>
                  )}
                </View>
                {/*
                  TUTAR SÜTUNU — eksik varsa İKİ sayı: üstte sipariş edilenin tutarı ÜSTÜ ÇİZİLİ,
                  altında ödenecek olan (kullanıcı kararı 01.09).

                  Eskiden yalnız yeni tutar yazılıyordu ve satır kendi içinde çelişiyordu: ad "2×"
                  diyor, tutar 1 adedinkini gösteriyordu. Üstü çizili değer o çelişkiyi kapatıyor
                  ve para çözümünü CÜMLEYE gerek kalmadan anlatıyor.

                  Sipariş edilenin tutarı SÖZLEŞMEDEN TÜRETİLİR, yeni alan eklenmedi: `shortfallCents`
                  zaten "eksik gelen miktarın para karşılığı" (şema künyesi), yani ödenecek tutara
                  eklenince sipariş edilenin tutarı çıkar. İkinci bir alan, aynı gerçeğin ikinci
                  kaynağı olurdu (CLAUDE §1).
                */}
                {line.shortfall ? (
                  <View style={styles.itemPriceBox}>
                    <Text style={styles.itemPriceWas} testID={`order-line-was-${line.id}`}>
                      {formatPrice(line.lineTotalCents + line.shortfallCents, locale)}
                    </Text>
                    <Text style={styles.itemPrice}>{formatPrice(line.lineTotalCents, locale)}</Text>
                  </View>
                ) : (
                  <Text style={styles.itemPrice}>{formatPrice(line.lineTotalCents, locale)}</Text>
                )}
              </View>

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

        {/* YORUM TEŞVİKİ (27.08 · kullanıcı kararı) — davet bildiriminin indiği yer burasıdır.
            Blok YALNIZ açık davet varken çizilir; sözleşme `feedback: null` gönderdiğinde (davet
            yok · tamamlandı · süresi doldu) hiç doğmaz — üçünü de ekran ayırt etmez, gerekçe
            `readOrderFeedbackInvite` künyesinde. Kutunun tamamı basılabilir (davet kartı deseni)
            ve açtığı yer akışın kendisidir: `/feedback/[token]`, yani düğme bir kapıdır.

            PUAN SUNUCUDAN: cümledeki sayı ayardan gelen `points`tir, ekran rakam uydurmaz —
            yazılmayacak bir ödülü vaat etmek, 29.07 denetiminin kapattığı arıza sınıfının aynısı. */}
        {((invite) =>
          invite === null ? null : (
          <DashedInvite
            tone="olive"
            layout="stack"
            title={t.detail.feedback.title}
            description={t.detail.feedback.body.replace('{points}', String(invite.points))}
            action={
              <PrimaryButton
                label={t.detail.feedback.cta}
                shape="pill"
                onPress={() => router.push({ pathname: '/feedback/[token]', params: { token: invite.token } })}
                testID="order-feedback-cta"
              />
            }
            testID="order-feedback-invite"
          />
          ))(detail.feedback)}

        {/* Künyesi yukarıda (`trackable`): tek kutuda tek düğme, çok kutuda kutu başına satır. */}
        {trackable.map((parcel) => (
          <View style={styles.actionRow} key={parcel.trackingNumber}>
            <TextAction
              label={
                parcel.ordinal === null
                  ? t.detail.trackingCta
                  : fill(t.detail.trackingCtaBox, { ordinal: parcel.ordinal })
              }
              onPress={() => void Linking.openURL(parcel.trackingUrl)}
              tone="olive"
              testID={parcel.ordinal === null ? 'order-tracking' : `order-tracking-${parcel.ordinal.replace('/', '-')}`}
            />
          </View>
        ))}

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
  items: { gap: theme.space.md },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  itemBlock: {
    paddingVertical: theme.space.lg,
    borderBottomWidth: theme.border.base,
    borderBottomColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  itemText: { flex: 1, gap: theme.space['2xs'] },
  itemName: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  itemDetail: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  /* Gramajın devamı — AYNI satırın ikinci sesi, kendi kutusu yok. Renk `honey` ("bekleyen durum")
     ve ağırlık bir kademe kalın: cümle gramajdan ayrışmalı ama satırdan kopmamalı. */
  itemShortfall: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    color: theme.colors.honey,
  },
  /* Eksik varsa tutar sütunu iki satır: üstte çizili eski, altında ödenecek. Sağa yaslı çünkü
     sütunun kendisi sağa yaslı — iki sayının basamakları alt alta gelmezse göz karşılaştıramaz. */
  itemPriceBox: { alignItems: 'flex-end', gap: theme.space['2xs'] },
  itemPriceWas: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    color: theme.colors.muted,
    textDecorationLine: 'line-through',
  },
  itemPrice: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  actionRow: { alignItems: 'center' },
}));
