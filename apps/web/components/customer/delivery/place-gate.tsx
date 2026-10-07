'use client';

import type { Locale } from '@lezzet/i18n';
import { buttonClass } from '@/components/customer/ui/button';
import { useDeliveryPlace } from './place-context';
import messages from './place-messages.json';

/**
 * Rota-only üründe yer bilinmiyorken "Sepete ekle" doğrulanamayan bir iddia olur; soru müşterinin ürünü istediği anda sorulur, fiyat
 * ise gizlenmez çünkü yere göre değişmez. Soru başlıktaki tek yer kapısını açar: ayrı bir posta kodu girdisi aynı doğrulamayı ikinci
 * bir yerde bakıma bırakırdı.
 */
interface PlaceGateProps {
  locale: Locale;
}

export function PlaceGate({ locale }: PlaceGateProps) {
  const t = messages[locale];
  const { setPanelOpen } = useDeliveryPlace();

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className={buttonClass({
          variant: 'primary',
          size: 'lg',
          fullWidth: true,
          className: 'border-2 border-transparent !px-4 !py-3 leading-tight whitespace-nowrap',
        })}
      >
        {t.gateCta}
      </button>
      <span className="font-sans text-micro leading-relaxed text-muted">{t.gateHint}</span>
    </div>
  );
}
