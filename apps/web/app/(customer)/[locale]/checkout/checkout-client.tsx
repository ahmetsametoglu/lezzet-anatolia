'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useCart } from '@/components/customer/cart/cart-context';
import { entryOf } from '@/lib/cart/cart-types';
import { clientStripe } from '@/lib/stripe-client';
import { PaymentSection } from './components/payment-element';
import { CheckoutDesktop } from './checkout.desktop';
import { CheckoutMobile } from './checkout.mobile';
import { addCheckoutAddressAction, confirmCheckoutAction, loadCheckoutAction, type CheckoutSnapshot } from './actions';
import type { CheckoutState, CheckoutViewProps, Messages, NewAddressInput } from './checkout-types';

/**
 * Checkout'un karar merkezi (08.13) — durum ve sunucu turları burada, yerleşim iki ekran dosyasında.
 *
 * **Adres değişince her şey yeniden çözülür.** Teslimat türü, uygun günler, kargo ücreti, açık
 * ödeme yöntemleri ve toplam — hepsi adresin cevabı. Bunları istemcide türetmek, sunucunun
 * kuralıyla ekranın kuralının ayrışabildiği ikinci bir kaynak yaratırdı.
 */
interface CheckoutClientProps {
  t: Messages;
  locale: Locale;
  device: Device;
  authenticated: boolean;
  customer: { name: string; email: string; phone: string | null } | null;
}

const EMPTY: CheckoutSnapshot = { addresses: [], delivery: null, payment: null };

