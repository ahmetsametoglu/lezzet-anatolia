'use client';

import type { StockIntakePayload } from '@lezzet/types';
import { num, shortDate } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import type { AssistantRowView } from '../assistant-types';
import { Facts, PriceBlock, SubjectBox, SummaryLine, totalQty } from './shared';

/**
 * MAL KABUL — siparişten farkı: burada mal ELDE ve sayılar kesin.
 *
 * ── TOPLAM MALİYET HESAPLANIYOR ─────────────────────────────────────────────
 * `Σ qty × unitCostCents`. Fırsat kartındaki indirim yüzdesiyle aynı bilinçli istisna: iş kuralı
 * değil, dilekçede yan yana duran iki sayının çarpımı. **Bir kalemin bile alış fiyatı yoksa toplam
 * YAZILMAZ** — eksik tabanla bulunan bir tutar, kasadan çıkacak parayı olduğundan az gösterir
 * (`CLAUDE §1`: ölçülemeyen değer sıfır değildir). O hâlde kaç kalemin fiyatsız olduğu söylenir.
 *
 * ── EN YAKIN SKT KARARIN KENDİSİ ────────────────────────────────────────────
 * Girişi yapılan partinin ömrü, malın satılabilirliğidir: üç ay sonra dolacak 40 adet ile bir yıl
 * sonrası aynı karar değildir. Kalem başına tarih göstermek karta sığmaz; **en yakını** göstermek
 * riski söyler, çünkü ilk dolan parti ilk sorunu çıkarır.
 */
export function StockIntakeCard({ payload, row }: { payload: StockIntakePayload; row: AssistantRowView }) {
  const unknownCost = payload.lines.filter((l) => l.unitCostCents === null).length;
  const costCents = unknownCost > 0 ? null : payload.lines.reduce((sum, l) => sum + (l.unitCostCents ?? 0) * l.qty, 0);
  // Tarihler dizge olarak ISO (YYYY-MM-DD) — sıralama için ayrıştırmaya gerek yok.
  const soonest = payload.lines.map((l) => l.expiryDate).sort()[0];

  return (
    <>
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      {costCents !== null ? (
        <PriceBlock cents={costCents} wasCents={null} wasLabel="" percentOff={null} tone="" note="alış toplamı" />
      ) : null}

      {/* Künye satırları AYRI — tedarik siparişiyle aynı gerekçe (kullanıcı düzeltmesi 10.08):
          dar sütunda birleştirilen değerler birbirine giriyor, oysa kartın altında yer var. */}
      <Facts>
        {costCents === null ? <CardFact label="Alış" value={`${num(unknownCost)} kalemde fiyat yok`} /> : null}
        <CardFact label="En yakın SKT" value={soonest ? shortDate(soonest) : '—'} />
        <CardFact label="Belge" value={payload.documentNo ?? '—'} />
        <CardFact label="Parti" value={`${num(payload.lines.length)} çeşit · ${num(totalQty(payload.lines))} ad.`} />
      </Facts>
    </>
  );
}
