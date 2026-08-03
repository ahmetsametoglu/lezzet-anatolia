'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * TELEFONDA alttan açılan tabaka — `Dialog`'un (O9) mobil kardeşi.
 *
 * ── NEDEN ORTAK BİR KOMPONENT ────────────────────────────────────────────────
 * İki ekran aynı kalıbı birbirinden habersiz kurmuştu (denetim, 03.08): ürün listesi ve talepler.
 * Aynı şeyin iki kopyası olmakla kalmıyor, **ayrışmışlardı** da — biri `z-50` öteki `z-40`, biri
 * `rounded-t-ops-dialog` token'ı öteki ham `rounded-t-[20px]`, tutamaklar farklı ölçüde. Üçüncü
 * kopya yazılmadan tek yere alındı; envanterde bu öğenin numarası da yoktu, bu dosya o tanımdır.
 *
 * ── NEDEN `Dialog` DEĞİL ─────────────────────────────────────────────────────
 * `Dialog` ortalanmış bir panel: telefonda ekranın ortasında duran, iki yanında boşluk olan bir
 * kutu. Alt tabaka ise başparmağın olduğu yerden açılır ve genişliği tamdır. İkisini tek bileşene
 * sıkıştırmak, "mobilde şu, masaüstünde bu" diye dallanan bir kabuk üretirdi — cihaz forkunun
 * (Sapma 3) tam olarak kaçındığı şey.
 *
 * ── KAPANMA ÜÇ YOLDAN ────────────────────────────────────────────────────────
 * Örtüye dokunma · tutamağa dokunma · Esc. Üçü de olmalı: tutamak bir İPUCUDUR, tek çıkış yolu
 * olamaz; Esc de telefona klavye takılıysa (tablet + klavye, dükkândaki kurulum) çalışan tek yol.
 */

interface BottomSheetProps {
  onClose: () => void;
  /** Ekran okuyucu için tabakanın adı — görünür başlık `children` içinde olabilir. */
  label: string;
  /**
   * Gövde kendi kaydırmasını mı yönetiyor? Uzun içerik (yazışma) için `true`: tabaka yüksekliği
   * sabitlenir ve kaydırma içeride olur. Kısa içerik (ürün hızlı bakış) için `false` — tabaka
   * içeriği kadar yüksektir, boş yer kaplamaz.
   */
  scrollable?: boolean;
  children: ReactNode;
}

export function BottomSheet({ onClose, label, scrollable = false, children }: BottomSheetProps) {
  // `Dialog`'un yığın mantığı burada gerekmiyor (tabaka üst üste açılmıyor), ama Esc yine de
  // dinlenir — kapanmanın üçüncü yolu.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex flex-col justify-end bg-ops-scrim">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className={[
          'rounded-t-ops-dialog border-t border-ops-line bg-ops-card',
          scrollable ? 'flex max-h-[92vh] min-h-0 flex-col overflow-hidden' : 'flex flex-col gap-3.5 p-4',
        ].join(' ')}
      >
        <button type="button" onClick={onClose} aria-label={`${label} — kapat`} className="flex cursor-pointer justify-center py-2.5">
          <span className="h-1.5 w-10 rounded-full bg-ops-gray-500" />
        </button>
        {children}
      </div>
    </div>
  );
}
