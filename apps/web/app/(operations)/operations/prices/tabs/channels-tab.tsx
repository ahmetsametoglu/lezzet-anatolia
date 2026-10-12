'use client';

import type { Channel, Country } from '@lezzet/types';
import { FOREIGN_COUNTRIES, PRICE_CHANNELS } from '@/components/operation/prices/country-prices';
import { Badge } from '@/components/operation/ui/badge';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { countryColumnKey, PRICES_COLUMN_TRACKS } from '../prices-columns';
import { LoadMoreSentinel } from '@/components/operation/ui/load-more-sentinel';
import { Table, withCells, type Column } from '@/components/operation/ui/table';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { amount, money } from '@/components/operation/ui/format';
import { channelHint, countryHint, marginHint, marginText, marginTone, rowStateNote } from '../prices-labels';
import { SCOPE_LABEL } from '../prices-url';
import type { PriceRow, PricesViewProps } from '../prices-types';

// Kanal fiyatları: satır boydur, çünkü fiyat boya yazılır; KDV oranı, hedef marj ve otomatik fiyat üründen gelir. Sütun sırası kararın
// sırasıdır (boy → fiyatlar → maliyet → marj) ve maliyet fiyatların yanında durur ki göz ikisini yan yana kıyaslasın.

/** Ülke kolonlarının hücreleri, şerit anahtarıyla. */
const COUNTRY_CELLS = Object.fromEntries(
  FOREIGN_COUNTRIES.flatMap((country) =>
    PRICE_CHANNELS.map((channel) => [
      countryColumnKey(channel, country),
      (r: PriceRow) => <CountryCell row={r} country={country} channel={channel} />,
    ]),
  ),
);

export function ChannelsTab({ data, rows, hasMore, loadingMore, onLoadMore, onEdit, scope, search, counts, navPending }: PricesViewProps) {
  const columns: Column<PriceRow>[] = withCells<PriceRow>(PRICES_COLUMN_TRACKS, {
    name: (r) => (
      // Görsel (36 px) iki metin satırından kısadır ki satır yüksekliğini metin belirlesin ve iskelet satırıyla ritim bozulmasın.
      <div className="flex min-w-0 items-center gap-2.5">
        <Thumbnail src={r.imageUrl} alt={r.productName} size={36} />
        <div className="flex min-w-0 flex-col gap-px">
          <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{r.title}</span>
          <span className="truncate font-ops-body text-ops-xs text-ops-muted">
            {r.categoryName || 'kategorisiz'}
            {rowStateNote(r)}
          </span>
        </div>
      </div>
    ),
    b2c: (r) => <ChannelCell channel="b2c" cents={r.b2c.amountCents} />,
    b2b: (r) => <ChannelCell channel="b2b" cents={r.b2b.amountCents} />,
    ...COUNTRY_CELLS,
    cost: (r) => (
      <span
        className="font-ops-mono text-ops-sm font-medium text-ops-muted"
        title={
          r.costCents === null
            ? 'Fiyatlı parti yok — maliyet bilinmiyor (sıfır değil)'
            : 'Son alış fiyatı — yeniden almanın bedeli (KDV hariç)'
        }
      >
        {amount(r.costCents)}
      </span>
    ),
    margin: (r) => (
      <span title={marginHint(r)}>
        <Badge tone={marginTone(r)}>{marginText(r)}</Badge>
      </span>
    ),
    auto: (r) => (
      <span
        className={`inline-block h-2 w-2 rounded-full ${r.autoPrice ? 'bg-ops-olive' : 'border-[1.5px] border-ops-line-strong'}`}
        title={
          r.autoPrice
            ? 'Otomatik fiyat açık — fiyat elle değil, hedef marjdan hesaplanır'
            : 'Otomatik fiyat kapalı — marj-altına düşünce yalnız uyarır'
        }
      />
    ),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Table
        busy={navPending}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.variantId}
        onRowClick={(r) => onEdit(r.variantId)}
        empty={
          <CleanState filtered={Boolean(search) || scope !== 'all'} serverScope={scope === 'country'} scopeLabel={SCOPE_LABEL[scope]} />
        }
        footer={
          <>
            <LoadMoreSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} />
            {/* Solda açıklama, sağda marj-altı sayacı; sayaç yalnız başlıkta dursa liste kaydırılınca gözden kaybolurdu. */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-3">
              <span className="mr-auto font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
                Satıra tıkla → fiyat düzenle. Otomatik fiyatı açık üründe fiyat elle değil, hedef marj değişir. Fiyat değişikliği verilmiş
                siparişleri etkilemez.
              </span>
              {/* Kanalında fiyatı olmayan ürün vitrinden hata vermeden düşer, çip bunu görünür kılar. Amberdir, çünkü marj-altı para
                  kaybıdır, bu ise kaçan satış; sayı sıfırken çizilmez ki hep duran uyarı uyarı olmaktan çıkmasın. */}
              {data.hiddenFromStorefront && data.hiddenFromStorefront.b2c + data.hiddenFromStorefront.b2b > 0 ? (
                <span className="flex-none rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-[11px] py-[5px] font-ops-body text-ops-xs font-medium text-ops-amber">
                  vitrinde yok: <strong className="font-ops-mono">{data.hiddenFromStorefront.b2c}</strong> perakende ·{' '}
                  <strong className="font-ops-mono">{data.hiddenFromStorefront.b2b}</strong> toptan
                </span>
              ) : null}
              {counts.below > 0 ? (
                <span className="flex-none rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-[11px] py-[5px] font-ops-body text-ops-xs font-medium text-ops-red">
                  <strong className="font-ops-mono">{counts.below}</strong> marj-altı
                </span>
              ) : null}
            </div>
          </>
        }
      />
    </div>
  );
}

