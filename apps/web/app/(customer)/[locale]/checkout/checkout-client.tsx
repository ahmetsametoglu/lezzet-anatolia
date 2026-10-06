'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Router next-intl'den: `next/navigation` dilsiz yol üretir, middleware onu 307 ile dilli yola çevirir ve çerez dili URL diliyle
// ayrışınca müşteri yanlış dile düşer.
import { useRouter } from '@/i18n/navigation';
import { isNameMissing } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import checkoutMessages from '@lezzet/i18n/customer/checkout';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { useCart } from '@/components/customer/cart/cart-context';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { errorText } from '@/lib/customer-error-text';
import { hapticError, hapticSuccess } from '@/lib/haptics/haptics';
import { CardTrustNote, openCardPopup, type PayStage } from './components/revolut-card';
import { rememberPaymentError } from './payment-error';
import { CheckoutDesktop } from './checkout.desktop';
import { CheckoutMobile } from './checkout.mobile';
import type { AddressCheckOutcome } from '@lezzet/application';
import type { CheckoutSnapshot } from '@lezzet/application';
import { checkCheckoutAddressAction, confirmCheckoutAction, loadCheckoutAction, saveCheckoutNameAction } from './actions';
import { checkoutEntriesOf, isSeparateOrder, type CheckoutState, type CheckoutViewProps, type Messages } from './checkout-types';

/**
 * Durum ve sunucu turları burada, yerleşim iki ekran dosyasında. Adres sepette seçilir ve burada yalnız okunur, çünkü teslimat
 * türü, günler, kargo ücreti, ödeme yöntemleri ve toplam o adresin cevabıdır; iki ekran iki ayrı adresle konuşmamalı.
 */
interface CheckoutClientProps {
  t: Messages;
  locale: Locale;
  device: Device;
  /**
   * Sepetin kargo grubundan açılan sipariş mi (`?group=shipping`). Kalemler de tür de bu tek bayraktan seçilir; ayrı türetilseydi
   * rota içindeki müşteride ekran "kapıya teslim" derken taslak kargo siparişi açardı.
   */
  shippingOrder: boolean;
  /** Girişli müşterinin künyesi — sayfa girişsizi sepete çevirdiği için hep dolu. */
  customer: { name: string; email: string; phone: string | null };
}

const EMPTY: CheckoutSnapshot = { addresses: [], delivery: null, shipping: null, payment: null, summary: null, pickup: null };

