import { useCallback, useState, useTransition } from 'react';
import type { StorefrontProduct } from '@lezzet/application';
import { cardBadgeOf, cardPlaceNoteOf, placeMarkOf, productPriceLabel } from '@lezzet/helper';
import catalogMessages from '@lezzet/i18n/customer/catalog';
import placeMessages from '@lezzet/i18n/customer/place';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { Chip } from '@/components/customer/phone-kit/chip';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { LoadingState } from '@/components/customer/phone-kit/loading-state';
import { PlaceNoticeBand } from '@/components/customer/phone-kit/place-notice-band';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { ProductPhotoCard } from '@/components/customer/phone-kit/product-photo-card';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { useRouter } from '@/i18n/navigation';
import { campaignNote } from '@/lib/storefront/campaign-note';
import { useLoadMore } from '@/lib/use-load-more.hook';
import { useSearchDraft } from '@/lib/use-search-draft.hook';
import { CatalogPhoneSkeleton } from './components/catalog-phone-skeleton';
import { CatalogSortSheet } from './components/catalog-sort-sheet';
import type { CatalogFilterPatch, CatalogViewProps } from './catalog-types';

/**
 * Katalogun telefon görünümü, native katalogun web ikizi; süzgeç adreste yaşar ki liste paylaşılabilsin ve tarayıcının geri
 * hareketi çalışsın, bu yüzden her süzgeç değişimi sayfayı sunucuda yeniden çözer. `h1` arama motoru için sayfada durur:
 * koleksiyon açıksa görünen başlıktır, değilse ekran okuyucuda.
 */