export function CheckoutClient({ t, locale, device, authenticated, customer }: CheckoutClientProps) {
  const router = useRouter();
  const { view, ready: cartReady, reload: reloadCart } = useCart();
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot>(EMPTY);
  const [state, setState] = useState<CheckoutState>({
    addressId: null,
    deliveryDate: null,
    paymentMethod: null,
    onAccount: false,
    marketingConsent: false,
  });
  const [busy, setBusy] = useState(false);
  const [snapshotReady, setSnapshotReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cartEntries = useMemo(() => view.lines.map(entryOf), [view.lines]);

  /** Adım verisini tazeler. Seçili adres değiştikçe ve sepet değiştikçe koşar. */
  const refresh = useCallback(
    async (addressId: string | null) => {
      const { data, error: failure } = await loadCheckoutAction(locale, cartEntries, addressId);
      // Okuma düşse de bayrak kalkar: sonsuza kadar iskelet göstermek, hatayı gizlemenin bir
      // başka biçimi olurdu — ekran hata satırını gösterebilmeli.
      setSnapshotReady(true);
      if (failure || !data) {
        setError(failure);
        return;
      }
      setSnapshot(data);
      setState((prev) => {
        const selected = data.addresses.find((a) => a.id === (addressId ?? prev.addressId)) ?? data.addresses.find((a) => a.isDefault) ?? data.addresses[0];
        // Gün SEÇİMİ korunmaz: adres değişince eski gün başka bölgenin günü olabilir. Tek gün
        // varsa seçim sunulmadığı için o gün doğrudan yazılır — ekran boş seçimle kilitlenmesin.
        const dates = data.delivery?.availableDates ?? [];
        const keepDate = prev.deliveryDate && dates.includes(prev.deliveryDate) ? prev.deliveryDate : (dates.length === 1 ? dates[0]! : null);
        return { ...prev, addressId: selected?.id ?? null, deliveryDate: keepDate };
      });
    },
    [locale, cartEntries],
  );

  useEffect(() => {
    if (!authenticated) return;
    void refresh(null);
    // Sepet değiştiğinde de tazelenmeli: başka sekmede kalem çıkarılmış olabilir ve toplam
    // ile kargo ücreti ona bağlı.
  }, [authenticated, refresh]);

  const selectedAddress = snapshot.addresses.find((a) => a.id === state.addressId) ?? null;

  /** Kart dışı yollar (kapıda / vadeli): sipariş burada kapanır, sağlayıcıya gidilmez. */
  const confirm = async () => {
    if (!state.addressId || !state.paymentMethod) return;
    setBusy(true);
    setError(null);
    const { data, error: failure } = await confirmCheckoutAction({
      locale,
      entries: cartEntries,
      addressId: state.addressId,
      deliveryDate: state.deliveryDate,
      paymentMethod: state.paymentMethod,
      onAccount: state.onAccount,
      marketingConsent: state.marketingConsent,
    });
    setBusy(false);

    if (failure || !data) return setError(failure);
    if (data.status === 'rejected') return setError(rejectionMessage(t, data.reason, data.detail));
    // Sipariş kesinleşti: sunucudaki sepet boşaldı, ekrandaki sayaç da onu görmeli. Tazelemeden
    // gidilirse müşteri onay sayfasında başlıkta hâlâ dolu bir sepet rozeti görüyordu.
    reloadCart();
    router.push(`/checkout/${data.orderId}`);
  };

  /**
   * Kart yolunda "hazırla" adımı: Stripe formu kartı valide ettikten SONRA çağrılır, taslağı açar
   * ve `clientSecret` döner. Sıra bilinçli — kartını yanlış yazan müşteri için sipariş açılmaz.
   */
  const prepare = async (): Promise<{ ok: true; clientSecret: string; orderId: string } | { ok: false; error: string }> => {
    if (!state.addressId) return { ok: false, error: t.rejected.address_not_found };
    const { data, error: failure } = await confirmCheckoutAction({
      locale,
      entries: cartEntries,
      addressId: state.addressId,
      deliveryDate: state.deliveryDate,
      paymentMethod: 'online',
      marketingConsent: state.marketingConsent,
    });
    if (failure || !data) return { ok: false, error: failure ?? t.pay.error };
    if (data.status === 'rejected') return { ok: false, error: rejectionMessage(t, data.reason, data.detail) };
    if (data.status !== 'payment_required') return { ok: false, error: t.payment.unavailable };
    return { ok: true, clientSecret: data.clientSecret, orderId: data.orderId };
  };

  const stripe = clientStripe();
  // `window` sunucu render'ında yok; adres ilk karede boş kalır, form zaten istemcide monte
  // olduktan sonra kullanılıyor. Sipariş kimliği sonuna Stripe onayı verilirken eklenir.
  const returnUrlBase = typeof window === 'undefined' ? '' : `${window.location.origin}/${locale}/checkout`;
  const paymentSlot =
    state.paymentMethod === 'online' && snapshot.payment && selectedAddress && customer ? (
      stripe ? (
        <PaymentSection
          stripe={stripe}
          locale={locale}
          amountCents={snapshot.payment.orderTotalCents}
          billing={{
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            line1: selectedAddress.line1,
            line2: selectedAddress.line2,
            postalCode: selectedAddress.postalCode,
            city: selectedAddress.city,
            country: selectedAddress.country,
          }}
          // Dönüş adresi 3-D Secure için: banka doğrulaması müşteriyi götürüp geri getirebiliyor.
          returnUrlBase={returnUrlBase}
          onPrepare={prepare}
          onError={setError}
          disabled={busy || !snapshot.payment.minBasketOk || Boolean(snapshot.delivery?.blocked)}
          labels={{
            submit: t.summary.submit,
            validating: t.pay.validating,
            preparing: t.pay.preparing,
            confirming: t.pay.confirming,
            secureBy: t.pay.secureBy,
          }}
        />
      ) : (
        // Anahtar yok: sessiz başarısızlık yerine açık cevap — kapıda ödeme hâlâ seçilebilir.
        <p className="font-sans text-note leading-relaxed font-semibold text-honey">{t.payment.unavailable}</p>
      )
    ) : null;

  const props: CheckoutViewProps = {
    t,
    locale,
    compact: device === 'mobile',
    cart: view,
    cartReady,
    snapshotReady,
    snapshot,
    state,
    authenticated,
    customerEmail: customer?.email ?? '',
    busy,
    error,
    selectedAddress,
    paymentSlot,
    onSelectAddress: (id) => void refresh(id),
    onSelectDate: (date) => setState((prev) => ({ ...prev, deliveryDate: date })),
    onSelectPayment: (method, onAccount) => setState((prev) => ({ ...prev, paymentMethod: method, onAccount })),
    onToggleConsent: (value) => setState((prev) => ({ ...prev, marketingConsent: value })),
    onAddAddress: async (input: NewAddressInput) => {
      const { data } = await addCheckoutAddressAction(input);
      if (data) await refresh(data.id);
    },
    onConfirm: () => void confirm(),
    // Doğrulama bittiğinde sayfa tazelenir: oturum sunucuda çözülüyor, adımlar oradan açılıyor.
    onVerified: () => router.refresh(),
  };

  return device === 'mobile' ? <CheckoutMobile {...props} /> : <CheckoutDesktop {...props} />;
}

/** Ret sebebi → müşteri diline. Sunucu kodu döner, metin ekranın sorumluluğudur. */
function rejectionMessage(t: Messages, reason: string, detail?: string[] | string): string {
  const template = t.rejected[reason as keyof typeof t.rejected] ?? t.pay.error;
  const list = Array.isArray(detail) ? detail.join(', ') : (detail ?? '');
  return template.replace('{detail}', list);
}
