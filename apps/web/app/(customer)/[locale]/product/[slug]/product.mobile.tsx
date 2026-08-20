import { Declaration } from './components/declaration';
import { FamilyBlock } from './components/family-block';
import { Gallery } from './components/gallery';
import { PurchaseBar, VariantPicker } from './components/purchase-panel';
import { Reviews } from './components/reviews';
import { SimilarStrip } from './components/similar-strip';
import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { BackButton } from '@/components/customer/ui/back-button';
import { ShareButton } from '@/components/customer/ui/share-button';
import { DeliveryLine } from '@/components/customer/delivery/delivery-line';
import { Badge } from '@/components/customer/ui/badge';
import { ColdChainMark, StockMark, StockNoticeButton } from '@/components/customer/delivery/stock-mark';
import type { ProductViewProps } from './product-types';

/**
 * Ürün detay — mobil düzeni (tasarım: `Musteri - Urun Detay.dc.html`, "Urun Detay Mobil").
 *
 * Mobil bu sayfanın ASIL biçimi: sosyal medya ve WhatsApp trafiği doğrudan buraya düşer, sayfa tek
 * başına ilk izlenim olabilir (`musteri-urun-detay.md §7`).
 *
 * BAŞLIK YOK (kullanıcı kararı 20.08, sekizinci tur): görsel ekranın tepesine yaslı ve kenardan
 * kenara — kart değil, sayfanın kendisi (native ürün ekranının kahraman deseni). Geri düğmesi
 * fotoğrafın sol üstünde krem daire (`BackButton photo`); sepete giden yol çerçevenin sağ alttaki
 * yüzen düğmesi (`CartFab`). Üst bar + boş krem şerit "kötü bir boşluk" bırakıyordu (kullanıcı
 * görüntüyle gösterdi).
 *
 * Akış: galeri (kaydırmalı) → künye → boy seçimi → teslimat güvencesi → SATIN ALMA → beyan
 * akordeonları → yorumlar → benzer ürün şeridi. Sepete ekle artık sabit çubukta DEĞİL, akışın
 * karar bölgesinde: kararın malzemesi (boy, fiyat, teslimat) hemen üstünde duruyor.
 */
export function ProductMobile({ t, locale, product, selected, onSelect, familyLabel, unavailable, reviews }: ProductViewProps) {
  return (
    // Alt boşluk yüzen sepet düğmesi için: daire son bölümün metnini örtmesin.
    <div className="flex flex-col pb-16">
      <div className="relative">
        <Gallery images={product.gallery} alt={product.name} compact flush />
        <div className="absolute top-3 left-3 z-10">
          <BackButton label={t.backLabel} fallback="/catalog" variant="photo" />
        </div>
      </div>

      <section className="flex flex-col gap-3 px-4 pt-4">
        <div className="flex flex-col gap-1.5">
          {product.category && (
            <span className="font-sans text-eyebrow-sm text-olive uppercase">{product.category.name}</span>
          )}
          {/* Paylaş adın YANINDA (kullanıcı kararı 20.08, yedinci tur) — düğme neyin yanındaysa
              onu paylaşır; başlıkta bağlamsız duruyordu. */}
          <div className="flex items-start justify-between gap-2">
            <h1 className="font-serif text-page-title-sm text-ink">{product.name}</h1>
            <ShareButton label={t.share} subject={{ subjectType: 'product', subjectId: product.id, productId: product.id }} />
          </div>
          {/* Stok rozeti SEÇİLİ boyu anlatır — butonla çelişmemesi için. Tasarımda puan satırının
              sağına yaslıdır; puan satırı bugün yok (17), rozet o satırın yerinde tek başına durur.
              Rozet elle boyanıyordu ve tükendi hâlinde de YEŞİL çıkıyordu ("Tükendi" yazan yeşil bir
              rozet); K5 tonu anlamdan seçiyor. Yere bağlı iki hâlde yerini yer işareti alır (19.7). */}
          {/* Soğuk zincir işareti rozetin YANINDA — masaüstüyle aynı karar (16.08): ürünün künyesi,
              teslimat kutusunun ayrıntısı değil. */}
          <div className="flex flex-wrap items-center gap-2">
            {selected &&
              (selected.stockStatus === 'available' || selected.stockStatus === 'out_of_stock' ? (
                <Badge tone={selected.soldOut ? 'closed' : 'positive'}>{selected.soldOut ? t.soldOut : t.inStock}</Badge>
              ) : (
                <StockMark status={selected.stockStatus} locale={locale} size="lg" />
              ))}
            {product.coldChain && <ColdChainMark label={t.assurance.coldChainShort} />}
          </div>
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
          fallback={{ ...t.assurance, doorstep: t.assurance.doorstepShort }}
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

        {/* Satın alma AKIŞTA, karar bölgesinin sonunda (sekizinci tur): boy seçimi ve teslimat
            güvencesinin hemen altı — sabit çubuk söküldü, alt köşe yüzen sepet düğmesinin. */}
        {selected && <PurchaseBar t={t} locale={locale} selected={selected} routeOnly={!product.shippable} flow />}
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

    </div>
  );
}
