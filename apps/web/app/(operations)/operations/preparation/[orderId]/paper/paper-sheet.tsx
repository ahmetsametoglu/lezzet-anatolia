'use client';

import Link from 'next/link';
import type { PreparationOrder } from '@lezzet/application';
import { Button } from '@/components/operation/ui/button';
import { num, shortDate } from '@/components/operation/ui/format';
import { PREP_PATH } from '../../preparation-labels';

/**
 * **Hazırlık kâğıdının kendisi** — `design/project/Belge - Hazirlik Kagidi.dc.html`, A4 / 14 mm.
 *
 * ── KÂĞIT EKRANIN KOPYASI DEĞİL ─────────────────────────────────────────────
 * Ekranda olmayan iki sütun var ve belgenin varlık sebebi onlar: **"Kondu / eksik"** ve **"Not"**.
 * Depocu rafın karşısında kalemle işaretler, sonra masaya dönüp ekrana geçer. Ekranın aynısını
 * basmak, kâğıdı gereksiz kılardı.
 *
 * ── SIRA EKRANIN SIRASI ─────────────────────────────────────────────────────
 * Kalemler kapının verdiği sırayla basılıyor (yürüyüş sırası — `storage_area.sort_order`). Kâğıt
 * kendi sırasını kursaydı, aynı depoyu iki farklı yönde yürüten iki liste doğardı ve tasarımın
 * *"kâğıt ile ekran karşılaştırılmaz"* cümlesi yalan olurdu.
 *
 * ── YAZDIRMA KENDİLİĞİNDEN AÇILMAZ ──────────────────────────────────────────
 * Operatör önce kâğıdı görmeli: doğru siparişi bastığını doğrulamadan onay isteyen bir pencere,
 * yanlış listeyi eline alma ihtimalini artırır.
 *
 * ── PARA YOK, ADRES YOK ─────────────────────────────────────────────────────
 * Kapı zaten taşımıyor (`PreparationOrder` künyesi). Belgenin altbilgisi bunu kâğıdın üstüne de
 * yazıyor — eline alan kişi ne olduğunu bilsin.
 */
interface PaperSheetProps {
  order: PreparationOrder;
  warehouseName: string;
}

