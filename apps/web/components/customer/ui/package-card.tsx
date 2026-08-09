import { RATIO_SOURCE, type StockStatus } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { FramedImage } from '@/components/media/framed-image';
import { StockMark } from '@/components/customer/delivery/stock-mark';
import { Link } from '@/i18n/navigation';
import { formatPrice, formatWeight } from '@/lib/storefront/format';
import type { StorefrontPackage } from '@/lib/storefront/storefront-types';
import { buttonClass } from './button';

/**
 * K28 · Paket Liste Kartı — Paketler sayfasının tek yapı taşı (tasarım: `Musteri - Paketler.dc.html`).
 *
 * **Kartın TAMAMI bağlantıdır** ve detaya gider; listede "sepete ekle" YOKTUR. Sebep tasarımda
 * yazılı: paket bütün olarak satılıyor, karar detayda veriliyor — listeden tek dokunuşla sepete
 * atmak, içeriğini görmeden 50 €'luk bir sofra almak demek.
 *
 * Künye satırları TÜRETİLMİŞ bilgilerdir ve **hesaplanamıyorsa hiç basılmaz** (uydurulmaz):
 * "kaç kişilik" girilmemişse rozet yok, bir kalemin ağırlığı bilinmiyorsa ağırlık satırı yok.
 * Kalem sayısı ve ağırlık AYRI satırlardır (tasarım) — tek satırda birleştirilince kartın dikey
 * ritmi kayboluyor ve uzun adlı dilde (DE) sarıp iki satıra düşüyor.
 *
 * Tükendi hâli kartı GİZLEMEZ, soluklaştırır: paket bir pazarlama aracı — sosyal medyada dolaşan
 * link boşa düşmemeli, "yakında yeniden" beklentisi sürmeli. Kart tıklanabilir kalır.
 */
interface PackageCardLabels {
  serves: string;
  items: string;
  weight: string;
  inStock: string;
  shippable: string;
  inRouteOnly: string;
  soldOut: string;
  /** Mobil kartta yer yok — uzun cümle iki satıra sarıp fiyatı aşağı itiyor. */
  soldOutShort: string;
  cta: string;
}

interface PackageListCardProps {
  pack: StorefrontPackage;
  locale: Locale;
  labels: PackageCardLabels;
  /** Mobil ızgara: iki sütun, dolayısıyla kart yarı genişlikte — açıklama ve düğme düşer. */
  compact?: boolean;
  /**
   * TEK paket kaldığında (tasarım "Durumlar" bölümü): ızgara yerine tam genişlikte YATAY kart.
   * Gerekçesi tasarımda yazılı — 1/3 genişlikte yalnız kalan kart zayıf görünür. Künye tek satıra
   * iner ("6 kişilik · 8 ürün · 4,2 kg"), açıklama kartın içinde uzun hâliyle yer alır.
   */
  wide?: boolean;
}

/**
 * **Paketin YOLU → ürün kartının stok dili** (19.22 ekran ucu, arka-uç talebi 09.08).
 *
 * `CartLineRoute` ile `StockStatus` iki ayrı enum ama aynı dört soruyu soruyor; eşleyip `StockMark`
 * kullanmak, paket için ikinci bir cümle ailesi yazmaktan iyidir — müşteri aynı bilgiyi ürün
 * kartında ve paket kartında farklı kelimelerle okumamalı (`CLAUDE §1`).
 *
 * `null` = **yer bilinmiyor**, işaret çizilmez. `local` de işaretsiz: "adresine geliyor" varsayılan
 * hâldir, her karta yazmak gürültü olurdu (ürün kartının `available` kararının aynısı).
 *
 * `unavailable` BİLEREK eşlenmiyor: o hâlde `soldOut` zaten devrede ve kart tek çipe iniyor —
 * "tükendi" ile "buraya gelmiyor" aynı anda yazılırsa hangisinin geçerli olduğu belirsizleşir.
 */
function stockStatusOfRoute(route: StorefrontPackage['route']): StockStatus | null {
  if (route === 'shipping') return 'shipping';
  if (route === 'not_shippable_here') return 'elsewhere';
  return null;
}

