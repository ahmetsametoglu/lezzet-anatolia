'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { CopyIcon } from './icons';

/**
 * **Panoya kopyalama — operasyon yüzeyinin TEK kapısı.**
 *
 * Beş ayrı yerde beş kez yazılmıştı (`error.tsx` · `stack-block` · `purchase-order-dialog` + iki
 * müşteri ekranı) ve üçü zaten AYRIŞMIŞTI: biri hatayı sessizce yutuyor, biri "kopyalanamadı"
 * diyor, biri iki saniye sonra sıfırlanırken öteki 1,6 saniyede. Aynı işin üç farklı davranışı,
 * kullanıcının aynı düğmeye iki ekranda iki farklı güven duyması demekti (`CLAUDE §1`).
 *
 * ── DAVRANIŞ ORTAK, GÖRÜNÜM DEĞİL ───────────────────────────────────────────
 * Paylaşılan şey `useCopy`: yazma, üç hâl (`idle`/`done`/`failed`), zamanlayıcı ve **temizliği**.
 * Görünüm ikiye ayrılıyor çünkü bağlamlar gerçekten farklı: hata ekranındaki kopyalama bir
 * EYLEMDİR (görünür düğme, etiketli), künyedeki kopyalama bir KOLAYLIKTIR (metnin yanında sessiz
 * bir ikon — kendini metnin önüne koymamalı).
 *
 * ── HATA SESSİZ GEÇMEZ ──────────────────────────────────────────────────────
 * Pano izni reddedilebilir (güvenli olmayan bağlam, tarayıcı ayarı). Düğme "kopyalanamadı" der:
 * **başarı iddia eden bir düğme, boş bir yapıştırmadan daha kötüdür** — kullanıcı panoyu dolu
 * sanıp gider ve eksikliği bir sonraki ekranda, sebebini bilmeden fark eder.
 */

/** Kopyalamanın üç hâli. `failed` ayrı bir hâl: sessizce `idle`a dönmek yalan söylemek olurdu. */
type CopyState = 'idle' | 'done' | 'failed';

/** Geri bildirimin ekranda kalma süresi (ms). Okunacak kadar uzun, unutulacak kadar kısa. */
const FEEDBACK_MS = 1600;

/**
 * Dışa VERİLMİYOR ve bu bir sınır: kopyalama davranışı bu dosyanın üç görünümü üzerinden
 * kullanılır. Hook'u dışarı açmak, dördüncü bir görünümün başka bir dosyada doğmasına ve
 * "kopyalanamadı" hâlini yeniden unutmasına kapı açardı — kapattığımız hatanın aynısı.
 */
function useCopy(text: string): { state: CopyState; copy: () => void } {
  const [state, setState] = useState<CopyState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Komponent geri bildirim penceresi içinde sökülürse zamanlayıcı sahipsiz kalır ve sökülmüş bir
  // komponentin durumunu güncellemeye çalışır. Temizlik ŞART, kolaylık değil.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(() => {
    void navigator.clipboard
      .writeText(text)
      .then(() => setState('done'))
      .catch(() => setState('failed'))
      .finally(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setState('idle'), FEEDBACK_MS);
      });
  }, [text]);

  return { state, copy };
}

interface CopyButtonProps {
  text: string;
  label: string;
  /** Kopyalandıktan sonraki etiket — "Kopyalandı ✓" varsayılan. */
  doneLabel?: string;
  fullWidth?: boolean;
}

/**
 * **Görünür kopyalama düğmesi** — kopyalamanın kendisi bir eylem olduğunda (hata referansı, sipariş
 * metni). Etiket taşır, çünkü buraya gelen kişi tam da bunu aramaktadır.
 */
export function CopyButton({ text, label, doneLabel = 'Kopyalandı ✓', fullWidth = false }: CopyButtonProps) {
  const { state, copy } = useCopy(text);

  return (
    <button
      type="button"
      onClick={copy}
      className={[
        'cursor-pointer rounded-[7px] border px-3 py-1.5 font-ops-display text-ops-xs font-semibold transition-colors',
        state === 'failed'
          ? 'border-ops-red-line bg-ops-red-bg text-ops-red'
          : state === 'done'
            ? 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark'
            : 'border-ops-line-strong bg-ops-white text-ops-strong hover:border-ops-olive',
        fullWidth ? 'w-full py-3' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {state === 'failed' ? 'Kopyalanamadı' : state === 'done' ? doneLabel : label}
    </button>
  );
}

/**
 * **İkonlu kopyalama düğmesi** — ortak kabuğu (`Button`) kullanan hâli. `error.tsx` gibi kendi
 * yerleşimi olan ekranlarda, ikon + etiket birlikte istendiğinde.
 */
export function CopyAction({ text, label = 'Kopyala' }: { text: string; label?: string }) {
  const { state, copy } = useCopy(text);

  return (
    <Button variant="secondary" size="sm" onClick={copy} className="gap-1.5">
      <CopyIcon />
      {state === 'failed' ? 'Kopyalanamadı' : state === 'done' ? 'Kopyalandı' : label}
    </Button>
  );
}

/**
 * **Sessiz kopyalama** — metnin yanında duran ikon. Künye alanları için: depo kodu ve adres sistem
 * DIŞINA elle taşınıyor (`design/pages/admin-depolar.md §2/§7` — belge öneki denetmenin elle
 * yazdığı şey, adres irsaliyeye giriyor).
 *
 * Etiketsiz, çünkü burada asıl olan METİN; düğme kendini onun önüne koymamalı. Erişilebilirlik
 * `aria-label`dan geliyor ve kopyalanan şeyi ADIYLA söylüyor ("Kodu kopyala") — ekran okuyucuda
 * yalnız "Kopyala" duyan kişi, sayfadaki üç kopyalamadan hangisine bastığını bilemezdi.
 */
export function CopyInline({ text, what }: { text: string; what: string }) {
  const { state, copy } = useCopy(text);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${what} kopyala`}
      title={state === 'failed' ? 'Kopyalanamadı' : state === 'done' ? 'Kopyalandı' : `${what} kopyala`}
      className={`cursor-pointer rounded-ops-btn p-0.5 align-middle transition-colors ${
        state === 'failed'
          ? 'text-ops-red'
          : state === 'done'
            ? 'text-ops-olive-dark'
            : 'text-ops-faint hover:bg-ops-subtle hover:text-ops-ink'
      }`}
    >
      <CopyIcon size={11} />
    </button>
  );
}
