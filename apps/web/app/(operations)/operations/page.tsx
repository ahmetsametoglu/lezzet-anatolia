import { serviceDb } from '@lezzet/database';
import { guarded, requireAdmin } from '@/lib/guard';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { readDashboard } from './dashboard-page-read';
import { DashboardDesktop } from './dashboard.desktop';

/**
 * Panel (09.3) — operasyonun açılış ekranı: *"bugün ne var, ne bekliyor, nerede sorun var"*
 * (`design/pages/admin-dashboard.md`).
 *
 * ── KAPI: YALNIZ YÖNETİCİ ────────────────────────────────────────────────────
 * Ciro, marj ve vade bu ekranda yan yana duruyor; depocu ve kurye kendi ekranlarını kullanır
 * (brief §6). Kapı `requireAdmin` — nav'ın onu göstermemesi bir güvence değil, görgü kuralıdır.
 *
 * ── İSTEMCİ KATMANI YOK, VE BU KASITLI ──────────────────────────────────────
 * Ekranın sözleşmesi *"karar tetikler, iş bitirmez"*: tek etkileşim köprüdür — form yok, seçim yok,
 * durum yok. `*-client` katmanı eklemek boş bir sarmalayıcı olurdu (`knip` de haklı olarak ölü kod
 * derdi). Operasyon web'i masaüstü-yalnız olduğu için cihaz forku da yok (`CLAUDE §2`).
 *
 * ── "ŞİMDİ" TEK YERDE ÜRETİLİR ───────────────────────────────────────────────
 * Gün akışı, üst şerit ve depo nabzı aynı ana bakmak zorunda: üçü kendi `new Date()`ini alsaydı
 * saniye farkları eşik hesabını ayırabilir ve şerit "20 dk kaldı" derken akış adımı çoktan geçmiş
 * görünebilirdi. Bu yüzden an sunucuda bir kez üretilip aşağı akıyor (`readDashboard`).
 */
export default async function OperationsPage() {
  const access = await guarded(requireAdmin);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Panel"
        reason="Günün genel bakışı ciro, marj ve vade bilgisi taşıdığı için yönetime açıktır. Deponuzun işi Hazırlık ve Stok ekranlarında, günün teslimatları Teslimat & Rota'da."
      />
    );
  }

  const data = await readDashboard(serviceDb());
  return <DashboardDesktop data={data} />;
}
