'use client';

import type { PurchaseOrderPayload } from '@lezzet/types';
import { num } from '@/components/operation/ui/format';
import { CardFact } from '../assistant-card';
import type { AssistantRowView } from '../assistant-types';
import { Facts, PriceBlock, SubjectBox, SummaryLine, totalQty } from './shared';

/**
 * TEDARİK SİPARİŞİ — kararın konusu "ne kadar mal, kimden, hangi depoya, kaça".
 *
 * ── TAHMİNİ TUTAR: ÖNCE YOKTU, ÖLÇÜNCE ÇIKTI ────────────────────────────────
 * İlk tur kartta tutar yoktu ve gerekçesi şuydu: "alış fiyatı siparişte değil mal kabulde
 * kesinleşir, uydurma sayı onaylatmayalım." Kullanıcının sorusu doğru soruydu (*"bu ürünlerin
 * yaklaşık kaç lira ettiğini biliyor muyuz?"*) ve ölçüm gerekçeyi çürüttü:
 * `supplier_product.last_purchase_price` 23/23 dolu — **biliyoruz**. Bilinen bir sayıyı saklamak,
 * kasadan ne çıkacağını görmeden sipariş onaylatmak demekti.
 *
 * Tutar TAHMİN olarak sunuluyor (`~`) ve **bir kalemin bile fiyatı eksikse hiç yazılmıyor**: eksik
 * tabanla bulunan toplam, gerçeğinden daima azdır ve az görünen bir tutar onayı kolaylaştırır
 * (`CLAUDE §1` — ölçülemeyen değer sıfır değildir).
 *
 * **Adetleri MOTOR hesapladı, model değil** (`ReorderService`): kart adedi tartışmaya açmıyor,
 * yalnız gösteriyor. Düzenleme diyaloğun işi.
 */
export function PurchaseOrderCard({ payload, row }: { payload: PurchaseOrderPayload; row: AssistantRowView }) {
  const eco = row.economics?.kind === 'supply' ? row.economics : null;
  // Fiyat önce BUGÜNKÜ kayıttan, sonra dilekçeden: sipariş kuyrukta beklerken alış değişmiş
  // olabilir ve onay anında geçerli olan bugünküdür (`batch_offer`daki liste fiyatıyla aynı sıra).
  const unitOf = (line: PurchaseOrderPayload['lines'][number]) =>
    eco?.unitCostByVariant[line.variantId] ?? line.lastPurchasePriceCents;
  const unknownPrice = payload.lines.filter((l) => unitOf(l) == null).length;
  const estimateCents = unknownPrice > 0 ? null : payload.lines.reduce((sum, l) => sum + (unitOf(l) ?? 0) * l.qty, 0);

  return (
    <>
      {row.subject ? <SubjectBox subject={row.subject} /> : <SummaryLine summary={row.summary} />}

      {estimateCents !== null ? (
        <PriceBlock cents={estimateCents} wasCents={null} wasLabel="" percentOff={null} tone="" note="tahmini tutar" />
      ) : null}

      {/* ── KÜNYE SATIRLARI AYRI (kullanıcı düzeltmesi 10.08) ─────────────────
          Bir tur depo/kalem/adet tek satıra sıkıştırılmıştı (`STR · 14 kalem · 411 ad.`) ve dar
          sütunda üç değer birbirine giriyordu — üstelik kartın altında boş alan varken. Sıkıştırma
          "kart en fazla üç künye satırı" kuralından geliyordu; kural yerinde ama burada yanlış
          uygulanmıştı: sınırın amacı kartı kısa tutmak değil, OKUNUR tutmak. */}
      <Facts>
        {estimateCents === null ? (
          <CardFact label="Tahmini tutar" value={`${num(unknownPrice)} kalemde fiyat yok`} />
        ) : null}
        <CardFact label="Depo" value={eco?.warehouseCode ?? payload.warehouseCode ?? '—'} />
        <CardFact label="Kalem" value={`${num(payload.lines.length)} çeşit`} />
        <CardFact label="Toplam" value={`${num(totalQty(payload.lines))} ad.`} />
      </Facts>
    </>
  );
}
