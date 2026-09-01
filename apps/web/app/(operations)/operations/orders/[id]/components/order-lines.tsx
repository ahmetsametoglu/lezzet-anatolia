import Link from 'next/link';
import { discountPercentOf } from '@lezzet/domain-core';
import { amount, money, percent } from '@/components/operation/ui/format';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import type { OrderBundleGroup, OrderLineView, OrderTotalLine } from '../order-detail-types';
import { cardClass } from '@/components/operation/ui/card';

/**
 * Kalem tablosu — Komponent Envanteri O16 (`Table`'ın kayıt içi hâli).
 *
 * Genel `Table`'dan farkı, tablonun kendisinden çok SATIRIN ALTINA düşen anlatım: bir kalem eksik
 * gitmiş ya da iade edilmiş olabilir ve bu, sütuna sığmaz — kendi şeridinde, sebebiyle yazılır.
 *
 * **Sipariş ve karşılanan adet İKİ AYRI sütundur.** Tek sütuna indirilseydi "3 yazan sipariş neden
 * 2 kalem parası ödedi" sorusu ekrandan cevaplanamazdı; eksik giden adet kırmızıdır.
 *
 * **Paketten gelen kalemler kendi başlığı altında girintili durur** (DOMAIN §13): tek tek alınmış
 * gibi okunmaları, müşterinin aldığı şeyi yanlış anlatmak olurdu.
 */
interface OrderLinesProps {
  lines: OrderLineView[];
  bundles: OrderBundleGroup[];
  totals: OrderTotalLine[];
  /**
   * Hazırlık kesinleşti mi. **`false` iken `fulfilledQty` bir EKSİKLİK DEĞİLDİR** — hazırlıkta
   * yazılmamış bir sayıdır (varsayılanı 0). Bu ayrım gözetilmezse yeni onaylanmış her sipariş
   * "her kalemi eksik gitti" görünür; ekran olmayan bir sorunu haber verir.
   */
  settled: boolean;
}

// İlk kolonun asgarisi görselle birlikte büyüdü (44px görsel + boşluk, 15.08 — "biraz daha büyük").
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
        {/* Tek tek alınan kalem KOYU, paketten gelen normal ağırlıkta (tasarım): girinti neyin
            içinde olduğunu, ağırlık neyin satın alındığını söyler. Görsel satır başında (15.08,
            kullanıcı isteği — fiyatlar emsali): operatör ürünü adından önce yüzünden tanır. */}
        <div className={`flex min-w-0 items-center gap-2.5 ${indented ? 'pl-3.5' : ''}`}>
          <Thumbnail src={line.imageUrl} alt={line.title} size={44} />
          <div className="flex min-w-0 flex-col gap-px">
            {/* Ad, MÜŞTERİNİN GÖRDÜĞÜ ürün sayfasına gider (15.08, kullanıcı isteği) — yeni sekmede:
                operatör sipariş kaydından kopmaz. Yol TR: operasyon yüzeyinin dili Türkçe, dış URL
                dile göre (`/tr/urun/…`). Ürün silinmişse (slug yok) ad köprüsüz düz metin kalır. */}
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
              // LOT TIKLANIR (16.08, kullanıcı kararı — sağ raydaki "parti izi" kartının yerine):
              // köprü ürün adıyla stok aramasına gider, çünkü stok ekranı ADLA arar (parti
              // numarası sorgu olarak boş sayfa açardı). Geri çağırma izi artık tek yerde, kalemde.
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
        {/* SATIR TUTARI İKİ SAYIDIR (01.09, kullanıcı isteği): eksik giden kalemde sipariş
            edilenin ÜSTÜ ÇİZİLİR, ödenecek onun altında durur. Tek sayı yazıldığında ekranda duran
            38,19 tahsil edilecek tutar DEĞİLDİ ve operatör farkı ancak alttaki bloktan çıkarabiliyordu.
            Müşteri yüzeyi de aynı deseni kullanıyor (`customer-orders`), iki yüzey ayrışmıyor. */}
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

      {/* İADE ŞERİDİ KALDI, "EKSİK GİTTİ" ŞERİDİ KALKTI (kullanıcı kararı 01.09).
          Eksiklik artık satırın kendisinde görünüyor: SİP./KARŞIL. sütunları ve üstü çizili tutar.
          Şerit aynı gerçeği üçüncü kez söylüyor, üstelik bir satır yüksekliğinde yer kaplayarak.
          İade şeridi KALIYOR çünkü o farklı bir şey söylüyor: malın AKIBETİ (rafa döndü / imha /
          jest) sütunlardan okunamaz ve stok hareketi ona bağlıdır. */}
      {line.returnDisposition ? (
        <div className={`mx-3.5 mb-2.5 rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3 py-2 ${indented ? 'ml-7' : ''}`}>
          <span className="font-ops-display text-ops-micro font-semibold text-ops-red">İADE EDİLDİ</span>
          <span className="ml-2 font-ops-body text-ops-xs text-ops-red">{DISPOSITION_TEXT[line.returnDisposition]}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Malın akıbeti (DOMAIN §8) — para tarafı üçünde aynı, stok tarafı ayrışır. */
const DISPOSITION_TEXT: Record<NonNullable<OrderLineView['returnDisposition']>, string> = {
  restock: 'rafa döndü — kullanılabilir stoğa eklendi',
  discard: 'imha edildi — stoktan düştü, fire yazıldı',
  goodwill: 'müşteride kaldı — miktar düşmedi, yalnız para iade edildi',
};
