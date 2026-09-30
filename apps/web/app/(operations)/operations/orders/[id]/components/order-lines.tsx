import Link from 'next/link';
import { discountPercentOf } from '@lezzet/domain-core';
import { amount, money, percent, shortDateTime } from '@/components/operation/ui/format';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import type { OrderBundleGroup, OrderLineReturnView, OrderLineView, OrderTotalLine } from '../order-detail-types';
import { cardClass } from '@/components/operation/ui/card';

/**
 * Kalem tablosu (Komponent Envanteri O16): sipariş ve karşılanan adet iki ayrı sütundur, eksik giden adet kırmızıdır;
 * paketten gelen kalemler başlığı altında girintili durur (DOMAIN §13). Sütuna sığmayan anlatım (iade) satırın altındaki
 * şeritte yazılır.
 */
interface OrderLinesProps {
  lines: OrderLineView[];
  bundles: OrderBundleGroup[];
  totals: OrderTotalLine[];
  /**
   * Hazırlık kesinleşti mi; `false` iken `fulfilledQty` bir eksiklik değil, hazırlıkta yazılmamış bir sayıdır. Bu ayrım
   * olmadan yeni onaylanmış her sipariş "her kalemi eksik gitti" görünürdü.
   */
  settled: boolean;
}

// İlk kolonun asgarisi 44px görsel ve boşluğu taşır.
const GRID = 'grid grid-cols-[minmax(172px,1fr)_46px_58px_78px_54px_46px_86px] gap-x-2';

