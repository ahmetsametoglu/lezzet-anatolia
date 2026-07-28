'use client';

import { useState } from 'react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { Appearance, Stripe as StripeClient, StripeElementsOptions } from '@stripe/stripe-js';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Skeleton } from '@/components/customer/ui/skeleton';
import { formatPrice } from '@/lib/storefront/format';

/**
 * Sayfa içi kart ödemesi (08.13). Kart alanları **Stripe'ın kendi iframe'inde** yaşar: numara ne
 * sunucumuza ne de istemci kodumuza uğrar, PCI kapsamı barındırılan Checkout ile aynı kalır.
 * Kazanılan şey müşterinin siteden hiç çıkmaması.
 *
 * **Ertelenmiş Elements** (`mode: 'payment'`, `clientSecret` YOK): form açılışta monte olur ama
 * ödeme niyeti YARATILMAZ. Niyet ancak "Siparişi onayla"ya basınca doğar — yani stok ayırma ile
 * ödeme arasındaki mesafe dakikalar değil saniyelerdir. Müşteri formu bir saat açık bıraksa bile
 * ortada kilitlenmiş mal olmaz.
 *
 * Sıra bilinçli: **önce kart valide edilir, sonra sipariş açılır.** `elements.submit()` sağlayıcıya
 * gitmeden alanları kontrol eder; kartını yanlış yazan müşteri için taslak sipariş açılmaz, stok
 * ayrılmaz. Tersi, her yazım hatasında ardında yetim taslak bırakırdı.
 *
 * **Adres iki kez sorulmaz:** `fields.billingDetails: 'never'` ile Stripe'ın kendi adres formu
 * kapatılır, 1. adımda seçilen adres `confirmPayment`'a elle geçer.
 */
interface PaymentSectionProps {
  stripe: Promise<StripeClient | null>;
  locale: Locale;
  amountCents: number;
  /** Fatura bilgisi — 1. adımda seçilen adresten. Stripe'ın formu kapalı olduğu için elle gider. */
  billing: BillingDetails;
  /**
   * Ödeme sonrası dönülecek adresin GÖVDESİ; sipariş kimliği sonuna eklenir.
   *
   * Adres ancak `onPrepare` dönünce tamamlanabiliyor — sipariş o anda doğuyor. Sabit bir "bekliyor"
   * adresine dönmek, dönüş sayfasının hangi siparişi göstereceğini bilmemesi demekti (ve o yol
   * `[reference]` rotasıyla çakışırdı).
   */
  returnUrlBase: string;
  /** Kart geçerliyse çağrılır: taslağı açar, stoğu ayırır, `clientSecret` döndürür. */
  onPrepare: () => Promise<{ ok: true; clientSecret: string; orderId: string } | { ok: false; error: string }>;
  onError: (message: string) => void;
  disabled: boolean;
  labels: { submit: string; validating: string; preparing: string; confirming: string; secureBy: string; secureNote: string };
}

