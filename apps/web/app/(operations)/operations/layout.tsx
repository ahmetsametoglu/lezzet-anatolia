import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Space_Grotesk, IBM_Plex_Mono, Karla } from 'next/font/google';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { STAFF_ROLES } from '@lezzet/types';
import { AuthError, requireStaff } from '@/lib/guard';
import { readWarehouseContext } from '@/lib/warehouse/context';
import { OPERATIONS_PATH_HEADER, OPERATIONS_PREFIX } from '@/lib/operations-request';
import { getPathname } from '@/i18n/navigation';
import { RootShell } from '@/components/root-shell';
import { AdminSidebar } from '@/components/operation/ui/admin-sidebar';
import { detectDevice } from '@/lib/device';
import { OpsShellProvider } from '@/components/operation/ui/ops-shell';
import { buttonClass } from '@/components/operation/ui/button';
import { ErrorState } from '@/components/operation/ui/error-state';
import { AlertIcon } from '@/components/operation/ui/icons';

// Operasyon evreni ("Veri Masası") fontları. latin-ext → Türkçe (ş ğ ı) doğru gösterilir.
const spaceGrotesk = Space_Grotesk({ subsets: ['latin', 'latin-ext'], variable: '--font-space-grotesk', display: 'swap' });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600'], variable: '--font-ibm-plex-mono', display: 'swap' });
const karla = Karla({ subsets: ['latin', 'latin-ext'], variable: '--font-karla', display: 'swap' });

/** İki kabuk da (uygulama + yetki ekranı) aynı font değişkenlerini taşır — tek yerde tanımlı. */
const fontVars = `${spaceGrotesk.variable} ${ibmPlexMono.variable} ${karla.variable}`;

export const metadata: Metadata = {
  title: 'Operasyon — Lezzet Anatolia',
  // Personel yüzeyi arama motorunda ASLA görünmez. Meta etiket gövdeli yanıtları, middleware'in
  // `X-Robots-Tag` üstbilgisi gövdesiz/yönlendirme yanıtlarını kapatır — ikisi bir arada.
  robots: { index: false, follow: false, nocache: true },
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
    if (!(e instanceof AuthError)) throw e;
    // Oturum yoksa: Türkçe girişe git ve GELDİĞİ yolu taşı — giriş sonrası operatör panele değil
    // bıraktığı ekrana döner. Yol middleware'in koyduğu üstbilgiden okunur (layout pathname görmez).
    if (e.code === 'auth_required') {
      const from = (await headers()).get(OPERATIONS_PATH_HEADER) ?? OPERATIONS_PREFIX;
      redirect(`${getPathname({ locale: 'tr', href: '/login' })}?next=${encodeURIComponent(from)}`);
    }
    // Girişli ama personel değil: sessizce markete ışınlamak yerine NE olduğu söylenir. Yanlış
    // hesapla giriş yapmış bir personel için de çıkış yolu var — yoksa "tıkladım, anasayfaya
    // attı" döngüsüne düşerdi.
    return <NotStaffScreen />;
  }

  // requireStaff geçtiğine göre en az bir operasyon rolü var. Roller ÇOĞUL taşınır: bir kişi hem
  // depocu hem muhasebeci olabilir ve gezinmesi ikisinin BİRLEŞİMİdir. Önceden yalnız "en geniş"
  // rol seçiliyordu ve o da sadece etiket içindi — nav herkese her şeyi gösteriyordu.
  // Müşteri rolü ayıklanır: aynı kişi hem müşteri hem personel olabilir, ama operasyon gezinmesi
  // personel rollerinden doğar.
  const allRoles = await new UserProfileService(serviceDb()).getRoles(user.id);
  const staffRoles = STAFF_ROLES.filter((r) => allRoles.includes(r));
  // Dev bypass'ta profil okunamayabilir (sahte kimlik) — yüzey açık kalsın diye yönetici sayılır.
  const roles = staffRoles.length > 0 ? staffRoles : (['admin'] as const);

  // Depo bağlamı BURADA okunur: sidebar'da durur ve sayfadan sayfaya taşınır — kimlik düzeyinde bir
  // tercih (19.5). Sayfalar aynı isteğin içinde tekrar sorduğunda `cache()` sayesinde bedava, ve
  // daha önemlisi seçici ile liste AYNI cevabı görür.
  const { warehouses, activeWarehouseId, scope } = await readWarehouseContext();

  // Cihaz ipucu kabuğa iniyor: TELEFONDA gezinme rayı bir çekmecedir (04.08). Karar layout'ta
  // veriliyor çünkü ray da başlık barındaki hamburger de layout'un parçası, sayfanın değil.
  const device = await detectDevice();

  return (
    <RootShell lang="tr" surface="operations" className={fontVars}>
      {/* Uygulama kabuğu: viewport yüksekliği sabit; sidebar ve içerik kendi içinde kaydırılır (Veri Masası). */}
      <div className="flex h-screen overflow-hidden bg-ops-bg font-ops-body text-ops-ink">
        {/* Kabuk bağlamı: kim bağlandı + hangi depo evreni. Başlık barı (`PageHeader`) bunları
            buradan okur — barı SAYFA çiziyor ama bu üç blok sayfanın değil oturumun (09.19). */}
        <OpsShellProvider
          device={device}
          value={{
            user: { email: user.email ?? '', roles },
            warehouse: { warehouses, activeWarehouseId, unscoped: scope.kind === 'all' },
          }}
        >
          {/* RAY SAĞLAYICININ İÇİNDE olmak zorunda: çekmece durumunu (`nav`) oradan okuyor.
              Dışarıda dururken context'i `null` görüyordu — hamburger çiziliyor ama basınca hiçbir
              şey olmuyordu, çünkü rayın kendisi "masaüstündeyim" sanıyordu (ölçüldü: `ui:shot`). */}
          <AdminSidebar roles={roles} />
          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
        </OpsShellProvider>
      </div>
    </RootShell>
  );
}

/**
 * Personel olmayan girişli kullanıcı — kabuk YOK (sidebar operasyon gezinmesidir, yetkisi olmayana
 * açılmaz), yalnız durum bloğu. İki çıkış: markete dönmek ya da doğru hesapla girmek.
 *
 * Gizleme (404) tercih edilmedi: kişi zaten adresi bilerek yazdı, yüzeyin varlığı sır değil; sırra
 * yaklaşan tek şey İÇERİĞİ ve o kapalı. Sessiz yönlendirme ise operatöre "tıkladım, bir şey oldu"
 * dedirtir — teşhis edilemeyen tek hâl odur.
 */
function NotStaffScreen() {
  return (
    <RootShell lang="tr" surface="operations" className={fontVars}>
      <div className="flex h-screen flex-col overflow-hidden bg-ops-bg font-ops-body text-ops-ink">
        <ErrorState
          tone="amber"
          icon={<AlertIcon />}
          title="Bu alan personel içindir"
          description="Hesabınız operasyon yüzeyine yetkili değil. Personelseniz iş hesabınızla girin; değilseniz alışverişe markette devam edebilirsiniz."
        >
          <div className="flex gap-2">
            <Link href={`${getPathname({ locale: 'tr', href: '/login' })}?next=${encodeURIComponent(OPERATIONS_PREFIX)}`} className={buttonClass({ variant: 'primary' })}>
              Farklı hesapla gir
            </Link>
            <Link href="/" className={buttonClass({ variant: 'secondary' })}>
              Markete dön
            </Link>
          </div>
        </ErrorState>
      </div>
    </RootShell>
  );
}
