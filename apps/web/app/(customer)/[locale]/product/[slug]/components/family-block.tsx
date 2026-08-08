'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { RATIO_SQUARE } from '@lezzet/types';
import { Dialog } from '@/components/customer/ui/dialog';
import { SCROLL_STRIP } from '@/components/customer/ui/scroll-strip';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import type { StorefrontFamilyMember, StorefrontVariant } from '@lezzet/application';
import type { Messages } from '../product-types';

/**
 * **Çeşit kartları** — ailenin öteki üyeleri (05.15, tasarım `musteri-urun-detay.md §1b`).
 *
 * ── NEDEN SATIN ALMA PANELİNİN İÇİNDE ────────────────────────────────────────────────────────
 * Müşterinin karar akışı *"hangisi?" → "hangi boy?" → "kaç adet?"*. Çeşit bir KİMLİK kararıdır ve
 * satın alma kararından önce gelir; blok bu yüzden boy seçicinin ÜSTÜNDE, panelin içinde durur.
 * Sayfanın altındaki "benzer ürünler" bölgesine inseydi müşteri kendi aradığı çeşidi keşif
 * önerileriyle aynı raftan seçerdi — oysa aradığı zaten bu ürün, yalnız başka bir hâli.
 *
 * ── İKİ SEÇİCİ ASLA KARIŞMAZ ────────────────────────────────────────────────────────────────
 * Çeşit kartı FOTOĞRAFLIDIR ve tıklayınca **sayfa değişir**; boy kartı METİN ESASLIDIR ve yalnız
 * fiyatı değiştirir (`VariantPicker`). Ayrı başlık, ayrı kart dili, ayrı kutu — tasarımın en çok
 * vurguladığı kural bu. Aynı görsel dille çizilselerdi müşteri bir çeşide tıklayıp "boy seçtim"
 * sanır, sayfa değişince yolunu kaybederdi.
 *
 * ── ALT SATIR YALNIZ GENİŞ KARTTA ───────────────────────────────────────────────────────────
 * Başlangıç fiyatı ("14,90 €'dan") ve "Bakıyorsunuz" AYNI satırı paylaşır — biri varken öteki
 * olmaz: bakılan çeşidin fiyatı hemen altındaki boy seçicisinde zaten tam hâliyle duruyor, kartta
 * ikinci kez yazmak aynı sayıyı iki kez basmak olurdu.
 * Satır yalnız 106 px'lik kartta çizilir; kalabalık (66 px) ve mobil (84 px) kartlarda tasarım da
 * yalnız adı gösteriyor — dar kartta üç satır metin, adı okunamaz hâle getirir.
 */

/** Kartların küçülüp tek satırda kaydırıldığı eşik (tasarım "kalabalık hâl · 12 üye"). */
const CROWDED_AT = 10;

/** İki üyede kartlar satırı PAYLAŞIR — kaydırma yoktur (tasarım "en dar hâl · 2 üye"). */
const WIDE_AT = 2;

/**
 * Bakılan ürün hiç alınamıyor mu — blok başlığı ve aktif işaret buna bakar.
 *
 * Ölçüt varyantın değil ÜRÜNÜN alınabilirliği: tek bir boyu tükenmiş üründe müşteri öteki boyu
 * alabilir, o hâlde "Alınabilir çeşitler" demek yanlış olurdu. Kapalı (fiyatsız) varyant da
 * alınamaz sayılır — ikisi müşteri için aynı kapıdır.
 */
export function isProductUnavailable(variants: readonly StorefrontVariant[]): boolean {
  return variants.length > 0 && variants.every((v) => v.soldOut || v.priceCents === null);
}

type CardSize = 'wide' | 'normal' | 'crowded' | 'mobile';

/**
 * Tasarımın dört kart ölçüsü. `wide` satırı paylaşır, ötekiler sabit genişlikte kayar.
 *
 * `wide`in TAVANI var ve gerekçesi ölçüldü (04.08, iki üyeli "Mini Pide"): tavansız `flex-1`, iki
 * kartı panelin yarısına kadar (~230 px) şişiriyor — çeşit bloğu galeriden büyük görünüyor, "Sepete
 * ekle" ekranın altına iniyor ve kimlik seçimi satın alma eyleminin önüne geçiyor. Tasarımın kendi
 * oranı da bu değil: 320 px'lik hâl maketinde iki kart ~124 px, yani "kartlar genişler" 106 → ~140
 * demek, iki katına çıkmak değil.
 */