interface BillingDetails {
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
 * Görünüm `globals.css` token'larına eşlenir. **Ham renk burada MEŞRUDUR ve tek istisnadır**
 * (kullanıcı onaylı, 28.07): Stripe iframe'i bizim CSS değişkenlerimizi okuyamaz, `var(--color-…)`
 * orada çözülmez. Her değerin yanında token adı yazılıdır — palet değişirse burası da değişir.
 * → `ARCHITECTURE_DECISIONS.md`
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

export function PaymentSection(props: PaymentSectionProps) {
  const options: StripeElementsOptions = {
    mode: 'payment',
    // Stripe sıfır tutarlı niyeti reddeder; alt sınır zaten `minBasket` ile korunuyor, bu yalnız
    // ekranın toplam hesaplanmadan monte olduğu ilk kareyi güvene alır.
    amount: Math.max(1, props.amountCents),
    currency: 'eur',
    locale: props.locale,
    // Kart yeterli: Apple/Google Pay de kart yöntemidir. Açık bırakılsaydı sepete uymayan
    // seçenekler (taksit, sonra öde) sekme olarak belirirdi.
    paymentMethodTypes: ['card'],
    paymentMethodCreation: 'manual',
    appearance: APPEARANCE,
  };

  return (
    <Elements stripe={props.stripe} options={options}>
      <PayForm {...props} />
    </Elements>
  );
}

type Stage = 'idle' | 'validating' | 'preparing' | 'confirming';

function PayForm({ locale, amountCents, billing, returnUrlBase, onPrepare, onError, disabled, labels }: PaymentSectionProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [stage, setStage] = useState<Stage>('idle');
  const [ready, setReady] = useState(false);
  const busy = stage !== 'idle';

  const submit = async () => {
    if (!stripe || !elements || disabled) return;
    // Üç adımın tamamı tek sarmalda: herhangi birinde beklenmedik hata (ağ, entegrasyon) ekranı
    // "işleniyor"da asılı bırakmamalı — müşteri ne olduğunu bilmeden bekler.
    try {
      setStage('validating');
      const validation = await elements.submit();
      if (validation.error) {
        onError(validation.error.message ?? labels.validating);
        setStage('idle');
        return;
      }

      setStage('preparing');
      const prepared = await onPrepare();
      if (!prepared.ok) {
        onError(prepared.error);
        setStage('idle');
        return;
      }

      setStage('confirming');
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
        setStage('idle');
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : labels.confirming);
      setStage('idle');
    }
  };

  const stageLabel = stage === 'validating' ? labels.validating : stage === 'preparing' ? labels.preparing : labels.confirming;

  return (
    <div className="flex flex-col gap-4">
      {/**
       * GÜVENCE ALANIN ÜSTÜNDE, altında değil: müşteri kart numarasını yazmadan ÖNCE nereye
       * yazdığını bilmeli. Altta dursaydı okuduğunda karar çoktan verilmiş olurdu.
       *
       * Sağlayıcı ADIYLA anılıyor ("Stripe"): tanınan bir ad, "güvenli ödeme" gibi kimsenin
       * doğrulayamadığı bir slogandan daha çok güven verir. Cümle de bir vaat değil, bir olgu —
       * alan gerçekten Stripe'ın kendi çerçevesinde açılıyor ve kart numarası bu sayfaya hiç
       * girmiyor (ADR Sapma 6).
       */}
      <div className="flex flex-col gap-1 rounded-soft bg-sand-50 px-4 py-3">
        <span className="font-sans text-note font-semibold text-body">🔒 {labels.secureBy}</span>
        <span className="font-sans text-micro leading-relaxed text-muted">{labels.secureNote}</span>
      </div>

      {/* Alan Stripe'tan yükleniyor: boş bırakmak yerine iskelet — gelen çerçeveyle aynı yeri
          kaplar, kutu sonradan belirince sayfa zıplamaz (ortak primitif). */}
      {!ready && <Skeleton className="h-40 rounded-card" />}
      <div style={{ display: ready ? 'block' : 'none' }}>
        <PaymentElement
          onReady={() => setReady(true)}
          options={{
            layout: 'tabs',
            fields: { billingDetails: 'never' },
            // Link kapalı: "bilgilerimi kaydet" bloğu kendi hesabına davet ediyor ve checkout'un
            // ortasında ikinci bir karar çıkarıyor. Cüzdanlar açık kalır.
            wallets: { applePay: 'auto', googlePay: 'auto', link: 'never' },
          }}
        />
      </div>

      <Button size="md" fullWidth onClick={() => void submit()} disabled={!stripe || busy || disabled}>
        {busy ? stageLabel : `${labels.submit} · ${formatPrice(amountCents, locale)}`}
      </Button>

      {busy && (
        <div aria-live="polite" className="flex gap-1.5">
          {(['validating', 'preparing', 'confirming'] as const).map((s, i) => {
            const current = ['validating', 'preparing', 'confirming'].indexOf(stage);
            return <div key={s} className={['h-1 flex-1 rounded-pill', i <= current ? 'bg-olive' : 'bg-sand-200'].join(' ')} />;
          })}
        </div>
      )}
    </div>
  );
}