export function PackageListCard({ pack, locale, labels, compact = false, wide = false }: PackageListCardProps) {
  if (wide) return <WidePackageCard pack={pack} locale={locale} labels={labels} />;
  const stockStatus = stockStatusOfRoute(pack.route);
  return (
    <Link
      href={{ pathname: '/package/[slug]', params: { slug: pack.slug } }}
      className={[
        'flex cursor-pointer flex-col overflow-hidden rounded-card border border-sand-200 bg-card transition-colors hover:border-olive-line',
        pack.soldOut ? 'opacity-70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="relative">
        <FramedImage src={pack.image.url} alt={pack.name} ratio={RATIO_SOURCE} crop={pack.image.crop} className="!rounded-none" />
        {/* "6 kişilik" künyesi fotoğrafın üstünde durur; girilmemişse rozet HİÇ çizilmez. */}
        {pack.serves !== null && (
          <span
            className={[
              'pointer-events-none absolute rounded-soft bg-ink/80 font-sans font-bold text-white',
              compact ? 'top-2 left-2 px-2 py-0.5 text-micro' : 'top-3 left-3 px-2.5 py-1 text-micro',
            ].join(' ')}
          >
            {labels.serves.replace('{n}', String(pack.serves))}
          </span>
        )}
      </div>

      <div className={['flex flex-1 flex-col gap-1', compact ? 'px-3 pt-2.5 pb-3' : 'gap-2 px-4.5 pt-4 pb-4.5'].join(' ')}>
        <span className={['font-serif text-ink', compact ? 'text-card-title-sm' : 'text-h2-sm'].join(' ')}>{pack.name}</span>

        {/* Künye satırları tükenmiş kartta da KALIR (tasarım): müşteri paketin ne olduğunu görmeli,
            "yakında yeniden" beklentisi ancak içerik bilinirse anlam taşır. Mobilde ise düşer —
            yarı genişlikteki kartta beş satır sığmıyor, orada tek şey söylenir: tükendi.
            Ağırlık hesaplanamadıysa satır HİÇ basılmaz; "bilinmiyor" yazılmaz. */}
        {!(compact && pack.soldOut) && (
          <>
            <span className={['font-sans text-muted', compact ? 'text-micro' : 'text-note'].join(' ')}>
              {labels.items.replace('{n}', String(pack.itemCount))}
            </span>
            {pack.totalWeightG !== null && (
              <span className={['font-sans text-muted', compact ? 'text-micro' : 'text-note'].join(' ')}>
                {labels.weight.replace('{weight}', formatWeight(pack.totalWeightG, locale))}
              </span>
            )}

            {/* Açıklama kartın esneyen parçası: ızgara boyunca kart yükseklikleri eşitlensin diye
                `flex-1` ondadır, fiyat satırı böylece daima alt hizada durur (tasarım). */}
            {!compact && pack.description && (
              <p className="line-clamp-3 flex-1 font-sans text-note leading-relaxed text-body">{pack.description}</p>
            )}
          </>
        )}

        {/* Durum çipleri. Tükenmişte TEK çip kalır — satın alınamayan pakette "stokta/kargoya uygun"
            bilgisi kendi kendini yalanlar. Stokta olanda masaüstü stok + kargoyu yan yana verir;
            mobilde yalnız KISIT gösterilir, dar kartta iki çip alt alta düşüp fiyatı aşağı itiyor
            ve "stokta" zaten varsayılan. */}
        <div className={['flex flex-wrap items-center gap-1.5', compact ? '' : 'mt-0.5'].join(' ')}>
          {pack.soldOut ? (
            <span className="rounded-soft bg-closed-bg px-2.5 py-1 font-sans text-micro font-semibold text-ink">
              {compact ? labels.soldOutShort : labels.soldOut}
            </span>
          ) : (
            <>
              {/* "Stokta" AĞ GENELİDİR ve yer bilinince yerini yere bağlı gerçeğe bırakır: müşteri
                  için "bir yerde var" değil "bana gelir mi" anlamlıdır. Yer bilinmiyorsa (çerez
                  girilmemiş) bugünkü hâl aynen sürüyor. */}
              {!compact && !stockStatus && (
                <span className="rounded-soft bg-olive-bg px-2.5 py-0.5 font-sans text-micro font-semibold whitespace-nowrap text-olive-dark">
                  {labels.inStock}
                </span>
              )}
              {stockStatus && <StockMark status={stockStatus} locale={locale} />}
              {/* Kargo kısıtı çipi YALNIZ yer bilinmiyorken: `route` doluyken aynı soruyu daha
                  kesin cevaplıyor ("kargolanamaz" ↔ "senin adresine gelmez") ve iki çip yan yana
                  müşteriye aynı şeyi iki kez, iki farklı kesinlikte söylerdi. */}
              {!stockStatus && (
                <span
                  className={[
                    'rounded-soft px-2.5 py-0.5 font-sans text-micro font-semibold whitespace-nowrap',
                    pack.inRouteOnly ? 'border border-honey-line bg-honey-bg text-honey' : 'bg-olive-bg text-olive-dark',
                  ].join(' ')}
                >
                  {pack.inRouteOnly ? labels.inRouteOnly : labels.shippable}
                </span>
              )}
            </>
          )}
        </div>

        <div className={['mt-auto flex items-center justify-between gap-2', compact ? 'pt-1.5' : 'pt-1'].join(' ')}>
          <span
            className={[
              'font-sans font-bold',
              compact ? 'text-body' : 'text-card-title',
              pack.soldOut ? 'text-muted' : 'text-ink',
            ].join(' ')}
          >
            {formatPrice(pack.priceCents, locale)}
          </span>
          {/* Mobilde düğme yok: kartın tamamı zaten bağlantı, dar kartta düğme yalnız yer kaplar. */}
          {!compact && (
            <span
              className={buttonClass({
                size: 'sm',
                // Tükenmişte düğme SOLUK ama duruyor: kart yine detaya tıklanabilir, kapalı olan
                // yalnız sepete ekleme. Düğmeyi kaldırmak "burada bakılacak bir şey yok" derdi.
                className: ['!px-5 !py-2.5 !text-body-sm', pack.soldOut ? '!bg-disabled-fill' : ''].join(' '),
              })}
            >
              {labels.cta}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Tek paket kaldığında kullanılan yatay kart — ızgaranın tek elemanlı hâli yerine (tasarım). */
function WidePackageCard({ pack, locale, labels }: Omit<PackageListCardProps, 'compact' | 'wide'>) {
  const stockStatus = stockStatusOfRoute(pack.route);
  // Künye tek satırda birleşir; hesaplanamayan parça sessizce düşer, ayraç ondan sonra kurulur.
  const meta = [
    pack.serves !== null ? labels.serves.replace('{n}', String(pack.serves)) : null,
    labels.items.replace('{n}', String(pack.itemCount)),
    pack.totalWeightG !== null ? formatWeight(pack.totalWeightG, locale) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      href={{ pathname: '/package/[slug]', params: { slug: pack.slug } }}
      className={[
        'flex cursor-pointer overflow-hidden rounded-card border border-sand-200 bg-card transition-colors hover:border-olive-line',
        pack.soldOut ? 'opacity-70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="w-[260px] flex-none">
        <FramedImage src={pack.image.url} alt={pack.name} ratio={RATIO_SOURCE} crop={pack.image.crop} className="!rounded-none" />
      </div>
      <div className="flex flex-1 flex-col gap-2 px-6 py-5">
        <span className="font-serif text-h2-sm text-ink">{pack.name}</span>
        <span className="font-sans text-note text-muted">{meta}</span>
        {pack.description && <p className="flex-1 font-sans text-note leading-relaxed text-body">{pack.description}</p>}
        {/* Çip kuralı DAR KARTIN aynısı (`PackageListCard`): yer biliniyorsa yola bağlı işaret,
            bilinmiyorsa kargo kısıtı çipi. İki dal aynı soruyu iki türlü cevaplayamaz — sayfanın
            ilk kartı geniş, gerisi dar ve müşteri ikisini yan yana görüyor. */}
        <div className="flex items-center gap-1.5">
          {pack.soldOut ? (
            <span className="rounded-soft bg-closed-bg px-2.5 py-1 font-sans text-micro font-semibold text-ink">{labels.soldOut}</span>
          ) : stockStatus ? (
            <StockMark status={stockStatus} locale={locale} />
          ) : (
            <span
              className={[
                'rounded-soft px-2.5 py-0.5 font-sans text-micro font-semibold whitespace-nowrap',
                pack.inRouteOnly ? 'border border-honey-line bg-honey-bg text-honey' : 'bg-olive-bg text-olive-dark',
              ].join(' ')}
            >
              {pack.inRouteOnly ? labels.inRouteOnly : labels.shippable}
            </span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-1">
          <span className={['font-sans text-card-title font-bold', pack.soldOut ? 'text-muted' : 'text-ink'].join(' ')}>
            {formatPrice(pack.priceCents, locale)}
          </span>
          <span
            className={buttonClass({
              size: 'sm',
              className: ['!px-5 !py-2.5 !text-body-sm', pack.soldOut ? '!bg-disabled-fill' : ''].join(' '),
            })}
          >
            {labels.cta}
          </span>
        </div>
      </div>
    </Link>
  );
}
