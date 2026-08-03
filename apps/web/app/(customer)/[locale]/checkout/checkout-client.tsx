'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
// Router next-intl'in kendisinden: `next/navigation`'ınki dilsiz bir yol üretiyordu
// (`/checkout/<id>`) ve middleware onu her seferinde `/tr/odeme/<id>`'ye 307 ile yönlendiriyordu —
// istemci-taraflı geçiş bir sunucu turuna dönüşüyor, `NEXT_LOCALE` çerezi URL diliyle ayrışırsa
// yanlış dile düşme riski doğuyordu (proje kuralı: `@/i18n/navigation`).
import { useRouter } from '@/i18n/navigation';
import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { useCart } from '@/components/customer/cart/cart-context';
import { entryOf, splitByRoute } from '@/lib/cart/cart-types';
import { clientStripe } from '@/lib/stripe-client';
import { errorText } from '@/lib/customer-error-text';
import { PaymentSection } from './components/payment-element';
import { CheckoutDesktop } from './checkout.desktop';
import { CheckoutMobile } from './checkout.mobile';
import { toAddressFields } from '@/components/customer/delivery/address-form';
import {
  addCheckoutAddressAction,
  confirmCheckoutAction,
  loadCheckoutAction,
  updateCheckoutAddressAction,
  type CheckoutSnapshot,
} from './actions';
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
  /**
   * Sepetin KARGO grubundan açılan ikinci sipariş mi (19.7 · `?group=shipping`).
   *
   * İki şeyi birden belirler: hangi kalemlerin siparişe gireceği ve siparişin TÜRÜ. İkisi ayrı
   * ayrı türetilseydi ayrışabilirlerdi — kalemler kargo grubundan, tür adresten gelirdi ve rota
   * içindeki müşteride ekran "kapıya teslim" derken taslak kargo siparişi açardı.
   */
  shippingOrder: boolean;
  customer: { name: string; email: string; phone: string | null } | null;
}

const EMPTY: CheckoutSnapshot = { addresses: [], delivery: null, payment: null };