const CARD_WIDTH: Record<CardSize, string> = {
  wide: 'flex-1 max-w-[140px]',
  normal: 'w-[106px] flex-none',
  crowded: 'w-[66px] flex-none',
  mobile: 'w-[84px] flex-none',
};

interface FamilyCardProps {
  member: StorefrontFamilyMember;
  size: CardSize;
  /** Ad altındaki satır — "Bakıyorsunuz" ya da başlangıç fiyatı. Dar kartta `null`. */
  subLine: string | null;
}

function FamilyCard({ member, size, subLine }: FamilyCardProps) {
  const box = [
    'flex flex-col gap-1.5 rounded-soft bg-card p-1.5',
    CARD_WIDTH[size],
    member.isCurrent ? 'relative border-2 border-olive' : 'border-[1.5px] border-sand-300',
  ].join(' ');

  const label = (
    <span className="flex flex-col gap-px px-1 pb-1">
      {/* Etiket uzun olabilir ("Épinards & fromage") ve dar kartta sarar — sıkı satır aralığı kartı
          gereksiz uzatmaz. Kırpılmaz: çeşidin adı, kartın taşıdığı TEK ayırt edici bilgi. */}
      <span className={['font-sans leading-tight font-bold text-ink', size === 'crowded' ? 'text-micro' : 'text-note'].join(' ')}>
        {member.label}
      </span>
      {/* Bakılan çeşitte satır YEŞİL ("Bakıyorsunuz" bir durum), ötekilerde soluk (fiyat bir bilgi). */}
      {subLine && (
        <span className={['font-sans text-micro', member.isCurrent ? 'text-olive' : 'text-muted'].join(' ')}>{subLine}</span>
      )}
    </span>
  );

  const image = (
    <FramedImage src={member.image.url} alt={member.label} ratio={RATIO_SQUARE} crop={member.image.crop} />
  );

  // Aktif kart TIKLANAMAZ (tasarım): bulunduğu sayfaya götüren bir bağlantı, tıklayanı hiçbir yere
  // götürmeyen bir söz olurdu. `aria-current` ekran okuyucuya aynı şeyi söyler.
  if (member.isCurrent) {
    return (
      <div aria-current="true" className={box}>
        {image}
        {/* Rozet kartın dışına taşar; şeridin üst pedi (`pt-2.5`) onu kırpılmaktan korur. */}
        <span className="absolute -top-2 -right-2 grid size-5.5 place-items-center rounded-full bg-olive font-sans text-micro font-bold text-on-image">
          ✓
        </span>
        {label}
      </div>
    );
  }

  return (
    <Link
      href={{ pathname: '/product/[slug]', params: { slug: member.slug } }}
      className={`${box} cursor-pointer transition-colors hover:border-sand-400`}
    >
      {image}
      {label}
    </Link>
  );
}

interface FamilyBlockProps {
  t: Messages['family'];
  locale: Locale;
  members: StorefrontFamilyMember[];
  /** Bakılan çeşidin kendisi alınamıyor — başlık değişir, aktif işaret basılmaz. */
  currentUnavailable: boolean;
  /** Mobil kabuk: daha küçük kartlar, "Bakıyorsunuz" satırı yok. */
  compact?: boolean;
}

