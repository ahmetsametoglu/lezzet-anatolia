'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { errorText } from '@/lib/customer-error-text';
import { formatPrice } from '@/lib/storefront/format';
import { redeemPointsAction } from '../actions';
import type { Messages } from '../account-types';

/**
 * Puanı kupona çevirme; eşik üstünde aktif, önce onay penceresi açar çünkü çevirme biriktirilmiş değeri harcar ve geri alınamaz.
 * Kaç puanın harcanacağını istemci söylemez: eylem parametresiz gider, eşiği ve karşılığı motor okur.
 */
interface RedeemPointsProps {
  t: Messages;
  locale: Locale;
  /** Eşik ve karşılık ayardan gelir, ekrana gömülmez. */
  redeem: { minimumPoints: number; valueCents: number };
  enough: boolean;
  compact?: boolean;
}

export function RedeemPoints({ t, locale, redeem, enough, compact = false }: RedeemPointsProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setErrorKey(null);
    const { data, errorKey: failed } = await redeemPointsAction();
    setBusy(false);
    if (!data) return setErrorKey(failed ?? 'unexpected');
    // Kapanış yalnız BAŞARIDA: hata varsa pencere açık kalır ve cümle orada okunur — kapatıp
    // arkadaki sayfaya kırmızı bir satır düşürmek, müşteriyi hatanın kaynağından uzaklaştırırdı.
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        disabled={!enough}
        onClick={() => setOpen(true)}
        className={[
          'rounded-pill font-sans font-bold transition-colors',
          compact ? 'px-3.5 py-2 text-micro' : 'px-4 py-2.5 text-note',
          // Koyu kartın İÇİNDE duruyor: aktif hâli tasarımın açık zeytini, pasif hâli aynı kartın
          // saydam katmanı. Yüzeyin `Button` kiti burada kullanılmıyor çünkü o krem/beyaz zemin
          // için kurulmuş — koyu kart üstünde kendi kontrastını taşımıyor.
          enough
            ? 'cursor-pointer bg-olive-light text-ink hover:bg-cream'
            : 'cursor-not-allowed bg-cream/10 text-cream/45',
        ].join(' ')}
      >
        {t.pointsRedeem}
      </button>

      {/* Diyalog `compact` almaz: mobil dokunma kademesi sayfa düzeyindeki eylemler için, diyalog sınırlı bir yüzeydir. */}
      {open && (
        <Dialog title={t.redeemTitle} onClose={() => setOpen(false)} closeLabel={t.redeemCancel}>
          <div className="flex flex-col gap-3">
            <p className="font-sans text-body-sm leading-relaxed text-body">
              {t.redeemBody
                .replace('{points}', String(redeem.minimumPoints))
                .replace('{amount}', formatPrice(redeem.valueCents, locale))}
            </p>
            {/* Geri alınamazlık AYRI bir satır: onayın asıl sebebi bu ve gövde metninin içinde
                kaybolmamalı. */}
            <p className="font-sans text-note leading-relaxed font-semibold text-ink">{t.redeemNote}</p>

            {errorKey && (
              <p className="font-sans text-note leading-relaxed font-semibold text-terracotta">
                {errorText(t.errors, errorKey)}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" compact={compact} disabled={busy} onClick={() => setOpen(false)}>
                {t.redeemCancel}
              </Button>
              <Button size="sm" compact={compact} disabled={busy} onClick={confirm}>
                {busy ? t.redeemBusy : t.redeemConfirm}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
