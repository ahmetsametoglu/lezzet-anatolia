'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { useCart } from '@/components/customer/cart/cart-context';
import { isValidPostalCode } from '@/lib/delivery/place-types';
import { useDeliveryPlace } from './place-context';
import messages from './place-messages.json';

/**
 * K31 · Posta Kodu Sorma Şeridi — İKİ bağlamda, iki farklı gerekçeyle.
 *
 * **`home` · anasayfa daveti.** Kahramanın altında ince krem şerit; modal değil, atlanabilir.
 * Alışverişin önüne konan bir soru değil, sunulan bir kolaylık — atlanırsa hiçbir şey kilitlenmez.
 *
 * **`cart` · sepetteki somut soru.** Tasarımda YOKTU ve eklendi (28.07 · kullanıcı geri bildirimi),
 * çünkü mekanizmayı kurup soruyu sonucun doğduğu yere koymamak sorunu çözmüyordu: anasayfaya
 * uğramayan ya da "şimdi değil" diyen müşteri sepete kadar geliyor, sepet susuyor ve duvar yine
 * checkout'ta çıkıyordu. Sepet, checkout'tan önceki SON duraktır.
 *
 * Sepette soru KOŞULLUDUR: yalnız sepette kendi aracımızla gidebilen (kargoya verilemeyen) ürün
 * varsa sorulur. Sepetin tamamı kargolanabilirse kodu bilmenin bu aşamada bir sonucu yok — kargo
 * Fransa'nın her yerine gidiyor, sormak karşılıksız bir soru olurdu.
 *
 * Yer zaten biliniyorsa ya da o bağlamda "şimdi değil" denmişse şerit HİÇ çizilmez.
 */
interface PlacePromptProps {
  locale: Locale;
  /** Hangi soru — metni ve atlama işaretini belirler. */
  scope?: 'home' | 'cart';
}

export function PlacePrompt({ locale, scope = 'home' }: PlacePromptProps) {
  const t = messages[locale];
  const { place, ready, skipped, setPostalCode, skip } = useDeliveryPlace();
  const { view } = useCart();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const restricted = view.lines.filter((l) => !l.shippable && !l.blocked).length;
  if (!ready || place || skipped(scope)) return null;
  if (scope === 'cart' && restricted === 0) return null;

  const submit = async () => {
    if (!isValidPostalCode(value)) return;
    setBusy(true);
    await setPostalCode(value);
    setBusy(false);
  };

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-3.5',
        // Sepetteki soru BAL tonunda: bir sonuca bağlı ve göz ardı edilirse checkout'ta duvara
        // dönüşüyor. Anasayfadaki davet kum tonunda kalır — orada bir sonuç yok, yalnız kolaylık.
        scope === 'cart' ? 'rounded-card border border-honey-line bg-honey-bg' : 'rounded-card bg-sand-100',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-sans text-body font-semibold text-ink">{scope === 'cart' ? t.cartAskTitle : t.promptTitle}</span>
        <span className="font-sans text-note leading-relaxed text-body">
          {scope === 'cart' ? t.cartAskBody.replace('{n}', String(restricted)) : t.promptBody}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-2.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void submit()}
          inputMode="numeric"
          maxLength={5}
          placeholder={t.placeholder}
          aria-label={scope === 'cart' ? t.cartAskTitle : t.promptTitle}
          className="w-28 rounded-pill border-[1.5px] border-sand-300 bg-card px-4 py-2 font-sans text-body-sm font-semibold text-ink outline-none focus:border-olive"
        />
        <Button size="sm" onClick={() => void submit()} disabled={busy} className="!px-5">
          {t.submit}
        </Button>
        <button
          type="button"
          onClick={() => skip(scope)}
          className="cursor-pointer font-sans text-note font-semibold text-muted underline hover:text-ink"
        >
          {t.promptSkip}
        </button>
      </div>
    </div>
  );
}