export function FamilyBlock({ t, locale, members, currentUnavailable, compact = false }: FamilyBlockProps) {
  const [allOpen, setAllOpen] = useState(false);

  // Sözleşme boş listede bloğu hiç çizmemeyi söylüyor (ailesiz ürün ve tek üyeye inmiş aile) — kapı
  // burada da durur ki çağıran her yerde aynı koşulu tekrar yazmasın.
  if (members.length === 0) return null;

  const crowded = members.length >= CROWDED_AT;
  // "İki üyede kartlar genişler, kaydırma yoktur" CİHAZDAN BAĞIMSIZ bir kural: mobilde de 84 px'lik
  // kaydırma kartı kullanmak, kaydıracak bir şey yokken kartı daraltmak olurdu — ölçüldü (04.08,
  // "Épinards & fromage" 84 px'te üç satıra bölünüyordu).
  const size: CardSize = members.length <= WIDE_AT ? 'wide' : compact ? 'mobile' : crowded ? 'crowded' : 'normal';

  // Bakılan çeşit alınamıyorken aktif işaret BASILMAZ: yeşil çerçeve ve ✓ "seçtiğiniz bu" der,
  // oysa müşteri onu seçemiyor. Kart yine listede kalır (çıkış yolu kardeşlerdedir, tasarım §1b).
  const cards = currentUnavailable ? members.map((m) => ({ ...m, isCurrent: false })) : members;

  /**
   * Ad altındaki satır. Bakılan çeşitte fiyat YERİNE "Bakıyorsunuz" yazılır — veri ikisini de
   * taşıyor, hangisinin gösterileceği ekranın kararı (sözleşme künyesi de böyle diyor).
   * Fiyat çözülemediyse (kanal fiyatı girilmemiş) satır hiç çizilmez: sıfır yazmak bedava
   * göstermek olurdu (`CLAUDE §1` — ölçülemeyen değer sıfır değildir).
   */
  const subLineOf = (m: StorefrontFamilyMember, detailed: boolean) => {
    if (!detailed) return null;
    if (m.isCurrent) return t.current;
    return m.fromPriceCents === null ? null : t.fromPrice.replace('{price}', formatPrice(m.fromPriceCents, locale));
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-sand-200 bg-sand-50 px-4 py-3.5">
      <div className="flex items-baseline gap-2.5">
        <span className={['font-sans font-bold text-ink', compact ? 'text-note' : 'text-body-sm'].join(' ')}>
          {currentUnavailable ? t.titleUnavailable : t.title}
        </span>
        <span className="font-sans text-micro text-muted">{t.count.replace('{n}', String(members.length))}</span>
        {/* İpucu YALNIZ masaüstünde: dar ekranda başlık satırını ikinci satıra taşırıyor ve
            "sayfa değişir" bilgisini zaten ilk tıklama veriyor. */}
        {!compact && !crowded && <span className="font-sans text-micro text-muted">· {t.hint}</span>}
        {crowded && (
          <button
            type="button"
            onClick={() => setAllOpen(true)}
            className="ml-auto cursor-pointer font-sans text-micro font-bold text-olive hover:text-olive-dark"
          >
            {t.seeAll}
          </button>
        )}
      </div>

      {/* Blok TEK SATIRDA kalır (tasarım): ızgaraya dönüşseydi kalabalık ailede satın alma panelini
          ekranlarca aşağı iterdi. Üst ped aktif kartın taşan ✓ rozeti içindir. */}
      <div className={`${SCROLL_STRIP} gap-2 pt-2.5`}>
        {cards.map((m) => (
          <FamilyCard key={m.slug} member={m} size={size} subLine={subLineOf(m, size === 'normal')} />
        ))}
      </div>

      {/* "Tümünü gör" — kalabalık ailede kaydırmadan tam listeyi veren panel. Kaydırma zaten tüm
          üyelere erişim sağlıyor; panelin işi ERİŞİM değil GENEL GÖRÜNÜM: 12 çeşidi yan yana
          görmek, on ikisini teker teker kaydırarak geçmekten başka bir karardır. */}
      {allOpen && (
        <Dialog title={t.allTitle} closeLabel={t.close} onClose={() => setAllOpen(false)} maxWidth={460}>
          <div className="grid grid-cols-3 gap-2.5 pt-2.5">
            {/* Panelde fiyat satırı VARDIR: panelin işi tam listeyi yan yana göstermek ve çeşitler
                arasındaki fiyat farkı seçimin bir parçası. Şeritte dar karta sığmayan bilgi burada
                sığıyor — panel zaten bunun için açılıyor. */}
            {cards.map((m) => (
              <FamilyCard key={m.slug} member={m} size="wide" subLine={subLineOf(m, true)} />
            ))}
          </div>
        </Dialog>
      )}
    </div>
  );
}
