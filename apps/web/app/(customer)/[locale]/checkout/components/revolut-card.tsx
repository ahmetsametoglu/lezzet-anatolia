'use client';

import RevolutCheckout, { type Mode, type RevolutCheckoutError } from '@revolut/checkout';
import type { Locale } from '@lezzet/i18n';
import { Icon } from '@/components/customer/ui/icons';
import { reportClientErrorAction } from '@/lib/observability/report-client-error';

/**
 * Kart ödemesi Revolut'un kendi güvenli penceresinde alınır: kart bilgisi ne sayfamıza ne sunucumuza uğrar ve müşteri ödemeyi kimin
 * aldığını görür. Pencere bir ödeme jetonuyla açılır; jeton "Öde"ye basınca açılan taslağın ödemesinindir.
 */

export type PayStage = 'preparing' | 'confirming';

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

/** Kartın reddinde müşteriye gidecek cümleler; sağlayıcının kendi mesajı İngilizce ve entegrasyon diliyle yazılmış. */
export interface CardErrorLabels {
  declined: string;
  insufficientFunds: string;
  expiredCard: string;
  incorrectCvv: string;
  authentication: string;
  generic: string;
  unavailable: string;
}

/** Sağlayıcının ret türünden müşteri cümlesi; tanınmayan tür genel cümleye düşer. */
function errorMessage(error: RevolutCheckoutError, labels: CardErrorLabels): string {
  switch (error.type) {
    case 'error.declined':
    case 'error.do-not-honour':
      return labels.declined;
    case 'error.insufficient-funds':
      return labels.insufficientFunds;
    case 'error.expired-card':
      return labels.expiredCard;
    case 'error.incorrect-cvv-code':
      return labels.incorrectCvv;
    case 'error.3ds-failed':
      return labels.authentication;
    default:
      return labels.generic;
  }
}

interface CardPopupInput {
  token: string;
  mode: Mode;
  locale: Locale;
  billing: BillingDetails;
  labels: CardErrorLabels;
  onPaid: () => void;
  onError: (message: string) => void;
  /** Müşteri pencereyi kapattı; hata değildir. */
  onCancel: () => void;
}

/** Revolut'un kart penceresini açar; sonuç geri çağrılarla gelir, pencere kapanınca örnek bırakılır. */
export async function openCardPopup(input: CardPopupInput): Promise<void> {
  try {
    const instance = await RevolutCheckout(input.token, input.mode);
    const finish = (then: () => void) => () => {
      instance.destroy();
      then();
    };
    instance.payWithPopup({
      locale: input.locale === 'tr' ? 'tr' : input.locale === 'de' ? 'de' : 'fr',
      name: input.billing.name,
      email: input.billing.email,
      ...(input.billing.phone ? { phone: input.billing.phone } : {}),
      billingAddress: {
        countryCode: input.billing.country.toUpperCase() as 'FR',
        postcode: input.billing.postalCode,
        city: input.billing.city,
        streetLine1: input.billing.line1,
        ...(input.billing.line2 ? { streetLine2: input.billing.line2 } : {}),
      },
      onSuccess: finish(input.onPaid),
      onCancel: finish(input.onCancel),
      onError: (error) => {
        instance.destroy();
        input.onError(errorMessage(error, input.labels));
      },
    });
  } catch (error) {
    // Betik yüklenemedi ya da sağlayıcı jetonu reddetti; müşteri başka yol seçebilsin diye cümle döner, iz ayrıca bırakılır.
    void reportClientErrorAction({
      message: `revolut kart penceresi açılamadı: ${error instanceof Error ? error.message : String(error)}`,
      path: window.location.pathname,
    });
    input.onError(input.labels.unavailable);
  }
}

interface CardTrustNoteProps {
  text: string;
}

/** Kartın nerede girildiğini söyleyen satır; tasarımın ödeme ekranındaki güven notu. */
export function CardTrustNote({ text }: CardTrustNoteProps) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <p className="font-sans text-note leading-relaxed text-muted">{text}</p>
      <p className="flex items-center gap-1.5 font-sans text-note font-semibold text-muted">
        <Icon name="lock" size={13} />
        Powered by <span className="font-bold text-ink">Revolut</span>
      </p>
    </div>
  );
}

const STAGES: readonly PayStage[] = ['preparing', 'confirming'];

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
