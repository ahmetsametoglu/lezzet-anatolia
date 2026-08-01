'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * O24 · Stack / bağlam bloğu — uzun teknik metnin tek okuma kabı (18.5).
 *
 * **Satır KIRILMAZ, iki eksende kaydırılır.** Sarmalanan bir stack okunmuyor: `at foo (/a/b/c.ts:44)`
 * ikiye bölününce göz her satırın nerede bittiğini aramak zorunda kalıyor ve kareler birbirine
 * karışıyor. Genişlik `min-w-max` ile içeriğe açılır, kap kaydırır.
 *
 * **Kopyalanabilir olması işlevin parçası:** bu metnin gideceği yer çoğu zaman başka bir pencere.
 * Kopyalandı geri bildirimi 1,6 sn görünür — sessiz bir kopyalama, kopyalanıp kopyalanmadığını
 * bilmemek demek.
 *
 * Üç ölçüde aynı bileşen (`size`): geniş inceleme sütunu · dialog · telefon kartı. Ölçü değişir,
 * davranış değişmez — üç yerde ayrı yazılsalardı biri bir gün sarmalamaya başlardı.
 */
type StackSize = 'wide' | 'dialog' | 'mobile';

const SIZE: Record<StackSize, { box: string; text: string }> = {
  wide: { box: 'min-h-[300px] max-h-[420px] px-4 py-3.5', text: 'text-ops-sm leading-[1.75]' },
  dialog: { box: 'max-h-[220px] px-3.5 py-3', text: 'text-ops-xs leading-[1.7]' },
  mobile: { box: 'max-h-[150px] p-2.5', text: 'text-ops-micro leading-[1.65]' },
};

interface StackBlockProps {
  stack: string | null;
  size?: StackSize;
}

export function StackBlock({ stack, size = 'dialog' }: StackBlockProps) {
  const s = SIZE[size];
  return (
    <div className={`overflow-auto rounded-[9px] border border-ops-gray-300 bg-ops-subtle ${s.box}`}>
      <pre className={`m-0 min-w-max whitespace-pre font-ops-mono text-ops-strong ${s.text}`}>
        {/* Stack YOKSA bunu SÖYLER. Boş bir kutu "yüklenmedi" diye okunur; yokluk da bir bilgidir —
            bazı hatalar (doğrulama, uyarı) gerçekten stack taşımaz. */}
        {stack ?? '— stack kaydı yok —'}
      </pre>
    </div>
  );
}

interface CopyButtonProps {
  text: string;
  label: string;
  /** Kopyalandıktan sonraki etiket — "Kopyalandı ✓" varsayılan. */
  doneLabel?: string;
  fullWidth?: boolean;
}

/** Kopyala düğmesi — panoya yazar ve 1,6 sn "kopyalandı" der. */
export function CopyButton({ text, label, doneLabel = 'Kopyalandı ✓', fullWidth = false }: CopyButtonProps) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const onCopy = () => {
    // Pano izni reddedilebilir (güvenli olmayan bağlam, tarayıcı ayarı). SESSİZ değil: düğme
    // "kopyalanamadı" der — başarı iddia eden bir düğme, boş bir yapıştırmadan daha kötüdür.
    void navigator.clipboard
      .writeText(text)
      .then(() => setDone(true))
      .catch(() => setFailed(true))
      .finally(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          setDone(false);
          setFailed(false);
        }, 1600);
      });
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className={[
        'cursor-pointer rounded-[7px] border px-3 py-1.5 font-ops-display text-ops-xs font-semibold transition-colors',
        failed
          ? 'border-ops-red-line bg-ops-red-bg text-ops-red'
          : done
            ? 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark'
            : 'border-ops-line-strong bg-ops-white text-ops-strong hover:border-ops-olive',
        fullWidth ? 'w-full py-3' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {failed ? 'Kopyalanamadı' : done ? doneLabel : label}
    </button>
  );
}