export function PaperSheet({ order, warehouseName }: PaperSheetProps) {
  const sealed = order.boxes.filter((box) => box.sealedAt !== null).length;

  return (
    <div data-doc="paper" className="min-h-screen bg-ops-white">
      {/* Kabuk yalnız EKRANDA: kâğıda basılmıyor (`data-print="hide"`). */}
      <div
        data-print="hide"
        className="flex items-center justify-between gap-3 border-b border-ops-line px-6 py-3"
      >
        <Link
          href={PREP_PATH}
          className="cursor-pointer font-ops-body text-ops-sm text-ops-muted underline-offset-2 hover:underline"
        >
          ← Kuyruğa dön
        </Link>
        <Button variant="primary" size="sm" onClick={() => window.print()}>
          Yazdır
        </Button>
      </div>

      <article className="mx-auto max-w-[182mm] px-[14mm] py-[12mm] print:px-0 print:py-0">
        <header className="flex items-start justify-between gap-6 border-b border-ops-line pb-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.08em] text-ops-muted">
              Hazırlık kâğıdı
            </span>
            {/* Tasarım 27px veriyor; merdivende karşılığı `display` (29px) — ham piksel yazılmaz
                (`docs:check` zorluyor) ve iki basamak arasında kalan bir değer için yeni basamak
                açmak, merdiveni belge başına bir kademe uzatmak olurdu. */}
            <h1 className="font-ops-display text-ops-display font-semibold leading-tight tracking-tight text-ops-ink">
              {order.referenceNo ?? 'Numarasız sipariş'}
            </h1>
            <span className="font-ops-body text-ops-xs text-ops-muted">
              {[
                // Koliye yazılacak ad ADRESTEN gelir ve yalnız farklıysa ayrıca yazılır (10.9
                // kararı) — kâğıt da aynı adı taşımalı, etiketi yazan kişi buna bakıyor.
                order.recipientName && order.recipientName !== order.customerName
                  ? `${order.customerName} · koliye: ${order.recipientName}`
                  : order.customerName,
                warehouseName,
                order.deliveryDate ? `${shortDate(order.deliveryDate)} teslim` : 'kargo — teslim günü yok',
              ].join(' · ')}
            </span>
          </div>
          <span className="shrink-0 font-ops-body text-ops-micro text-ops-faint">
            Depoda kalır — kutuya konmaz
          </span>
        </header>

        <div className="flex gap-8 border-b border-ops-line py-3">
          <Stat label="Kalem" value={num(order.lineCount)} />
          <Stat label="Kutu" value={order.boxes.length === 0 ? '—' : `${num(order.boxes.length)} (${num(sealed)} kapalı)`} />
          {/* Basım anı İSTEMCİDE okunuyor ve bu doğru: kâğıdın üstündeki saat, kâğıdın basıldığı
              andır. Sunucuda üretilseydi önbelleğe alınmış bir sayfa eski saati taşırdı. */}
          <Stat label="Basım" value={new Date().toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} />
        </div>

        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-ops-line">
              {['Ürün', 'Adet', 'Konum', 'Bu partiden al · son tarih', 'Kondu / eksik'].map((header) => (
                <th
                  key={header}
                  className="py-2 pr-3 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => {
              const remaining = Math.max(0, line.orderedQty - line.pickedQty);
              return (
                <tr key={line.itemId} className="border-b border-ops-line-soft align-top">
                  <td className="py-2.5 pr-3 font-ops-body text-ops-sm font-medium text-ops-ink">
                    {line.productName}
                    {line.variantLabel ? <span className="text-ops-muted"> · {line.variantLabel}</span> : null}
                  </td>
                  <td className="py-2.5 pr-3 font-ops-mono text-ops-sm text-ops-ink">
                    {num(remaining)}
                    {/* Yarım kalan iş kâğıtta da görünür: "6 iste, 2 zaten toplandı" diyen bir
                        satır, kalan 4'ü ikinci kez toplatmaz. */}
                    {line.pickedQty > 0 ? (
                      <span className="font-ops-body text-ops-micro text-ops-muted"> ({num(line.pickedQty)} toplandı)</span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-3 font-ops-body text-ops-xs text-ops-body">
                    {line.suggestion[0]?.areaName ?? '—'}
                  </td>
                  <td className="py-2.5 pr-3 font-ops-body text-ops-xs text-ops-body">
                    {line.suggestion.length === 0 ? (
                      // Boşluğun İKİ anlamı var ve ayrılıyor (10.1'in ekran tarafındaki aynı
                      // düzeltmesi): bitmiş iş ↔ uygun parti yok.
                      <span className="text-ops-faint">{remaining === 0 ? 'toplandı' : 'uygun parti yok'}</span>
                    ) : (
                      line.suggestion.map((batch, index) => (
                        <span key={batch.stockId} className="block">
                          {num(batch.qty)} adet · son tarih {shortDate(batch.expiryDate)}
                          {index === 0 && line.suggestion.length > 1 ? ' (önce bu)' : ''}
                        </span>
                      ))
                    )}
                  </td>
                  {/* ELLE DOLDURULACAK — kâğıdın varlık sebebi. Boş bir hücre değil, çizgili bir
                      alan: nereye yazılacağı belli olmayan bir boşluk doldurulmaz. */}
                  <td className="w-[26mm] py-2.5">
                    <span className="block h-[16px] border-b border-ops-line" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="mt-3 font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
          Sıra ekrandaki sırayla aynıdır — kâğıt ile ekran karşılaştırılmaz. Parti önerisi tazelik kuralına göre
          verilir: <strong className="font-medium text-ops-body">en yakın tarihli önce çıkar</strong>. Başka partiden
          aldıysanız sağdaki boşluğa yazın.
        </p>

        <section className="mt-6 flex flex-col gap-1">
          <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
            Not / eksik açıklaması
          </span>
          <span className="block h-[22mm] rounded-ops-card border border-ops-line" />
          <span className="font-ops-body text-ops-micro text-ops-faint">
            Eksik işaretlediyseniz sebebini kısaca yazın; ekranda listeden seçilecek (stokta kalmadı · tazelik ·
            hasarlı).
          </span>
        </section>

        <section className="mt-5 flex items-end gap-8">
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
              Hazırlayan · saat
            </span>
            <span className="block h-[14px] border-b border-ops-line" />
          </label>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            İşaretledikten sonra ekrana geçin — kâğıt depoda kalır, kutuya konmaz.
          </span>
        </section>

        <footer className="mt-8 flex items-center justify-between gap-4 border-t border-ops-line pt-3">
          <span className="font-ops-body text-ops-micro text-ops-faint">
            {/* Depo adı ZATEN "… — ana depo" gibi okunuyor; ardına "deposu" eklemek ekranda
                "ana depo deposu" yazdırdı (çekimde görüldü). Ad olduğu gibi basılır. */}
            {[order.referenceNo, warehouseName, order.boxes.length > 0 ? `${num(order.boxes.length)} kutu` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <span className="font-ops-body text-ops-micro text-ops-faint">İç belge · fiyat bilgisi içermez</span>
        </footer>
      </article>
    </div>
  );
}

/** Başlık altındaki üçlü künye — etiket üstte küçük, sayı altta iri (tasarımın kendi düzeni). */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
        {label}
      </span>
      <span className="font-ops-mono text-ops-sm font-medium text-ops-ink">{value}</span>
    </span>
  );
}
