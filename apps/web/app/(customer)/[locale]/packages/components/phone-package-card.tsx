import { cardPlaceNoteOf, formatPrice, packageRouteStatusOf, placeMarkOf } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type packagesMessages from '@lezzet/i18n/customer/packages';
import placeMessages from '@lezzet/i18n/customer/place';
import { RATIO_BAND } from '@lezzet/types';
import { PhotoSurface } from '@/components/customer/phone-kit/photo-surface';
import { Tag } from '@/components/customer/phone-kit/tag';
import { Link } from '@/i18n/navigation';
import type { StorefrontPackage } from '@/lib/storefront/storefront-types';

/*
  PAKET LİSTESİ KARTI — native paket listesinin kartının (`packages-list-screen.tsx` `card`) web telefon ikizi
  (14.09). Kartın TAMAMI detaya bağdır; listede sepete ekleme yok (paket içeriği görülmeden alınmaz).

  · Fotoğraf bölgesi 198 yüksek, kitin yüzeyinden (`PhotoSurface` — görsel ya da baş harf + skrim). Kutu telefon
    eninde ≈ 354 × 198, yani CDN'den 16:9 çerçeve istenir.
  · Sol üstte "Tükendi" rozeti, sağ üstte +3° fiyat çipi (native: sol üst durum, sağ üst fiyat); fotoğrafın
    altında ad · "{n} çeşit · TEK FİYAT" · yer notu.
  · SOLMA FOTOĞRAFA UYGULANIR (native 10.08): tükenmiş ya da bu adrese hiç gitmeyen paketin fotoğrafı solar;
    rozet ve künye tam opak kalır, solmanın sebebini söyleyen cümle okunur olmalı.
  · Yer notu künyenin son satırında, zeminsiz, vurgu tonunda (native 11.08: bir UYARI, üçüncü künye satırı değil).
    "Kargoyla gelir" kartta yazılmaz, cümlesi listenin başındaki bantta; tükenmiş pakette not hiç yazılmaz.
  · Beyaz gövde bugün yalnız eylemi taşır ("Paketi incele ›", sağa yaslı) — sözleşmede açıklama ve içerik
    çipleri yok, uydurulmaz (native künyesi).
*/

type PackagesCopy = LocalizedCopy<typeof packagesMessages>;

interface PhonePackageCardProps {
  pack: StorefrontPackage;
  copy: PackagesCopy;
  locale: Locale;
  /** Çözülmüş yerin rota bilgisi — yer notunun geçici mi kalıcı mı olduğunu söyler; `null` = yer bilinmiyor. */
  place: { inRoute: boolean } | null;
}

export function PhonePackageCard({ pack, copy, locale, place }: PhonePackageCardProps) {
  // Paketin kendi gerçeği → ürün sözlüğü → cümle → kartın elemesi; dört adım da ortak kurallardan.
  const { note: placeNote, dimmed } = cardPlaceNoteOf(placeMarkOf(packageRouteStatusOf(pack.route), place, placeMessages[locale]));
  // Hiçbir yerde olmayan pakette "bu adrese gelmez" demek, cevabı olmayan bir soruya cevap vermek olurdu.
  const note = pack.soldOut ? undefined : placeNote;
  const faded = pack.soldOut || dimmed;

  return (
    <Link
      href={{ pathname: '/package/[slug]', params: { slug: pack.slug } }}
      // Ekran okuyucu görenle aynı bilgiyi alır: ad · durum · yer notu.
      aria-label={[copy.open.replace('{name}', pack.name), pack.soldOut ? copy.card.soldOut : undefined, note].filter(Boolean).join(' · ')}
      className="block cursor-pointer overflow-hidden rounded-card border-[1.5px] border-sand-200 bg-card shadow-soft transition-transform hover:opacity-95 active:scale-[0.97]"
    >
      <span className="relative block h-49.5">
        <PhotoSurface
          image={pack.image}
          initial={pack.name.slice(0, 1)}
          ratio={RATIO_BAND}
          sizes="100vw"
          scrim
          className={['absolute inset-0', faded ? 'opacity-45' : ''].filter(Boolean).join(' ')}
        />
        {pack.soldOut && (
          <span className="absolute top-3 left-3 rounded-badge bg-scrim-72 px-2.5 py-1 font-sans text-badge-sm font-bold tracking-(--text-badge--letter-spacing) text-sand-50 uppercase">
            {copy.card.soldOut}
          </span>
        )}
        <span className="absolute top-3 right-3">
          <Tag label={formatPrice(pack.priceCents, locale)} rotate={3} shadow />
        </span>
        <span className="absolute inset-x-4 bottom-3.5 flex flex-col gap-0.5">
          <span className="font-serif text-card-title leading-[1.15] text-on-image">{pack.name}</span>
          <span className="font-sans text-eyebrow-xs text-olive-light">{copy.meta.replace('{n}', String(pack.itemCount))}</span>
          {/* Üç dilde farklı uzunlukta bir cümle: iki satıra kadar sarar. */}
          {note !== undefined && <span className="line-clamp-2 font-sans text-body-sm leading-[1.6] font-semibold text-terracotta">{note}</span>}
        </span>
      </span>
      <span className="flex justify-end px-4 py-3.5 font-sans text-note font-bold text-olive">{copy.cta}</span>
    </Link>
  );
}
