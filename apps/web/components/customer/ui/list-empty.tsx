import type { ComponentProps } from 'react';
import { Link } from '@/i18n/navigation';
import { buttonClass } from './button';

/**
 * Liste-içi boş hâl — emoji + başlık + açıklama + çıkış (denetim bulgusu K1, 02.08).
 *
 * **`MessageScreen` DEĞİLDİR ve ona bağlanamaz.** O blok sayfanın KENDİSİ durum ekranı olduğunda
 * kullanılır (404/500) ve gövdesinde `<h1>` çizer. Buradaki hâl ise başlığı zaten çizilmiş bir
 * sayfanın içinde durur (`orders` sayfa başlığını yazar, boş kutu hemen altındadır) — bağlanırsa
 * aynı sayfada ikinci bir `<h1>` doğar. İkisi benzer görünen iki AYRI şeydir; sınır burada yazılı
 * ki bir sonraki boş hâli yazan ajan yeniden karar vermek zorunda kalmasın.
 *
 * Dış kabuk çağıranındır: taleplerde ekranı dolduran ortalama (`h-full`), siparişlerde tasarımın
 * çizdiği `w-[340px]` krem kart. Tasarımda gerçekten farklılar; primitif yalnız İÇ dizilimi taşır.
 *
 * `compact` tek bir şey değiştirir — emoji ölçüsü. Tasarım aynı kartı Talep sayfasında bir tık
 * küçük çiziyor (32 ↔ 34); tip token'ları arada bir kademe taşımadığı için (`card-title-sm` tek
 * değer) fark koda yalnız burada yansıyor. Dekoratif emoji punto token'ı yok, iki ölçü tasarımdan
 * birebir alınmıştır.
 */
interface ListEmptyProps {
  /** Dekoratif emoji — müşteri evreni emoji kullanır (operasyon çizgi SVG). */
  icon: string;
  title: string;
  body: string;
  /** Boş hâl her zaman bir ÇIKIŞ verir: "hiçbir şey yok" tek başına çıkmaz sokaktır. */
  action: { label: string; href: ComponentProps<typeof Link>['href'] };
  /** Talep ölçeği (tasarım: emoji 32). Varsayılan sipariş ölçeği (34). */
  compact?: boolean;
}

export function ListEmpty({ icon, title, body, action, compact = false }: ListEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-2.5 text-center">
      <span className={compact ? 'text-[32px] leading-none' : 'text-[34px] leading-none'}>{icon}</span>
      {/* Ağırlık TOKEN'DAN gelir (`--text-card-title-sm--font-weight: 600`); ayrıca `font-semibold`
          yazmak aynı değeri iki yerde tutmaktır ve token değişince biri geride kalır. */}
      <span className="font-serif text-card-title-sm leading-tight text-ink">{title}</span>
      <span className="font-sans text-note leading-relaxed text-body">{body}</span>
      <Link href={action.href} className={buttonClass({ className: 'mt-1' })}>
        {action.label}
      </Link>
    </div>
  );
}