/** `crypto.randomUUID` sunucu render'ında da var (Node 19+); yine de eski tarayıcı için yedeği var. */
function newAttemptKey(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`;
}

export function CheckoutClient({ t, locale, device, authenticated, shippingOrder, customer }: CheckoutClientProps) {
  /**
   * Cihaz İSTEMCİDE doğrulanır (03.08 · denetim bulgusu) — sunucunun UA tahmini bir başlangıç
   * değeri, son söz değil. Bu dosya yüzeydeki 13 istemciden **tek**i olarak `device` prop'unu
   * doğrudan okuyordu; tahmin yanılırsa ya da müşteri ekranı döndürürse checkout tek başına yanlış
   * düzende kalıyordu — hem de dönüşümün en pahalı ekranında.
   */
  const resolved = useDevice(device);
  const router = useRouter();
  const { view, ready: cartReady, failed: cartFailed, reload: reloadCart, coupon } = useCart();
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

  /**
   * Bu siparişe girecek kalemler — sepetin TAMAMI değil, **bu grubun** kalemleri (19.7).
   *
   * Kargo checkout'u yalnız kargo grubunu alır; normal checkout ise kargo grubunu DIŞARIDA bırakır.
   * Bırakmasaydı kapıya siparişi, o adrese araçla gidemeyecek kalemleri de taşırdı ve taslak
   * "bu siparişin deposunda karşılanamayan kalem" diye reddederdi — müşteri sepetinde gördüğü
   * kalemin neden siparişe girmediğini ancak ödemeye geçince öğrenirdi.
   *
   * Yol bilinmiyorken (`route === null`: yer sorulmamış ya da satır bir paket) kalem HER ZAMAN ana
   * gruptadır: bilmediğimiz bir satırı asıl akıştan çıkarmak, siparişten sessizce kalem düşürmek
   * olurdu.
   */
  const cartEntries = useMemo(() => {
    const groups = splitByRoute(view.lines);
    return (shippingOrder ? groups.shipping : groups.route).map(entryOf);
  }, [view.lines, shippingOrder]);
  /**
   * Anlık görüntü okumasının SIRA BİLETİ. Sepet bağlamında zaten vardı, burada yoktu: hızlıca A
   * sonra B adresine tıklayan müşteride yanıtlar ters sırada dönerse geç gelen ESKİ cevap yeniyi
   * eziyordu — ekran B'yi seçmişken A'ya geri atlıyor, kargo ücreti ve teslimat günleri o adresin
   * oluyordu (29.07 denetimi). Kilit yerine bilet: arayüz açık kalır, sonuncu okuma kazanır.
   */
  const seq = useRef(0);
  /**
   * Bu checkout denemesinin kimliği — çift sipariş kalkanı (0015).
   *
   * Sayfa monte olurken bir kez üretilir: çift tıklama ve ağın yeniden denemesi AYNI anahtarla
   * gider, sunucu ikinci siparişi açmaz. Sipariş verildikten sonra yenilenir — müşteri geri dönüp
   * ikinci bir sipariş vermek İSTEYEBİLİR ve o artık farklı bir istektir.
   */
  const attemptKey = useRef(newAttemptKey());

  /** Adım verisini tazeler. Seçili adres değiştikçe ve sepet değiştikçe koşar. */
  const refresh = useCallback(
    async (addressId: string | null) => {
      const ticket = ++seq.current;
      const { data, errorKey } = await loadCheckoutAction(locale, cartEntries, addressId, coupon, shippingOrder);
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
        const selected = data.addresses.find((a) => a.id === (addressId ?? prev.addressId)) ?? data.addresses.find((a) => a.isDefault) ?? data.addresses[0];
        // Gün SEÇİMİ korunmaz: adres değişince eski gün başka bölgenin günü olabilir. Tek gün
        // varsa seçim sunulmadığı için o gün doğrudan yazılır — ekran boş seçimle kilitlenmesin.
        const dates = data.delivery?.availableDates ?? [];
        const keepDate = prev.deliveryDate && dates.includes(prev.deliveryDate) ? prev.deliveryDate : (dates.length === 1 ? dates[0]! : null);
        return { ...prev, addressId: selected?.id ?? null, deliveryDate: keepDate };
      });
    },
    [t, locale, cartEntries, coupon, shippingOrder],
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
    });

    if (errorKey || !data) {
      setBusy(false);
      return setError(errorText(t.errors, errorKey));
    }
    if (data.status === 'rejected') {
      setBusy(false);
      return setError(rejectionMessage(t, data.reason, data.detail));
    }

    /**
     * **Önce GİT, sonra sepeti tazele.** Ters sırada yapılıyordu ve ekran gözümüzün önünde
     * sıfırlanıyordu: `reloadCart` sunucudaki (artık boş) sepeti okuyor → `cartEntries` boşalıyor →
     * `refresh` yeniden koşup kalemsiz bir anlık görüntü çekiyordu. Müşteri yönlendirme tamamlanana
     * kadar kalemsiz bir özet ve 0,00 € toplam görüyordu (29.07 denetimi + kullanıcı bildirimi).
     *
     * `busy` de AÇIK bırakılır: yanıt döndükten sonra gezinme bitene kadar düğme yeniden
     * etkinleşiyordu ve sabırsız ikinci tıklama gerçek bir İKİNCİ sipariş açabiliyordu.
     */
    router.push({ pathname: '/checkout/[reference]', params: { reference: data.orderId } });
    reloadCart();
    // Sonraki sipariş AYRI bir istektir: anahtar tazelenir.
    attemptKey.current = newAttemptKey();
  };

  /**
   * Kart yolunda "hazırla" adımı: Stripe formu kartı valide ettikten SONRA çağrılır, taslağı açar
   * ve `clientSecret` döner. Sıra bilinçli — kartını yanlış yazan müşteri için sipariş açılmaz.
   */
  const prepare = async (): Promise<{ ok: true; clientSecret: string; orderId: string } | { ok: false; error: string }> => {
    if (!state.addressId) return { ok: false, error: t.rejected.address_not_found };
    const { data, errorKey } = await confirmCheckoutAction({
      locale,
      entries: cartEntries,
      addressId: state.addressId,
      deliveryDate: state.deliveryDate,
      paymentMethod: 'online',
      marketingConsent: state.marketingConsent,
      couponCode: coupon,
      shippingOrder,
    });
    if (errorKey || !data) return { ok: false, error: errorText(t.errors, errorKey) };
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
            unavailable: t.payment.unavailable,
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
    compact: resolved === 'mobile',
    cart: view,
    cartReady,
    cartFailed,
    snapshotReady,
    snapshot,
    state,
    authenticated,
    shippingOrder,
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
      const { data } = await addCheckoutAddressAction(toAddressFields(input), input.makeDefault ?? false);
      if (data) await refresh(data.id);
    },
    /**
     * Adres düzenleme sonrası TAZELEME ŞART, yalnız listeyi güncellemek yetmez: posta kodu
     * değişmişse teslimat yolu, günleri ve kargo ücreti de değişmiştir — anlık görüntü sunucudan
     * yeniden çözülmeli. `refresh` zaten bileti (`seq`) yönetiyor, yarış açılmıyor.
     */
    onUpdateAddress: async (addressId: string, input: NewAddressInput) => {
      const { data } = await updateCheckoutAddressAction(addressId, toAddressFields(input), input.makeDefault ?? false);
      if (data) await refresh(addressId);
    },
    onConfirm: () => void confirm(),
    // Doğrulama bittiğinde sayfa tazelenir: oturum sunucuda çözülüyor, adımlar oradan açılıyor.
    onVerified: () => router.refresh(),
  };

  return resolved === 'mobile' ? <CheckoutMobile {...props} /> : <CheckoutDesktop {...props} />;
}

/** Ret sebebi → müşteri diline. Sunucu kodu döner, metin ekranın sorumluluğudur. */
function rejectionMessage(t: Messages, reason: string, detail?: string[] | string): string {
  const template = t.rejected[reason as keyof typeof t.rejected] ?? t.pay.error;
  const list = Array.isArray(detail) ? detail.join(', ') : (detail ?? '');
  return template.replace('{detail}', list);
}
