import { Declaration } from './components/declaration';
import { FamilyBlock } from './components/family-block';
import { Gallery } from './components/gallery';
import { PurchaseBar, VariantPicker } from './components/purchase-panel';
import { Reviews } from './components/reviews';
import { SimilarStrip } from './components/similar-strip';
import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { DeliveryLine } from '@/components/customer/delivery/delivery-line';
import { Badge } from '@/components/customer/ui/badge';
import { StockMark, StockNoticeButton } from '@/components/customer/delivery/stock-mark';
import type { ProductViewProps } from './product-types';

/**
 * Ürün detay — mobil düzeni (tasarım: `Musteri - Urun Detay.dc.html`, "Urun Detay Mobil").
 *
 * Mobil bu sayfanın ASIL biçimi: sosyal medya ve WhatsApp trafiği doğrudan buraya düşer, sayfa tek
 * başına ilk izlenim olabilir (`musteri-urun-detay.md §7`). Bu yüzden çerçevesi de farklıdır —
 * duyuru şeridi ve gezinme yerine geri + paylaş taşıyan bir üst bar (`SiteFrame mobileChrome`);
 * geri bağlantısı sayfanın içinde ayrı bir satır DEĞİL, başlığın kendisidir.
 *
 * Akış: galeri (kaydırmalı) → künye → boy seçimi → teslimat güvencesi → beyan akordeonları →
 * yorumlar → benzer ürün şeridi. Adet + sepete ekle bu akışta DEĞİL: ekranın altına sabitlenir,
 * kaydırma boyunca yerinde kalır.
 */
export function ProductMobile({ t, locale, product, selected, onSelect, familyLabel, unavailable, reviews }: ProductViewProps) {
  return (
    // Alt boşluk sabit çubuğun yüksekliği kadar: çubuk son bölümü ve footer'ı örtmesin.
    <div className="flex flex-col pb-24">
      <div className="px-3">
        <Gallery images={product.gallery} alt={product.name} compact />
      </div>

      <section className="flex flex-col gap-3 px-4 pt-4">
        <div className="flex flex-col gap-1.5">
          {product.category && (
            <span className="font-sans text-eyebrow-sm text-olive uppercase">{product.category.name}</span>
          )}
          <h1 className="font-serif text-page-title-sm text-ink">{product.name}</h1>
          {/* Stok rozeti SEÇİLİ boyu anlatır — butonla çelişmemesi için. Tasarımda puan satırının
              sağına yaslıdır; puan satırı bugün yok (17), rozet o satırın yerinde tek başına durur.
              Rozet elle boyanıyordu ve tükendi hâlinde de YEŞİL çıkıyordu ("Tükendi" yazan yeşil bir
              rozet); K5 tonu anlamdan seçiyor. Yere bağlı iki hâlde yerini yer işareti alır (19.7). */}
          {selected &&
            (selected.stockStatus === 'available' || selected.stockStatus === 'out_of_stock' ? (
              <Badge tone={selected.soldOut ? 'closed' : 'positive'}>{selected.soldOut ? t.soldOut : t.inStock}</Badge>
            ) : (
              <StockMark status={selected.stockStatus} locale={locale} />
            ))}
        </div>

        {product.description && <p className="font-sans text-body-sm leading-relaxed text-body">{product.description}</p>}

        {/* Çeşit bloğu boy seçicinin ÜSTÜNDE — masaüstüyle aynı karar sırası (`§1b`). Mobilde de
            sabit çubuğun üstünde, akışın içinde kalır: sabitlense ekranın yarısını yerdi. */}
        <FamilyBlock t={t.family} locale={locale} members={product.family} currentUnavailable={unavailable} compact />

        {selected && (
          <VariantPicker t={t} locale={locale} variants={product.variants} selected={selected} onSelect={onSelect} familyLabel={familyLabel} compact />
        )}

        {/* Kargo kısıtı sepete eklemeden ÖNCE görünür (`musteri-urun-detay.md §2`). Mobilde etiketler
            kısalır — tasarım dar ekranda üç güvenceyi tek satırda tutuyor. */}
        <DeliveryLine
          locale={locale}
          shippable={product.shippable}
          status={selected?.stockStatus}
          fallback={{ ...t.assurance, coldChain: t.assurance.coldChainShort, doorstep: t.assurance.doorstepShort }}
          blockedActions={
            selected?.stockStatus === 'elsewhere' ? (
              <StockNoticeButton variantId={selected.id} productName={product.name} locale={locale} emphasis="panel" />
            ) : (
              <Link
                href={{ pathname: '/catalog', query: { shippable: '1' } }}
                className={buttonClass({ size: 'xs', className: '!text-micro' })}
              >
                {t.assurance.seeShippable}
              </Link>
            )
          }
          compact
        />
      </section>

      <div className="px-4 pt-4">
        <Declaration t={t} locale={locale} declaration={product.declaration} netWeightG={selected?.netWeightG ?? null} compact />
      </div>

      <div className="px-4 pt-5">
        <Reviews t={t} locale={locale} productId={product.id} productName={product.name} data={reviews} compact />
      </div>

      {product.similar.length > 0 && (
        <section className="flex flex-col gap-2.5 px-4 pt-5">
          <h2 className="font-serif text-h2-sm text-ink">{t.similar}</h2>
          <SimilarStrip products={product.similar} locale={locale} />
        </section>
      )}

      {selected && <PurchaseBar t={t} locale={locale} selected={selected} routeOnly={!product.shippable} fixed />}
    </div>
  );
}