export function OrderLines({ lines, bundles, totals, settled }: OrderLinesProps) {
  const grouped = new Set(bundles.flatMap((b) => b.lineIds));
  const loose = lines.filter((l) => !grouped.has(l.id));

  return (
    <div className={cardClass()}>
      <div className="flex items-center gap-2.5 border-b border-ops-line bg-ops-subtle px-3.5 py-2.5">
        <span className="mr-auto font-ops-display text-ops-base font-semibold text-ops-ink">
          Kalemler{' '}
          <span className="font-ops-body text-ops-xs font-normal text-ops-muted">
            {lines.length} kalem
            {bundles.length > 0 ? ` · ${bundles.length} paket` : ''}
          </span>
        </span>
        {!settled ? (
          <span className="font-ops-body text-ops-micro text-ops-muted">hazırlık yapılmadı · karşılanan yazılmadı</span>
        ) : lines.some((l) => l.fulfilledQty < l.qty) ? (
          <span className="rounded-[7px] border border-ops-amber-line bg-ops-amber-bg px-2 py-[3px] font-ops-display text-ops-micro font-semibold text-ops-amber">
            Kısmi karşılandı
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[616px]">
          <div
            className={`${GRID} border-b border-ops-line bg-ops-subtle px-3.5 py-2 font-ops-display text-ops-micro font-medium uppercase tracking-[0.05em] text-ops-muted`}
          >
            <span>Ürün · boy</span>
            <span className="text-right">Sip.</span>
            <span className="text-right">Karşıl.</span>
            <span className="text-right">Birim</span>
            <span className="text-right">İnd.</span>
            <span className="text-right">KDV</span>
            <span className="text-right">Satır</span>
          </div>

          {bundles.map((bundle) => (
            <div key={bundle.bundleId}>
              <div className="flex items-center gap-2.5 border-b border-ops-line-soft bg-ops-subtle px-3.5 py-2">
                <span className="rounded-[6px] border border-ops-olive-line bg-ops-olive-bg px-1.5 py-px font-ops-display text-ops-micro font-semibold text-ops-olive-dark">
                  Paket
                </span>
                <span className="mr-auto font-ops-body text-ops-sm font-semibold text-ops-ink">{bundle.name}</span>
                {/* Paketin kuralı satırın yanında yazar (DOMAIN §13): fiyat sabittir, içerik tek tek
                    satılmamıştır — grup toplamıyla kalem toplamları neden birbirini tutmayabilir. */}
                <span className="font-ops-body text-ops-micro text-ops-muted">
                  paket fiyatı sabit · içerik tek tek satılmadı
                </span>
                <span className="font-ops-mono text-ops-sm text-ops-ink">{money(bundle.totalCents)}</span>
              </div>
              {lines
                .filter((l) => l.bundleId === bundle.bundleId)
                .map((line) => (
                  <Line key={line.id} line={line} indented settled={settled} />
                ))}
            </div>
          ))}

          {loose.map((line) => (
            <Line key={line.id} line={line} indented={false} settled={settled} />
          ))}
        </div>
      </div>

      {/* Toplam bloğu — düşülenler satır satır. Hiçbir tutar elle yazılmaz. */}
      <div className="flex flex-col gap-1.5 bg-ops-subtle px-3.5 py-3">
        {totals.map((total) => (
          <div
            key={total.label}
            className={`flex items-baseline gap-2.5 ${total.kind === 'refund' ? 'border-t border-ops-line-soft pt-1.5' : ''}`}
          >
            <span
              className={`mr-auto ${
                total.kind === 'grand'
                  ? 'font-ops-display text-ops-sm font-semibold text-ops-ink'
                  : total.kind === 'note'
                    ? 'font-ops-body text-ops-micro text-ops-muted'
                    : 'font-ops-body text-ops-xs text-ops-body'
              }`}
            >
              {total.label}
            </span>
            <span
              className={`font-ops-mono ${
                total.kind === 'grand'
                  ? 'text-ops-lead font-medium text-ops-ink'
                  : total.kind === 'deduction'
                    ? 'text-ops-sm text-ops-amber-dark'
                    : total.kind === 'refund'
                      ? 'text-ops-sm font-medium text-ops-red'
                      : total.kind === 'note'
                        ? 'text-ops-micro text-ops-muted'
                        : 'text-ops-sm text-ops-body'
              }`}
            >
              {total.kind === 'deduction' || total.kind === 'refund'
                ? `−${amount(total.amountCents)} €`
                : money(total.amountCents)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LineProps {
  line: OrderLineView;
  indented: boolean;
  settled: boolean;
}

function Line({ line, indented, settled }: LineProps) {
  // Eksiklik ancak hazırlık kesinleştiyse vardır; öncesinde bu sayı yalnız "henüz yazılmadı".
  const short = settled ? line.qty - line.fulfilledQty : 0;
  return (
    <div className="border-b border-ops-line-soft last:border-b-0">
      <div className={`${GRID} items-center px-3.5 py-2.5`}>
        {/* Tek tek alınan kalem koyu, paketten gelen normal ağırlıkta: girinti neyin içinde olduğunu, ağırlık neyin satın
            alındığını söyler. Görsel satır başında, çünkü operatör ürünü adından önce yüzünden tanır. */}
        <div className={`flex min-w-0 items-center gap-2.5 ${indented ? 'pl-3.5' : ''}`}>
          <Thumbnail src={line.imageUrl} alt={line.title} size={44} />
          <div className="flex min-w-0 flex-col gap-px">
            {/* Ad, müşterinin gördüğü ürün sayfasına yeni sekmede gider ki operatör sipariş kaydından kopmasın; yol dile göre
                (`/tr/urun/…`), ürün silinmişse ad düz metin kalır. */}
            {line.productSlug ? (
              <a
                href={`/tr/urun/${line.productSlug}`}
                target="_blank"
                rel="noreferrer"
                className={`cursor-pointer truncate font-ops-body text-ops-sm text-ops-ink transition-colors hover:text-ops-olive-dark hover:underline ${indented ? '' : 'font-semibold'}`}
              >
                {line.title}
              </a>
            ) : (
              <span className={`truncate font-ops-body text-ops-sm text-ops-ink ${indented ? '' : 'font-semibold'}`}>
                {line.title}
              </span>
            )}
            {line.batchNos.length > 0 ? (
              // Lot tıklanır ve ürün adıyla stok aramasına gider, çünkü stok ekranı adla arar; parti numarası sorgusu boş
              // sayfa açardı.
              <span className="flex flex-wrap items-center gap-x-1.5 font-ops-mono text-ops-micro text-ops-faint">
                Lot
                {line.batchNos.map((lot) =>
                  line.productName ? (
                    <Link
                      key={lot}
                      href={`/operations/stock?q=${encodeURIComponent(line.productName)}`}
                      className="cursor-pointer transition-colors hover:text-ops-olive-dark hover:underline"
                      title="Partiyi stokta aç"
                    >
                      {lot}
                    </Link>
                  ) : (
                    <span key={lot}>{lot}</span>
                  ),
                )}
              </span>
            ) : indented ? (
              <span className="font-ops-body text-ops-micro text-ops-muted">paket içeriği</span>
            ) : null}
          </div>
        </div>
        <span className="text-right font-ops-mono text-ops-xs text-ops-body">{line.qty}</span>
        <span
          className={`text-right font-ops-mono text-ops-xs ${
            short > 0 ? 'font-medium text-ops-red' : settled ? 'font-medium text-ops-body' : 'text-ops-faint'
          }`}
          title={settled ? undefined : 'Hazırlıkta yazılır'}
        >
          {settled ? line.fulfilledQty : '—'}
        </span>
        <span className="text-right font-ops-mono text-ops-xs text-ops-body">{amount(line.unitPriceCents)}</span>
        {/* İndirim YÜZDE olarak okunur (tasarım): "−1,20 €" kalemi başka kalemle karşılaştırmaya
            yaramaz, "−%8" yarar. Kazanılmış bir şey olduğu için olive. */}
        <span
          className={`text-right font-ops-mono text-ops-micro ${
            line.lineDiscountCents > 0 ? 'text-ops-olive-dark' : 'text-ops-faint'
          }`}
        >
          {line.lineDiscountCents > 0
            ? `−${percent(discountPercentOf(line.unitPriceCents * line.qty, line.lineTotalCents) ?? 0, 0)}`
            : '—'}
        </span>
        <span className="text-right font-ops-mono text-ops-micro text-ops-muted">{percent(line.vatRate, 1)}</span>
        {/* Satır tutarı iki sayıdır: eksik giden kalemde sipariş edilenin üstü çizilir, ödenecek altında durur; tek sayı
            operatöre tahsil edilecek tutarı göstermezdi. Müşteri yüzeyi de aynı deseni kullanıyor (`customer-orders`). */}
        <span className="text-right font-ops-mono text-ops-sm text-ops-ink">
          {settled && line.payableCents !== line.lineTotalCents ? (
            <span className="flex flex-col items-end leading-tight">
              <span className="text-ops-micro text-ops-muted line-through">{amount(line.lineTotalCents)}</span>
              <span className="text-ops-amber-dark">{amount(line.payableCents)}</span>
            </span>
          ) : (
            amount(line.lineTotalCents)
          )}
        </span>
      </div>

      {/* Hazırlıktaki eksik satırın kendisinde (SİP./KARŞIL., üstü çizili tutar) göründüğü için şerit almaz; iade ve kapıda geri
          çevrilen adet olay başına şerit alır, çünkü aynı kalemin adetleri farklı akıbet alabilir ve sütunlardan okunmaz. */}
      {line.returns.filter(isShownReturn).map((entry) => (
        <div
          key={entry.id}
          className={`mx-3.5 mb-2.5 rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3 py-2 ${indented ? 'ml-7' : ''}`}
        >
          <span className="font-ops-display text-ops-micro font-semibold text-ops-red">
            {entry.disposition ? 'İADE EDİLDİ' : 'KAPIDA GERİ ÇEVRİLDİ'}
          </span>
          <span className="ml-2 font-ops-body text-ops-xs text-ops-red">{returnSentence(entry)}</span>
        </div>
      ))}
    </div>
  );
}

/** Malın akıbeti (DOMAIN §8) — para tarafı üçünde aynı, stok tarafı ayrışır. */
const DISPOSITION_TEXT: Record<NonNullable<OrderLineReturnView['disposition']>, string> = {
  restock: 'rafa döndü — kullanılabilir stoğa eklendi',
  discard: 'imha edildi',
  goodwill: 'müşteride kaldı — bedeli siparişten düşüldü',
};

/** Şeride giren olay: akıbeti yazılmış iade ya da kapıda geri çevrilen adet. */
function isShownReturn(entry: OrderLineReturnView): boolean {
  return entry.disposition !== null || entry.stage === 'out_for_delivery';
}

/** "1 adet · rafa döndü … · 29 Eyl 09:16 · Ayşe · “kutu ezik”" — adet, akıbet, an, kişi ve varsa sebep. */
function returnSentence(entry: OrderLineReturnView): string {
  return [
    `${entry.qty} adet`,
    entry.disposition ? DISPOSITION_TEXT[entry.disposition] : null,
    shortDateTime(entry.at),
    entry.actorName,
    entry.note ? `“${entry.note}”` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}
