'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { RATIO_SOURCE } from '@lezzet/types';
import { Dialog } from '@/components/customer/ui/dialog';
import { SCROLL_STRIP } from '@/components/customer/ui/scroll-strip';
import { Icon } from '@/components/customer/ui/icons';
import { FramedImage } from '@/components/media/framed-image';
import { Link } from '@/i18n/navigation';
import { formatPrice } from '@/lib/storefront/format';
import type { StorefrontFamilyMember, StorefrontVariant } from '@lezzet/application';
import type { Messages } from '../product-types';

/**
 * Çeşit kartları satın alma panelinin içinde, boy seçicinin üstündedir: çeşit bir kimlik kararıdır ve boydan önce gelir. Çeşit kartı
 * fotoğraflıdır ve sayfayı değiştirir, boy kartı metindir ve yalnız fiyatı değiştirir; aynı dille çizilselerdi müşteri çeşide basıp
 * boy seçtiğini sanırdı.
 */

/** Kartların küçülüp tek satırda kaydırıldığı eşik (tasarım "kalabalık hâl · 12 üye"). */
const CROWDED_AT = 10;

/** İki üyede kartlar satırı PAYLAŞIR — kaydırma yoktur (tasarım "en dar hâl · 2 üye"). */
const WIDE_AT = 2;

/**
 * Bakılan ürün hiç alınamıyor mu: ölçüt varyantın değil ürünün alınabilirliğidir, çünkü tek boyu tükenen üründe öteki boy alınabilir.
 * Kapalı (fiyatsız) varyant da alınamaz sayılır.
 */
export function isProductUnavailable(variants: readonly StorefrontVariant[]): boolean {
  return variants.length > 0 && variants.every((v) => v.soldOut || v.priceCents === null);
}

type CardSize = 'wide' | 'normal' | 'crowded' | 'mobile';

/**
 * Tasarımın dört kart ölçüsü; `wide` satırı paylaşır, ötekiler sabit genişlikte kayar. `wide`in tavanı vardır, çünkü tavansız iki
 * kart panelin yarısına kadar şişip "Sepete ekle"yi ekranın altına iter.
 */
const CARD_WIDTH: Record<CardSize, string> = {
  wide: 'flex-1 max-w-[140px]',
  normal: 'w-[104px] flex-none',
  crowded: 'w-[66px] flex-none',
  mobile: 'w-[84px] flex-none',
};

/**
 * Görselin `sizes`i — kartın genişliği (iç boşluk düşülmedi: birkaç piksel fazlası basamağı
 * değiştirmez). Genişlikle AYNI tabloda değil ama AYNI anahtarlarla; biri değişirse öteki yanında.
 */
const CARD_IMAGE_SIZES: Record<CardSize, string> = { wide: '140px', normal: '104px', crowded: '66px', mobile: '84px' };

interface FamilyCardProps {
  member: StorefrontFamilyMember;
  size: CardSize;
  /** Ad altındaki satır — "Bakıyorsunuz" ya da başlangıç fiyatı. Dar kartta `null`. */
  subLine: string | null;
}

