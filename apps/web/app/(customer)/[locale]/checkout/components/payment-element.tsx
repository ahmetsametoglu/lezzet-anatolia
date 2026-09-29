'use client';

import { useEffect, useImperativeHandle, useMemo, useState, type ReactNode, type Ref } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { Appearance, Stripe as StripeClient, StripeElementsOptions } from '@stripe/stripe-js';
import type { Locale } from '@lezzet/i18n';
import { Skeleton, SkeletonBlock } from '@/components/customer/ui/skeleton';

/**
 * Sayfa içi kart ödemesi: kart alanları Stripe'ın iframe'inde kalır ve ödeme niyeti ancak onayda doğar (ertelenmiş Elements), böylece
 * açık bırakılan form stok kilitlemez. Önce kart doğrulanır, sonra sipariş açılır, çünkü tersi her yazım hatasında yetim taslak bırakırdı.
 */

export type PayStage = 'validating' | 'preparing' | 'confirming';

/** Kart formunun dışarı açtığı tek iş; onay düğmesi formda değil, kabul bloğunun sonunda durur. */
export interface CardFieldsHandle {
  submit: () => Promise<void>;
}

interface CardPaymentScopeProps {
  /** `null` = müşteri kart yolunu henüz seçmedi; Stripe o zamana kadar ödeme grubu kurmaz. */
  stripe: Promise<StripeClient | null> | null;
  locale: Locale;
  /** `null` = kargo ücreti bilinmiyor; o hâlde sipariş açılmaz. */
  amountCents: number | null;
  children: ReactNode;
}

interface CardFieldsProps {
  ref: Ref<CardFieldsHandle>;
  /** Fatura bilgisi ilk adımda seçilen adresten gelir; Stripe'ın adres formu kapalı olduğu için elle geçer. */
  billing: BillingDetails;
  /**
   * Ödeme sonrası dönülecek adresin gövdesi; sipariş kimliği sonuna `onPrepare` dönünce eklenir, çünkü sipariş o anda doğar ve sabit
   * bir dönüş adresi hangi siparişin gösterileceğini bilemezdi.
   */
  returnUrlBase: string;
  /** Kart geçerliyse çağrılır: taslağı açar, stoğu ayırır, `clientSecret` döndürür. */
  onPrepare: () => Promise<{ ok: true; clientSecret: string; orderId: string } | { ok: false; error: string }>;
  onError: (message: string) => void;
  /** Ödeme turunun aşaması, `null` boşta; düğme yazısı ve ilerleme çubuğu bunu çizer. */
  onStage: (stage: PayStage | null) => void;
  /** Form kart almaya hazır mı; hazır olmadan basılan düğme boş formu doğrulamaya gönderirdi. */
  onReady: (ready: boolean) => void;
  labels: { validating: string; confirming: string; unavailable: string };
}

export interface BillingDetails {
  name: string;
  email: string;
  phone: string | null;
  line1: string;
  line2: string | null;
  postalCode: string;
  city: string;
  country: string;
}

/**
 * Görünüm `globals.css` token'larına eşlenir ve ham renk burada tek istisnadır, çünkü Stripe iframe'i CSS değişkenlerimizi okuyamaz
 * (`ARCHITECTURE_DECISIONS.md`). Her değerin yanında token adı yazılı; palet değişirse burası da değişir.
 */
