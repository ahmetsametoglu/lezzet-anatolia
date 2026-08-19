import { CATALOG_SORTS } from '@lezzet/types';
import { EmptyState, FilterChip } from '@/components/customer/ui/filter-controls';
import { SearchField } from '@/components/customer/ui/search-field';
import { SortSelect } from '@/components/customer/ui/sort-select';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import { LoadMore } from '@/components/customer/ui/load-more';
import { ShippableChip } from '@/components/customer/delivery/shippable-chip';
import { campaignNote } from '@/lib/storefront/campaign-note';
import { Link } from '@/i18n/navigation';
import type { CatalogViewProps } from './catalog-types';

/**
 * Katalog — masaüstü düzeni (tasarım: `Musteri - Katalog.dc.html`, "Katalog Web").
 * Başlık → kategori çipleri → sonuç sayısı + süzgeç/sıralama → 4 sütun ürün ızgarası.
 *
 * Süzgeç değişince sayfanın ÜST BLOĞU sabit kalır: başlık yalnız metnini değiştirir, beliren/kaybolan
 * öğe yoktur. Filtrelerken içeriğin aşağı kayması (layout shift) kullanıcıya "ekran zıplıyor" hissi
 * verir — seçili kategori zaten iki yerde görünür (başlık metni + işaretli çip), üçüncü bir gösterge
 * eklenmez.
 *
 * Koleksiyon görünümü (tasarımdaki "Durum: koleksiyon görünümü" varyantı — üstbaşlıklı başlık bandı)
 * 08.26'da AÇILDI ve künyenin öngördüğü gibi oldu: yalnız başlık bloğu değişiyor, gerisi aynı kalıyor.
 * Ayrı bir rota değil, katalogun bir hâli (`?collection=<slug>`).
 */
export function CatalogDesktop({ t, locale, placeMode, data, products, hasMore, loadingMore, onLoadMore, active, hrefFor, search }: CatalogViewProps) {
  /* Cümlenin türetmesi TEK YERDE (`lib/storefront/campaign-note`): mobil fork da aynı kapıyı
     çağırıyor, iki cihaz forkunun aynı kampanyayı farklı yazması imkânsız. */
  const note = campaignNote(data.campaign, t.campaign, locale);
  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-5 px-12 pt-9 pb-5">
        {/* Arama BAŞLIKLA aynı satırda: çerçeveden buraya indi (28.07) — sonucu gösteren sayfada
            durması hem üst çubuğu boşaltıyor hem "ne aradığım"ı sonucun yanında tutuyor. */}
        {/* KOLEKSİYON GÖRÜNÜMÜ — başlık bandı değişir, gerisi aynı kalır (tasarım: "Durum:
            koleksiyon görünümü"). Ayrı bir sayfa AÇILMADI ve bu kullanıcı kararı: koleksiyon
            kataloğun bir kesiti, ayrı bir mağaza değil — süzgeç, sıralama ve sayfalama aynen
            çalışmalı. Ayrı sayfa olsaydı bunların hepsi ikinci kez yazılırdı. */}
        {data.activeCollection && (
          <span className="font-sans text-eyebrow font-semibold uppercase tracking-wider text-olive">{t.collectionTag}</span>
        )}

        <div className="flex items-center justify-between gap-6">
          <h1 className="font-serif text-page-title text-ink">{data.activeCollection?.name ?? data.activeCategory?.name ?? t.title}</h1>
          {data.activeCollection ? (
            // Çıkış yolu ARAMANIN yerinde: koleksiyon görünümündeyken müşterinin ilk ihtiyacı
            // "buradan nasıl çıkarım", arama değil. Süzgeci temizler, ötekilere dokunmaz.
            <Link href={hrefFor({ collection: null })} className="cursor-pointer font-sans text-note font-bold text-olive hover:text-olive-dark">
              {t.collectionExit}
            </Link>
          ) : (
            <SearchField placeholder={t.searchPlaceholder} clearLabel={t.searchClear} defaultValue={search} />
          )}
        </div>

        {data.activeCollection?.description && (
          <p className="max-w-[760px] font-sans text-body-sm leading-relaxed text-body">{data.activeCollection.description}</p>
        )}

        {/* KAMPANYA CÜMLESİ (08.44) — kesitin başlığının altında, listeden önce. Müşteri bu kesite
            girdiğinde kampanyayı sepete gelmeden öğreniyor (MB-22b). Cümle bir FİYAT VAADİ DEĞİL
            ve öyle yazıldı ("sepette uygulanır"): kampanya sepetten bağımsız olmadığı için kart
            fiyatı değişmiyor. Zeytin zemin — kazanç bilgisi, uyarı değil. */}
        {note && (
          <p className="max-w-[760px] rounded-soft bg-olive-bg px-4 py-3 font-sans text-body-sm leading-relaxed text-olive-dark" data-testid="catalog-campaign">
            {note}
          </p>
        )}

        {/* Kategori çipleri koleksiyon görünümünde GİZLENİR (tasarımın açık kuralı): koleksiyon
            zaten bir seçkidir, üstüne kategori bölmesi sunmak müşteriye "bu seçki neydi"yi
            unutturur. Süzgeç/sıralama satırı aşağıda aynen kalır. */}
        {!data.activeCollection && (
          <div className="flex flex-wrap gap-2.5">
            <FilterChip label={t.all} href={hrefFor({ category: null })} active={!active.category} />
            {data.categories.map((c) => (
              <FilterChip key={c.id} label={c.name} href={hrefFor({ category: c.slug })} active={active.category === c.slug} />
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <span className="font-sans text-body-sm text-muted">{t.count.replace('{n}', String(data.total))}</span>
          <span className="flex-1" />
          {/* Kargo çipi fırsat çipinin SOLUNDA: "nereye gidecek" sorusu "hangisi indirimli"den önce
              gelir. Varsayılan kapalı — katalog kendiliğinden küçülmez (tasarım).
              Üç hâli `ShippableChip` taşır (08.27): yer bilinmiyorsa süzmez, adresi sorar; bölge
              içinde hiç çizilmez (süzecek şey yok); yalnız bölge dışında gerçek bir süzgeçtir. */}
          <ShippableChip
            mode={placeMode}
            locale={locale}
            label={t.onlyShippable}
            askLabel={t.shippableAsk}
            href={hrefFor({ onlyShippable: !active.onlyShippable })}
            active={active.onlyShippable}
          />
          <FilterChip label={t.onlyOffers} href={hrefFor({ onlyOffers: !active.onlyOffers })} active={active.onlyOffers} tone="offer" size="control" />
          <SortSelect
            label={t.sortLabel}
            currentLabel={t.sort[active.sort]}
            options={CATALOG_SORTS.map((s) => ({ label: t.sort[s], href: hrefFor({ sort: s }), active: active.sort === s }))}
          />
        </div>
      </section>

      {products.length === 0 ? (
        <div className="px-12 pb-12">
          <EmptyState title={t.empty.title} body={t.empty.body} action={{ label: t.empty.cta, href: '/catalog' }} icon="🔍" />
        </div>
      ) : (
        <section className="grid grid-cols-4 gap-[18px] px-12 pt-1 pb-12">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} locale={locale} labels={{ ...t.card, limit: null }} />
          ))}
        </section>
      )}

      <div className="px-12">
        <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} label={t.loadMore} loadingLabel={t.loading} />
      </div>
    </div>
  );
}
