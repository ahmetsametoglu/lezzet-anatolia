import { Link } from '@/i18n/navigation';
import { buttonClass } from '@/components/customer/ui/button';
import { DeliveryLine } from '@/components/customer/delivery/delivery-line';
import { ColdChainMark, StockMark, StockNoticeButton } from '@/components/customer/delivery/stock-mark';
import { Badge } from '@/components/customer/ui/badge';
import { SectionHeading } from '@/components/customer/ui/section';
import { ProductCard } from '@/components/customer/ui/storefront-cards';
import { Declaration } from './components/declaration';
import { FamilyBlock } from './components/family-block';
import { Gallery } from './components/gallery';
import { PurchaseBar, VariantPicker } from './components/purchase-panel';
import { Reviews } from './components/reviews';
import type { ProductViewProps } from './product-types';

/**
 * Ürün detay — masaüstü düzeni (tasarım: `Musteri - Urun Detay.dc.html`, "Web").
 * Breadcrumb → **iki bağımsız sütun** (solda ürünün kendisi, sağda satın alma kararı) → benzer ürünler.
 *
 * ── NEDEN TEK BİR AKIŞ (kullanıcı kararı 19.08, ölçülerek) ──────────────────
 * Sayfa İKİ ayrı ızgaraydı — üstte galeri | satın alma (`1fr 1fr`, 48px), altta beyan | yorumlar
 * (`1.2fr 1fr`, 40px) — ve bu iki kusur üretiyordu:
 *
 * 1. **Solda ölü alan.** Üst ızgaranın satır yüksekliğini UZUN olan sağ sütun belirliyordu.
 *    Ölçüldü (1460px): sol sütunun içeriği 710px'de bitiyor, hücre 838'e kadar uzatılıyor, bölüm
 *    dolgusuyla birlikte "İçindekiler" ancak 882'de başlıyordu → **172px** boşluk, yalnız solda.
 * 2. **Dikiş kayması.** Sütunları ayıran dikey çizgi iki blok arasında **60px** sağa kayıyordu
 *    (706 → 766), çünkü oranlar ve aradaki boşluk farklıydı.
 *
 * **Kusur tasarımda da vardı ve daha büyüktü** (`.dc.html` tarayıcıda ölçüldü: kayma 132px, ölü
 * alan 263px). Yani bu bir uygulama sapması değil; sebebi de görünüyor — "Çeşitler" bloğu sonradan
 * eklendi (§1b, 04.08 kararı) ve sağ sütunu uzattı; iki bağımsız ızgara o boy farkını deliğe
 * çeviriyordu.
 *
 * ── IZGARA DEĞİL, İKİ SÜTUN — ve fark ölçüldü ───────────────────────────────
 * İlk denemede iki bölüm TEK ızgaraya alınmıştı. Dikiş kayması bitti ama **delik yerinde kaldı**
 * (yeniden ölçüldü: galeri 710, beyan hâlâ 882): ızgarada satırlar ORTAKTIR, ikinci satır uzun
 * hücrenin bitmesini bekler. Dikey akışın her sütunda kendi başına ilerlemesi gerekiyordu; bunu
 * yapan şey flex sütunudur.
 *
 * Sol sütun **ürünün kendisi** (görseller → içindekiler ve alerjenler), sağ sütun **satın alma
 * kararı** (çeşit → boy → fiyat → sepet → teslimat) ve altında yorumlar.
 *
 * Yorum bölümü bugün yalnız boş hâliyle var ama YİNE DE çizilir: kaldırılırsa sağ sütun beyanın
 * karşısında erken biter ve denge bu kez öteki tarafa kayar.
 */