/** Kategori rayı — native `ScrollView horizontal`ın karşılığı; kaydırma çubuğu gizli. */
const RAIL = 'flex gap-2 overflow-x-auto px-4.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export function CatalogMobile({ t, locale, data, products, hasMore, loadingMore, tailFailed, onLoadMore, active, hrefFor, search }: CatalogViewProps) {
  const copy = catalogMessages[locale];
  const placeCopy = placeMessages[locale];
  const router = useRouter();
  const { place } = useDeliveryPlace();
  const [pending, startTransition] = useTransition();
  const [sheetOpen, setSheetOpen] = useState(false);
  // `Dialog`un odak tuzağı kapanma işlevine bağlı — kimliği her çizimde değişmesin.
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  /** Süzgeç değişimi: adres ilerler, sayfa sunucuda yeniden çözülür; geçiş sürerken iskelet çizilir. */
  const go = (patch: CatalogFilterPatch, mode: 'push' | 'replace' = 'push') => {
    const href = hrefFor(patch);
    startTransition(() => (mode === 'push' ? router.push(href) : router.replace(href)));
  };

  // Arama parmak durunca gider (sistemin tek gecikmesi) ve geçmişe satır eklemez.
  const { draft, onDraft, reset } = useSearchDraft(search ?? '', (term) => go({ search: term === '' ? null : term }, 'replace'));
  const clearSearch = () => {
    reset('');
    go({ search: null }, 'replace');
  };

  /* Süzgeç düğmesinin dolu hâli — ekranda görünmeyen bir daraltma var (native `filtersActive`). Kategori
     ve koleksiyon sayılmaz: ikisi de başlıkta kendi hâliyle duruyor. */
  const filtersActive = active.sort !== 'featured' || active.onlyOffers || active.onlyShippable;
  /* Boş listenin çıkışı yalnız SÜZGEÇ VARKEN (native): süzgeçsiz boş katalogda "tüm katalog" aynı boş listeye
     götürürdü. Arama da, yer ve indirim anahtarı da bir süzgeçtir. */
  const filtered = Boolean(active.category) || Boolean(search) || active.onlyShippable || active.onlyOffers;
  const clearFilters = () => {
    reset('');
    go({ category: null, search: null, onlyShippable: false, onlyOffers: false });
  };

  // Bant yalnız ÇÖZÜLMÜŞ ve ROTA DIŞI yerde (native kapısı); yer bağlamı sunucunun ilk karesiyle gelir.
  const noticePlace = place !== null && !place.inRoute ? place : null;
  const campaignLine = campaignNote(data.campaign, copy.campaign, locale);
  // Kuyruk düştüyse gözlemci susar — kendiliğinden yeniden denemek düşen isteği döngüye sokardı.
  const tail = useLoadMore({ hasMore: hasMore && !tailFailed, loading: loadingMore, onLoadMore });

  /** Sözleşme satırı → kart — native `cardOf`un karşılığı; cümleler ortak kuruculardan. */
  const cardOf = (product: StorefrontProduct) => {
    const { note: placeNote, dimmed } = cardPlaceNoteOf(placeMarkOf(product.stockStatus, place, placeCopy));
    return {
      name: product.name,
      image: product.image,
      priceLabel: productPriceLabel(product.priceCents, product.variantCount, locale),
      soldOut: product.soldOut,
      soldOutLabel: copy.card.soldOut,
      discountLabel: cardBadgeOf(product, { offer: copy.card.offer }),
      placeNote,
      dimmed,
      // "1 seçenek" yazılmaz — olmayan bir seçim varmış izlenimi verirdi.
      optionsLabel: product.variantCount > 1 ? copy.card.options.replace('{n}', String(product.variantCount)) : undefined,
    };
  };

  /* Liste sonu — native'in dört hâli: kuyruk yükleniyor · kuyruk düştü (tekrar dene) · liste bitti; web'e
     özgü dördüncüsü gözlemcinin tur sınırı (açık "daha fazla"). İlk yükün göstergesi bu değil, iskelettir. */
  const tailView = loadingMore ? (
    <div className="py-3.5">
      <LoadingState label={copy.loading} />
    </div>
  ) : tailFailed ? (
    <div className="flex justify-center py-3.5">
      <PrimaryButton label={copy.error.retry} onClick={onLoadMore} />
    </div>
  ) : hasMore && !tail.autoActive ? (
    <div className="flex justify-center py-3.5">
      <PrimaryButton label={t.loadMore} onClick={tail.loadMore} />
    </div>
  ) : !hasMore && products.length > 0 ? (
    <p className="pt-2 pb-3 text-center font-sans text-micro font-semibold text-sand-600">{copy.listEnd}</p>
  ) : null;

  return (
    <div className="flex flex-col">
      {data.activeCollection === null && <h1 className="sr-only">{data.activeCategory?.name ?? t.title}</h1>}

      {/* Başlık kaydırmada yerinde kalır (native'de listenin dışında durur; burada yapışkan). */}
      <header className="sticky top-0 z-20 flex flex-col gap-2.5 border-b-[1.5px] border-ink bg-sand-50 pt-2 pb-2.5">
        <div className="flex items-center gap-2.5 px-4.5">
          <div role="search" className="flex h-11.5 min-w-0 flex-1 items-center gap-2 rounded-control border-[1.5px] border-ink px-4">
            <MobileIcon name="search" size={17} className="text-muted" />
            <input
              type="search"
              value={draft}
              onChange={(e) => onDraft(e.target.value)}
              placeholder={copy.search.placeholder}
              // Yer tutucu ekran okuyucu için ad değildir — yazmaya başlayınca kaybolur.
              aria-label={copy.search.label}
              enterKeyHint="search"
              className="min-w-0 flex-1 bg-transparent font-sans text-body-sm text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
            />
            {/* Temizle yalnız yazı varken: boşken duran düğme kutunun içinde gürültü olurdu. */}
            {draft.length > 0 && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={copy.search.clear}
                className="-m-2 flex flex-none cursor-pointer p-2 text-muted transition-colors hover:text-ink"
              >
                <MobileIcon name="close" size={17} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label={copy.filter.label}
            aria-haspopup="dialog"
            className={[
              'flex size-11.5 flex-none cursor-pointer items-center justify-center rounded-full border border-ink transition-[scale,opacity] active:scale-[0.97]',
              filtersActive ? 'bg-sand-150 text-olive-dark' : 'text-ink hover:opacity-70',
            ].join(' ')}
          >
            <MobileIcon name="filter" size={17} />
          </button>
        </div>

        {/* Koleksiyon açıkken kategori rayı çizilmez: kesit kategori havuzunu da daralttığı için rayda yalnız "Tümü" kalırdı. */}
        {data.activeCollection !== null ? (
          <div className="flex items-center gap-2.5 px-4.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{copy.collection.eyebrow}</span>
              <h1 className="truncate font-serif text-h2-sm leading-[1.15] text-ink">{data.activeCollection.name}</h1>
            </div>
            <button
              type="button"
              onClick={() => go({ collection: null })}
              aria-label={copy.collection.clear}
              className="-m-2 flex flex-none cursor-pointer p-2 text-terracotta transition-opacity hover:opacity-70"
            >
              <MobileIcon name="close" size={20} bold />
            </button>
          </div>
        ) : (
          <div className={RAIL}>
            {/* "Tümü" bir kategori değil, süzgecin yokluğudur — hep başta. */}
            <Chip label={copy.all} selected={!active.category} onClick={() => go({ category: null })} />
            {data.categories.map((category) => (
              <Chip key={category.id} label={category.name} selected={active.category === category.slug} onClick={() => go({ category: category.slug })} />
            ))}
          </div>
        )}

        {/* Kampanya cümlesi fiyat vaadi değil, "sepette uygulanır" der; zemin zeytin, çünkü bu bir kazanç bilgisi. */}
        {campaignLine !== null && (
          <p data-testid="catalog-campaign" className="mx-4.5 rounded-control bg-olive-bg px-3.5 py-2.5 font-sans text-body-sm leading-[1.6] text-olive-dark">
            {campaignLine}
          </p>
        )}
      </header>

      {pending ? (
        <CatalogPhoneSkeleton label={copy.loading} />
      ) : (
        <div className="grid grid-cols-2 gap-x-3.5 gap-y-5 px-5.5 pt-5 pb-3">
          {/* Bant listenin BAŞINDA, başlıkta değil: adresin gerçeği bir kez okunur, sonra kaydırılıp geçilir. */}
          {noticePlace !== null && (
            <div className="col-span-2 pb-2">
              <PlaceNoticeBand
                locale={locale}
                postalCode={noticePlace.postalCode}
                placeName={noticePlace.placeName}
                shippableFilter={{ value: active.onlyShippable, onChange: () => go({ onlyShippable: !active.onlyShippable }) }}
              />
            </div>
          )}
          {products.length === 0 ? (
            <div className="col-span-2">
              <EmptyState
                icon={<MobileIcon name="search-empty" size={80} className="text-sand-600" />}
                title={copy.empty.title}
                description={copy.empty.body}
                action={filtered ? <PrimaryButton label={copy.empty.cta} onClick={clearFilters} /> : undefined}
              />
            </div>
          ) : (
            products.map((product) => (
              <ProductPhotoCard key={product.id} href={{ pathname: '/product/[slug]', params: { slug: product.slug } }} {...cardOf(product)} />
            ))
          )}
        </div>
      )}

      {/* Nöbetçi geçişte de yerinde kalır: gözlemci öğeyi bir kez bağlıyor, sökülüp yeniden çizilen öğeyi
          görmezdi ve süzgeç değişince sonsuz kaydırma dururdu. */}
      <div ref={tail.ref} className="px-5.5">
        {pending ? null : tailView}
      </div>

      {sheetOpen && (
        <CatalogSortSheet
          copy={copy}
          sort={active.sort}
          onlyOffers={active.onlyOffers}
          offersLabel={t.offersSwitch}
          closeLabel={t.close}
          onSort={(sort) => {
            setSheetOpen(false);
            go({ sort });
          }}
          onToggleOffers={() => {
            setSheetOpen(false);
            go({ onlyOffers: !active.onlyOffers });
          }}
          onClose={closeSheet}
        />
      )}
    </div>
  );
}