interface ChannelCellProps {
  channel: Channel;
  cents: number | null;
}

/**
 * Fiyat hücresi. Fiyatı OLMAYAN kanal tire ile ve amber yazılır: bu bir sıfır değil, bir eksikliktir
 * ve sonucu "o kanalda satışa kapalı"dır — sessiz geçilirse ürünün neden satılmadığı görünmez.
 */
function ChannelCell({ channel, cents }: ChannelCellProps) {
  const has = cents !== null;
  return (
    <span
      className={`font-ops-mono text-ops-base font-medium ${has ? 'text-ops-ink' : 'text-ops-amber'}`}
      title={channelHint(channel, has)}
    >
      {has ? money(cents) : '—'}
    </span>
  );
}

interface CountryCellProps {
  row: PriceRow;
  country: Country;
  channel: Channel;
}

/**
 * Ülke hücresi: ülke fiyatı yazılmamışsa o ülkede genel fiyat geçer ve hücre bunu söyler; genel fiyat da yoksa geçen fiyat yoktur. Ürün o
 * ülkenin tüketicisine satılmıyorsa B2C hücresi amberdir, çünkü yazılı fiyat da o satışı açmaz.
 */
function CountryCell({ row, country, channel }: CountryCellProps) {
  const cents = row.countryPrices[country]?.[channel].amountCents ?? null;
  const hasGeneral = row[channel].amountCents !== null;
  const sellable = channel === 'b2b' || row.countryVat[country]?.sellableToConsumer === true;
  const title = countryHint(channel, country, { hasPrice: cents !== null, hasGeneral, sellable });
  if (cents !== null) {
    return (
      <span className={`font-ops-mono text-ops-base font-medium ${sellable ? 'text-ops-ink' : 'text-ops-amber'}`} title={title}>
        {money(cents)}
      </span>
    );
  }
  if (sellable && !hasGeneral) {
    return (
      <span className="font-ops-mono text-ops-base font-medium text-ops-amber" title={title}>
        —
      </span>
    );
  }
  return (
    <span className={`font-ops-body text-ops-xs ${sellable ? 'text-ops-faint' : 'text-ops-amber'}`} title={title}>
      {sellable ? 'genel' : 'satılmıyor'}
    </span>
  );
}

interface CleanStateProps {
  filtered: boolean;
  /** Süzgeci sunucu uyguladı; boş liste bütün kataloğun cevabıdır, yüklenmiş sayfanın değil. */
  serverScope: boolean;
  scopeLabel: string;
}

/** Boş hâl. Süzgeç sonucu boşsa bu bir eksiklik değil, iyi haber olabilir; metin ikisini ayırır. */
function CleanState({ filtered, serverScope, scopeLabel }: CleanStateProps) {
  if (!filtered) {
    return <EmptyState title="Henüz fiyatlanacak boy yok" description="Ürün eklendiğinde boyları burada listelenir." />;
  }
  return (
    <EmptyState
      title="Bu süzgeçte satır yok"
      description={
        serverScope
          ? `“${scopeLabel}” ölçütüne uyan boy yok.`
          : `“${scopeLabel}” ölçütüne uyan boy bulunamadı — yüklenmiş sayfalarda. Liste sayfalıdır; aşağı kaydırıp devamını yükleyince ölçüte uyan satır çıkabilir.`
      }
    />
  );
}