export function ProductDesktop({ t, locale, product, selected, onSelect, familyLabel, unavailable, reviews }: ProductViewProps) {
  /**
   * "Bu adrese gönderemiyoruz" hâli — sayfanın eylem sırasını DEĞİŞTİRİR (19.08): satın alma
   * düğmesi normal yerinden iner ve karar kutusunda üçüncül olarak çizilir. Ölçüt tek yerde durur
   * ki iki karar (nerede çizilecek / hangi ağırlıkta) bir gün ayrışmasın.
   */
  const away = selected?.stockStatus === 'elsewhere';

  return (
    <div className="flex flex-col">
      <nav className="flex gap-1.5 px-12 pt-5 font-sans text-body-sm text-muted">
        <Link href="/catalog" className="font-bold text-olive hover:text-olive-dark">
          {t.back}
        </Link>
        {product.category && <span>· {product.category.name}</span>}
        <span>· {product.name}</span>
      </nav>

      {/* **IZGARA DEĞİL, İKİ BAĞIMSIZ SÜTUN** — ve bu ayrım ölçülerek seçildi.
          Izgarada satırlar ORTAKTIR: beyanı ikinci satıra koymak, onu sağdaki uzun hücrenin
          bitmesini beklemeye zorluyordu (ölçüldü: galeri 710'da bitiyor, beyan 882'de başlıyor →
          delik olduğu yerde kalıyordu). Dikey akış her sütunda kendi başına ilerlemeli; bunu
          yapan şey flex sütunudur. `min-w-0`: uzun kelime/URL sütunu şişirmesin (ızgaranın
          `minmax(0,1fr)` güvencesinin flex karşılığı). */}
      <div className="flex gap-12 px-12 pt-6 pb-11">
        {/* SOL — ürünün kendisi: ne göründüğü, sonra içinde ne olduğu. */}
        <div className="flex min-w-0 flex-1 flex-col gap-11">
          <Gallery images={product.gallery} alt={product.name} />
          <Declaration t={t} locale={locale} declaration={product.declaration} netWeightG={selected?.netWeightG ?? null} />
        </div>

        {/* SAĞ — satın alma kararı: çeşit → boy → fiyat → sepet → teslimat, altında yorumlar. */}
        <div className="flex min-w-0 flex-1 flex-col gap-11">
          <div className="flex flex-col gap-4.5">
            <div className="flex flex-col gap-2">
              {product.category && <span className="font-sans text-eyebrow text-olive uppercase">{product.category.name}</span>}
              <h1 className="font-serif text-page-title text-ink">{product.name}</h1>
              {/* Stok rozeti SEÇİLİ boyu anlatır: bir boy tükenmişken "Stokta" yazmak, butonu
                "Tükendi" gösteren aynı ekranda kendi kendini yalanlar.
                Yere bağlı iki hâlde (kargoyla / bölgenizde yok) rozetin yerini YER İŞARETİ alır:
                orada da yeşil "Stokta" yazmak, hemen altındaki kutuyla çelişirdi (19.7). */}
              {/* Soğuk zincir işareti ROZETİN YANINDA (16.08, kullanıcı isteği): teslimat kutusunun
                içindeyken bir teslimat ayrıntısı gibi okunuyordu, oysa ÜRÜNÜN künyesi.
                Dayanağı ARTIK KENDİ ALANI (`product.storage_type` → `coldChain`), `!shippable`
                proxy'si değil: o bir teslimat olgusuydu ve kargolanabilen ürüne de "soğuk zincirle
                gelir" yazdırıyordu. */}
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

            {product.description && <p className="font-sans text-lead text-body">{product.description}</p>}

            {/* Çeşit bloğu boy seçicinin ÜSTÜNDE: karar sırası "hangisi? → hangi boy?" (`§1b`). */}
            <FamilyBlock t={t.family} locale={locale} members={product.family} currentUnavailable={unavailable} />

            {selected && (
              <>
                <VariantPicker
                  t={t}
                  locale={locale}
                  variants={product.variants}
                  selected={selected}
                  onSelect={onSelect}
                  familyLabel={familyLabel}
                />
                {/* Satın alma düğmesi `elsewhere` hâlinde BURADA DEĞİL, karar kutusunun içinde —
                    ve orada üçüncül. Gerekçesi kutunun `blockedActions`ında. */}
                {!away && <PurchaseBar t={t} locale={locale} selected={selected} routeOnly={!product.shippable} />}
              </>
            )}

            {/* Kargo kısıtı sepete eklemeden ÖNCE görünür (`musteri-urun-detay.md §2`). Teslimat yeri
              biliniyorsa somut konuşur; bilinmiyorsa tasarımın genel vaatleri kalır. */}
            <DeliveryLine
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
                  <Link
                    href={{ pathname: '/catalog', query: { shippable: '1' } }}
                    className={buttonClass({ size: 'sm', className: '!text-note' })}
                  >
                    {t.assurance.seeShippable}
                  </Link>
                )
              }
            />
          </div>
          {/* Yorumlar bir SATIN ALMA girdisidir — kararın yanında durur, sayfanın dibinde değil. */}
          <Reviews t={t} locale={locale} productId={product.id} productName={product.name} data={reviews} />
        </div>
      </div>

      {product.similar.length > 0 && (
        <section className="flex flex-col gap-5 bg-cream-deep px-12 py-11">
          {/* Açıklama satırı YOK. Bir süre "aile üyeleri burada tekrar edilmez" yazıyordu; kural
              değişti (04.08 — her aileden bir temsilci gelebilir) ve cümle yalan oldu. Yerine
              yenisi konmadı: karışık bir liste kendini anlatır, kuralını anlatmasına gerek yok. */}
          <SectionHeading
            title={t.similar}
            action={
              product.category
                ? { label: `${product.category.name} →`, href: { pathname: '/catalog', query: { category: product.category.slug } } }
                : undefined
            }
          />
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
