import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { PaymentMethod } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BackButton } from '@/components/ui/back-button';
import { Chip } from '@/components/ui/chip';
import { LoadingState } from '@/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { TextAction } from '@/components/ui/text-action';
import type { MeAddress } from '@/lib/api/addresses';
import { placeCheckoutOrder } from '@/lib/api/checkout';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { presentPayment } from '@/lib/payment/payment-sheet';
import { addressLine } from '@/screens/customer-kit/address-format';
import { AddressSheet, type AddressSheetTarget } from '@/screens/customer-kit/address-sheet';
import { cartLineId, useCart } from '@/screens/customer-kit/cart-store';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import { OptionRow } from '@/screens/customer-kit/option-row';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { useMe } from '@/screens/customer-kit/use-me.hook';
import { formatDeliveryDate } from '@/screens/orders/order-format';
import { newOrderKey } from './order-key';
import { deliveryLabelOf, paymentFailureMessage, rejectionMessage } from './order-result-copy';
import { useCheckout } from './use-checkout.hook';
import messages from './messages.json';

/*
  SİPARİŞİ TAMAMLA (v3 `vCheckout`) — adres · teslimat ve günü · ödeme yolu · özet · onay.

  ── EKRAN SEÇER, SUNUCU KARAR VERİR (21.14 ikinci etap) ─────────────────────
  Ekran artık GERÇEK sipariş veriyor. Uygun günler, açık ödeme yolları, kargo ücreti ve toplam
  `GET /me/checkout`ten gelir (`use-checkout.hook`); ekran kendi listesini UYDURMAZ ve gönderdiği
  tek şey SEÇİMLERDİR (`POST /me/checkout/order`) — tutar, indirim ve kalem listesi gövdede YOKTUR
  (sözleşme künyesi: aksi hâlde siparişin parasını uygulama belirlerdi).

  Yerleşim v3'ün kendisi; değişen yalnız verinin kaynağıdır. Fixture (`checkout-fixture.ts`)
  SİLİNDİ: sahte adresler, uydurma saat aralıklı teslimat günleri ("Yarın 09:00–13:00" — veri
  modelinde saat YOK) ve sabit kargo ücreti ekranın gerçekle ayrıştığı üç yerdi.

  ── TESLİMAT YOLU BİR SEÇİM DEĞİL, ADRESİN CEVABIDIR ────────────────────────
  `deliveryType` sunucuda çözülür (rota-içi ⟷ kargo). İki satır yine çiziliyor çünkü tasarım öyle
  ve öğretici: hangi yolun geçerli olduğunu ve ötekinin NEDEN geçerli olmadığını yan yana söylüyor.
  Ama dokunuş yolu değiştirmez — değiştirseydi ekranın gösterdiği ile siparişin açıldığı yol
  ayrışırdı (müşteri kapıda ödeme seçer, kasada reddedilirdi).

  ── ADRES BURADA YAZILIR, EKRAN TERK EDİLMEZ (10.08) ────────────────────────
  "＋ Yeni adres ekle" eskiden müşteriyi profil sayfasına atıyordu: sipariş akışının ortasında
  başka bir ekrana gitmek, checkout'tan çıkmaktır. Artık kitin ORTAK adres çekmecesi burada
  açılıyor (`customer-kit/address-sheet` — hesap ekranıyla aynı dosya, aynı doğrulama, aynı BAN
  önerileri) ve yazılan adres seçili hâle gelip anlık görüntüyü tazeliyor.

  ── ENGELLER TEK YERDE (`blockReason`) ──────────────────────────────────────
  Şablonun `confirmBlock`u ile aynı sıra, sunucunun gerçekleriyle genişletilmiş: doğrulama →
  adres → tazeleme → kargo engeli → asgari sepet → gün → ödeme. Sebep düğmenin ÜSTÜNDE yazılı ve
  düğme engelli: kuralı basmadan önce göstermek, kullanıcıyı denemeye zorlamaktan iyi.

  ── RETLER TEK CÜMLEYE İNDİRGENMEZ ──────────────────────────────────────────
  On beş adlı ret ayrı ayrı karşılanıyor (`order-result-copy.ts`); her ret sonrası anlık görüntü
  TAZELENİR, çünkü ret çoğu zaman "ekrandaki resim eskidi" demektir.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Puan kazancı: her tam euro 1 puan (şablonun `Math.round(total)` kuralı, cent'e uyarlanmış). */
