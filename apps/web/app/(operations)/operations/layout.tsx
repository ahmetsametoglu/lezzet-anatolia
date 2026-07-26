import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Space_Grotesk, IBM_Plex_Mono, Karla } from 'next/font/google';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { AuthError, requireStaff } from '@/lib/guard';
import { getPathname } from '@/i18n/navigation';
import { RootShell } from '@/components/root-shell';
import { AdminSidebar } from '@/components/operation/ui/admin-sidebar';

// Operasyon evreni ("Veri Masası") fontları. latin-ext → Türkçe (ş ğ ı) doğru gösterilir.
const spaceGrotesk = Space_Grotesk({ subsets: ['latin', 'latin-ext'], variable: '--font-space-grotesk', display: 'swap' });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600'], variable: '--font-ibm-plex-mono', display: 'swap' });
const karla = Karla({ subsets: ['latin', 'latin-ext'], variable: '--font-karla', display: 'swap' });

export const metadata: Metadata = {
  title: 'Operasyon — Lezzet Anatolia',
};

interface OperationsLayoutProps {
  children: ReactNode;
}

/**
 * Operasyon yüzeyi kökü — yalnız personel (Türkçe, locale yönlendirmesinin dışında). Guard BURADA:
 * tüm alt sayfaları korur ve kullanıcıyı sidebar'a taşır. AdminSidebar tek gezinme kaynağıdır.
 * Mobil operasyon kabuğu (Envanter O11) sonraki dilimde.
 */
export default async function OperationsLayout({ children }: OperationsLayoutProps) {
  let user;
  try {
    user = await requireStaff();
  } catch (e) {
    if (e instanceof AuthError) {
      // Personel Türkçe → Türkçe girişe yönlendir (yerelleştirilmiş dış URL: /tr/giris).
      if (e.code === 'auth_required') redirect(`${getPathname({ locale: 'tr', href: '/login' })}?next=/operations`);
      redirect('/'); // müşteri Operasyon'a giremez → market'e
    }
    throw e;
  }

  // requireStaff geçtiğine göre rol customer değil; sidebar için rolü çek.
  const role = (await new UserProfileService(serviceDb()).getRole(user.id)) ?? 'admin';

  return (
    <RootShell lang="tr" className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} ${karla.variable}`}>
      {/* Uygulama kabuğu: viewport yüksekliği sabit; sidebar ve içerik kendi içinde kaydırılır (Veri Masası). */}
      <div className="flex h-screen overflow-hidden bg-ops-bg font-ops-body text-ops-ink">
        <AdminSidebar user={{ email: user.email ?? '', role }} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </RootShell>
  );
}
