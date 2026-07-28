import { Declaration } from './components/declaration';
import { Gallery } from './components/gallery';
import { PurchaseBar, VariantPicker } from './components/purchase-panel';
import { Reviews } from './components/reviews';
import { SimilarStrip } from './components/similar-strip';
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
export function ProductMobile({ t, locale, product, selected, onSelect }: ProductViewProps) {
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
              sağına yaslıdır; puan satırı bugün yok (17), rozet o satırın yerinde tek başına durur. */}
          {selected && (
            <span className="w-max rounded-soft bg-olive-bg px-2.5 py-0.5 font-sans text-note font-semibold text-olive">
              {selected.soldOut ? t.soldOut : t.inStock}
            </span>
          )}
        </div>

        {product.description && <p className="font-sans text-body-sm leading-relaxed text-body">{product.description}</p>}

        {selected && (
          <VariantPicker t={t} locale={locale} variants={product.variants} selected={selected} onSelect={onSelect} compact />
        )}

        {/* Kargo kısıtı sepete eklemeden ÖNCE görünür (`musteri-urun-detay.md §2`). Mobilde etiketler
            kısalır — tasarım dar ekranda üç güvenceyi tek satırda tutuyor. */}
        <div className="flex flex-wrap gap-4 rounded-soft bg-sand-100 px-3.5 py-2.5 font-sans text-micro text-body">
          {product.shippable ? (
            <>
              <span>{t.assurance.coldChainShort}</span>
              <span>{t.assurance.doorstepShort}</span>
              <span>{t.assurance.shippable}</span>
            </>
          ) : (
            <span>{t.assurance.notShippable}</span>
          )}
        </div>
      </section>

      <div className="px-4 pt-4">
        <Declaration t={t} locale={locale} declaration={product.declaration} netWeightG={selected?.netWeightG ?? null} compact />
      </div>

      <div className="px-4 pt-5">
        <Reviews t={t} compact />
      </div>

      {product.similar.length > 0 && (
        <section className="flex flex-col gap-2.5 px-4 pt-5">
          <h2 className="font-serif text-h2-sm text-ink">{t.similar}</h2>
          <SimilarStrip products={product.similar} locale={locale} />
        </section>
      )}

      {selected && <PurchaseBar t={t} selected={selected} fixed />}
    </div>
  );
}