function FamilyCard({ member, size, subLine }: FamilyCardProps) {
  const box = [
    'flex flex-col gap-1 rounded-soft bg-card p-1',
    CARD_WIDTH[size],
    member.isCurrent ? 'relative border-2 border-olive' : 'border-[1.5px] border-sand-300',
  ].join(' ');

  const label = (
    <span className="flex flex-col gap-px px-1 pb-1">
      {/* Etiket uzun olabilir ("Épinards & fromage") ve dar kartta sarar — sıkı satır aralığı kartı
          gereksiz uzatmaz. Kırpılmaz: çeşidin adı, kartın taşıdığı TEK ayırt edici bilgi. */}
      <span className="font-sans text-micro leading-tight font-bold text-ink">{member.label}</span>
      {/* Bakılan çeşitte satır YEŞİL ("Bakıyorsunuz" bir durum), ötekilerde soluk (fiyat bir bilgi). */}
      {subLine && (
        <span className={['font-sans text-micro', member.isCurrent ? 'text-olive' : 'text-body'].join(' ')}>{subLine}</span>
      )}
    </span>
  );

  const image = (
    <FramedImage
      src={member.image.url}
      alt={member.label}
      // Kart görseli 3:2: kare görsel, adın altındaki satırla çeşit şeridini boy seçicisinden uzun yapar.
      ratio={RATIO_SOURCE}
      crop={member.image.crop}
      frames={member.image.frames}
      sizes={CARD_IMAGE_SIZES[size]}
    />
  );

  // Aktif kart TIKLANAMAZ (tasarım): bulunduğu sayfaya götüren bir bağlantı, tıklayanı hiçbir yere
  // götürmeyen bir söz olurdu. `aria-current` ekran okuyucuya aynı şeyi söyler.
  if (member.isCurrent) {
    return (
      <div aria-current="true" className={box}>
        {image}
        {/* Rozet kartın dışına taşar; şeridin üst pedi (`pt-2.5`) onu kırpılmaktan korur. */}
        <span className="absolute -top-2 -right-2 grid size-5.5 place-items-center rounded-full bg-olive text-on-image">
          <Icon name="check" size={12} strokeWidth={2.6} />
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
  /**
   * `rail` karar rafında, kendi kutusunda ve tek satır kaydırmalı (boy seçicisi olmayan ürün). `grid` galerinin altında, kutusuz
   * ve sarmalanan ızgaradır: blok sütunun tamamına yayıldığından kaydırılacak bir şey kalmaz.
   */
  layout?: 'rail' | 'grid';
}

export function FamilyBlock({ t, locale, members, currentUnavailable, compact = false, layout = 'rail' }: FamilyBlockProps) {
  const [allOpen, setAllOpen] = useState(false);

  // Sözleşme boş listede bloğu hiç çizmemeyi söylüyor (ailesiz ürün ve tek üyeye inmiş aile) — kapı
  // burada da durur ki çağıran her yerde aynı koşulu tekrar yazmasın.
  if (members.length === 0) return null;

  const crowded = members.length >= CROWDED_AT;
  // İki üyede kartlar cihazdan bağımsız genişler: kaydıracak bir şey yokken dar kart kullanmak adı üç satıra böler. Izgarada kart
  // sabit ölçüdedir, satırı paylaşan `wide` kart iki üyeyi sütunun yarısına kadar şişirirdi.
  const size: CardSize = layout === 'grid' ? (crowded ? 'crowded' : 'normal') : members.length <= WIDE_AT ? 'wide' : compact ? 'mobile' : crowded ? 'crowded' : 'normal';

  // Bakılan çeşit alınamıyorken aktif işaret BASILMAZ: yeşil çerçeve ve ✓ "seçtiğiniz bu" der,
  // oysa müşteri onu seçemiyor. Kart yine listede kalır (çıkış yolu kardeşlerdedir, tasarım §1b).
  const cards = currentUnavailable ? members.map((m) => ({ ...m, isCurrent: false })) : members;

  /**
   * Ad altındaki satır: bakılan çeşitte fiyat yerine "Bakıyorsunuz" yazılır, çünkü fiyat hemen altındaki boy seçicisinde tam hâliyle
   * durur. Fiyat çözülemediyse satır çizilmez; sıfır yazmak bedava göstermek olurdu.
   */
  const subLineOf = (m: StorefrontFamilyMember, detailed: boolean) => {
    if (!detailed) return null;
    if (m.isCurrent) return t.current;
    return m.fromPriceCents === null ? null : t.fromPrice.replace('{price}', formatPrice(m.fromPriceCents, locale));
  };

  return (
    // Telefonda kapsızdır: kum kartın iç pedi şeridi kenardan kırpar, sayfanın öbür bölümleri de kapsız akar. Masaüstünde kart
    // bloğu sütundaki komşularından ayırır.
    <div
      className={
        compact || layout === 'grid'
          ? 'flex flex-col gap-2.5'
          : 'flex flex-col gap-2.5 rounded-card border border-sand-200 bg-sand-50 px-4 py-3.5'
      }
    >
      <div className="flex items-baseline gap-2.5">
        <span className={['font-sans font-bold text-ink', compact ? 'text-note' : 'text-body-sm'].join(' ')}>
          {currentUnavailable ? t.titleUnavailable : t.title}
        </span>
        <span className="font-sans text-field-label font-normal text-body">{t.count.replace('{n}', String(members.length))}</span>
        {/* İpucu YALNIZ masaüstünde: dar ekranda başlık satırını ikinci satıra taşırıyor ve
            "sayfa değişir" bilgisini zaten ilk tıklama veriyor. */}
        {!compact && !crowded && <span className="font-sans text-field-label font-normal text-body">· {t.hint}</span>}
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

      {/* Blok tek satırda kalır (ızgara kalabalık ailede satın alma panelini aşağı iterdi), üst ped aktif kartın taşan rozeti
          içindir. Telefonda şerit kenardan kenara taşar ve kaydırma çubuğu gizlidir, çünkü kesik duran son kart devamı olduğunu
          zaten söyler. */}
      <div
        className={
          compact
            ? '-mx-4 flex gap-2 overflow-x-auto px-4 pt-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
            : layout === 'grid'
              ? 'grid gap-2 pt-2.5'
              : `${SCROLL_STRIP} gap-2 pt-2.5`
        }
        style={layout === 'grid' && !compact ? { gridTemplateColumns: `repeat(auto-fill, ${size === 'crowded' ? 66 : 104}px)` } : undefined}
      >
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
