import { fromPriceLabel } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import type { StorefrontFamilyMember } from '@lezzet/application';
import { CirclePhoto } from '@/components/customer/phone-kit/circle-photo';
import { Link } from '@/i18n/navigation';

/*
  ÇEŞİT RAYI — native ürün detayının aile bloğunun (`product-detail-screen.tsx` `familyBlock`) web telefon
  ikizi (14.09): "{KATEGORİ} — GÖZ ATIN" üstbaşlığı ve kenardan kenara kayan çipler (34'lük daire foto + ad
  + "…'dan" ya da "Bakıyorsunuz"). Çeşit kardeş ürünün sayfasına götürür; bakılan çeşit bağlantı DEĞİLDİR —
  bulunduğun sayfaya götüren bağ, hiçbir yere götürmez.

  Geçmişe satır eklemez (native 08.08: aile çipi `setParams`): web'de `replace` — geri tuşu aileyi gezinti
  geçmişi saymaz, geldiği yeri hatırlar. Fiyat yoksa satır boş kalır, sıfır yazılmaz (`price-label`).
*/

interface PhoneFamilyRailProps {
  members: StorefrontFamilyMember[];
  /** "{KATEGORİ} — GÖZ ATIN" — kategori adı çağıranda yerleşmiş, dilin kuralıyla büyük harf. */
  eyebrow: string;
  /** "Bakıyorsunuz" */
  currentLabel: string;
  locale: Locale;
}

const CHIP = 'flex flex-none items-center gap-2.5 rounded-control border-[1.5px] border-sand-400 py-2 pr-3.5 pl-2';

export function PhoneFamilyRail({ members, eyebrow, currentLabel, locale }: PhoneFamilyRailProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-sans text-eyebrow-xs text-terracotta">{eyebrow}</span>
      <div className="-mx-3.5 flex gap-2.5 overflow-x-auto px-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {members.map((member) => {
          const body = (
            <>
              <CirclePhoto image={member.image} initial={member.label.slice(0, 1)} size={34} initialClassName="text-note text-muted" />
              <span className="flex flex-col">
                <span className="font-sans text-note font-bold whitespace-nowrap text-ink">{member.label}</span>
                <span className="font-sans text-micro font-semibold whitespace-nowrap text-olive-dark">
                  {member.isCurrent ? currentLabel : (fromPriceLabel(member.fromPriceCents, locale) ?? '')}
                </span>
              </span>
            </>
          );
          return member.isCurrent ? (
            <div key={member.slug} aria-current="page" className={CHIP}>
              {body}
            </div>
          ) : (
            <Link
              key={member.slug}
              replace
              href={{ pathname: '/product/[slug]', params: { slug: member.slug } }}
              className={`${CHIP} cursor-pointer transition-[scale,border-color] hover:border-ink active:scale-[0.97]`}
            >
              {body}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
