'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { OpsTone } from '@/components/operation/ui/tone';

/**
 * Çok durumlu anahtar (segment) — Komponent Envanteri O8 (girdi kontrolleri).
 *
 * TEK bilginin ikiden çok değeri için: "Satışta / Pasif / Aday", "%5,5 / %20", "DLC / DDM". İki
 * değerli hâli `Toggle`'dır (yuvarlak ray + topuz); üç ve üstü burada.
 *
 * Biçim envanterdeki segmentin kendisidir: **tek gri ray**, içinde SEÇİLİ olanın altında kayan hap.
 * Önceki `Segment` her seçeneği ayrı çerçeveli buton çiziyordu — üç ayrı düğme gibi okunuyordu, oysa
 * bunlar bir alanın değerleri; "hangisi açık" değil "hangisindeyiz" sorusunun cevabı.
 *
 * SAPMA: envanterdeki hap beyaz dolgulu; burada DOLU RENK (varsayılan olive). Gerekçe iki yönlü —
 * beyaz hap gri rayın üstünde silik kalıyordu, ayrıca palet koyu temada bütünüyle ters çevrildiği için
 * (globals §0.6) "beyaz" orada rayın altına düşüyor, yani seçili olan sönük görünüyordu. Dolu renk iki
 * temada da aynı yönde okunur: `ops-olive` koyuda açılır, üstündeki `ops-card` metin koyulaşır.
 *
 * Seçenek genişlikleri EŞİT (`flex-1 basis-0`): kayan hap tek bir `translateX(i × 100%)` ile yerine
 * oturur, etiket uzunluğu değişince hizalama bozulmaz. Toplam genişliği çağıran verir (`className`).
 *
 * `tone` seçeneğe anlam rengi verir — durum seçicilerinde rozetle AYNI sözlük (bkz. OpsTone), böylece
 * "Aday" formda mavi, önizlemedeki rozette de mavi. Verilmezse olive (marka rengi).
 */
type MultiToggleSize = 'sm' | 'md';

const SIZE: Record<MultiToggleSize, string> = {
  sm: 'py-[6px] text-ops-sm',
  md: 'py-[8px] text-ops-sm',
};

// Seçili hapın dolgusu + üstündeki metin. Her çift İKİ temada da aynı yönde çalışır: dolgu koyu
// temada açılır, `ops-card` metin aynı anda koyulaşır (nötrde tersi: dolgu koyulaşır, `ops-ink` açılır).
const TONE: Record<OpsTone, { fill: string; text: string }> = {
  olive: { fill: 'bg-ops-olive', text: 'text-ops-card' },
  neutral: { fill: 'bg-ops-gray-600', text: 'text-ops-ink' },
  amber: { fill: 'bg-ops-amber', text: 'text-ops-card' },
  red: { fill: 'bg-ops-red', text: 'text-ops-card' },
  slate: { fill: 'bg-ops-slate', text: 'text-ops-slate' },
  blue: { fill: 'bg-ops-blue', text: 'text-ops-card' },
  violet: { fill: 'bg-ops-violet', text: 'text-ops-card' },
};

export interface MultiToggleOption<T extends string> {
  key: T;
  label: string;
  /** Seçiliyken hapın anlam rengi (durum seçicilerinde rozetle aynı sözlük). Yoksa olive. */
  tone?: OpsTone;
  /** Uzun açıklama — kısa etiketin altını dolduran ipucu. */
  title?: string;
  /**
   * Bu seçenek şu an SEÇİLEMEZ — ama görünür kalır (03.08).
   *
   * İhtiyaç talep ekranından geldi: durum geçişlerine motor karar veriyor
   * (`allowedTicketTransitions`) ve çözülmüş bir talepte "İlgileniliyor" tıklanamıyor. Seçeneği
   * GİZLEMEK yanlış olurdu — kontrolün genişliği talebe göre oynar, operatör aynı ekranı her
   * seferinde farklı bulur; kapalı ama görünür bir seçenek ise kuralı da öğretir.
   *
   * Bu alan olmadığı için o ekran bir tur boyunca kendi segmentini ELDEN yazmıştı (ve ok tuşu
   * gezinmesini, roving tabindex'i, kayan hapı kaybetmişti). Ortak komponenti çatallamak yerine
   * yeteneklendirmek doğru olan: eksik olan bir yetenekti, ayrı bir komponent değil.
   */
  disabled?: boolean;
}

interface MultiToggleProps<T extends string> {
  value: T;
  options: Array<MultiToggleOption<T>>;
  onChange: (value: T) => void;
  size?: MultiToggleSize;
  /** Erişilebilirlik adı — görünür etiket yoksa (ör. alt bardaki durum seçicisi) zorunlu sayılır. */
  label?: string;
  className?: string;
}

