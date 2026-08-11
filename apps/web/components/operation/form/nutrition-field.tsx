'use client';

import type { ReactNode } from 'react';
import { EMPTY_NUTRITION, NUTRITION_KEYS, NUTRITION_LABELS, type Nutrition } from '@lezzet/types';
import { FieldShell } from './field-shell';
import { Input } from './input';

/**
 * Besin değerleri (INCO) — **form kütüphanesinden bağımsız çekirdek.**
 *
 * Değer `Nutrition`, sahibi çağırandır: RHF formu `FormNutrition` ile sarar, `useState` ile çalışan
 * ekran (asistan kuyruğunun ürün gövdesi) doğrudan bunu kullanır. Ayrım `LocalizedTextField`'da bir
 * kez verilmişti ve gerekçesi aynı: çekirdek RHF'ye bağlı kalırsa, RHF kullanmayan ekran alanı ham
 * `Input`larla yeniden kurar — ve o kopya kJ↔kcal çevrimini, "0 bir beyandır" ayrımını, satırların
 * yasal sırasını bir gün kaybeder.
 *
 * ── SABİT SEKİZ KALEM, 100 g BAŞINA ─────────────────────────────────────────
 * Serbest anahtar yok: satır adları burada, veride değil; sıra yasaldır ve müşteri tablosu da aynı
 * sırayı izler.
 *
 * Neden ortak `Table` DEĞİL: tablo bileşeni bir VERİ LİSTESİ için tasarlandı (değişken satır sayısı,
 * tıklanabilir satır, kaydırılan gövde). Burada satırlar sabit, tıklanmıyor ve asıl mesele girdilerin
 * hizası. Ayrıca tablo düzeni beyanın YAPISINI gizliyordu: "doymuş yağ" yağın, "şeker" karbonhidratın
 * içindeki miktardır — bunlar bağımsız satır değil, alt kalemdir.
 *
 * Hizanın kaynağı: her satırın DEĞER SÜTUNU aynı genişlikte ve içerik sağa yaslı → tek girdili satırın
 * kutusu, enerji satırındaki SON kutuyla aynı dikey çizgide biter. Genişlik sarmalayıcı div'den gelir,
 * girdinin kendi sınıfından değil: ortak kontrol sınıfı `w-full` taşıyor ve `w-[…]` onu ezmiyordu —
 * girdiler sütunu doldurup etiketi kırpıyordu.
 *
 * Enerji TEK satırda iki birimle: kJ ve kcal ayrı kalem değil, aynı ölçünün iki yazımıdır. Alt alta
 * iki "Enerji" satırı tekrar gibi görünüyordu. kcal boşsa kJ'den hesaplanabilir (INCO çevrim katsayısı).
 *
 * Boş bırakılan kalem `null` = "bilinmiyor" → müşteri tablosunda o satır hiç gösterilmez. Sıfır ile boş
 * AYRI şeydir (0 g tuz bir beyandır), bu yüzden boş string null'a çevrilir, 0'a değil.
 */

/** INCO çevrim katsayısı: 1 kcal = 4,184 kJ. */
const KJ_PER_KCAL = 4.184;

// Görünen adlar şemanın yanında, tek yerde (`NUTRITION_LABELS`) — asistan kuyruğunun önizlemesi de
// aynı satır adlarını okuyor. Burada yalnız kısa bir ad kısayolu tutuluyor.
const LABELS = Object.fromEntries(
  NUTRITION_KEYS.map((k) => [k, NUTRITION_LABELS[k].label]),
) as Record<keyof Nutrition, string>;

interface NutritionFieldProps {
  value: Nutrition | null;
  onChange: (value: Nutrition) => void;
  onBlur?: () => void;
  disabled?: boolean;
  /** Alanın kendi başlığı — `false` verilirse kabuk çizilmez (çağıran kendi başlığını kurar). */
  shell?: boolean;
}

