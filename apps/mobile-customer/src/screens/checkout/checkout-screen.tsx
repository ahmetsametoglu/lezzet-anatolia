import {
  UNKNOWN_AMOUNT,
  discountRowLabel,
  formatPrice,
  servicePointRequired,
  shippingNotice,
  vatSummaryOf,
  type ServicePointEntry,
} from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { AddressCheckResult, PaymentMethod } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { AppBar } from '@/components/ui/app-bar';
import { AvatarThumb } from '@/components/ui/avatar-thumb';
import { BackButton } from '@lezzet/mobile-kit/src/components/ui/back-button';
import { Chip } from '@lezzet/mobile-kit/src/components/ui/chip';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { TextAction } from '@lezzet/mobile-kit/src/components/ui/text-action';
import { declineNeighborInvite } from '@/lib/invite/invite-api';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { checkAddress, updateAddress, type MeAddress } from '@/lib/api/addresses';
import { placeCheckoutOrder } from '@/lib/api/checkout';
import { updateMe } from '@lezzet/mobile-kit/src/lib/api/me';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { hapticError, hapticSuccess } from '@lezzet/mobile-kit/src/lib/haptics/haptics';
import { presentPayment } from '@/lib/payment/payment-sheet';
import { addressContact, addressLine, addressTitle } from '@lezzet/address';
import { cartAddedVat, isNameMissing, vatTotalOf } from '@lezzet/domain-core';
import { cartLineId, refreshCart, useCart } from '@/screens/customer-kit/cart-store';
import { selectDeliveryAddress, useSelectedDeliveryAddress, useSelectedPickupWarehouse } from '@/screens/customer-kit/delivery-address-store';
import { discountSummaryOf, orderDiscountSummaryOf } from '@/screens/customer-kit/discount-label';
import { OptionRow } from '@/screens/customer-kit/option-row';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { publishMe, useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { formatDeliveryDate } from '@/screens/orders/order-format';
import { newOrderKey } from './order-key';
import { deliveryLabelOf, rejectionMessage } from './order-result-copy';
import { CheckoutSkeleton } from './checkout-skeleton';
import { ServicePointPicker } from './service-point-picker';
import { ShippingChoice } from './shipping-choice';
import { brand } from '@lezzet/brand';
import { useCheckout } from './use-checkout.hook';
import messages from '@lezzet/i18n/customer/checkout';

/*
  Ekran seçer, sunucu karar verir: günler, ödeme yolları, kargo ücreti ve toplam sunucudan gelir, ekran yalnız seçimleri gönderir.
  Teslimat yolu seçim değil adresin cevabıdır; iki satır çizilir ama dokunuş yolu değiştirmez.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Web ödemesinin kurduğu kümenin aynısı. */
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
  /** Bölünmüş sepetin kargo yarısı için ayrı sipariş; türetilmez, rotadan gelir ve varsayılanı rota siparişidir. */
  shippingOrder?: boolean;
}