/** `crypto.randomUUID` sunucu render'ında da var (Node 19+); yine de eski tarayıcı için yedeği var. */
function newAttemptKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`;
}

export function CheckoutClient({ t, locale, device, shippingOrder, customer }: CheckoutClientProps) {
  /**
   * Cihaz istemcide doğrulanır: sunucunun UA tahmini yalnız başlangıçtır, yanılırsa ya da ekran dönerse checkout yanlış düzende
   * kalırdı.
   */
  const resolved = useDevice(device);
  const router = useRouter();
  const { view, ready: cartReady, failed: cartFailed, reload: reloadCart, coupon } = useCart();
  // Seçili adres SİTENİN yer bağlamından: sepetin seçtiği adres burada da aynı kaynaktan okunur
  // ve düzeltme teklifi (`onAcceptAddressFix`) aynı bağlam üstünden yazılır — yer de onunla tazelenir.
  const { address: selectedPlaceAddress, saveAddress } = useDeliveryPlace();
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot>(EMPTY);
  const [state, setState] = useState<CheckoutState>({
    addressId: null,
    deliveryDate: null,
    shippingOptionCode: null,
    servicePoint: null,
    shippingMode: 'home',
    paymentMethod: null,
    onAccount: false,
    marketingConsent: false,
    termsAccepted: false,
  });
  const [busy, setBusy] = useState(false);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Ad eksikse ilk siparişte sorulur, native ile aynı kutu; kaydedilen ad yerelde tutulur, ki kutu sayfa yenilenmeden kapansın ve kart
     ödemesinin fatura adı onu taşısın. */
  const [contactName, setContactName] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const customerName = savedName ?? customer.name;
  const nameMissing = savedName === null && isNameMissing(customer);
  const saveContact = async () => {
    const name = contactName.trim();
    if (savingContact || name === '') return;
    setSavingContact(true);
    setContactError(null);
    const { errorKey } = await saveCheckoutNameAction(name);
    setSavingContact(false);
    if (errorKey) {
      const errors = checkoutMessages[locale].contact.errors;
      return setContactError(errors[errorKey as keyof typeof errors] ?? errors.generic);
    }
    setSavedName(name);
  };
  const [payStage, setPayStage] = useState<PayStage | null>(null);

  const cartEntries = useMemo(() => checkoutEntriesOf(view.lines), [view.lines]);
  /**
   * Okumanın sıra bileti: art arda iki okuma ters sırada dönerse geç gelen eski cevap yeniyi ezerdi. Kilit yerine bilet, arayüz açık
   * kalsın diye.
   */
  const seq = useRef(0);
  /**
   * Çift sipariş kalkanı: çift tıklama ve ağın yeniden denemesi aynı anahtarla gider, sunucu ikinci siparişi açmaz. Sipariş verilince
   * yenilenir, çünkü sonraki sipariş bilerek verilen ayrı bir istektir.
   */
  const attemptKey = useRef(newAttemptKey());
  /** Kart yolunda açılan taslak; ödeme düşerse müşteri onun sayfasına gider. */
  const preparedOrder = useRef<string | null>(null);
  /** Siparişin sayfasına geçildi: boşalan sepet bu ekranın okumasını yeniden koşturmasın, istek yeni sayfaya düşerdi. */
  const leaving = useRef(false);

  /** Adım verisini tazeler. Seçili adres (sepetten), sepet ve gel-al seçimi değiştikçe koşar. */
  const refresh = useCallback(
    async (addressId: string | null, shippingOptionCode: string | null = null) => {
      if (leaving.current) return;
      const ticket = ++seq.current;
      const { data, errorKey } = await loadCheckoutAction(
        locale,
        cartEntries,
        addressId,
        coupon,
        shippingOrder,
        shippingOptionCode,
      );
      if (ticket !== seq.current) return;
      // Okuma düşse de bayrak kalkar: sonsuza kadar iskelet göstermek, hatayı gizlemenin bir
      // başka biçimi olurdu — ekran hata satırını gösterebilmeli.
      setSnapshotReady(true);
      if (errorKey || !data) {
        setError(errorText(t.errors, errorKey));
        return;
      }
      setSnapshot(data);
      setState((prev) => {
        // Adres SEPETTEKİ seçimdir: kapı `addressId` verilmezse varsayılanı seçer (aynı kural).
        const selected = data.addresses.find((a) => a.id === (addressId ?? prev.addressId)) ?? data.addresses.find((a) => a.isDefault) ?? data.addresses[0];
        // Gün SEÇİMİ korunmaz: adres değişince eski gün başka bölgenin günü olabilir. Tek gün
        // varsa seçim sunulmadığı için o gün doğrudan yazılır — ekran boş seçimle kilitlenmesin.
        const dates = data.delivery?.availableDates ?? [];
        // Komşu daveti varsa en yakın davetli gün önseçili gelir, çünkü davetin işlevi o güne denk gelmektir; liste sunucudan gün
        // sırasıyla gelir. Müşterinin kendi geçerli seçimi yine önce gelir, öteki davetler gün seçicide kendi adlarıyla durur.
        const invited = data.delivery?.neighborInvites[0]?.deliveryDate ?? null;
        const keepDate =
          prev.deliveryDate && dates.includes(prev.deliveryDate)
            ? prev.deliveryDate
            : (invited ?? (dates.length === 1 ? dates[0]! : null));
        /* Kargo servisini sunucu seçer, ekran yansıtır: burada önseçim kursaydık liste seçili görünür ama ücret sabit tarifeden
           hesaplanmış olurdu. Adres değişince başka taşıyıcıya ait eski kodu da sunucu süzer. */
        const selectedCode = data.shipping?.selectedCode ?? null;
        // Nokta ancak aynı adreste ve servisi hâlâ seçiliyken kalır; ücretsiz kargoya geçişte sunucu eve giden servisi seçer.
        const keepPoint =
          prev.servicePoint && prev.addressId === (selected?.id ?? null) && prev.servicePoint.optionCode === selectedCode ? prev.servicePoint : null;
        return {
          ...prev,
          addressId: selected?.id ?? null,
          deliveryDate: keepDate,
          shippingOptionCode: selectedCode,
          servicePoint: keepPoint,
        };
      });
    },
    [t, locale, cartEntries, coupon, shippingOrder],
  );

  // Sepette seçilen adres değişince (başka sekme, hap) anlık görüntü onunla yeniden çözülür;
  // sepet değiştiğinde de: başka sekmede kalem çıkarılmış olabilir ve toplam ile kargo ücreti ona bağlı.
  const selectedAddressId = selectedPlaceAddress?.id ?? null;
  useEffect(() => {
    void refresh(selectedAddressId);
  }, [refresh, selectedAddressId]);

  const selectedAddress = snapshot.addresses.find((a) => a.id === state.addressId) ?? null;

  /**
   * Adres doğrulamasının sonucu; `checkedFor` aynı adres ikinci kez sorulmasın diye sorulan adresi tutar.
   * Sorulsaydı "benim yazdığım doğru" diyen müşteri döngüye girerdi, çünkü ret bir beyandır ve bir kez alınır.
   */
  const [addressNotice, setAddressNotice] = useState<AddressCheckOutcome | null>(null);
  const checkedFor = useRef<string | null>(null);

  /**
   * Doğrulama ödeme yolu seçilince arkada başlar: düğmeye basıldığında cevap hazırdır, müşteri onu beklemez. İstek düşerse
   * sonuç `null` sayılır ve sipariş durmaz; sunucu da servis kesintisinde aynı yolu tutar (`unknown`).
   */
  const pendingCheck = useRef<{ addressId: string; outcome: Promise<AddressCheckOutcome | null> } | null>(null);
  const addressCheckOf = useCallback((addressId: string) => {
    if (pendingCheck.current?.addressId !== addressId) {
      const outcome = checkCheckoutAddressAction(addressId).then(
        (check) => check.data,
        () => null,
      );
      pendingCheck.current = { addressId, outcome };
    }
    return pendingCheck.current.outcome;
  }, []);
  useEffect(() => {
    if (state.addressId && state.paymentMethod) void addressCheckOf(state.addressId);
  }, [state.addressId, state.paymentMethod, addressCheckOf]);

  /**
   * Söylenecek bir şey varsa akış durur; müşteri görür, karar verir, ikinci tıklamada sipariş geçer. `confirmed` ve `unknown`
   * gösterilmez, çünkü "doğrulayamadık" her siparişte görünen ve hiçbir şey söylemeyen bir satır olurdu.
   */
  const addressStops = async (addressId: string): Promise<boolean> => {
    if (checkedFor.current === addressId) return false;
    setBusy(true);
    const outcome = await addressCheckOf(addressId);
    checkedFor.current = addressId;
    setBusy(false);
    if (!outcome || outcome.status === 'confirmed' || outcome.status === 'unknown') return false;
    setAddressNotice(outcome);
    return true;
  };

  /** Kart dışı yollar (kapıda / vadeli): sipariş burada kapanır, sağlayıcıya gidilmez. */
  const confirm = async () => {
    if (!state.addressId || !state.paymentMethod) return;
    if (await addressStops(state.addressId)) return;

    setBusy(true);
    setError(null);
    const { data, errorKey } = await confirmCheckoutAction({
      locale,
      entries: cartEntries,
      addressId: state.addressId,
      deliveryDate: state.deliveryDate,
      paymentMethod: state.paymentMethod,
      onAccount: state.onAccount,
      marketingConsent: state.marketingConsent,
      couponCode: coupon,
      idempotencyKey: attemptKey.current,
      shippingOrder,
      shippingOptionCode: state.shippingOptionCode,
      servicePointId: state.servicePoint?.id ?? null,
      /* Ekranın gösterdiği sepetin imzası sunucudan geldiği gibi geri gider. Sepet iki yüzeyde paylaşıldığı için bu arada
         değiştiyse kapı `cart_changed` ile reddeder ve müşteri yeni özeti görüp onaylar. */
      expectedCartFingerprint: snapshot.summary?.fingerprint ?? null,
    });

    if (errorKey || !data) {
      setBusy(false);
      hapticError();
      return setError(errorText(t.errors, errorKey));
    }
    if (data.status === 'rejected') {
      setBusy(false);
      hapticError();
      return setError(rejectionMessage(t, data.reason, data.detail));
    }
    // Aynı basışın ödemesi işleniyor: yeni sipariş açılmadı, müşteri sonucu o siparişin sayfasında görür.
    if (data.status === 'open_payment') {
      leaveTo(data.orderId);
      return;
    }

    // `busy` açık kalır, yoksa gezinme bitmeden ikinci tıklama gerçek bir ikinci sipariş açabilirdi.
    hapticSuccess();
    leaveTo(data.orderId);
    // Sonraki sipariş AYRI bir istektir: anahtar tazelenir.
    attemptKey.current = newAttemptKey();
  };

  /**
   * Kart yolunda taslağı ve ödemesini açar; anahtar basışın kendisidir, ikinci basış aynı taslağın aynı ödemesine döner.
   */
  const prepare = async (): Promise<
    { ok: true; orderId: string; paymentToken: string; paymentMode: 'sandbox' | 'prod' } | { ok: false; error: string }
  > => {
    // Ret titreşimi tek yerde, yoksa yeni bir ret dalında unutulurdu.
    const refuse = (error: string) => {
      hapticError();
      return { ok: false as const, error };
    };
    if (!state.addressId) return refuse(t.rejected.address_not_found);
    const { data, errorKey } = await confirmCheckoutAction({
      locale,
      entries: cartEntries,
      addressId: state.addressId,
      deliveryDate: state.deliveryDate,
      paymentMethod: 'online',
      marketingConsent: state.marketingConsent,
      couponCode: coupon,
      idempotencyKey: attemptKey.current,
      shippingOrder,
      shippingOptionCode: state.shippingOptionCode,
      servicePointId: state.servicePoint?.id ?? null,
    });
    if (errorKey || !data) return refuse(errorText(t.errors, errorKey));
    if (data.status === 'rejected') return refuse(rejectionMessage(t, data.reason, data.detail));
    // Aynı basışın ödemesi bankada işleniyor: yeni ödeme açılmaz, müşteri o siparişe gider.
    if (data.status === 'open_payment') {
      leaveTo(data.orderId);
      return { ok: false, error: t.payment.openPayment };
    }
    if (data.status !== 'payment_required') return refuse(t.payment.unavailable);
    preparedOrder.current = data.orderId;
    return { ok: true, orderId: data.orderId, paymentToken: data.paymentToken, paymentMode: data.paymentMode };
  };

  /** Adres pencere açılmadan sorulur, çünkü pencere açıldıktan sonra durmak ödemeyi yarıda keserdi. */
  const payByCard = async () => {
    if (!selectedAddress || !state.addressId || (await addressStops(state.addressId))) return;
    setPayStage('preparing');
    const prepared = await prepare();
    if (!prepared.ok) {
      setPayStage(null);
      return setError(prepared.error);
    }
    setPayStage('confirming');
    await openCardPopup({
      token: prepared.paymentToken,
      mode: prepared.paymentMode,
      locale,
      billing: {
        name: customerName,
        email: customer.email,
        phone: customer.phone,
        line1: selectedAddress.line1,
        line2: selectedAddress.line2,
        postalCode: selectedAddress.postalCode,
        city: selectedAddress.city,
        country: selectedAddress.country,
      },
      labels: {
        declined: t.pay.declined,
        insufficientFunds: t.pay.insufficientFunds,
        expiredCard: t.pay.expiredCard,
        incorrectCvv: t.pay.incorrectCvv,
        authentication: t.pay.authentication,
        generic: t.pay.error,
        unavailable: t.payment.unavailable,
      },
      onPaid: () => onCardPaid(prepared.orderId),
      onError: onCardError,
      // Vazgeçmek hata değildir; kalemler taslakta bekler, müşteri siparişin sayfasında öder ya da iptal eder.
      onCancel: () => leaveTo(prepared.orderId),
    });
  };

  /** Siparişin sayfasına gidilir, sonra sepet tazelenir: ters sırada boşalan sepet gezinme bitene kadar kalemsiz bir özet çizerdi. */
  const leaveTo = (orderId: string) => {
    leaving.current = true;
    router.push({ pathname: '/checkout/[reference]', params: { reference: orderId } });
    reloadCart();
  };

  /**
   * Taslak açıldıktan sonra düşen kart ödemesinde kalemler siparişte bekler: müşteri o siparişin sayfasına gider, orada başka
   * kartla öder ya da iptal eder. Taslak açılmadan önceki hata bu ekranda kalır.
   */
  const onCardError = (message: string) => {
    hapticError();
    const orderId = preparedOrder.current;
    if (!orderId) return setError(message);
    rememberPaymentError(orderId, message);
    leaveTo(orderId);
  };

  /** Ödeme geçti: siparişin sayfasına gidilir; onayı webhook ya da sayfanın canlı bağı verir. */
  const onCardPaid = (orderId: string) => {
    hapticSuccess();
    leaveTo(orderId);
    attemptKey.current = newAttemptKey();
  };

  const paymentSlot = state.paymentMethod === 'online' && snapshot.payment ? <CardTrustNote text={t.payment.cardTrust} /> : null;

  const props: CheckoutViewProps = {
    t,
    locale,
    compact: resolved === 'mobile',
    cart: view,
    cartReady,
    cartFailed,
    snapshotReady,
    snapshot,
    state,
    // Ekrana giden "ayrı sipariş mi" SEPETTEN türer, bayraktan değil (`isSeparateOrder` künyesi).
    separateOrder: isSeparateOrder(shippingOrder, view),
    busy: busy || payStage !== null,
    error,
    selectedAddress,
    paymentSlot,
    payStage,
    addressNotice,
    /**
     * Teklif kabulü kaydın kendisini düzeltir ve yalnız kod ile şehir değişir, çünkü `wrong_postal_code` sokağın aynı, kodun farklı
     * olduğu hâldir. Yazım yer bağlamından geçer, çünkü kod değişince site genelindeki bölge, kargo ücreti ve gün de değişir.
     */
    onAcceptAddressFix: async () => {
      if (!selectedAddress || addressNotice?.status !== 'wrong_postal_code') return;
      setBusy(true);
      const result = await saveAddress({
        id: selectedAddress.id,
        fields: {
          label: selectedAddress.label,
          recipient: selectedAddress.recipient,
          line1: selectedAddress.line1,
          line2: selectedAddress.line2,
          postalCode: addressNotice.postalCode,
          city: addressNotice.city,
          phone: selectedAddress.phone,
          country: selectedAddress.country,
        },
        makeDefault: false,
      });
      setBusy(false);
      if (!result.ok) return setError(errorText(t.errors, result.errorKey));
      /* Adres değişti, eski cevap artık bu kaydın değil: soru yeniden sorulur ve cevabı yine arkada hazırlanır. `refresh` şart, çünkü
         kod değişimi bölgeyi, kargo ücretini ve teslim gününü de oynatabilir. */
      checkedFor.current = null;
      pendingCheck.current = null;
      void addressCheckOf(selectedAddress.id);
      setAddressNotice(null);
      void refresh(selectedAddress.id);
    },
    /** Teklif reddedildi — bir vazgeçiş değil bir BEYAN; `geo_alt_label` satırda kalır. */
    onDismissAddressNotice: () => setAddressNotice(null),
    contact: {
      missing: nameMissing,
      name: contactName,
      saving: savingContact,
      error: contactError,
      onChangeName: setContactName,
      onSave: () => void saveContact(),
    },
    onSelectDate: (date) => setState((prev) => ({ ...prev, deliveryDate: date })),
    /* Seçim SUNUCUYA gidiyor: ücret, KDV kırılımı ve toplam ona bağlı ve hiçbiri istemcide
       hesaplanmıyor. Yerel `setState` ile yetinseydik ekran seçili seçeneği gösterir ama toplam
       eski ücretle kalırdı — checkout'un en pahalı çelişkisi. */
    onSelectShipping: (code) => {
      setState((prev) => ({ ...prev, shippingOptionCode: code, servicePoint: null, shippingMode: 'home' }));
      void refresh(state.addressId, code);
    },
    onSelectServicePoint: (point) => {
      setState((prev) => ({ ...prev, shippingOptionCode: point.optionCode, servicePoint: point, shippingMode: 'point' }));
      void refresh(state.addressId, point.optionCode);
    },
    onSelectShippingMode: (mode) => {
      if (mode === 'point') return setState((prev) => ({ ...prev, shippingMode: 'point' }));
      // Noktanın servisi seçiliyken eve dönülürse kod boşaltılır: sunucu eve giden en ucuzu seçer, ücret onunla çözülür.
      const hadPoint = state.servicePoint !== null;
      setState((prev) => ({ ...prev, shippingMode: 'home', servicePoint: null, shippingOptionCode: hadPoint ? null : prev.shippingOptionCode }));
      if (hadPoint) void refresh(state.addressId, null);
    },
    onSelectPayment: (method, onAccount) => {
      setState((prev) => ({ ...prev, paymentMethod: method, onAccount }));
    },
    onToggleConsent: (value) => setState((prev) => ({ ...prev, marketingConsent: value })),
    onToggleTerms: (value) => setState((prev) => ({ ...prev, termsAccepted: value })),
    onConfirm: () => {
      // Düğme koşullar kabul edilmeden kapalı; sipariş yine de kabulsüz açılmasın diye kapı burada da durur.
      if (!state.termsAccepted) return;
      if (state.paymentMethod === 'online') void payByCard();
      else void confirm();
    },
  };

  return resolved === 'mobile' ? <CheckoutMobile {...props} /> : <CheckoutDesktop {...props} />;
}

/**
 * Ret sebebi müşteri diline; stok yarışında kalem adı çözüldüyse adlı cümle, çözülmediyse genel cümle yazılır. Ayrımı ekran yapar,
 * çünkü sebep kodu davranışı ve ölçümü belirler ve onu metnin varlığına göre bölmek aynı gerçeğe iki kod vermek olurdu.
 */
function rejectionMessage(t: Messages, reason: string, detail?: string[] | string): string {
  const list = Array.isArray(detail) ? detail.join(', ') : (detail ?? '');
  const template =
    reason === 'insufficient_stock' && list
      ? t.rejected.insufficient_stock_named
      : reason === 'warehouse_unresolved' && detail === 'outside_zones'
        ? t.rejected.warehouse_outside_zones
        : (t.rejected[reason as keyof typeof t.rejected] ?? t.pay.error);
  return template.replace('{detail}', list);
}
