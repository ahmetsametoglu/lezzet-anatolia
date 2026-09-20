import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { DeliveryLine } from '@/components/customer/delivery/delivery-line';
import { ColdChainMark, StockMark, StockNoticeButton } from '@/components/customer/delivery/stock-mark';
import { Badge } from '@/components/customer/ui/badge';
import { ShareButton } from '@/components/customer/ui/share-button';
import { formatDecimal } from '@/lib/storefront/format';
import { SectionHeading } from '@/components/customer/ui/section';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import { Icon } from '@/components/customer/ui/icons';
import { variantNameOf } from '@/lib/storefront/variant-name';
import { AiAsk } from './components/ai-ask';
import { Declaration } from './components/declaration';
import { FamilyBlock } from './components/family-block';
import { Gallery } from './components/gallery';
import { LimitNote, PriceBox, PurchaseBar, VariantPicker } from './components/purchase-panel';
import { Stars } from './components/review-card';
import { Reviews } from './components/reviews';
import type { ProductViewProps } from './product-types';

/**
 * Ürün detay — masaüstü düzeni (tasarım: `Musteri Web.dc.html`, "Web · Ürün detay", 20.09).
 *
 * Breadcrumb → **galeri + yapışkan karar rafı** (1fr / 470 px) → ürün künyesi bandı → yorumlar → benzer ürünler.
 *
 * ── İKİ SÜTUNUN BOYU NEDEN TUTUYOR ──────────────────────────────────────────
 * Sayfa uzun süre iki bağımsız sütundu ve sağ sütun sürekli aşağı sarkıyordu: içerik toplamı sabit,
 * mesele hangi sütuna düştüğü. Tasarım üç taşımayla dengeledi — küçük görsel şeridi ana görselin
 * İÇİNE girdi (sol sütun ~134 px kısaldı), çeşit kartları boy seçicisi olan üründe SOLA indi,
 * yasal künye sütundan çıkıp tam genişlik banda taşındı.
 *
 * Kalan fark kaydırmada kaybolur, çünkü raf yapışkandır: müşteri künyeyi okurken boy, fiyat ve
 * sepet düğmesi ekranda kalır.
 */