export function MultiToggle<T extends string>({ value, options, onChange, size = 'md', label, className }: MultiToggleProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.key === value));

  /**
   * Hapın yeri ve genişliği SEÇİLİ DÜĞMEDEN ölçülür.
   *
   * Önceki hâl seçenekleri eşit genişliğe zorluyordu (`flex-1 basis-0`) çünkü hap
   * `translateX(i × 100%)` ile kayıyordu — yani ölçü değil ARİTMETİK. Bedeli: uzun etiket kendi
   * hücresini taşıp komşusunun üstüne biniyordu (kullanıcı bildirimi, 03.08), kısa etiket ise
   * gereksiz yer kaplıyordu. Ölçüm bu bağı kesiyor: düğmeler içeriklerine göre büyüyor, hap
   * onları izliyor.
   *
   * `useLayoutEffect` — boyamadan ÖNCE koşar, yani hap hiçbir karede yanlış yerde görünmez.
   * Ölçüm gelene kadar (ilk sunucu çıktısı) hap saydam; `ResizeObserver` ray genişliği ya da yazı
   * tipi değiştiğinde yeniden ölçüyor.
   */
  const railRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const measure = () => {
      const button = rail.querySelectorAll('button')[index];
      if (!button) return;
      setPill({ left: button.offsetLeft, width: button.offsetWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [index, options]);
  // Hap SEÇİLİ seçeneğin tonunu alır — kayarken rengi de değişir, "hangi durumdayım" tek bakışta.
  const tone = TONE[options[index]?.tone ?? 'olive'];

  // Ok tuşları radiogroup'ta seçimi taşır (ARIA deseni). Odak da taşınmalı — seçili olmayan düğmeler
  // sekme sırasının dışında (roving tabindex), aksi hâlde odak geride kalırdı.
  // Kapalı seçenekler ATLANIR: ok tuşu onların üstünde durursa kontrol kilitlenmiş gibi hissettirir.
  // Döngü en fazla `options.length` adım atar — hepsi kapalıysa olduğu yerde kalır, sonsuza gitmez.
  const moveBy = (container: HTMLElement, delta: number) => {
    for (let step = 1; step <= options.length; step += 1) {
      const next = (index + delta * step + options.length * step) % options.length;
      const target = options[next];
      if (!target || target.disabled) continue;
      onChange(target.key);
      container.querySelectorAll('button')[next]?.focus();
      return;
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
        const fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
        if (!back && !fwd) return;
        e.preventDefault();
        moveBy(e.currentTarget, fwd ? 1 : -1);
      }}
      ref={railRef}
      className={['relative flex rounded-ops-btn border border-ops-gray-300 bg-ops-gray-100 p-[2px]', className].filter(Boolean).join(' ')}
    >
      {/* Kayan hap — yeri ve genişliği SEÇİLİ DÜĞMEDEN ölçülür (aşağıdaki künye). Ölçüm gelmeden
          çizilmez: yanlış yerde bir kare bir kare bile görünmemeli. */}
      <span
        aria-hidden
        className={['absolute bottom-[2px] top-[2px] rounded-md transition-all duration-150', tone.fill, pill ? '' : 'opacity-0'].join(' ')}
        style={pill ?? undefined}
      />
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            disabled={o.disabled}
            onClick={() => onChange(o.key)}
            className={[
              // Genişlik İÇERİKTEN (`flex-none`, `whitespace-nowrap`): etiket ne kadar uzunsa
              // düğme o kadar geniş. Eskiden üçü de eşit genişlikteydi (`flex-1 basis-0`) çünkü
              // kayan hap `translateX(i × 100%)` ile yer değiştiriyordu — ve uzun bir etiket
              // (`İlgileniliyor`) komşusunun ÜSTÜNE biniyordu. Kırpmak (`truncate`) taşmayı
              // durduruyordu ama etiketi de yiyordu ("İlgilen…"); asıl çözüm hapın ÖLÇÜLMESİ.
              'relative z-[1] flex-none whitespace-nowrap rounded-md px-3 text-center font-ops-display font-semibold transition-colors',
              SIZE[size],
              // Kapalı seçenek SOLUK ama okunur: gizlemiyoruz, "şu an olmaz" diyoruz.
              o.disabled ? 'cursor-not-allowed text-ops-faint' : 'cursor-pointer',
              on ? tone.text : o.disabled ? '' : 'text-ops-body hover:text-ops-ink',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
