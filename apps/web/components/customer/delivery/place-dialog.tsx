'use client';

import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { pillInputClass } from '@/components/customer/form/pill-input';
import { PlaceLookupResults, usePlaceLookup } from './place-lookup';
import messages from './place-messages.json';

/**
 * Teslimat yeri penceresi — hapa (K30, mobil web) ya da şeride (K31) tıklayınca açılır. Masaüstü
 * başlığında aynı soru başlığın ALTINDAKİ panelde soruluyor (`PlacePanel`, v1); mantık ikisinde de
 * ortak (`place-lookup`).
 *
 * İki iş yapar: kodu girdirir ve **kapıya teslim ettiğimiz yerleri gösterir**. İkincisi olmadan
 * "kargo" cevabı bir çıkmaz gibi okunuyor; liste "benimki neden yok" sorusunu cevaplıyor.
 *
 * Sonuç cümlesi kısıtı BURADA söylemez ("şu ürün gönderilemez"): pencere sepeti bilmez. Yalnız kuralı
 * söyler — soğuk zincir kargoya verilemez. Hangi kalemin etkilendiğini kısıt bloğu (K32) söyler.
 *
 * **Gönderince KAPANMAZ** (28.07 düzeltmesi): cevap gösterilir, kapatma müşterinin kararıdır
 * ("Tamam", ✕, Escape ya da dışına tıklama) — dördü de paylaşılan `Dialog` kabuğunun sözleşmesi (K3).
 */
interface PlaceDialogProps {
  locale: Locale;
  onClose: () => void;
}

export function PlaceDialog({ locale, onClose }: PlaceDialogProps) {
  const t = messages[locale];
  const state = usePlaceLookup(locale);

  return (
    <Dialog title={t.dialogTitle} closeLabel={t.close} onClose={onClose} maxWidth={460}>
      <p className="font-sans text-note leading-relaxed text-body">{t.dialogBody}</p>

      <div className="flex gap-2.5">
        <input {...state.inputProps} aria-label={t.dialogTitle} className={pillInputClass('min-w-0 flex-1 py-2.5 text-body font-semibold')} />
        <Button size="sm" onClick={() => void state.submit(state.value)} disabled={state.busy} className="!px-5">
          {t.submit}
        </Button>
      </div>

      <PlaceLookupResults state={state} locale={locale} />

      {state.place && (
        <Button variant="secondary" size="sm" fullWidth onClick={onClose}>
          {t.done}
        </Button>
      )}
    </Dialog>
  );
}
