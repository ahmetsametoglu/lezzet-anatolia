import { NavRow } from '@/components/customer/phone-kit/nav-row';
import type { LegalDirectoryView } from '../account-types';

/**
 * Bilgi ve koşullar — native `LegalLinks`in (`apps/mobile/src/screens/legal/legal-links.tsx`) web telefon ikizi
 * (14.09): beş belgenin tek listesi, hesabın menü kartıyla aynı kap. Hesap ekranının iki hâlinde de (girişli gövde,
 * misafir) en altta — telefon görünümünde footer yok ve belgelerin kalıcı evi burası (native'in 19.08 kararı). v1'in
 * ince bağlantı satırının (`SiteLinks`) yerine geçti.
 *
 * Başlık ve sayfa adları ortak bilgi sözlüğünden SUNUCUDA okunur (`page.tsx`): sözlük belge metinlerini de taşıyor
 * (~92 KB) ve bu kart onun yalnız altı cümlesine muhtaç — istemciye yalnız onlar gider. Sıra `LEGAL_LINKS`in sırası.
 */
interface LegalDirectoryProps {
  directory: LegalDirectoryView;
}

export function LegalDirectory({ directory }: LegalDirectoryProps) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-serif text-card-title-sm text-ink">{directory.title}</h2>
      <nav className="overflow-hidden rounded-card bg-sand-250">
        {directory.links.map((link, index) => (
          <NavRow key={link.href} label={link.label} href={link.href} divider={index > 0} />
        ))}
      </nav>
    </section>
  );
}
