'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from './button';
import { CopyIcon } from './icons';

/**
 * Panoya kopyalamanın operasyon yüzeyindeki tek kapısı: yazma, üç hâl ve zamanlayıcı burada, görünüm üç bileşende. Pano izni
 * reddedilebildiği için düğme "kopyalanamadı" der; başarı iddia eden düğme boş bir yapıştırmadan kötüdür.
 */

type CopyState = 'idle' | 'done' | 'failed';

/** Kopyalanacak metin ya da onu tıklama anında getiren fonksiyon; gizli değer sayfaya hiç gelmesin diye ikincisi var. */
type CopySource = string | (() => Promise<string>);

const FEEDBACK_MS = 1600;

/** Safari panoya yazmayı yalnız tıklamanın içinde kabul eder; sunucudan gelecek değer söz olarak verilir ki tıklamayla bağı kopmasın. */
async function writeToClipboard(source: CopySource): Promise<void> {
  if (typeof source === 'string') return navigator.clipboard.writeText(source);
  if (typeof ClipboardItem !== 'undefined') {
    const blob = source().then((text) => new Blob([text], { type: 'text/plain' }));
    return navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
  }
  return navigator.clipboard.writeText(await source());
}

/** Dışa verilmez: kopyalama davranışı bu dosyanın görünümleri dışında yeniden yazılırsa "kopyalanamadı" hâli yine unutulur. */
function useCopy(source: CopySource): { state: CopyState; copy: () => void } {
  const [state, setState] = useState<CopyState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = useCallback(() => {
    void writeToClipboard(source)
      .then(() => setState('done'))
      .catch(() => setState('failed'))
      .finally(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setState('idle'), FEEDBACK_MS);
      });
  }, [source]);

  return { state, copy };
}

interface CopyButtonProps {
  text: string;
  label: string;
  doneLabel?: string;
  fullWidth?: boolean;
}

/** Kopyalamanın kendisi eylem olduğunda (hata referansı, sipariş metni) görünen, etiketli düğme. */
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

interface CopyActionProps {
  text: string;
  label?: string;
}

/** Ortak düğme kabuğundaki ikonlu kopyalama; kendi yerleşimi olan ekranlar için. */
export function CopyAction({ text, label = 'Kopyala' }: CopyActionProps) {
  const { state, copy } = useCopy(text);

  return (
    <Button variant="secondary" size="sm" onClick={copy} className="gap-1.5">
      <CopyIcon />
      {state === 'failed' ? 'Kopyalanamadı' : state === 'done' ? 'Kopyalandı' : label}
    </Button>
  );
}

interface CopyInlineProps {
  text: CopySource;
  /** Kopyalanan şeyin adı; sayfada birden çok kopyalama olduğunda ekran okuyucu hangisine basıldığını bilsin. */
  what: string;
}

/** Metnin yanında duran sessiz ikon; asıl olan metindir, düğme kendini onun önüne koymaz. */
export function CopyInline({ text, what }: CopyInlineProps) {
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