export function CheckoutScreen({ shippingOrder = false }: CheckoutScreenProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const router = useRouter();
  const cart = useCart();
  const { status: meStatus, me, refresh: refreshMe } = useMe();
  /**
   * Yalnız `ready` hâlinde dolu: misafir bir cevap, okuma hatası cevapsızlık, yükleme henüz sorulmamış sorudur ve ekran üçünü
   * ayrı karşılar.
   */
  const customer = meStatus === 'ready' ? me : null;
  /* Giriş sepette sorulur; buraya misafir ancak derin bağlantıyla gelir ve sepete döner. */
  useEffect(() => {
    if (meStatus === 'guest') router.replace('/cart');
  }, [meStatus, router]);

  /** Seçili adres; `null` sunucunun karar vermesi demektir (varsayılan, yoksa ilk adres). */
  /* Seçim ortak depoda: sepet de aynı adresi okur ve değiştirebilir, iki ekran ayrı durum tutsaydı ayrışırlardı. */
  const addressId = useSelectedDeliveryAddress();
  const setAddressId = selectDeliveryAddress;
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  /* Gel-al seçimi ORTAK depoda (sepetin adres seçicisiyle aynı): depo bir adres gibi seçilir, tür sunucudan döner. */
  const pickupWarehouseId = useSelectedPickupWarehouse();
  const [paymentKey, setPaymentKey] = useState<string | null>(null);
  const [marketing, setMarketing] = useState(false);
  /** Satış koşulları kabul edildi mi; kutu işaretsiz başlar ve işaretlenmeden sipariş düğmesi kapalıdır. */
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Sunucunun ya da ödeme kartının söylediği son şey. `warm` = hata değil (vazgeçilen ödeme). */
  const [notice, setNotice] = useState<string | null>(null);
  /** `checkedFor` hangi adres için sorulduğunu tutar: "benim yazdığım doğru" diyen müşteriye aynı adres için ikinci kez sorulmaz. */
  const [addressNotice, setAddressNotice] = useState<AddressCheckResult | null>(null);
  const checkedFor = useRef<string | null>(null);
  /** Ödeme yolu seçilince başlayan doğrulama; dokunuşta cevap hazırdır, müşteri onu beklemez. */
  const pendingCheck = useRef<{ addressId: string; result: ReturnType<typeof checkAddress> } | null>(null);
  const addressCheckOf = useCallback((addressId: string) => {
    if (pendingCheck.current?.addressId !== addressId) pendingCheck.current = { addressId, result: checkAddress(addressId) };
    return pendingCheck.current.result;
  }, []);

  /* Ad girişte değil ilk siparişte istenir: kimliğini yeni kuran kişiden künye istemek bir bedeldir, siparişte ise karşılığı görünür.
     Telefon sorulmaz, çünkü kurye adresteki zorunlu telefonu arar. */
  const [contactName, setContactName] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  /* Tekrar anahtarı açılışta bir kez üretilir ve seçimler değişse de korunur: çift dokunuş ve ağın yeniden denemesi aynı niyettir. */
  const [orderKey] = useState(newOrderKey);

  /* Kargo seçimi: istenen servis okumaya gider ve ücret onunla çözülür, işaretli satır sunucunun seçtiğidir. Nokta, seçildiği adreste
     ve servisi hâlâ seçiliyken kalır. */
  const [shippingCode, setShippingCode] = useState<string | null>(null);
  const [shippingMode, setShippingMode] = useState<'home' | 'point'>('home');
  const [chosenPoint, setChosenPoint] = useState<{ entry: ServicePointEntry; addressId: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const checkout = useCheckout(locale, addressId, cart.couponCode, shippingOrder, pickupWarehouseId, shippingCode);
  const snapshot = checkout.snapshot;
  const addresses = snapshot?.addresses ?? [];
  const delivery = snapshot?.delivery ?? null;
  const payment = snapshot?.payment ?? null;

  /* Seçili adres sunucuyla aynı kuralla çözülür (varsayılan, yoksa ilk); ekran açılışta seçim yazmaz, yoksa müşterinin
     yapmadığı bir seçim doğardı. */
  const selectedAddress = addresses.find((a) => a.id === addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  /* Adres değişince önceki doğrulama bu adresin cevabı değildir. */
  const selectedAddressId = selectedAddress?.id ?? null;
  useEffect(() => {
    checkedFor.current = null;
    setAddressNotice(null);
  }, [selectedAddressId]);

  const shipping = snapshot?.shipping ?? null;
  const selectedCode = shipping?.selectedCode ?? null;
  const pointOptions = useMemo(() => (shipping?.options ?? []).filter((option) => option.needsServicePoint), [shipping]);
  /* Tazeleme sürerken sunucunun eski seçimi görünür; nokta istenen servisle tutuyorsa kalır ki kart gidip gelmesin. */
  const pointOption = pointOptions.find((option) => option.code === chosenPoint?.entry.option.code);
  const servicePoint: ServicePointEntry | null =
    chosenPoint !== null &&
    pointOption !== undefined &&
    chosenPoint.addressId === selectedAddressId &&
    pointOption.code === shippingCode &&
    (checkout.refreshing || pointOption.code === selectedCode)
      ? { point: chosenPoint.entry.point, option: pointOption }
      : null;
  const pointMissing = servicePoint === null && servicePointRequired(shipping, shippingMode);

  const selectShipping = (code: string): void => {
    setShippingCode(code);
    setShippingMode('home');
    setChosenPoint(null);
  };
  /** Eve dönülünce nokta bırakılır ve eve giden en ucuzu sunucu seçer; noktaya geçmek ücreti değiştirmez, nokta seçilince değişir. */
  const selectShippingMode = (next: 'home' | 'point'): void => {
    setShippingMode(next);
    if (next === 'home' && chosenPoint !== null) {
      setChosenPoint(null);
      setShippingCode(null);
    }
  };
  const selectServicePoint = (entry: ServicePointEntry): void => {
    if (selectedAddressId === null) return;
    setChosenPoint({ entry, addressId: selectedAddressId });
    setShippingCode(entry.option.code);
    setShippingMode('point');
  };

  /**
   * Yazılan adres seçilir ve anlık görüntü onunla yeniden okunur, çünkü günler, ücret ve ödeme yolları adrese bağlıdır. Silinen
   * adres seçiliyse seçim bırakılır ve kararı yine sunucu verir.
   */
  const applyAddressWrite = (list: MeAddress[], savedId: string | null): void => {
    const next = savedId ?? (addressId !== null && list.some((a) => a.id === addressId) ? addressId : null);
    if (next === addressId) checkout.reload();
    else setAddressId(next);
  };

  const isRoute = delivery?.deliveryType === 'route';
  // Bölge içindeki kargo siparişinde kapı yolu bölge dışı olduğu için değil, ürünler bölgenin deposunda olmadığı için kapalıdır.
  const doorClosedHere = !isRoute && delivery?.addressInRoute === true;
  const isPickup = delivery?.deliveryType === 'pickup';
  const pickupOffer = snapshot?.pickup ?? null;
  const pickedWarehouse = pickupOffer?.warehouses.find((w) => w.id === pickupOffer.selectedWarehouseId) ?? null;
  const dates = delivery?.availableDates ?? [];

  /* Komşu daveti cihazdan değil kişiden gelir; süzgeç sunucuda, seçilemeyen gün hiç görünmez. */
  const neighborInvites = delivery?.neighborInvites ?? [];

  /* Seçilen gün türetilir, çünkü adres değişince saklanan gün uygun olmayabilir; tek gün varsa seçim sunulmaz. Davetin günü
     önseçilidir ama kilitli değil: müşterinin kendi seçimi her zaman önce gelir, önseçim en yakın davetli gündür. */
  const firstInvitedDate = neighborInvites.find((invite) => dates.includes(invite.deliveryDate))?.deliveryDate ?? null;
  const chosenDate =
    deliveryDate !== null && dates.includes(deliveryDate)
      ? deliveryDate
      : firstInvitedDate !== null
        ? firstInvitedDate
        : delivery !== null && !delivery.requiresDateChoice
          ? (dates[0] ?? null)
          : null;

  const methods = payment?.methods ?? [];
  const codBlockedReason = payment?.codBlockedReason ?? null;
  const paymentOptions: PaymentOption[] = [
    // `online` kart ödemesidir; `cash` kapıda ödemedir ve aracı (nakit ya da kart) kurye kapanışta yazar.
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
      // Gel-al'da aynı yol "depoda ödeme"dir: nakit/kart tezgâhta, kural kapıdakiyle aynı.
      label: isPickup ? t.payment.atPickup : t.payment.onDelivery,
      // Kapalı yöntemin SEBEBİ yazılır: "kapıda ödeme yok" ile "bu tutarda sunulamıyor" farklı
      // cümlelerdir ve ikincisinde müşteri sepetini küçültüp yöntemi açabilir (sözleşme künyesi).
      body:
        codBlockedReason === null
          ? isPickup
            ? t.payment.atPickupBody
            : t.payment.onDeliveryBody
          : t.payment.codBlocked[codBlockedReason],
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
  const paymentChosen = selectedPayment !== null;
  useEffect(() => {
    if (selectedAddressId !== null && paymentChosen) void addressCheckOf(selectedAddressId);
  }, [selectedAddressId, paymentChosen, addressCheckOf]);

  const view = cart.view;
  const viewLines = view.lines;

  /* Bu adrese gelemeyen kalem siparişe girmez ama sepetten silinmez; grup adresin cevabıdır. Kalem gizlenmez, üstü çizilir, yoksa
     müşteri "herhâlde bunları alıyorum" sanardı. */
  const droppedLines = viewLines.filter((line) => line.group === 'undeliverable');
  const orderedLines = viewLines.filter((line) => line.group !== 'undeliverable');

  /**
   * İki sunucu sayısının farkı, ekranın kendi aritmetiği değil: satırları toplasaydık fiyatı çözülemeyen satır sessizce sıfır
   * sayılırdı.
   */
  const orderedSubtotalCents = view.subtotalCents - view.undeliverableSubtotalCents;

  /*
    Özet varsa hem satırlar hem toplam ondan, yoksa ikisi de yerel sepetten gelir; asla karışık, çünkü sepet iki yüzeyde
    paylaşıldığı için liste ile toplam ayrışabilir. Adres seçilmeden özet yoktur ve yerel sepete düşmek doğrudur.
  */
  const summary = snapshot?.summary ?? null;
  // Sunucu cevap vermeden özet yerel sepetten kurulmaz: yerel sepet bu siparişin grubunu bilmez ve bölünmüş sepette bütün sepeti yazardı.
  const pending = checkout.status === 'loading';
  const summaryLines: { key: string; name: string; qty: number; lineTotalCents: number | null }[] = pending
    ? []
    : summary === null
      ? orderedLines.map((line) => ({ key: cartLineId(line), name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : summary.lines.map((line, index) => ({ key: `order-${index}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }));
  /* Sipariş dışı kalanlar da aynı kaynaktan, yoksa özetin yarısı yerelden çizilir ve liste ile toplam ayrışır. */
  const droppedRows: { key: string; name: string; qty: number; lineTotalCents: number | null }[] = pending
    ? []
    : summary === null
      ? droppedLines.map((line) => ({ key: `dropped-${cartLineId(line)}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : summary.excludedLines.map((line, index) => ({ key: `dropped-${index}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }));

  /* Hangi kalemler olduğu SÖYLENİR ama ancak biliniyorsa: sepet görünümü başka bir posta koduyla
     çözülmüşse elimizde ad yoktur ve uydurulmuş bir liste, yanlış ürünü aratırdı. */
  const undeliverableText =
    droppedRows.length === 0
      ? t.undeliverable.body
      : `${t.undeliverable.body} ${t.undeliverable.items.replace('{items}', droppedRows.map((line) => line.name).join(', '))}`;

  const shippingFeeLabel = pending
    ? UNKNOWN_AMOUNT
    : payment === null
      ? t.summary.pending
      : payment.shippingFeeCents === null
        ? UNKNOWN_AMOUNT
        : payment.shippingFeeCents === 0
          ? t.summary.free
          : formatPrice(payment.shippingFeeCents, locale);
  /**
   * Ödenecek toplam sunucunun kararıdır ve taslağın tahsil edeceğiyle aynı kapsamdan çıkar; adres seçilmeden yalnız kalem toplamı
   * bilinir, kargo ücreti bilinmiyorsa toplam da bilinmez. Ekran indirim ve kargoyu kendisi hesaplamaz.
   */
  // KDV hariç fiyatta (onaylı işletme) KDV ara toplamın altında, teslimat en altta; satırlar ödeme cevabından, öncesinde sepetten.
  const vat = payment ? payment.goodsVat : cartAddedVat(view.lines, view);
  const vatText = vatSummaryOf({ pricesIncludeVat: view.pricesIncludeVat, vat, zeroRated: view.zeroRated }, locale);
  const grandTotalCents = payment ? payment.orderTotalCents : view.totalCents + vatTotalOf(vat);
  const grandTotalLabel = grandTotalCents === null ? UNKNOWN_AMOUNT : formatPrice(grandTotalCents, locale);

  /* İndirim de aynı kaynaktan: özet varsa onun çözülmüş indirimi, yoksa sepetinki. `reasonLabel`
     ikisinde de ORTAK (künyesi kitte) — adı olmayan bir kampanya sepette "Kampanya · %8" iken
     özette başka türlü yazamaz. */
  const discountSummary = pending
    ? null
    : summary === null
      ? discountSummaryOf(view.discount, locale)
      : orderDiscountSummaryOf(summary.discount, locale);

  /* Paket satırı sunucunun çözdüğü `orderedLines`ın içinde; yerel satır toplamı ekranın kendi çarpımı olurdu. */
  const summaryRows: SummaryRow[] = [
    ...summaryLines.map((line) => ({
      key: line.key,
      label: t.summary.line.replace('{quantity}', String(line.qty)).replace('{name}', line.name),
      // Fiyatı olmayan satır SIFIR yazılmaz (CLAUDE §1): satışa kapanmış kalem "bedava" değildir.
      value: line.lineTotalCents === null ? t.summary.noPrice : formatPrice(line.lineTotalCents, locale),
    })),
    /* Gelemeyen kalem özetten gizlenmez, üstü çizilir ve altında nedeni yazılır; ara toplamın üstünde durur ki listenin parçası
       olduğu okunsun. */
    ...droppedRows.map((line) => ({
      key: line.key,
      label: t.summary.line.replace('{quantity}', String(line.qty)).replace('{name}', line.name),
      value: line.lineTotalCents === null ? t.summary.noPrice : formatPrice(line.lineTotalCents, locale),
      tone: 'danger' as const,
      strike: true,
    })),
    ...(droppedRows.length === 0
      ? []
      : [{ key: 'undeliverable-note', label: t.summary.undeliverableNote, value: '', tone: 'danger' as const }]),
    {
      key: 'subtotal',
      label: vatText.subtotalLabel ?? t.summary.subtotal,
      value: pending ? UNKNOWN_AMOUNT : formatPrice(summary?.subtotalCents ?? orderedSubtotalCents, locale),
    },
    /* İndirimin adı da yazılır ki sepetteki indirimle aynı olduğu anlaşılsın; türetme sepetle ortak. */
    ...(discountSummary === null
      ? []
      : [
          {
            key: 'discount',
            label: discountRowLabel(t.summary.discount, discountSummary.name),
            value: `−${formatPrice(discountSummary.amountCents, locale)}`,
            tone: 'olive' as const,
          },
        ]),
    ...(pending ? [] : vatText.vatRows),
    { key: 'delivery', label: t.summary.delivery, value: shippingFeeLabel },
  ];

  // Küçük resimler siparişin kendisini gösterir; fotoğrafı olmayan ürün adının ilk harfiyle çizilir.
  const thumbs = [
    ...cart.bundles.map((bundle) => ({ key: `bundle-${bundle.id}`, name: bundle.name, image: bundle.image })),
    ...orderedLines.map((line) => ({ key: cartLineId(line), name: line.name, image: line.image })),
  ].slice(0, 4);

  // Kutu yalnız ad eksikken çizilir; dolu adı yeniden sormak müşteriye verdiği bilgiyi tekrar yazdırmak olurdu.
  const contactMissing = customer !== null && isNameMissing(customer);

  const saveContact = (): void => {
    if (savingContact) return;
    setContactError(null);
    setSavingContact(true);
    void updateMe({ name: contactName.trim() }).then((result) => {
      setSavingContact(false);
      if (result.error !== null) {
        // Adlı retler sözleşmede anahtar, cümle burada (`MeUpdateErrorEnum`); tanınmayan anahtar
        // genel cümleye düşer — ekran sunucunun sözlüğünü ezberlemek zorunda değil.
        setContactError(t.contact.errors[result.error as keyof typeof t.contact.errors] ?? t.contact.errors.generic);
        return;
      }
      // Yayınlanan profil `blocked`ı da açar: kapı `customer`ı okuyor, ikinci bir bayrak tutulmuyor.
      publishMe(result.data);
    });
  };

  /** Onayı engelleyen İLK sebep; yoksa `null`. Sıra şablonun sırası, gerçekler sunucunun. */
  const blockReason = (): string | null => {
    if (customer === null) return t.block.login;
    // Ad zorunlu; engel adres kontrolünden önce, çünkü bölüm de ekranın en üstünde ve söylenen sıra uygulanan sıra olmalı.
    if (contactMissing) return t.block.contact;
    // Okuma düştüyse onay KAPALI ve sebep açıkça söylenir: "seçenekleriniz güncelleniyor" demek,
    // bitmeyecek bir bekleyiş vaat etmek olurdu (yukarıda ayrıca "yeniden dene" duruyor).
    if (checkout.status === 'error') return t.state.failed;
    // Yükleme/tazeleme boyunca da kapalı: eski ücretle onaylanan sipariş, gösterilenden başka bir
    // tutarla açılırdı.
    if (checkout.status === 'loading' || checkout.refreshing) return t.block.loading;
    if (selectedAddress === null) return t.block.address;
    // Adres var ama teslimat/ödeme dilimi yoksa karar VERİLMEMİŞ demektir; tahmin yürütülmez.
    if (payment === null) return t.block.loading;
    /* Gelemeyen kalem onayı kapatmaz, sunucu onu kapsam dışında bırakır; engel yalnız kargo siparişinde gerçek, çünkü o sipariş
       soğuk zincir kalemi taşıyamaz. */
    if (shippingOrder && delivery?.blocked === true) return t.block.shipping;
    if (!payment.minBasketOk) {
      return t.block.minBasket
        .replace('{place}', payment.placeLabel)
        .replace('{missing}', formatPrice(payment.missingForMinBasketCents, locale));
    }
    if (pointMissing) return t.point.none;
    if (payment.orderTotalCents === null) return shippingNotice(shipping, t.carrier);
    if (isRoute && chosenDate === null) return t.block.day;
    if (selectedPayment === null) return t.block.payment;
    if (!termsAccepted) return t.block.terms;
    return null;
  };
  const blocked = blockReason();

  /**
   * Siparişin ekranına sunucunun tutarı ve numarası taşınır; kart yolunda numara `null`dur, çünkü sipariş o anda taslaktır. Sepet
   * yerelde boşaltılmaz, sunucudan tazelenir: `resetCart()` henüz sipariş edilmemiş kargo yarısını da silerdi.
   */
  const openOrder = (
    orderId: string,
    totalCents: number,
    deliveryType: 'route' | 'shipping' | 'pickup',
    referenceNo: string | null,
  ): void => {
    refreshCart();
    router.replace({
      pathname: '/checkout/confirmed',
      params: {
        orderId,
        // Numarası olmayan geçişte parametre hiç yazılmaz; boş dize de bir değerdir ve ekranın "bilinmiyor" dalını kaçırırdı.
        ...(referenceNo === null ? {} : { reference: referenceNo }),
        total: String(totalCents),
        delivery: deliveryLabelOf(deliveryType, chosenDate, t, locale),
        payment: selectedPayment?.label ?? '',
      },
    });
  };

  /** Sipariş verildi: ekran değişmeden önce titrer ki onay geçiş animasyonunun altında kaybolmasın. */
  const finish = (...order: Parameters<typeof openOrder>): void => {
    hapticSuccess();
    openOrder(...order);
  };

  // Ret ve arızanın titreşimi tek yerde, yoksa yeni bir ret türünde unutulurdu.
  const showNotice = (text: string): void => {
    hapticError();
    setNotice(text);
  };

  const confirm = async (): Promise<void> => {
    if (blocked !== null || submitting || selectedAddress === null || selectedPayment === null) return;
    setSubmitting(true);
    setNotice(null);

    /* Adres doğrulamasının cevabı bir kez kullanılır: söylenecek bir şey varsa akış durur, ikinci dokunuşta sipariş geçer. Soru
       düşerse akış durmaz, çünkü dış servisin kesintisi satışı durduramaz. */
    if (checkedFor.current !== selectedAddress.id) {
      const check = await addressCheckOf(selectedAddress.id);
      checkedFor.current = selectedAddress.id;
      if (check.error === null && check.data.status !== 'confirmed' && check.data.status !== 'unknown') {
        setSubmitting(false);
        setAddressNotice(check.data);
        return;
      }
    }

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
      // Gel-al: seçilen depo; sunucu izni ve depoyu yeniden doğrular.
      pickupWarehouseId: isPickup ? pickupWarehouseId : null,
      // Ekranın işaretlediği servis ve nokta; sunucu ikisini de teklif listesinden ve sağlayıcıdan yeniden doğrular.
      shippingOptionCode: selectedCode,
      servicePointId: servicePoint?.point.id ?? null,
      /* Ekranın gösterdiği sepetin imzası, sunucunun verdiği gibi geri gider; sepet arada değiştiyse sunucu `cart_changed` ile
         reddeder ve müşteri yeni listeyi bilerek onaylar. */
      expectedCartFingerprint: summary?.fingerprint ?? null,
    });

    if (result.error !== null) {
      // TAŞIMA arızası (ağ, bozuk gövde, kimliksizlik) — retlerden ayrı: sipariş açıldı mı
      // BİLİNMİYOR. Anahtar korunduğu için tekrar denemek ikinci sipariş açmaz.
      setSubmitting(false);
      showNotice(result.status === 401 ? t.reject.session : t.reject.transport);
      return;
    }

    const outcome = result.data;
    if (outcome.status === 'placed') {
      finish(outcome.orderId, outcome.totalCents, outcome.deliveryType, outcome.referenceNo);
      return;
    }
    // Önceki kart ödemesi geçti ya da bankada işleniyor: yeni sipariş açılmadı, müşteri o siparişin onayına gider.
    if (outcome.status === 'open_payment') {
      finish(outcome.orderId, outcome.totalCents, outcome.deliveryType, outcome.referenceNo);
      return;
    }
    if (outcome.status === 'payment_required') {
      // Yerel ödeme kartı sağlayıcının kendi yüzeyi; ayrı bir ekran yazılmaz.
      const sheet = await presentPayment({ paymentToken: outcome.paymentToken });
      if (sheet.status === 'succeeded') {
        // Numara yok: sipariş hâlâ taslak, onayı sağlayıcının cevabı yazar.
        finish(outcome.orderId, outcome.totalCents, outcome.deliveryType, null);
        return;
      }
      /* Ödeme olmadı ama sipariş açıldı ve kalemler sepetten ona geçti: müşteri siparişin ekranında aynı ödemeye döner ya da iptal
         eder. Vazgeçmek hata değildir, titreşim yalnız düşen ödemede. */
      if (sheet.status === 'failed') hapticError();
      openOrder(outcome.orderId, outcome.totalCents, outcome.deliveryType, null);
      return;
    }

    setSubmitting(false);
    showNotice(
      // Ürün adı sepet görünümünden çözülür; sunucudan ikinci kez istemek istemcinin bildiğini ona geri okutmak olurdu.
      rejectionMessage(outcome, t, locale, (variantId) =>
        viewLines.find((line) => line.kind === 'variant' && line.variantId === variantId)?.name ?? null,
      ),
    );
    // Her ret "ekrandaki resim eskidi" ihtimalidir (gün düştü, yöntem kapandı, fiyat değişti):
    // anlık görüntü tazelenir ki müşteri düzeltmeyi GÜNCEL seçeneklerle yapsın.
    checkout.reload();
  };

  /**
   * Teklif kabul edilince hem siparişin adresi hem kayıt düzelir; değişen yalnız kod ve şehirdir. Ülke gönderilmez, kapı yeni kodu
   * kendisi çözer.
   */
  const acceptAddressFix = async (): Promise<void> => {
    if (selectedAddress === null || addressNotice?.status !== 'wrong_postal_code') return;
    setSubmitting(true);
    const result = await updateAddress(selectedAddress.id, {
      label: selectedAddress.label,
      recipient: selectedAddress.recipient,
      phone: selectedAddress.phone,
      line1: selectedAddress.line1,
      line2: selectedAddress.line2,
      postalCode: addressNotice.postalCode,
      city: addressNotice.city,
    });
    setSubmitting(false);
    if (result.error !== null) {
      showNotice(t.reject.transport);
      return;
    }
    /* Adres değişti, eski cevap artık bu kaydın değil: soru yeniden sorulur ve cevabı yine arkada hazırlanır. Tazeleme şart, çünkü
       kod değişimi bölgeyi, kargo ücretini ve teslim gününü de oynatabilir. */
    checkedFor.current = null;
    pendingCheck.current = null;
    void addressCheckOf(selectedAddress.id);
    setAddressNotice(null);
    applyAddressWrite(result.data, selectedAddress.id);
  };

  // Her ödeme yolunda aynı yazı: basınca ödeme yükümlülüğü doğar, kart yolunda ödeme kartı bu kararın arkasından açılır.
  const confirmLabel = t.confirm.replace('{total}', grandTotalLabel);

  return (
    <View style={styles.screen}>
      <AppBar
        title={t.title}
        left={<BackButton onPress={() => router.back()} accessibilityLabel={t.back} testID="checkout-back" />}
        testID="checkout-appbar"
      />
      {/* Klavye korumalı kap: odaklanan alan klavyenin altında kalmasın ve klavye açıkken ilk dokunuş yutulmasın. Kural
          `lib/keyboard-scroll-guard.test.ts`te denetleniyor. */}
      <FormScroll contentContainerStyle={styles.content} testID="checkout-scroll">
        <View style={styles.hero}>
          <Text style={styles.heroTitle} accessibilityRole="header">
            {t.hero}
          </Text>
          <View style={styles.thumbs}>
            {thumbs.map((thumb) => (
              <AvatarThumb
                key={thumb.key}
                initial={thumb.name.slice(0, 1)}
                accessibilityLabel={thumb.name}
                image={thumb.image}
                size="sm"
                stacked
              />
            ))}
          </View>
        </View>

        {/* Kim olarak devam edildiği sepette yazılır; burada yalnız kimliğin okunamadığı hâl söylenir, çünkü onsuz sipariş kapısı
            açılamaz ve müşteri yeniden deneme yolu ister. */}
        {meStatus === 'error' ? (
          <View style={styles.meError} testID="checkout-me-error">
            <Note tone="error" description={t.meUnreadable} testID="checkout-me-error-note" />
            <TextAction label={t.meRetry} onPress={refreshMe} testID="checkout-me-retry" />
          </View>
        ) : null}

        {/* Seçenekler okunamadıysa ekran hâlini söyler ve yeniden deneme yolu verir. Yüklenirken üç bölümün yeri tutulur ki cevap
            gelince tutar özeti ve onay aşağı zıplamasın. */}
        {checkout.status === 'loading' ? <CheckoutSkeleton testID="checkout-loading" /> : null}
        {checkout.status === 'error' ? (
          <View style={styles.section} testID="checkout-failed">
            <Note tone="error" description={t.state.failed} />
            <SecondaryButton label={t.state.retry} onPress={checkout.retry} testID="checkout-retry" />
          </View>
        ) : null}

        {checkout.status === 'ready' ? (
          <>
            {/* İletişim bölümü yalnız künye eksikken ve en üstte; alanı sormadan önce neden sorulduğu yazılı. */}
            {contactMissing ? (
              <View style={styles.section} testID="checkout-contact">
                <Text style={styles.eyebrow}>{upperIn(t.contact.eyebrow, locale)}</Text>
                <Text style={styles.contactReason}>{t.contact.reason}</Text>
                <TextField
                  label={t.contact.name}
                  accessibilityLabel={t.contact.name}
                  value={contactName}
                  onChangeText={setContactName}
                  // `content` otomatik doldurma, klavye ve büyük harf davranışını birlikte kurar (kitin künyesi).
                  content="name"
                  testID="checkout-contact-name"
                />
                {contactError === null ? null : (
                  <Note tone="terracotta" description={contactError} testID="checkout-contact-error" />
                )}
                <PrimaryButton
                  label={savingContact ? t.contact.saving : t.contact.save}
                  shape="pill"
                  onPress={saveContact}
                  // Boş alanla yazım denenmez: sunucu `name_required` derdi, ama bu dokunduğu anda anlaşılabilecek bir şey.
                  disabled={savingContact || contactName.trim() === ''}
                  testID="checkout-contact-save"
                />
              </View>
            ) : null}

            {/* Adres sepette seçilir, burada yalnız gösterilir: iki ekran iki ayrı adresle konuşmasın. Değiştirmek sepete döner. */}
            <View style={styles.section}>
              <Text style={styles.eyebrow}>{upperIn(t.address.eyebrow, locale)}</Text>
              {isPickup && pickedWarehouse !== null ? (
                <>
                  <OptionRow
                    label={t.address.pickupTitle}
                    description={`${pickedWarehouse.name} · ${pickedWarehouse.addressLine}`}
                    selected
                    onPress={router.back}
                    trailing={<TextAction label={t.address.change} onPress={router.back} testID="checkout-address-change" />}
                    testID="checkout-pickup-place"
                  />
                  {selectedAddress === null ? null : (
                    <Text style={styles.helpNote} testID="checkout-pickup-billing">
                      {t.address.billing.replace('{address}', `${addressTitle(selectedAddress)} · ${addressLine(selectedAddress)}`)}
                    </Text>
                  )}
                </>
              ) : selectedAddress !== null ? (
                <>
                  <OptionRow
                    label={addressTitle(selectedAddress)}
                    description={addressLine(selectedAddress)}
                    detail={addressContact(selectedAddress) ?? undefined}
                    selected
                    onPress={router.back}
                    trailing={<TextAction label={t.address.change} onPress={router.back} testID="checkout-address-change" />}
                    testID="checkout-address-selected"
                  />
                  <Text style={styles.helpNote}>{t.address.inCartNote}</Text>
                </>
              ) : (
                <Note
                  description={t.address.missing}
                  action={<TextAction label={t.address.missingCta} onPress={router.back} testID="checkout-address-missing" />}
                  testID="checkout-address-missing-note"
                />
              )}
            </View>

            {/* Engel değil bilgi: bu kalemler siparişe girmez, sepette bekler ve bölge içi bir adres seçilirse dahil olur; ton bu
                yüzden hata kırmızısı değil. */}
            {droppedRows.length === 0 ? null : (
              <Note tone="warm" title={t.undeliverable.title} description={undeliverableText} testID="checkout-undeliverable" />
            )}

            {delivery === null ? null : (
              <View style={styles.section}>
                <Text style={styles.eyebrow}>{upperIn(t.delivery.eyebrow, locale)}</Text>
                {/* Kapı/kargo adresin cevabıdır (dokunuş değiştirmez); gel-al seçiliyken ikisi de çizilmez — depo bloğu konuşur. */}
                {isPickup ? (
                  <Text style={styles.pickupBody} testID="checkout-pickup-phone">
                    {t.delivery.pickupBody}
                    {'\n'}
                    {t.delivery.pickupPhone.replace('{phone}', brand.contact.phoneDisplay)}
                  </Text>
                ) : (
                  <>
                    <OptionRow
                      label={t.delivery.door}
                      description={
                        isRoute
                          ? t.delivery.doorBody.replace('{fee}', shippingFeeLabel)
                          : doorClosedHere
                            ? t.delivery.shippingInZone
                            : t.delivery.doorUnavailable
                      }
                      selected={isRoute}
                      disabled={!isRoute}
                      /* Bölge dışı kırmızıdır, çünkü müşterinin adresi değişmeden kapı açılmaz; ürünün deposu ise bir bilgidir. */
                      descriptionTone={isRoute || doorClosedHere ? 'muted' : 'danger'}
                      onPress={keepDelivery}
                      testID="checkout-mode-door"
                    />
                    <OptionRow
                      label={t.delivery.shipping}
                      description={isRoute ? t.delivery.shippingUnavailable : t.delivery.shippingBody.replace('{fee}', shippingFeeLabel)}
                      selected={!isRoute}
                      disabled={isRoute}
                      descriptionTone={isRoute ? 'danger' : 'muted'}
                      onPress={keepDelivery}
                      testID="checkout-mode-shipping"
                    />
                  </>
                )}
                {/* Komşu daveti gün seçiminin hemen üstünde, çünkü cümle o seçimin gerekçesidir. Her davet kendi satırında: müşteriyi
                    birden çok komşu birden çok güne çağırmış olabilir. */}
                {isRoute
                  ? neighborInvites.map((neighborInvite) => (
                  <Note
                    key={neighborInvite.inviteId}
                    tone="olive"
                    /* Cümle seçime bağlı: davet yalnız tam gün eşleşmesinde bağlanır, başka güne dokunan müşteriye o güne dönmenin
                       ne kazandırdığı söylenir. */
                    description={(chosenDate === neighborInvite.deliveryDate ? t.delivery.neighborInvite : t.delivery.neighborInviteOtherDay)
                      .replace('{name}', neighborInvite.inviterName || t.delivery.neighborSomeone)
                      .replace('{day}', formatDeliveryDate(neighborInvite.deliveryDate, locale))}
                    /* Ret kutunun içinde ve geri alınabilir, bu yüzden "sil" değil "kaldır". Ekran yerel liste tutmaz, anlık görüntü
                       yeniden okunur. */
                    action={
                      <TextAction
                        label={t.delivery.neighborDecline}
                        tone="terracotta"
                        onPress={() => {
                          void declineNeighborInvite(neighborInvite.inviteId).then((result) => {
                            if (result.error === null) checkout.reload();
                          });
                        }}
                        testID="checkout-neighbor-decline"
                      />
                    }
                    testID="checkout-neighbor-invite"
                  />
                    ))
                  : null}

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
                {!isRoute && !isPickup && !delivery.blocked ? (
                  <ShippingChoice
                    locale={locale}
                    shipping={shipping}
                    mode={shippingMode}
                    selectedCode={selectedCode}
                    point={servicePoint}
                    onSelectShipping={selectShipping}
                    onSelectMode={selectShippingMode}
                    onOpenPicker={() => setPickerOpen(true)}
                  />
                ) : null}
              </View>
            )}

            {payment === null ? null : (
              <View style={styles.section}>
                <Text style={styles.eyebrow}>{upperIn(t.payment.eyebrow, locale)}</Text>
                {paymentOptions.map((option) => (
                  <OptionRow
                    key={option.key}
                    label={option.label}
                    description={option.body}
                    selected={selectedPayment?.key === option.key}
                    disabled={!option.available}
                    /* Kapalı ödeme yolunun sebebi de kırmızı — "kapıda ödeme yalnız kendi
                       aracımızla getirdiğimiz adreslerde" cümlesi aynı sebeple soluk kalıyordu. */
                    descriptionTone={option.available ? 'muted' : 'danger'}
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
          eyebrow={upperIn(t.summary.eyebrow, locale)}
          rows={summaryRows}
          totalLabel={vatText.totalLabel ?? t.summary.total}
          totalValue={pending ? UNKNOWN_AMOUNT : grandTotalLabel}
          totalTone="terracotta"
          testID="checkout-summary"
        />

        {/* Kabul bloğu özetle düğmenin arasında; koşulların bağı kutunun dışında, ki bağa dokunmak kutuyu işaretlemesin. */}
        <CheckRow checked={marketing} onToggle={() => setMarketing(!marketing)} label={t.marketing} testID="checkout-marketing" />
        <View style={styles.termsBlock}>
          <CheckRow
            checked={termsAccepted}
            onToggle={() => setTermsAccepted(!termsAccepted)}
            label={t.terms}
            testID="checkout-terms-accept"
          />
          <View style={styles.termsLink}>
            <TextAction
              label={t.termsLink}
              onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'sales' } })}
              testID="checkout-terms"
            />
          </View>
        </View>

        {/* Adres teklifi onay düğmesinin hemen üstünde, çünkü soru o anda doğar. İki hâl ayrı yapı: başka kodda bulunan kapıda iki
            düğme, doğrulanamayan kapıda tek yumuşak satır; metin servisin etiketidir. */}
        {addressNotice === null ? null : addressNotice.status === 'wrong_postal_code' ? (
          <Note
            tone="warm"
            title={t.addressCheck.foundElsewhere}
            description={addressNotice.label}
            action={
              <View style={styles.checkActions}>
                <PrimaryButton
                  label={t.addressCheck.useIt}
                  shape="pill"
                  onPress={() => void acceptAddressFix()}
                  disabled={submitting}
                  testID="checkout-address-fix"
                />
                <TextAction
                  label={t.addressCheck.keepMine}
                  onPress={() => setAddressNotice(null)}
                  testID="checkout-address-keep"
                />
              </View>
            }
            testID="checkout-address-check"
          />
        ) : addressNotice.status === 'street_only' || addressNotice.status === 'not_found' ? (
          <Note
            tone="warm"
            description={addressNotice.status === 'street_only' ? t.addressCheck.streetOnly : t.addressCheck.notFound}
            testID="checkout-address-check"
          />
        ) : null}

        {notice === null ? null : <Note tone="error" description={notice} testID="checkout-notice" />}

        {blocked === null ? null : <Text style={styles.blockLine}>{blocked}</Text>}

        <PrimaryButton
          label={submitting ? t.submitting : confirmLabel}
          onPress={() => void confirm()}
          disabled={blocked !== null || submitting}
          testID="checkout-confirm"
        />
      </FormScroll>

      {/* Seçici ekranın üstünde katman: liste çekmecesi kökte açıldığı için ayrı pencereye (`Modal`) konsaydı onun altında kalırdı. */}
      {pickerOpen && selectedAddressId !== null ? (
        <ServicePointPicker
          locale={locale}
          addressId={selectedAddressId}
          pointOptions={pointOptions}
          selectedId={servicePoint?.point.id ?? null}
          onSelect={selectServicePoint}
          onClose={closePicker}
        />
      ) : null}
    </View>
  );
}

/** Teslimat satırlarının dokunuşu — yol adresin cevabı olduğu için bir şey DEĞİŞTİRMEZ. */
function keepDelivery(): void {
  return undefined;
}

interface CheckRowProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  testID: string;
}

/** Kabul bloğunun kutusu; işaretsiz başlar, çünkü izin de kabul de açık eylem ister. */
function CheckRow({ checked, onToggle, label, testID }: CheckRowProps) {
  return (
    <PressableSurface
      onPress={onToggle}
      feedback="opacity"
      selected={checked}
      style={styles.consentRow}
      accessibilityLabel={label}
      testID={testID}
    >
      <View style={[styles.checkbox, checked ? styles.checkboxOn : styles.checkboxOff]}>
        <Text style={styles.checkboxMark}>{checked ? '✓' : ' '}</Text>
      </View>
      <Text style={styles.consentLabel}>{label}</Text>
    </PressableSurface>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  /** Adres teklifinin iki eylemi — kutunun eninde, alt alta (bölge bandının yığın kararı). */
  checkActions: {
    alignSelf: 'stretch',
    rowGap: theme.space.lg,
  },
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
  meError: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.control,
    paddingVertical: theme.space.xl,
    paddingHorizontal: theme.space['2xl'],
  },
  section: { gap: theme.space.md },
  eyebrow: {
    fontFamily: theme.font.body[theme.text['eyebrow--font-weight']],
    fontSize: theme.text.eyebrow,
    letterSpacing: theme.text.eyebrow * 0.18,
    color: theme.colors.terracotta,
  },
  /** İletişim bölümünün GEREKÇE cümlesi — alanların üstünde, gövde tonunda; uyarı değil izah. */
  contactReason: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
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
    fontSize: theme.text['body-sm'],
    color: theme.colors['olive-dark'],
  },
  /** Seçili adresin altındaki yardım cümlesi: bir onay değil izah, bu yüzden günün yeşil satırından ayrı ve soluk. */
  helpNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.micro,
    lineHeight: theme.text.micro * 1.45,
    color: theme.colors.muted,
  },
  pickupBody: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  paymentNote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
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
  termsBlock: {
    gap: theme.space.xs,
  },
  /** Bağ etiketin hizasında: kutunun genişliği ve kutuyla etiket arasındaki boşluk kadar içeride. */
  termsLink: {
    alignItems: 'flex-start',
    paddingLeft: theme.size.markBox + theme.space.lg,
  },
  blockLine: {
    textAlign: 'center',
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.terracotta,
  },
}));