export function NutritionField({ value, onChange, onBlur, disabled = false, shell = true }: NutritionFieldProps) {
  const current: Nutrition = value ?? EMPTY_NUTRITION;
  const write = (patch: Partial<Nutrition>) => onChange({ ...current, ...patch });

  const parse = (raw: string): number | null => {
    const t = raw.trim().replace(',', '.'); // TR klavyede ondalık virgülle yazılır
    if (t === '') return null;
    const n = Number(t);
    return Number.isNaN(n) ? null : n;
  };

  // Girdi + birim ikilisi. Genişlik SARMALAYICIDA (girdinin `w-full`'ünü ezmeye çalışmak yerine).
  const cell = (k: keyof Nutrition, unit: string) => (
    <div className="flex flex-none items-center gap-1.5">
      <div className="w-[86px]">
        <Input
          inputSize="sm"
          mono
          inputMode="decimal"
          aria-label={`${LABELS[k]} (${unit})`}
          value={current[k] ?? ''}
          onChange={(e) => write({ [k]: parse(e.target.value) })}
          onBlur={onBlur}
          disabled={disabled}
          placeholder="—"
          className="text-right"
        />
      </div>
      <span className="w-[26px] font-ops-mono text-ops-micro text-ops-faint">{unit}</span>
    </div>
  );

  // Değer sütunu HER satırda aynı genişlikte (iki ikili sığacak kadar) ve içerik SAĞA yaslı →
  // tek girdili satırlar enerji satırının son kutusuyla hizalanır. Etiket sütunu hiç ezilmez.
  const row = (label: ReactNode, right: ReactNode, sub = false) => (
    <div className="grid grid-cols-[minmax(0,1fr)_244px] items-center gap-3 py-[2px]">
      <span className={`truncate font-ops-body text-ops-sm ${sub ? 'pl-3.5 text-ops-muted' : 'text-ops-body'}`}>{label}</span>
      <div className="flex items-center justify-end gap-2">{right}</div>
    </div>
  );

  // kcal boş ve kJ doluysa çevrim önerilir — operatör iki değeri elle hesaplamasın (yuvarlama
  // hatası yasal beyanda hata demektir). Tersi de geçerli.
  const kj = current.energyKj;
  const kcal = current.energyKcal;
  const convert =
    kj !== null && kcal === null
      ? { label: '→ kcal', apply: () => write({ energyKcal: Math.round(kj / KJ_PER_KCAL) }) }
      : kcal !== null && kj === null
        ? { label: '→ kJ', apply: () => write({ energyKj: Math.round(kcal * KJ_PER_KCAL) }) }
        : null;

  const grid = (
    <div className="flex flex-col rounded-ops-card border border-ops-line-soft px-3 py-1.5">
      {/* Enerji: tek satır, iki birim (aynı ölçü) + boş olanı doldurma kısayolu */}
      {row(
        <span className="flex items-center gap-2">
          {LABELS.energyKj}
          {convert && !disabled ? (
            <button
              type="button"
              onClick={convert.apply}
              title="Diğer birimi bu değerden hesapla (1 kcal = 4,184 kJ)"
              className="cursor-pointer font-ops-body text-ops-micro font-semibold text-ops-olive"
            >
              {convert.label}
            </button>
          ) : null}
        </span>,
        <>
          {cell('energyKj', 'kJ')}
          {cell('energyKcal', 'kcal')}
        </>,
      )}

      {/* Yağ ve karbonhidrat KENDİ alt kalemleriyle bir küme — ayraç kümeler arasında, içinde değil */}
      <div className="border-t border-ops-line-soft pt-1">
        {row(LABELS.fatG, cell('fatG', 'g'))}
        {row(LABELS.saturatedFatG, cell('saturatedFatG', 'g'), true)}
      </div>
      <div className="border-t border-ops-line-soft pt-1">
        {row(LABELS.carbohydrateG, cell('carbohydrateG', 'g'))}
        {row(LABELS.sugarsG, cell('sugarsG', 'g'), true)}
      </div>
      <div className="border-t border-ops-line-soft pt-1">
        {row(LABELS.proteinG, cell('proteinG', 'g'))}
        {row(LABELS.saltG, cell('saltG', 'g'))}
      </div>
    </div>
  );

  if (!shell) return grid;

  return (
    <FieldShell label="Besin değerleri" labelAside={<span className="font-ops-body text-ops-micro text-ops-faint">100 g başına</span>}>
      {grid}
      <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
        Boş bırakılan kalem müşteri tablosunda hiç görünmez. “0” bir beyandır, boş değildir.
      </span>
    </FieldShell>
  );
}