const APPEARANCE: Appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#5f7a2c', // --color-olive
    colorBackground: '#ffffff', // --color-card
    colorText: '#343b41', // --color-ink
    colorTextSecondary: '#6d7261', // --color-body
    colorTextPlaceholder: '#8a8270', // --color-muted
    colorDanger: '#c25e3a', // --color-terracotta-bright
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSizeBase: '15px',
    fontWeightNormal: '500',
    borderRadius: '12px',
    spacingUnit: '4px',
    spacingGridRow: '14px',
  },
  rules: {
    // Girdiler sepetteki/formdaki kendi girdilerimizle aynı: 1.5px kum kenar, hap değil yumuşak köşe.
    '.Input': {
      border: '1.5px solid #e0d8c2', // --color-sand-300
      backgroundColor: '#ffffff', // --color-card
      boxShadow: 'none',
      padding: '10px 14px',
      color: '#343b41', // --color-ink
    },
    '.Input:focus': {
      borderColor: '#5f7a2c', // --color-olive
      boxShadow: 'none',
      outline: 'none',
    },
    '.Input--invalid': { borderColor: '#c25e3a' }, // --color-terracotta-bright
    '.Label': {
      color: '#6d7261', // --color-body
      fontWeight: '600',
      fontSize: '13px',
      marginBottom: '6px',
    },
    '.Error': { color: '#c25e3a', fontSize: '13px', marginTop: '6px' }, // --color-terracotta-bright
    '.Tab': { border: '1.5px solid #e0d8c2', backgroundColor: '#ffffff', borderRadius: '12px' },
    '.Tab--selected': { borderColor: '#5f7a2c', backgroundColor: '#eef2e2' }, // --color-olive / --color-olive-bg
    '.Block': { backgroundColor: '#f3efe2', border: '1.5px solid #ece5d2', borderRadius: '12px' }, // --sand-50 / --sand-200
  },
};

/** Kart alanı ödeme bölümünde, onay düğmesi kabul bloğunda durur; ikisi aynı Stripe bağlamını paylaşsın diye sağlayıcı ekranı sarar. */
export function CardPaymentScope({ stripe, locale, amountCents, children }: CardPaymentScopeProps) {
  const options = useMemo<StripeElementsOptions>(
    () => ({
      mode: 'payment',
      // Stripe sıfır tutarlı niyeti reddeder; tutar ekranın gösterimidir, çekilecek tutarı sunucu siparişten çözer.
      amount: Math.max(1, amountCents ?? 0),
      currency: 'eur',
      locale,
      // Kart yeterli: Apple/Google Pay de kart yöntemidir. Açık bırakılsaydı sepete uymayan
      // seçenekler (taksit, sonra öde) sekme olarak belirirdi.
      paymentMethodTypes: ['card'],
      paymentMethodCreation: 'manual',
      appearance: APPEARANCE,
    }),
    [amountCents, locale],
  );

  return (
    <Elements stripe={stripe} options={options}>
      {children}
    </Elements>
  );
}

/**
 * Kart alanının iskeleti gelen formun ölçülerini taşır (bir satır kart numarası, altında son kullanma ve CVC), böylece alanlar gelince
 * kutu zıplamaz. Ölçüler `APPEARANCE`ın karşılığıdır: etiket 13px + 6px boşluk, girdi ≈ 40px, satır arası 14px; biri değişirse öteki de.
 */
function CardFieldsSkeleton() {
  const field = (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-3.5 w-24" />
      <SkeletonBlock className="h-10 rounded-soft" />
    </div>
  );
  return (
    <div className="flex flex-col gap-3.5" role="status" aria-busy="true">
      {field}
      <div className="grid grid-cols-2 gap-3.5">
        {field}
        {field}
      </div>
    </div>
  );
}

