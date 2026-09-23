import { formatPrice } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type { AddressCheckResult, PaymentMethod } from '@lezzet/types';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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
import { updateMe, type Me } from '@lezzet/mobile-kit/src/lib/api/me';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { upperIn } from '@lezzet/mobile-kit/src/lib/i18n/locale';
import { hapticError, hapticSuccess } from '@lezzet/mobile-kit/src/lib/haptics/haptics';
import { presentPayment } from '@/lib/payment/payment-sheet';
import { addressLine, addressTitle } from '@lezzet/address';
import { addressDefaultsOf } from '@/screens/customer-kit/address-form';
import { AddressSheet, type AddressSheetTarget } from '@/screens/customer-kit/address-sheet';
import { cartLineId, refreshCart, setPurchasePlace, useCart } from '@/screens/customer-kit/cart-store';
import { DashedInvite } from '@/screens/customer-kit/dashed-invite';
import { selectDeliveryAddress, selectPickupWarehouse, useSelectedDeliveryAddress, useSelectedPickupWarehouse } from '@/screens/customer-kit/delivery-address-store';
import { discountSummaryOf, orderDiscountSummaryOf } from '@/screens/customer-kit/discount-label';
import { OptionRow } from '@/screens/customer-kit/option-row';
import { SummaryPanel, type SummaryRow } from '@/screens/customer-kit/summary-panel';
import { publishMe, useMe } from '@lezzet/mobile-kit/src/lib/me/use-me.hook';
import { formatDeliveryDate } from '@/screens/orders/order-format';
import { isNameMissing, isPhoneMissing } from '@/screens/customer-kit/profile-gaps';
import { newOrderKey } from './order-key';
import { deliveryLabelOf, paymentFailureMessage, rejectionMessage } from './order-result-copy';
import { CheckoutSkeleton } from './checkout-skeleton';
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

  /** Seçili adres; `null` sunucunun karar vermesi demektir (varsayılan, yoksa ilk adres). */
  /* Seçim ortak depoda: sepet de aynı adresi okur ve değiştirebilir, iki ekran ayrı durum tutsaydı ayrışırlardı. */
  const addressId = useSelectedDeliveryAddress();
  const setAddressId = selectDeliveryAddress;
  /** Hesap ekranıyla aynı ortak form; kapalıyken `null`. */
  const [addressSheet, setAddressSheet] = useState<AddressSheetTarget | null>(null);
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null);
  /* Gel-al seçimi ORTAK depoda (sepetin adres seçicisiyle aynı): depo bir adres gibi seçilir, tür sunucudan döner. */
  const pickupWarehouseId = useSelectedPickupWarehouse();
  const [paymentKey, setPaymentKey] = useState<string | null>(null);
  const [marketing, setMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Sunucunun ya da ödeme kartının söylediği son şey. `warm` = hata değil (vazgeçilen ödeme). */
  const [notice, setNotice] = useState<{ tone: 'error' | 'warm'; text: string } | null>(null);
  /** `checkedFor` hangi adres için sorulduğunu tutar: "benim yazdığım doğru" diyen müşteriye aynı adres için ikinci kez sorulmaz. */
  const [addressNotice, setAddressNotice] = useState<AddressCheckResult | null>(null);
  const checkedFor = useRef<string | null>(null);

  /* Ad ve telefon girişte değil ilk siparişte istenir: kimliğini yeni kuran kişiden künye istemek bir bedeldir, siparişte ise
     karşılığı görünür. Yazım ayrı adım, çünkü `phone_invalid` gibi retler siparişin değil künyenin sorunudur. */
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  /* Tekrar anahtarı açılışta bir kez üretilir ve seçimler değişse de korunur: çift dokunuş ve ağın yeniden denemesi aynı niyettir. */
  const [orderKey] = useState(newOrderKey);

  const checkout = useCheckout(locale, addressId, cart.couponCode, shippingOrder, pickupWarehouseId);
  const snapshot = checkout.snapshot;
  const addresses = snapshot?.addresses ?? [];
  const delivery = snapshot?.delivery ?? null;
  const payment = snapshot?.payment ?? null;

  /* Seçili adres sunucuyla aynı kuralla çözülür (varsayılan, yoksa ilk); ekran açılışta seçim yazmaz, yoksa müşterinin
     yapmadığı bir seçim doğardı. */
  const selectedAddress = addresses.find((a) => a.id === addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  /* Adres değişince önceki doğrulama artık bu adresin cevabı değildir. */
  const selectedAddressId = selectedAddress?.id ?? null;
  useEffect(() => {
    checkedFor.current = null;
    setAddressNotice(null);
  }, [selectedAddressId]);

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
  const isPickup = delivery?.deliveryType === 'pickup';
  const pickupOffer = snapshot?.pickup ?? null;
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
    // `online` Stripe yoludur; `cash` kapıda ödemedir ve aracı (nakit, kart, çek) kurye kapanışta yazar.
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

  /* Özetin kaynağı sunucunun çözdüğü görünüm, paket dahil. Yer depoya bildirilir; adres bilinmiyorsa depo gezinme koduna düşer,
     çünkü boş ekrandan bir adım eski bir doğru iyidir. */
  useEffect(() => {
    setPurchasePlace(selectedAddress?.postalCode ?? null);
  }, [selectedAddress?.postalCode]);
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
  const summaryLines: { key: string; name: string; qty: number; lineTotalCents: number | null }[] =
    summary === null
      ? orderedLines.map((line) => ({ key: cartLineId(line), name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : summary.lines.map((line, index) => ({ key: `order-${index}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }));
  /* Sipariş DIŞI kalanlar da aynı kaynaktan — özetin yarısını yerelden çizmek, düzeltilen
     ayrışmayı yarı yolda bırakmaktı. */
  const droppedRows: { key: string; name: string; qty: number; lineTotalCents: number | null }[] =
    summary === null
      ? droppedLines.map((line) => ({ key: `dropped-${cartLineId(line)}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }))
      : summary.excludedLines.map((line, index) => ({ key: `dropped-${index}`, name: line.name, qty: line.qty, lineTotalCents: line.lineTotalCents }));

  /* Hangi kalemler olduğu SÖYLENİR ama ancak biliniyorsa: sepet görünümü başka bir posta koduyla
     çözülmüşse elimizde ad yoktur ve uydurulmuş bir liste, yanlış ürünü aratırdı. */
  const undeliverableText =
    droppedRows.length === 0
      ? t.undeliverable.body
      : `${t.undeliverable.body} ${t.undeliverable.items.replace('{items}', droppedRows.map((line) => line.name).join(', '))}`;

  const shippingFeeLabel =
    payment === null ? t.summary.pending : payment.shippingFeeCents === 0 ? t.summary.free : formatPrice(payment.shippingFeeCents, locale);
  /**
   * Ödenecek toplam sunucunun kararıdır ve taslağın tahsil edeceğiyle aynı kapsamdan çıkar; adres seçilmeden yalnız kalem toplamı
   * bilinir. Ekran indirim ve kargoyu kendisi hesaplamaz.
   */
  const grandTotalCents = payment?.orderTotalCents ?? view.totalCents;

  /* İndirim de aynı kaynaktan: özet varsa onun çözülmüş indirimi, yoksa sepetinki. `reasonLabel`
     ikisinde de ORTAK (künyesi kitte) — adı olmayan bir kampanya sepette "Kampanya · %8" iken
     özette başka türlü yazamaz. */
  const discountSummary = summary === null ? discountSummaryOf(view.discount, locale) : orderDiscountSummaryOf(summary.discount, locale);

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
    { key: 'subtotal', label: t.summary.subtotal, value: formatPrice(summary?.subtotalCents ?? orderedSubtotalCents, locale) },
    /* İndirimin adı da yazılır ki sepetteki indirimle aynı olduğu anlaşılsın; türetme sepetle ortak. */
    ...(discountSummary === null
      ? []
      : [
          {
            key: 'discount',
            label:
              discountSummary.name === null
                ? t.summary.discount
                : `${t.summary.discount} · ${discountSummary.name}`,
            value: `−${formatPrice(discountSummary.amountCents, locale)}`,
            tone: 'olive' as const,
          },
        ]),
    { key: 'delivery', label: t.summary.delivery, value: shippingFeeLabel },
  ];

  // Küçük resimler siparişin kendisini gösterir; fotoğrafı olmayan ürün adının ilk harfiyle çizilir.
  const thumbs = [
    ...cart.bundles.map((bundle) => ({ key: `bundle-${bundle.id}`, name: bundle.name, image: bundle.image })),
    ...orderedLines.map((line) => ({ key: cartLineId(line), name: line.name, image: line.image })),
  ].slice(0, 4);

  /* YALNIZ EKSİK OLAN ALAN ÇİZİLİR — dolu olanı yeniden sormak, müşteriye zaten verdiği bilgiyi
     tekrar yazdırmaktır. Bu aynı zamanda "mevcut değeri forma doldurma" işini gereksiz kılıyor:
     çizilen alan her zaman boştur. */
  const nameMissing = customer !== null && isNameMissing(customer);
  const phoneMissing = customer !== null && isPhoneMissing(customer);
  const contactMissing = nameMissing || phoneMissing;

  const saveContact = (): void => {
    if (savingContact) return;
    setContactError(null);
    setSavingContact(true);
    void updateMe({
      // Gönderilmeyen alana DOKUNULMAZ (`MeUpdateSchema` künyesi) — dolu olan alanı boşuna yazmayız.
      ...(nameMissing ? { name: contactName.trim() } : {}),
      ...(phoneMissing ? { phone: contactPhone.trim() } : {}),
    }).then((result) => {
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
    /* İletişim künyesi zorunlu: numara olmadan kurye kapıda ulaşamaz. Engel adres kontrolünden önce, çünkü bölüm de ekranın en
       üstünde ve söylenen sıra uygulanan sıra olmalı. */
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
    if (isRoute && chosenDate === null) return t.block.day;
    if (selectedPayment === null) return t.block.payment;
    return null;
  };
  const blocked = blockReason();

  /**
   * Onay ekranına sunucunun tutarı ve sipariş numarası taşınır; kart yolunda numara `null`dur, çünkü sipariş o anda hâlâ taslaktır
   * ve onayı webhook yazar. `orderId` gösterilmez, yalnız komşu davetini açmak için taşınır.
   */
  const finish = (
    orderId: string,
    totalCents: number,
    deliveryType: 'route' | 'shipping' | 'pickup',
    referenceNo: string | null,
  ): void => {
    /* Sepet yerelde boşaltılmaz, sunucudan tazelenir: `resetCart()` henüz sipariş edilmemiş kargo yarısını da silerdi. Ekran
       değişmeden önce titrer ki onay geçiş animasyonunun altında kaybolmasın. */
    hapticSuccess();
    refreshCart();
    router.replace({
      pathname: '/checkout/confirmed',
      params: {
        orderId,
        /* Numarası olmayan geçişte parametre HİÇ YAZILMAZ (boş dize değil): boş dize de bir
           değerdir ve ekranın "bilinmiyor" dalını kaçırırdı. */
        ...(referenceNo === null ? {} : { reference: referenceNo }),
        total: String(totalCents),
        delivery: deliveryLabelOf(deliveryType, chosenDate, t, locale),
        payment: selectedPayment?.label ?? '',
      },
    });
  };

  /*
    Ret ve arızanın titreşimi tek yerde, yoksa yeni bir ret türünde unutulurdu. `warm` sessizdir: ödeme kartını müşteri kendisi
    kapattıysa bu onun kararıdır, hata değil.
  */
  const showNotice = (next: { tone: 'error' | 'warm'; text: string }): void => {
    if (next.tone === 'error') hapticError();
    setNotice(next);
  };

  const confirm = async (): Promise<void> => {
    if (blocked !== null || submitting || selectedAddress === null || selectedPayment === null) return;
    setSubmitting(true);
    setNotice(null);

    /* Adres doğrulaması sipariş anında ve bir kez: söylenecek bir şey varsa akış durur, ikinci dokunuşta sipariş geçer. Soru
       düşerse akış durmaz, çünkü dış servisin kesintisi satışı durduramaz. */
    if (checkedFor.current !== selectedAddress.id) {
      const check = await checkAddress(selectedAddress.id);
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
      /* Ekranın gösterdiği sepetin imzası, sunucunun verdiği gibi geri gider; sepet arada değiştiyse sunucu `cart_changed` ile
         reddeder ve müşteri yeni listeyi bilerek onaylar. */
      expectedCartFingerprint: summary?.fingerprint ?? null,
    });

    if (result.error !== null) {
      // TAŞIMA arızası (ağ, bozuk gövde, kimliksizlik) — retlerden ayrı: sipariş açıldı mı
      // BİLİNMİYOR. Anahtar korunduğu için tekrar denemek ikinci sipariş açmaz.
      setSubmitting(false);
      showNotice({ tone: 'error', text: result.status === 401 ? t.reject.session : t.reject.transport });
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
      /* YEREL ÖDEME KARTI (sağlayıcının kendi yüzeyi) — ayrı bir ekran YAZILMAZ. Üç sonuç ayrı
         karşılanır: iptal bir HATA DEĞİLDİR (müşteri vazgeçti, sipariş taslak kalır ve ekran
         yerinde durur), başarısızlık sebebiyle söylenir. */
      const sheet = await presentPayment({ clientSecret: outcome.clientSecret });
      if (sheet.status === 'succeeded') {
        /* Numara YOK ve olamaz: sipariş bu anda hâlâ taslak, onayı webhook yazacak (`finish`
           künyesi). `null` geçiyoruz, ekran satırı çizmiyor. */
        finish(outcome.orderId, outcome.totalCents, outcome.deliveryType, null);
        return;
      }
      setSubmitting(false);
      showNotice(
        sheet.status === 'canceled'
          ? { tone: 'warm', text: t.paymentSheet.canceled }
          : { tone: 'error', text: paymentFailureMessage(sheet, t) },
      );
      return;
    }

    setSubmitting(false);
    showNotice({
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
      showNotice({ tone: 'error', text: t.reject.transport });
      return;
    }
    /* Adres değişti → yeniden sorulacak; ve tazeleme ŞART: kod değişimi bölgeyi, kargo ücretini ve
       teslim gününü de oynatabilir (`applyAddressWrite` künyesi). */
    checkedFor.current = null;
    setAddressNotice(null);
    applyAddressWrite(result.data, selectedAddress.id);
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

        {/* Kimlik dört hâllidir: misafir bir cevap, okuma hatası cevapsızlık, yükleme henüz sorulmamış sorudur. Bant ad, yoksa
            e-posta, o da yoksa kimliksiz cümle yazar; boş işaret müşteriye bir şey söylemez. */}
        {meStatus === 'ready' && customer !== null ? (
          <View style={styles.signedIn} testID="checkout-signed-in">
            <Text style={styles.signedInLabel}>{signedInLabel(t, customer)}</Text>
          </View>
        ) : meStatus === 'error' ? (
          <View style={styles.signedIn} testID="checkout-me-error">
            <Note tone="error" description={t.meUnreadable} testID="checkout-me-error-note" />
            <TextAction label={t.meRetry} onPress={refreshMe} testID="checkout-me-retry" />
          </View>
        ) : meStatus === 'guest' ? (
          <DashedInvite
            layout="stack"
            title={t.guest.title}
            description={t.guest.body}
            action={<PrimaryButton label={t.guest.cta} shape="pill" onPress={() => router.push('/login')} testID="checkout-login" />}
            testID="checkout-guest"
          />
        ) : /* `loading`: hiçbir şey çizilmez — cevabı gelmemiş bir soruyu ekrana yazmak, kimliği
              olan müşteriye bir an için "misafirsiniz" demektir. */ null}

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
                {nameMissing ? (
                  <TextField
                    label={t.contact.name}
                    accessibilityLabel={t.contact.name}
                    value={contactName}
                    onChangeText={setContactName}
                    // `content` tek kavram, üç RN prop'una açılıyor (kitin künyesi): otomatik
                    // doldurma, klavye ve büyük harf davranışı buradan geliyor.
                    content="name"
                    testID="checkout-contact-name"
                  />
                ) : null}
                {phoneMissing ? (
                  <TextField
                    label={t.contact.phone}
                    accessibilityLabel={t.contact.phone}
                    value={contactPhone}
                    onChangeText={setContactPhone}
                    content="tel"
                    testID="checkout-contact-phone"
                  />
                ) : null}
                {contactError === null ? null : (
                  <Note tone="terracotta" description={contactError} testID="checkout-contact-error" />
                )}
                <PrimaryButton
                  label={savingContact ? t.contact.saving : t.contact.save}
                  shape="pill"
                  onPress={saveContact}
                  /* Boş alanla yazım denemesi yapılmaz: sunucu zaten `name_required` derdi ama bir
                     tur ağ gidip gelmesi, dokunduğu anda anlaşılabilecek bir şey için. */
                  disabled={
                    savingContact ||
                    (nameMissing && contactName.trim() === '') ||
                    (phoneMissing && contactPhone.trim() === '')
                  }
                  testID="checkout-contact-save"
                />
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.eyebrow}>{upperIn(t.address.eyebrow, locale)}</Text>
              {/* Hiç adres yoksa burası bir davettir, uyarı değil; düğme aynı çekmeceyi burada açar. */}
              {addresses.map((candidate) => (
                <OptionRow
                  key={candidate.id}
                  label={addressTitle(candidate)}
                  description={addressLine(candidate)}
                  // Depo seçiliyken varsayılan adres fatura adresidir, seçili çizilmez — tek seçim, tek çerçeve.
                  selected={!isPickup && candidate.id === selectedAddress?.id}
                  onPress={() => setAddressId(candidate.id)}
                  /* Uzun basma düzenler: kayıtlı adresi düzeltmek için sipariş akışından çıkmak gerekmesin. */
                  onLongPress={() => setAddressSheet({ editing: candidate })}
                  hint={t.address.editHint}
                  trailing={candidate.isDefault ? <Text style={styles.defaultBadge}>{t.address.default}</Text> : undefined}
                  testID={`checkout-address-${candidate.id}`}
                />
              ))}
              {/* Gel-al (izinli müşteri): depo bir adres gibi seçilir; adres fatura adresi olarak kalır, seçim ortak depoda. */}
              {pickupOffer?.warehouses.map((warehouse) => (
                <OptionRow
                  key={warehouse.id}
                  label={t.address.pickupOption}
                  description={`${warehouse.name} · ${warehouse.addressLine}`}
                  selected={isPickup && pickupOffer.selectedWarehouseId === warehouse.id}
                  descriptionTone="muted"
                  onPress={() => selectPickupWarehouse(warehouse.id)}
                  testID={`checkout-pickup-${warehouse.id}`}
                />
              ))}
              {isPickup && selectedAddress !== null ? (
                <Text style={styles.dayLine} testID="checkout-pickup-billing">
                  {t.address.billing.replace('{address}', `${addressTitle(selectedAddress)} · ${addressLine(selectedAddress)}`)}
                </Text>
              ) : null}
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
                  <Text style={styles.dayLine} testID="checkout-pickup-phone">
                    {t.delivery.pickupBody}
                    {'\n'}
                    {t.delivery.pickupPhone.replace('{phone}', brand.contact.phoneDisplay)}
                  </Text>
                ) : (
                  <>
                    <OptionRow
                      label={t.delivery.door}
                      description={isRoute ? t.delivery.doorBody.replace('{fee}', shippingFeeLabel) : t.delivery.doorUnavailable}
                      selected={isRoute}
                      disabled={!isRoute}
                      /* Sebep yalnız kapalı hâlde kırmızı: soluk griyle yazılınca müşteri onu fark etmiyordu. */
                      descriptionTone={isRoute ? 'muted' : 'danger'}
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

        {notice === null ? null : <Note tone={notice.tone} description={notice.text} testID="checkout-notice" />}

        {blocked === null ? null : <Text style={styles.blockLine}>{blocked}</Text>}

        <PrimaryButton
          label={submitting ? t.submitting : confirmLabel}
          onPress={() => void confirm()}
          disabled={blocked !== null || submitting}
          testID="checkout-confirm"
        />

        {/* Satış koşulları düğmenin altında, web'le aynı yerde ve cümlede. Cümle ile bağ ayrı satır: yerelleştirilmiş cümleye bağ
            gömmek üç dilde kırılgan olurdu. */}
        <View style={styles.termsBlock}>
          <Text style={styles.termsLine}>{t.terms}</Text>
          <TextAction
            label={t.termsLink}
            onPress={() => router.push({ pathname: '/legal/[page]', params: { page: 'sales' } })}
            testID="checkout-terms"
          />
        </View>
      </FormScroll>

      {/* Adres çekmecesi — hesap ekranının kullandığı KİT bileşeni. Sipariş akışı kesilmez:
          müşteri adresini burada yazar, seçili hâle gelir ve görüntü onunla yenilenir. */}
      <AddressSheet
        target={addressSheet}
        addresses={addresses}
        onClose={() => setAddressSheet(null)}
        onSaved={applyAddressWrite}
        /* Yeni adres hesabın künyesiyle dolu açılır; `me` bu ekranda zaten okunuyor. */
        defaults={addressDefaultsOf(me)}
        testID="checkout-address-sheet"
      />
    </View>
  );
}

/** Ölçüt `isNameMissing`ten gelir: "ad = e-posta" hâli de adsızlıktır ve kural iki yerde tutulursa ayrışır. */
function signedInLabel(t: Messages, customer: Me): string {
  if (!isNameMissing(customer)) return t.signedIn.replace('{name}', customer.name);
  const email = customer.email?.trim() ?? '';
  return email === '' ? t.signedInAnon : t.signedIn.replace('{name}', email);
}

/** Teslimat satırlarının dokunuşu — yol adresin cevabı olduğu için bir şey DEĞİŞTİRMEZ. */
function keepDelivery(): void {
  return undefined;
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
    alignItems: 'center',
    gap: theme.space.xs,
  },
  /* `body-sm`: müşterinin karar için okuduğu metin 14'ün altına inmez; bu satır siparişin hukuki çerçevesini söyler. */
  termsLine: {
    textAlign: 'center',
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  blockLine: {
    textAlign: 'center',
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['body-sm'],
    color: theme.colors.terracotta,
  },
}));
