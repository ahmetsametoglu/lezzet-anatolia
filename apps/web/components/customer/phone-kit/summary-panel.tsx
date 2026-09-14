/*
  TUTAR ÖZETİ — native `SummaryPanel`in (`apps/mobile/src/screens/customer-kit/summary-panel.tsx`) web telefon ikizi:
  kum (`sand-150`) panel, alt alta "etiket ⟷ tutar" satırları, kesikli çizgiden sonra −2° eğik toplam rozeti, altında
  isteğe bağlı açıklama. Sepet, checkout ve sipariş onayı AYNI paneli çizer — kesikli çizginin kalınlığı ya da rozetin
  açısı birinde ayrışmasın.

  Rozetin yazısı Lora `screen-title` (native 17): para burada bir etiket değil, ekranın en büyük sayısı. İki ton
  native'in ayrımı: sepette MÜREKKEP rozet (henüz karar verilmedi, bilgi), ödeme kararının verildiği ekranlarda
  TERRACOTTA + gölge (ödenecek tutar, ekranın odağı).

  Satır tonları: `olive` indirim (kazanç, gidere benzemesin) · `danger` bu siparişe GİRMEYEN kalem (üstü çizilir,
  kırmızı — gizlemek "herhâlde bunları alıyorum" dedirtiyordu, native 10.08).
*/

/** Panelin ara satırı — "Ara toplam · 24,90 €". */
export interface SummaryRow {
  /** Satır anahtarı: aynı etiket iki kez geçebilir (iki farklı indirim), etiket anahtar olamaz. */
  key: string;
  label: string;
  value: string;
  tone?: 'muted' | 'olive' | 'danger';
  strike?: boolean;
}

interface SummaryPanelProps {
  rows: SummaryRow[];
  totalLabel: string;
  totalValue: string;
  totalTone?: 'ink' | 'terracotta';
  /** Panelin üstbaşlığı ("SİPARİŞ ÖZETİ") — checkout ve onay kullanır. */
  eyebrow?: string;
  /** Altta ince açıklama ("Fiyatlar KDV dahildir…"). */
  note?: string;
}

const ROW_TONE: Record<NonNullable<SummaryRow['tone']>, string> = {
  muted: 'text-body',
  olive: 'font-semibold text-olive-dark',
  danger: 'font-semibold text-error',
};

export function SummaryPanel({ rows, totalLabel, totalValue, totalTone = 'ink', eyebrow, note }: SummaryPanelProps) {
  return (
    <div className="flex flex-col gap-2 rounded-control bg-sand-150 px-4 py-3.5">
      {eyebrow !== undefined && <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{eyebrow}</span>}
      {rows.map((row) => (
        <div
          key={row.key}
          className={['flex justify-between gap-2.5 font-sans text-note', ROW_TONE[row.tone ?? 'muted'], row.strike ? 'line-through' : ''].join(' ')}
        >
          <span>{row.label}</span>
          {row.value !== '' && <span className="flex-none">{row.value}</span>}
        </div>
      ))}
      {/* Kesikli çizgi tasarımın imzası: "burada bir kupon koparılır" hissi (native künyesi). */}
      <div className="flex items-center justify-between border-t-[1.5px] border-dashed border-sand-400 pt-2.5">
        <span className="font-sans text-body-sm font-bold text-ink">{totalLabel}</span>
        <span
          className={[
            '-rotate-2 rounded-badge px-3 py-1.5 font-serif text-screen-title',
            totalTone === 'ink' ? 'bg-ink text-sand-50' : 'bg-terracotta text-card shadow-badge',
          ].join(' ')}
        >
          {totalValue}
        </span>
      </div>
      {note !== undefined && <p className="font-sans text-body-sm leading-[1.6] text-muted">{note}</p>}
    </div>
  );
}