export function CardFields({ ref, billing, returnUrlBase, onPrepare, onError, onStage, onReady, labels }: CardFieldsProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const usable = ready && !loadFailed && stripe !== null && elements !== null;
  // Form sökülünce (başka ödeme yolu seçildi) düğme hâlâ hazır sanmasın.
  useEffect(() => {
    onReady(usable);
    return () => onReady(false);
  }, [usable, onReady]);

  useImperativeHandle(
    ref,
    () => ({
      submit: async () => {
        if (!stripe || !elements) return;
        // Üç adımın tamamı tek sarmalda: herhangi birinde beklenmedik hata (ağ, entegrasyon) ekranı
        // "işleniyor"da asılı bırakmamalı — müşteri ne olduğunu bilmeden bekler.
        try {
          onStage('validating');
          const validation = await elements.submit();
          if (validation.error) {
            onError(validation.error.message ?? labels.validating);
            onStage(null);
            return;
          }

          onStage('preparing');
          const prepared = await onPrepare();
          if (!prepared.ok) {
            onError(prepared.error);
            onStage(null);
            return;
          }

          onStage('confirming');
          const { error } = await stripe.confirmPayment({
            elements,
            clientSecret: prepared.clientSecret,
            confirmParams: {
              return_url: `${returnUrlBase}/${prepared.orderId}`,
              payment_method_data: {
                billing_details: {
                  name: billing.name,
                  email: billing.email,
                  phone: billing.phone ?? '',
                  address: {
                    line1: billing.line1,
                    line2: billing.line2 ?? '',
                    postal_code: billing.postalCode,
                    city: billing.city,
                    country: billing.country.toUpperCase(),
                    // Fransa'da eyalet yok ama Stripe alanın GEÇMESİNİ istiyor; `undefined`
                    // entegrasyon hatası veriyor, boş dize kabul ediliyor.
                    state: '',
                  },
                },
              },
            },
          });
          // Buraya yalnız HATA hâlinde gelinir: başarılıysa tarayıcı `return_url`'e gitmiştir.
          if (error) {
            onError(error.message ?? labels.confirming);
            onStage(null);
          }
        } catch (err) {
          onError(err instanceof Error ? err.message : labels.confirming);
          onStage(null);
        }
      },
    }),
    [stripe, elements, billing, returnUrlBase, onPrepare, onError, onStage, labels],
  );

  return (
    <div className="flex flex-col gap-4">
      {/**
       * Çerçeve `display:none` ile gizlenmez, çünkü öyle gizlenen iframe kendini ölçemez ve yerleşimini ancak açılınca kurar;
       * `invisible` + `absolute` ile ölçüsünü baştan alır ve akışta yer kaplamadığı için o sırada yüksekliği iskelet belirler.
       */}
      <div className="relative">
        {!ready && !loadFailed && <CardFieldsSkeleton />}
        <div className={ready ? undefined : 'invisible absolute inset-x-0 top-0'}>
          <PaymentElement
            onReady={() => setReady(true)}
            // Yükleme hatası sessiz kalmaz, çünkü Stripe onu yalnız konsola yazar ve iskelet sonsuza kadar dönerdi; ekran başka bir
            // ödeme yolu önerir.
            onLoadError={({ error }) => {
              // Sağlayıcının cümlesi müşteriye GİTMEZ: İngilizce ve entegrasyon diliyle yazılmış.
              // Ekrana yönlendiren bir cevap gider, teknik sebep konsola — teşhisin tek yeri burası.
              console.error('Stripe Payment Element yüklenemedi:', error?.message ?? error);
              setLoadFailed(true);
            }}
            options={{
              layout: 'tabs',
              fields: { billingDetails: 'never' },
              // Link kapalı: "bilgilerimi kaydet" bloğu kendi hesabına davet ediyor ve checkout'un
              // ortasında ikinci bir karar çıkarıyor. Cüzdanlar açık kalır.
              wallets: { applePay: 'auto', googlePay: 'auto', link: 'never' },
            }}
          />
        </div>
      </div>

      {loadFailed && <p className="font-sans text-note leading-relaxed font-semibold text-honey">{labels.unavailable}</p>}
    </div>
  );
}

const STAGES: readonly PayStage[] = ['validating', 'preparing', 'confirming'];

export function PayProgress({ stage }: { stage: PayStage }) {
  const current = STAGES.indexOf(stage);
  return (
    <div aria-live="polite" className="flex gap-1.5">
      {STAGES.map((s, i) => (
        <div key={s} className={['h-1 flex-1 rounded-pill', i <= current ? 'bg-olive' : 'bg-sand-200'].join(' ')} />
      ))}
    </div>
  );
}