const POINTS_PER_EURO = 1;

/** Ödeme satırı — v3'ün `payOpts()`u; web checkout'unun kurduğu kümenin AYNISI (tek karar iki yüzey). */
interface PaymentOption {
  /** Satır anahtarı: `bank_transfer` iki kez geçer (peşin havale ⟷ vadeli), yöntem anahtar olamaz. */
  key: string;
  method: PaymentMethod;
  /** Vadeli ("hesaba") — ödeme YÖNTEMİ değil, siparişin bayrağı (enum künyesi). */
  onAccount: boolean;
  label: string;
  body: string;
  available: boolean;
}

interface CheckoutScreenProps {
  /**
   * Bölünmüş sepetin KARGO yarısı için ayrı sipariş (19.15). Bayrak TÜRETİLMEZ, rotadan gelir;
   * bugün sepet ekranı bu yolu henüz açmıyor (varsayılan `false`) — BEKLEYEN(21.14).
   */
  shippingOrder?: boolean;
}

export function CheckoutScreen({ shippingOrder = false }: CheckoutScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const router = useRouter();
  const cart = useCart();
  const { status: meStatus, me } = useMe();
  /** Doğrulanmış müşteri; `null` = misafir ya da profil henüz okunmadı (ikisi de giriş kapısıdır). */
  const customer = meStatus === 'ready' ? me : null;

  /** Seçili adres; `null` = "sunucu karar versin" (varsayılan, yoksa ilk adres — uç künyesi). */
  const [addressId, setAddressId] = useState<string | null>(null);
  /** Adres çekmecesi — kitin ortak formu, hesap ekranıyla AYNI (10.08). Kapalıyken `null`. */
  const [addressSheet, setAddressSheet] = useState<AddressSheetTarget | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  const [paymentKey, setPaymentKey] = useState<string | null>(null);
  const [marketing, setMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Sunucunun ya da ödeme kartının söylediği son şey. `warm` = hata değil (vazgeçilen ödeme). */
  const [notice, setNotice] = useState<{ tone: 'error' | 'warm'; text: string } | null>(null);

  /* TEKRAR ANAHTARI EKRAN AÇILIŞINDA BİR KEZ (`useState`in tembel başlatıcısı): seçimler değişse
     de KORUNUR — çift dokunuş ve ağın yeniden denemesi aynı niyettir. Başarıdan sonra ekran
     `replace` ile kapanır ve bir sonraki açılış yeni anahtar üretir; sepete dönüp değiştiren
     müşteride de ekran sökülür. Gerekçenin tamamı `order-key.ts`te. */
  const [orderKey] = useState(newOrderKey);

  const checkout = useCheckout(locale, addressId, cart.couponCode, shippingOrder);
  const snapshot = checkout.snapshot;
  const addresses = snapshot?.addresses ?? [];
  const delivery = snapshot?.delivery ?? null;
  const payment = snapshot?.payment ?? null;

  /* Seçili adres SUNUCUYLA AYNI kuralla çözülür (varsayılan → ilk): ekranda işaretli satır ile
     ücreti hesaplanan adres ancak böyle aynı olur. Ekran açılışta bir seçim YAZMAZ — yazsaydı
     kullanıcının yapmadığı bir seçim, cevabın gecikmesine bağlı olarak doğardı. */
  const selectedAddress = addresses.find((a) => a.id === addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;

  /**
   * Çekmece bir adres yazdı (ekleme · düzenleme · silme). İKİ ŞEY birden olmalı: yazılan adres
   * SEÇİLİ hâle gelir ve anlık görüntü ONUNLA yeniden okunur — teslimat günleri, kargo ücreti ve
   * ödeme yolları adrese bağlıdır; eski cevapla devam etmek ekranı kendi kendisiyle çelişkiye
   * düşürürdü (müşteri kapıda ödeme görür, sunucu reddederdi).
   *
   * Okuma TEK turda yapılır: `addressId` değişimi hook'un bağımlılığıdır ve zaten yeniden okutur;
   * seçim değişmiyorsa (aynı adres düzenlendi ya da bir adres silindi) tazeleme AÇIKÇA istenir.
   * Silinen adres seçiliyse seçim bırakılır — kararı yine sunucu verir (varsayılan → ilk).
   */
  const applyAddressWrite = (list: MeAddress[], savedId: string | null): void => {
    const next = savedId ?? (addressId !== null && list.some((a) => a.id === addressId) ? addressId : null);
    if (next === addressId) checkout.reload();
    else setAddressId(next);
  };

  const isRoute = delivery?.deliveryType === 'route';
  const dates = delivery?.availableDates ?? [];

  /* SEÇİLEN GÜN TÜRETİLİR, saklanan değer körü körüne kullanılmaz: adres değişince eski gün artık
     uygun günlerden biri olmayabilir. Tek gün varsa seçim SUNULMAZ, o gün kullanılır
     (`requiresDateChoice` — sözleşmenin hükmü: seçeneksiz bir seçim sahte karardır). */
  const chosenDate =
    deliveryDate !== null && dates.includes(deliveryDate)
      ? deliveryDate
      : delivery !== null && !delivery.requiresDateChoice
        ? (dates[0] ?? null)
        : null;

  const methods = payment?.methods ?? [];
  const codBlockedReason = payment?.codBlockedReason ?? null;
  const paymentOptions: PaymentOption[] = [
    // `online` = Stripe yolu (peşin, yerel ödeme kartı). `cash` KAPIDA ödemedir; müşteri burada
    // "kapıda öderim" der, hangi aracı kullandığını (nakit/kart/çek) kurye kapanışta yazar.
    {
      key: 'online',
      method: 'online',
      onAccount: false,
      label: t.payment.online,
      body: t.payment.onlineBody,
      available: methods.includes('online'),
    },
    {
      key: 'cod',
      method: 'cash',
      onAccount: false,
      label: t.payment.onDelivery,
      // Kapalı yöntemin SEBEBİ yazılır: "kapıda ödeme yok" ile "bu tutarda sunulamıyor" farklı
      // cümlelerdir ve ikincisinde müşteri sepetini küçültüp yöntemi açabilir (sözleşme künyesi).
      body: codBlockedReason === null ? t.payment.onDeliveryBody : t.payment.codBlocked[codBlockedReason],
      available: methods.includes('cash') && codBlockedReason === null,
    },
  ];
  if (methods.includes('bank_transfer')) {
    paymentOptions.push({
      key: 'transfer',
      method: 'bank_transfer',
      onAccount: false,
      label: t.payment.transfer,
      body: t.payment.transferBody,
      available: true,
    });
  }
  // Vadeli YALNIZ açıksa çizilir (web'in aynı kararı): kapalıyken göstermek, B2C müşteriye
  // anlamı olmayan bir kapı açardı.
  if (payment?.creditAvailable === true) {
    paymentOptions.push({
      key: 'credit',
      method: 'bank_transfer',
      onAccount: true,
      label: t.payment.credit,
      body: t.payment.creditBody,
      available: true,
    });
  }
  /** Seçim de türetilir: adres değişip yöntem kapanınca seçili kalması "kapalıyı seçtim" olurdu. */
  const selectedPayment = paymentOptions.find((option) => option.key === paymentKey && option.available) ?? null;

  /* ── SEPET GÖRÜNÜMÜ (özet + küçük resimler) ───────────────────────────────
     Kaynak SUNUCUNUN çözdüğü görünüm. Paket satırı bugün sunucuda çözülemiyor (adı boş, fiyatı
     `null`) ve yerel kayıt onu taşıyor; sepet ekranının süzgeci burada da geçerli, yoksa aynı
     paket biri adsız iki kez yazılırdı. */
  const localBundleIds = new Set(cart.bundles.map((bundle) => bundle.id));
  const viewLines = cart.view.lines.filter((line) => line.kind !== 'bundle' || !localBundleIds.has(line.bundleId));

  const shippingFeeLabel =
    payment === null ? t.summary.pending : payment.shippingFeeCents === 0 ? t.summary.free : formatPrice(payment.shippingFeeCents, locale);
  /** Ödenecek TOPLAM sunucunun kararıdır; adres seçilmeden yalnız kalem toplamı bilinir. */
  const grandTotalCents = payment?.orderTotalCents ?? cart.view.totalCents;

  const summaryRows: SummaryRow[] = [
    ...cart.bundles.map((bundle) => ({
      key: `bundle-${bundle.id}`,
      label: t.summary.line.replace('{quantity}', String(bundle.quantity)).replace('{name}', bundle.name),
      value: formatPrice(bundle.unitCents * bundle.quantity, locale),
    })),
    ...viewLines.map((line) => ({
      key: cartLineId(line),
      label: t.summary.line.replace('{quantity}', String(line.qty)).replace('{name}', line.name),
      // Fiyatı olmayan satır SIFIR yazılmaz (CLAUDE §1): satışa kapanmış kalem "bedava" değildir.
      value: line.lineTotalCents === null ? t.summary.noPrice : formatPrice(line.lineTotalCents, locale),
    })),
    { key: 'subtotal', label: t.summary.subtotal, value: formatPrice(cart.view.subtotalCents, locale) },
    ...(cart.coupon === null
      ? []
      : [
          {
            key: 'discount',
            label: t.summary.discount,
            value: `−${formatPrice(cart.coupon.amountCents, locale)}`,
            tone: 'olive' as const,
          },
        ]),
    { key: 'delivery', label: t.summary.delivery, value: shippingFeeLabel },
  ];

  const thumbs = [
    ...cart.bundles.map((bundle) => ({ key: `bundle-${bundle.id}`, name: bundle.name })),
    ...viewLines.map((line) => ({ key: cartLineId(line), name: line.name })),
  ].slice(0, 4);

  /** Onayı engelleyen İLK sebep; yoksa `null`. Sıra şablonun sırası, gerçekler sunucunun. */
  const blockReason = (): string | null => {
    if (customer === null) return t.block.login;
    // Okuma düştüyse onay KAPALI ve sebep açıkça söylenir: "seçenekleriniz güncelleniyor" demek,
    // bitmeyecek bir bekleyiş vaat etmek olurdu (yukarıda ayrıca "yeniden dene" duruyor).
    if (checkout.status === 'error') return t.state.failed;
    // Yükleme/tazeleme boyunca da kapalı: eski ücretle onaylanan sipariş, gösterilenden başka bir
    // tutarla açılırdı.
    if (checkout.status === 'loading' || checkout.refreshing) return t.block.loading;
    if (selectedAddress === null) return t.block.address;
    // Adres var ama teslimat/ödeme dilimi yoksa karar VERİLMEMİŞ demektir; tahmin yürütülmez.
    if (payment === null) return t.block.loading;
    if (delivery?.blocked === true) return t.block.shipping;
    if (!payment.minBasketOk) {
      return t.block.minBasket
        .replace('{place}', payment.placeLabel)
        .replace('{missing}', formatPrice(payment.missingForMinBasketCents, locale));
    }
    if (isRoute && chosenDate === null) return t.block.day;
    if (selectedPayment === null) return t.block.payment;
    return null;
  };
  const blocked = blockReason();

  /**
   * Sipariş açıldı: onay ekranına SUNUCUNUN tutarı ve seçilen künyeler taşınır.
   *
   * **Sipariş NUMARASI taşınmıyor çünkü cevapta yok:** sözleşme `orderId` (uuid) döndürüyor,
   * müşteriye gösterilen `LA-26-…` ise `reference_no` ve ondan uuid'e giden bir okuma ucu YOK
   * (`GET /me/orders/:reference` yalnız numarayla adresleniyor). Uuid'i "sipariş no" diye yazmak
   * müşteriye kullanamayacağı bir numara vermek olurdu; onay ekranı o satırı hiç çizmiyor.
   * Terfi ihtiyacı raporlandı — BEKLEYEN(21.14).
   */
  const finish = (totalCents: number, deliveryType: 'route' | 'shipping'): void => {
    const points = Math.round((totalCents / 100) * POINTS_PER_EURO);
    /* SEPET YERELDE BOŞALTILMAZ: sunucu o siparişin kalemlerini zaten düşürdü (`placeOrder`) ve
       `resetCart()` iki gruplu sepette kargo yarısını da silerdi. Deponun sunucudan tazelenmesi
       gerekiyor ama dışa açık bir tazeleme kapısı YOK (`cart-store` yalnız dil/yer/oturum
       değişiminde okuyor) — BEKLEYEN(21.14): `refreshCart()` ihracı. */
    router.replace({
      pathname: '/checkout/confirmed',
      params: {
        total: String(totalCents),
        delivery: deliveryLabelOf(deliveryType, chosenDate, t, locale),
        payment: selectedPayment?.label ?? '',
        points: String(points),
      },
    });
  };

  const confirm = async (): Promise<void> => {
    if (blocked !== null || submitting || selectedAddress === null || selectedPayment === null) return;
    setSubmitting(true);
    setNotice(null);

    const result = await placeCheckoutOrder(locale, {
      addressId: selectedAddress.id,
      // Kargoda gün SORULMAZ ve gönderilmez: tarih taşıyıcıya bağlıdır, söz verilmez.
      deliveryDate: isRoute ? chosenDate : null,
      paymentMethod: selectedPayment.method,
      onAccount: selectedPayment.onAccount,
      couponCode: cart.couponCode,
      idempotencyKey: orderKey,
      marketingConsent: marketing,
      shippingOrder,
    });

    if (result.error !== null) {
      // TAŞIMA arızası (ağ, bozuk gövde, kimliksizlik) — retlerden ayrı: sipariş açıldı mı
      // BİLİNMİYOR. Anahtar korunduğu için tekrar denemek ikinci sipariş açmaz.
      setSubmitting(false);
      setNotice({ tone: 'error', text: result.status === 401 ? t.reject.session : t.reject.transport });
      return;
    }

    const outcome = result.data;
    if (outcome.status === 'placed') {
      finish(outcome.totalCents, outcome.deliveryType);
      return;
    }
    if (outcome.status === 'payment_required') {
      /* YEREL ÖDEME KARTI (sağlayıcının kendi yüzeyi) — ayrı bir ekran YAZILMAZ. Üç sonuç ayrı
         karşılanır: iptal bir HATA DEĞİLDİR (müşteri vazgeçti, sipariş taslak kalır ve ekran
         yerinde durur), başarısızlık sebebiyle söylenir. */
      const sheet = await presentPayment({ clientSecret: outcome.clientSecret });
      if (sheet.status === 'succeeded') {
        finish(outcome.totalCents, outcome.deliveryType);
        return;
      }
      setSubmitting(false);
      setNotice(
        sheet.status === 'canceled'
          ? { tone: 'warm', text: t.paymentSheet.canceled }
          : { tone: 'error', text: paymentFailureMessage(sheet, t) },
      );
      return;
    }

    setSubmitting(false);
    setNotice({
      tone: 'error',
      // Ürün adı SEPET GÖRÜNÜMÜNDEN çözülür — sunucudan ikinci kez istemek, istemcinin bildiği
      // bir şeyi ona geri okutmak olurdu (sözleşme künyesi).
      text: rejectionMessage(outcome, t, locale, (variantId) =>
        viewLines.find((line) => line.kind === 'variant' && line.variantId === variantId)?.name ?? null,
      ),
    });
    // Her ret "ekrandaki resim eskidi" ihtimalidir (gün düştü, yöntem kapandı, fiyat değişti):
    // anlık görüntü tazelenir ki müşteri düzeltmeyi GÜNCEL seçeneklerle yapsın.
    checkout.reload();
  };

  const confirmLabel = (selectedPayment?.method === 'online' ? t.confirmPay : t.confirm).replace(
    '{total}',
    formatPrice(grandTotalCents, locale),
  );

  return (
    <View style={styles.screen}>
      <AppBar
        title={t.title}
        left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="checkout-back" />}
        testID="checkout-appbar"
      />
      <ScrollView contentContainerStyle={styles.content} testID="checkout-scroll">
        <View style={styles.hero}>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {t.hero}
          </Text>
          <View style={styles.thumbs}>
            {thumbs.map((thumb) => (
              <AvatarThumb key={thumb.key} initial={thumb.name.slice(0, 1)} accessibilityLabel={thumb.name} size="sm" stacked />
            ))}
          </View>
        </View>

        {customer !== null ? (
          <View style={styles.signedIn} testID="checkout-signed-in">
            <Text style={styles.signedInLabel}>{t.signedIn.replace('{name}', customer.name)}</Text>
          </View>
        ) : (
          <DashedInvite
            layout="stack"
            title={t.guest.title}
            description={t.guest.body}
            action={<PrimaryButton label={t.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="checkout-login" />}
            testID="checkout-guest"
          />
        )}

        {/* Seçenekler okunamadıysa ekran SESSİZ KALMAZ: hangi hâlde olduğunu söyler ve aynı
            sorguyu tekrar etme yolunu verir. */}
        {checkout.status === 'loading' ? (
          <LoadingState accessibilityLabel={t.state.loading} label={t.state.loading} testID="checkout-loading" />
        ) : null}
        {checkout.status === 'error' ? (
          <View style={styles.section} testID="checkout-failed">
            <Note tone="error" description={t.state.failed} />
            <SecondaryButton label={t.state.retry} onPress={checkout.retry} testID="checkout-retry" />
          </View>
        ) : null}

        {checkout.status === 'ready' ? (
          <>
            <View style={styles.section}>
              <Text style={styles.eyebrow}>{t.address.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
              {/* HİÇ ADRES YOKSA burası bir DAVETTİR, bir uyarı değil (10.08): eskiden kuru bir
                  not ve profil sayfasına atan bir bağlantı vardı — müşteri siparişin ortasında
                  başka bir ekrana düşüyordu. Kutu misafir bloğunun kalıbı (`DashedInvite`),
                  düğme aynı çekmeceyi ORADA açar. */}
              {addresses.map((candidate) => (
                <OptionRow
                  key={candidate.id}
                  // Etiketsiz adreste başlık ŞEHİRDİR — uydurma etiket yazılmaz (entity künyesi).
                  label={candidate.label ?? candidate.city}
                  description={addressLine(candidate)}
                  selected={candidate.id === selectedAddress?.id}
                  onPress={() => setAddressId(candidate.id)}
                  trailing={candidate.isDefault ? <Text style={styles.defaultBadge}>{t.address.default}</Text> : undefined}
                  testID={`checkout-address-${candidate.id}`}
                />
              ))}
              {/* Adres YAZIMI kitin ortak çekmecesinde (tek form, tek doğrulama) — hesap
                  ekranıyla aynı dosya; burada ikinci bir kopyası yok. */}
              {addresses.length === 0 ? (
                <DashedInvite
                  layout="stack"
                  title={t.address.empty}
                  description={t.address.emptyBody}
                  action={
                    <PrimaryButton
                      label={t.address.add}
                      shape="pill"
                      onPress={() => setAddressSheet({ editing: null })}
                      testID="checkout-address-add"
                    />
                  }
                  testID="checkout-address-empty"
                />
              ) : (
                <TextAction label={t.address.add} onPress={() => setAddressSheet({ editing: null })} testID="checkout-address-add" />
              )}
            </View>

            {delivery?.blocked === true ? (
              <Note tone="error" title={t.blocked.title} description={t.blocked.body} testID="checkout-blocked" />
            ) : null}

            {delivery === null ? null : (
              <View style={styles.section}>
                <Text style={styles.eyebrow}>{t.delivery.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
                <OptionRow
                  label={t.delivery.door}
                  description={isRoute ? t.delivery.doorBody.replace('{fee}', shippingFeeLabel) : t.delivery.doorUnavailable}
                  selected={isRoute}
                  disabled={!isRoute}
                  // Yol adresin cevabı: dokunuş bir şey değiştirmez (dosya künyesi).
                  onPress={keepDelivery}
                  testID="checkout-mode-door"
                />
                <OptionRow
                  label={t.delivery.shipping}
                  description={isRoute ? t.delivery.shippingUnavailable : t.delivery.shippingBody.replace('{fee}', shippingFeeLabel)}
                  selected={!isRoute}
                  disabled={isRoute}
                  onPress={keepDelivery}
                  testID="checkout-mode-shipping"
                />
                {/* Gün YALNIZ rota-içi teslimatta: kargonun günü müşterinin kararı değil. */}
                {isRoute && dates.length > 0 ? (
                  delivery.requiresDateChoice ? (
                    <View style={styles.dayRow}>
                      {dates.map((date) => (
                        <Chip
                          key={date}
                          label={formatDeliveryDate(date, locale)}
                          selected={chosenDate === date}
                          onPress={() => setDeliveryDate(date)}
                          testID={`checkout-day-${date}`}
                        />
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.dayLine} testID="checkout-day-single">
                      {t.delivery.dayLabel.replace('{day}', formatDeliveryDate(dates[0] ?? '', locale))}
                    </Text>
                  )
                ) : null}
              </View>
            )}

            {payment === null ? null : (
              <View style={styles.section}>
                <Text style={styles.eyebrow}>{t.payment.eyebrow.toLocaleUpperCase('tr-TR')}</Text>
                {paymentOptions.map((option) => (
                  <OptionRow
                    key={option.key}
                    label={option.label}
                    description={option.body}
                    selected={selectedPayment?.key === option.key}
                    disabled={!option.available}
                    onPress={() => setPaymentKey(option.key)}
                    testID={`checkout-payment-${option.key}`}
                  />
                ))}
                {/* Tavan üstü tutarda kural TEK cümleyle söylenir; nakit sınırı ise yalnız o yol
                    seçiliyken — seçilmeyen bir yöntemin uyarısı gürültüdür. */}
                {codBlockedReason === 'over_limit' ? (
                  <Text style={styles.paymentNote} testID="checkout-payment-online-required">
                    {t.payment.onlineRequired}
                  </Text>
                ) : null}
                {selectedPayment?.method === 'cash' && payment.cashWarning ? (
                  <Text style={styles.paymentNote} testID="checkout-payment-cash-warning">
                    {t.payment.cashWarning}
                  </Text>
                ) : null}
              </View>
            )}
          </>
        ) : null}

        <SummaryPanel
          eyebrow={t.summary.eyebrow.toLocaleUpperCase('tr-TR')}
          rows={summaryRows}
          totalLabel={t.summary.total}
          totalValue={formatPrice(grandTotalCents, locale)}
          totalTone="terracotta"
          testID="checkout-summary"
        />

        <PressableSurface
          onPress={() => setMarketing(!marketing)}
          feedback="opacity"
          selected={marketing}
          style={styles.consentRow}
          accessibilityLabel={t.marketing}
          testID="checkout-marketing"
        >
          <View style={[styles.checkbox, marketing ? styles.checkboxOn : styles.checkboxOff]}>
            <Text style={styles.checkboxMark}>{marketing ? '✓' : ' '}</Text>
          </View>
          <Text style={styles.consentLabel}>{t.marketing}</Text>
        </PressableSurface>

        {notice === null ? null : <Note tone={notice.tone} description={notice.text} testID="checkout-notice" />}

        {blocked === null ? null : <Text style={styles.blockLine}>{blocked}</Text>}

        <PrimaryButton
          label={submitting ? t.submitting : confirmLabel}
          onPress={() => void confirm()}
          disabled={blocked !== null || submitting}
          testID="checkout-confirm"
        />
      </ScrollView>

      {/* Adres çekmecesi — hesap ekranının kullandığı KİT bileşeni. Sipariş akışı kesilmez:
          müşteri adresini burada yazar, seçili hâle gelir ve görüntü onunla yenilenir. */}
      <AddressSheet
        target={addressSheet}
        addresses={addresses}
        onClose={() => setAddressSheet(null)}
        onSaved={applyAddressWrite}
        testID="checkout-address-sheet"
      />
    </View>
  );
}

/** Teslimat satırlarının dokunuşu — yol adresin cevabı olduğu için bir şey DEĞİŞTİRMEZ. */
function keepDelivery(): void {
  return undefined;
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
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.xl,
  },
  heroTitle: {
    flex: 1,
    fontFamily: theme.font.display[theme.text['page-title-sm--font-weight']],
    fontSize: theme.text['page-title-sm'],
    lineHeight: theme.text['page-title-sm'] * theme.text['h1--line-height'],
    color: theme.colors.ink,
  },
  thumbs: {
    flexDirection: 'row',
    paddingLeft: theme.space.lg,
  },
  signedIn: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
  },
  signedInLabel: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  section: { gap: theme.space.md },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  defaultBadge: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.eyebrow,
    color: theme.colors['olive-dark'],
    backgroundColor: theme.colors['olive-bg'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space['2xs'],
    paddingHorizontal: theme.space.md,
    overflow: 'hidden',
  },
  dayRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.space.md,
  },
  dayLine: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors['olive-dark'],
  },
  paymentNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.lg,
  },
  checkbox: {
    width: theme.size.markBox,
    height: theme.size.markBox,
    borderRadius: theme.radius.badge,
    borderWidth: theme.border.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: theme.colors.olive,
    borderColor: theme.colors.olive,
  },
  checkboxOff: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors['sand-500'],
  },
  checkboxMark: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.card,
  },
  consentLabel: {
    flex: 1,
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    lineHeight: theme.text.helper * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  blockLine: {
    textAlign: 'center',
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text.helper,
    color: theme.colors.terracotta,
  },
}));
