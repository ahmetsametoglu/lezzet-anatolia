'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { pillInputClass } from '@/components/customer/form/pill-input';
import { isValidPostalCode } from '@/lib/delivery/place-types';
import { formatDeliveryDate } from '@/lib/storefront/format';
import { useDeliveryPlace } from './place-context';
import messages from './place-messages.json';

/**
 * Teslimat yeri düzenleme paneli — hapa (K30) ya da şeride (K31) tıklayınca açılır.
 *
 * İki iş yapar: kodu girdirir ve **kapıya teslim ettiğimiz yerleri gösterir**. İkincisi olmadan
 * "kargo" cevabı bir çıkmaz gibi okunuyor; liste "benimki neden yok" sorusunu cevaplıyor ve
 * bölgenin gerçekten var olduğunu gösteriyor.
 *
 * Sonuç cümlesi kısıtı BURADA söylemez ("şu ürün gönderilemez"): panel sepeti bilmez. Yalnız kuralı
 * söyler — soğuk zincir kargoya verilemez. Hangi kalemin etkilendiğini kısıt bloğu (K32) söyler.
 *
 * **Gönderince KAPANMAZ** (28.07 düzeltmesi). Önce kapanıyordu ve panelin bütün amacını boşa
 * çıkarıyordu: müşteri sorusunu soruyor, cevap yazılıyor, ama cevabı okumadan ekran kayboluyordu.
 * Artık cevap gösterilir, kapatma müşterinin kararıdır ("Tamam", ✕, Escape ya da dışına tıklama) —
 * dördü de paylaşılan `Dialog` kabuğunun sözleşmesi (K3).
 */
interface PlaceDialogProps {
  locale: Locale;
  onClose: () => void;
}

export function PlaceDialog({ locale, onClose }: PlaceDialogProps) {
  const t = messages[locale];
  // Bölge listesi BAĞLAMDAN gelir — sayfa açılırken sunucuda okundu. Burada `useEffect` ile
  // çekiliyordu ve panel açıldıktan bir süre SONRA alttan beliriyordu: müşteri "benimki var mı"
  // diye bakarken listenin yarısı henüz yoktu.
  const { place, setPostalCode, clear, zones } = useDeliveryPlace();
  const [value, setValue] = useState(place?.postalCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!isValidPostalCode(value)) {
      setError(t.invalid);
      return;
    }
    setBusy(true);
    const result = await setPostalCode(value);
    setBusy(false);
    // Sonuç artık AYRIK bir hâl (19.16b): `resolved` · `ambiguous` · `unknown` · `unresolved`.
    // BEKLEYEN(19.7): üçü ayrı ekran istiyor — `ambiguous` iki somut yeri seçtiren bir liste
    // (`result.options`, `{country, placeName, inRoute}` taşır), `unresolved` sebebine göre farklı
    // cümle ("oraya gönderemiyoruz" ≠ "kodu çözemedik"). Bugün üçü de tek uyarıya düşüyor; metin
    // `unknown` için zaten doğru ("Bu kod geçerli değil"), ötekiler için eksik.
    setError(result === null || result.kind !== 'resolved' ? t.invalid : null);
  };

  return (
    <Dialog title={t.dialogTitle} closeLabel={t.close} onClose={onClose} maxWidth={460}>
      <p className="font-sans text-note leading-relaxed text-body">{t.dialogBody}</p>

      <div className="flex gap-2.5">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          inputMode="numeric"
          maxLength={5}
          placeholder={t.placeholder}
          aria-label={t.dialogTitle}
          className={pillInputClass('min-w-0 flex-1 py-2.5 text-body font-semibold')}
        />
        <Button size="sm" onClick={() => void submit()} disabled={busy} className="!px-5">
          {t.submit}
        </Button>
      </div>

      {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}

      {/* Temizleme, ait olduğu GİRDİNİN altında: en altta dururken hangi alanı boşalttığı belirsiz
          kalıyordu ve panelin kapanış eyleminin yanına düşüp yanlışlıkla basılmaya açıktı. */}
      {place && (
        <button
          type="button"
          onClick={() => {
            clear();
            setValue('');
          }}
          className="w-max cursor-pointer font-sans text-note font-semibold text-muted underline hover:text-terracotta"
        >
          {t.clear}
        </button>
      )}

      {/* Sonuç: yer çözülmüşse ne anlama geldiği tek cümleyle. Kargo hâli bir HATA gibi
          yazılmaz — kargo da bizim teslimat yolumuz, yalnız soğuk zincir dışarıda kalıyor. */}
      {place && !error && (
        <div
          className={[
            'flex flex-col gap-1 rounded-soft px-4 py-3 font-sans text-note leading-relaxed',
            place.inRoute ? 'bg-olive-bg text-olive-dark' : 'bg-sand-100 text-body',
          ].join(' ')}
        >
          <span>{place.inRoute ? t.resultInRoute : t.resultShipping}</span>
          {place.inRoute && place.nextDate && (
            <span className="font-semibold">{t.nextDate.replace('{date}', formatDeliveryDate(place.nextDate, locale))}</span>
          )}
        </div>
      )}

      {zones.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-sand-100 pt-3">
          <span className="font-sans text-note font-bold text-ink">{t.zonesTitle}</span>
          {zones.map((zone) => (
            <span key={zone.name} className="font-sans text-micro leading-relaxed text-muted">
              <span className="font-semibold text-body">{zone.name}</span> · {zone.postalCodes.join(' · ')}
            </span>
          ))}
        </div>
      )}

      {place && (
        <Button variant="secondary" size="sm" fullWidth onClick={onClose}>
          {t.done}
        </Button>
      )}
    </Dialog>
  );
}