export function ProductDesktop({ t, locale, product, selected, onSelect, familyLabel, unavailable, reviews }: ProductViewProps) {
  /**
   * "Bu adrese gönderemiyoruz" hâli — sayfanın eylem sırasını DEĞİŞTİRİR (19.08): satın alma
   * düğmesi normal yerinden iner ve karar kutusunda üçüncül olarak çizilir. Ölçüt tek yerde durur
   * ki iki karar (nerede çizilecek / hangi ağırlıkta) bir gün ayrışmasın.
   */
  const away = selected?.stockStatus === 'elsewhere';

  /**
   * Çeşit kartları SOL sütuna iner — ama yalnız boy seçicisi de olan üründe (tasarımın denge
   * kararı 20.09): iki seçici birden rafta dururken raf galeriden ~280 px uzuyordu. Boyu olmayan
   * üründe çeşit rafta kalır, çünkü orada tek karar odur ve sol sütun zaten kısa.
   */
  const familyOnLeft = product.family.length > 0 && product.variants.length > 1;

  /**
   * Yapay zekâ sorusu kategoriden gelir, cümle BURADA kurulur: `{w}` seçili boydur ve seçim
   * ekranda değişiyor. Boy çözülemezse bölüm çizilmez — yarım bir soru göndermektense hiç sormamak.
   */
  const aiQuestion =
    product.aiQuestion && selected
      ? product.aiQuestion.replace('{n}', product.name).replace('{w}', variantNameOf(selected, t.size, locale))
      : null;

  /**
   * Teslimat satırı boy seçiminin ÜSTÜNDE durur (çeşitlerin altı, çeşit yoksa açıklamanın altı): kargo kısıtı sepete eklemeden
   * önce görünür. Bu adrese gönderilemeyen üründe kutu "yine de sepete ekle" düğmesini taşıdığı için boy seçiminin altına iner.
   */
  const delivery = (
    <DeliveryLine
      box
      locale={locale}
      shippable={product.shippable}
      status={selected?.stockStatus}
      fallback={t.assurance}
      blockedActions={
        away && selected ? (
          /**
           * **ÜÇ EYLEM, ÜÇ AĞIRLIK** — tasarımın kendi sırası (`Musteri - Urun Detay.dc.html`),
           * kullanıcı kararı 19.08 ile uygulandı.
           *
           * Uygulama bu sıradan sapmıştı: "Sepete ekle" yukarıda tam ağırlıkta duruyor,
           * "haber ver" de birincile terfi ettirilmişti — ekranda **iki dolu yeşil düğme**
           * yan yana çıkıyor ve hiçbiri birincil olmuyordu (kullanıcı bildirimi, ekran
           * görüntüsüyle). Tasarım sorunu zaten çözmüştü.
           *
           * Sıra bir yargıdır: müşteri bu ürünü BU ADRESE alamıyor, o yüzden ekranın en
           * güçlü teklifi alabileceği bir alternatiftir. Satın alma yolu yine de KAPANMAZ
           * (tasarımın kendi notu: *"müşteri bölge içindeki birine gönderiyor olabilir"*)
           * — ama adı değişir, çünkü artık farklı bir şey yapıyor: uyarıya rağmen devam.
           */
          <span className="flex w-full flex-col gap-2">
            <Link
              href={{ pathname: '/catalog', query: { shippable: '1' } }}
              className={buttonClass({ variant: 'primary', size: 'md', fullWidth: true, className: '!text-note' })}
            >
              {t.assurance.seeShippable}
            </Link>
            <StockNoticeButton variantId={selected.id} productName={product.name} locale={locale} emphasis="panel" />
            {/* Üçüncül: nötr çerçeve + "Yine de sepete ekle". `w-full` sarmalayıcı, düğmenin
                kendi `w-1/2` kutusunu kutunun genişliğine açıyor. */}
            <PurchaseBar t={t} locale={locale} selected={selected} routeOnly={!product.shippable} deemphasized />
          </span>
        ) : selected?.stockStatus === 'shipping' ? undefined : (
          /**
           * **`shipping` hâlinde çıkış düğmesi YOK** (ölçüldü 19.08, ekran turunda).
           *
           * O hâlde ürün zaten kargoyla gidiyor — çözülecek bir sorun yok. "Kargolanabilir
           * benzerleri gör" demek karşılıksız bir teklifti: müşteri bakmakta olduğu ürünü
           * ZATEN kargoyla alabiliyor. Üstelik düğme dolu yeşildi ve hemen üstündeki
           * "Sepete ekle" ile ikinci bir çift-yeşil çarpışması üretiyordu.
           *
           * Burada kalan tek hâl gerçek çıkmaz: yer rota dışında VE ürün kargolanamıyor
           * (`blocked`). Orada teklif anlamlı, çünkü müşterinin alabileceği bir şey yok.
           */
          <Link href={{ pathname: '/catalog', query: { shippable: '1' } }} className={buttonClass({ size: 'sm', className: '!text-note' })}>
            {t.assurance.seeShippable}
          </Link>
        )
      }
    />
  );

  return (
    <div className="flex flex-col">
      <nav className="flex gap-1.5 px-12 pt-5 font-sans text-body-sm text-muted">
        <Link href="/catalog" className="font-bold text-olive hover:text-olive-dark">
          {t.back}
        </Link>
        {product.category && <span>· {product.category.name}</span>}
        <span>· {product.name}</span>
      </nav>

      {/* Solda ürünün kendisi, sağda 470 px'lik YAPIŞKAN karar rafı — ölçü tasarımın (20.09). */}
      <div className="grid grid-cols-[1fr_470px] items-start gap-11 px-12 pt-8 pb-9.5">
        <div className="flex min-w-0 flex-col gap-3.5">
          <Gallery images={product.gallery} alt={product.name} />
          {familyOnLeft && (
            <FamilyBlock t={t.family} locale={locale} members={product.family} currentUnavailable={unavailable} layout="grid" />
          )}
        </div>

        {/* Raf kaydırmada ekranda kalır: karar (boy · fiyat · sepet) künyeyi okurken de elin altında. */}
        <div className="sticky top-24 flex min-w-0 flex-col gap-4">
          {product.category && <span className="font-sans text-eyebrow text-olive uppercase">{product.category.name}</span>}
          <div className="flex items-start justify-between gap-3.5">
            <h1 className="font-serif text-page-title leading-tight text-ink">{product.name}</h1>
            <ShareButton label={t.share} subject={{ subjectType: 'product', subjectId: product.id, productId: product.id }} />
          </div>

          {/* Stok rozeti SEÇİLİ boyu anlatır: bir boy tükenmişken "Stokta" yazmak, düğmesi "Tükendi"
              olan aynı ekranda kendi kendini yalanlar. Yere bağlı iki hâlde rozetin yerini yer
              işareti alır — orada yeşil "Stokta" hemen altındaki teslimat kutusuyla çelişirdi.
              Soğuk zincir işareti rozetin yanında (16.08): teslimatın değil ÜRÜNÜN künyesi. */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Puan adın altında; yorumu olmayan üründe satır rozetlerle başlar. Sayı yorumlara götürür. */}
            {reviews.score.average !== null && (
              <a href="#reviews" className="mr-1.5 inline-flex cursor-pointer items-center gap-2.5 font-sans">
                <Stars value={reviews.score.stars ?? reviews.score.average} small />
                <span className="text-body font-bold text-ink">{formatDecimal(reviews.score.average, locale, 1)}</span>
                <span className="text-body-sm text-muted transition-colors hover:text-olive">
                  · {t.reviews.countShort.replace('{count}', String(reviews.total))}
                </span>
              </a>
            )}
            {selected &&
              (selected.stockStatus === 'available' || selected.stockStatus === 'out_of_stock' ? (
                <Badge tone={selected.soldOut ? 'closed' : 'positive'}>{selected.soldOut ? t.soldOut : t.inStock}</Badge>
              ) : (
                <StockMark status={selected.stockStatus} locale={locale} size="lg" />
              ))}
            {product.coldChain && <ColdChainMark label={t.assurance.coldChainShort} />}
          </div>

          {product.description && <p className="font-sans text-lead text-body">{product.description}</p>}

          {/* Çeşit bloğu boy seçicisi YOKKEN rafta kalır; varken sola iner (yukarıdaki `familyOnLeft`). */}
          {!familyOnLeft && <FamilyBlock t={t.family} locale={locale} members={product.family} currentUnavailable={unavailable} />}

          {/* Boy seçicisi yalnız seçilecek bir şey varken çizilir; tek boyda fiyat kutusu zaten fiyatı söyler. */}
          {selected && product.variants.length > 1 && (
            <VariantPicker t={t} locale={locale} variants={product.variants} selected={selected} onSelect={onSelect} familyLabel={familyLabel} />
          )}

          {!away && delivery}

          {selected && (
            <>
              <PriceBox t={t} locale={locale} selected={selected}>
                {/* `elsewhere` hâlinde düğme kutuda DEĞİL, teslimat kutusunun içinde ve orada üçüncül. */}
                {!away && <PurchaseBar t={t} locale={locale} selected={selected} routeOnly={!product.shippable} flow />}
              </PriceBox>
              <LimitNote t={t} selected={selected} />
            </>
          )}

          {away && delivery}

          <span className="flex items-center gap-1.5 border-t border-sand-200 pt-3.25 font-sans text-note text-muted">
            <Icon name="box" size={14} />
            {t.assurance.sturdyBox}
          </span>
        </div>
      </div>

      {/* Künye kendi bandında ve üç eşit kart: sol sütunda dururken sayfanın en uzun bloğuydu ve
          rafın bittiği yerde sayfayı tek sütuna düşürüyordu (tasarım 20.09). */}
      <section className="flex flex-col gap-4.5 border-t border-sand-300 bg-sand-100 px-12 py-8.5">
        <div className="flex items-baseline gap-3">
          <h2 className="font-serif text-h2 text-ink">{t.declaration.title}</h2>
          <span className="font-sans text-body-sm text-muted">{t.declaration.note}</span>
        </div>
        <Declaration
          t={t}
          locale={locale}
          declaration={product.declaration}
          netQuantity={selected?.netQuantity ?? null}
          netUnit={selected?.netUnit ?? null}
        />
        {aiQuestion && <AiAsk t={t.ai} question={aiQuestion} />}
      </section>

      <div className="px-12 py-9">
        <Reviews t={t} locale={locale} productId={product.id} productName={product.name} data={reviews} />
      </div>

      {product.similar.length > 0 && (
        <section className="flex flex-col gap-5 border-t border-sand-275 bg-cream-deep px-12 py-8.5 pb-10.5">
          {/* Açıklama satırı YOK. Bir süre "aile üyeleri burada tekrar edilmez" yazıyordu; kural
              değişti (04.08 — her aileden bir temsilci gelebilir) ve cümle yalan oldu. Yerine
              yenisi konmadı: karışık bir liste kendini anlatır, kuralını anlatmasına gerek yok. */}
          <SectionHeading title={t.similar} action={{ label: t.similarAll, href: '/catalog' }} />
          <div className="grid grid-cols-4 gap-6">
            {product.similar.map((p) => (
              <ProductCard key={p.id} product={p} locale={locale} labels={t.card} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
