'use client';

import { Icon } from '@/components/customer/ui/icons';

/**
 * Kart ödemesi Revolut'un barındırdığı ödeme sayfasında alınır: kart bilgisi ne sayfamıza ne sunucumuza uğrar ve müşteri ödemeyi
 * kimin aldığını görür. Başarılı ödemeden sonra sağlayıcı müşteriyi siparişin sayfasına döndürür.
 */

export type PayStage = 'preparing' | 'confirming';

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
