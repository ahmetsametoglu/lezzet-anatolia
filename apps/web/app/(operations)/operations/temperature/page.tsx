import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { PageHeader } from '@/components/operation/ui/page-header';
import { WarehouseChoicePane } from '@/components/operation/ui/warehouse-choice-pane';
import { AuthError } from '@/lib/guard';
import { readWorkWarehouse } from '@/lib/warehouse/context';
import { TemperatureCard, TemperatureToday } from './temperature-card';
import { readTemperature } from './temperature-read';

/**
 * **Sıcaklık kaydı** (`/operations/temperature`) — 10.6.
 *
 * ── NEDEN AYRI SAYFA KALDI (22.26) ──────────────────────────────────────────
 * Bu sayfa eskiden "Stoktan düş"tü ve sıcaklık onun bir köşesiydi. Stoktan düşme Stok ekranının
 * Çıkışlar sekmesine taşındı; sıcaklık ONUNLA GİTMEDİ ve gitmemeliydi: hijyen defteri bir STOK
 * hareketi değil, tesisin günlük kaydıdır — mal girmez, çıkmaz, yalnız dolabın derecesi yazılır.
 * Stok sayfasına bir "sıcaklık" kartı iliştirmek, birleştirdiğimiz dağınıklığın aynısını başka bir
 * yerde kurmak olurdu.
 *
 * **Kalıcı evi henüz belli değil:** doğal adayı Depolar sayfasının tesis künyesi, asıl adayı ise
 * native uygulama (ölçüm dolabın önünde, ayakta, tek elle girilir — `docs/uygulama` D-serisi).
 * Karar verilene kadar yolu ve işlevi ayakta duruyor: `BEKLEYEN(22.29)`.
 *
 * Yol adı da değişti (`/operations/adjustments` → `/operations/temperature`): içeriği sıcaklık olan
 * bir sayfanın adresinde "düzeltme" yazması, arayan kişiyi yanlış yere gönderirdi.
 */
export default async function TemperaturePage() {
  let workplace;
  try {
    workplace = await readWorkWarehouse();
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    return (
      <NoAccessPane
        title="Sıcaklık kaydı"
        reason="Sıcaklık kaydı depo personeline açıktır. Bir depoya atanmamış hesap ölçüm yazamaz."
      />
    );
  }

  // **Depo seçilmeden liste kurulmuyor** (10.7): ölçüm noktası bir tesisin dolabıdır ve "hangi
  // depoda" sorusu cevaplanmadan hangi dolabın yazıldığı belli olmaz.
  if (workplace.status !== 'ok') {
    return (
      <WarehouseChoicePane
        title="Sıcaklık kaydı"
        hasOptions={workplace.status === 'needs_choice'}
        reason={
          workplace.status === 'none'
            ? 'Kapsamınızdaki depoların tamamı kapalı.'
            : 'Ölçüm noktası bir tesisin dolabıdır — hangi depoda çalıştığınız belli olmadan kayıt yazılamaz.'
        }
      />
    );
  }

  const { points } = await readTemperature(workplace.warehouseId);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Sıcaklık kaydı"
        subtitle={`${workplace.name} · günde 1-2 kez elle girilir · sıra dışı değer uyarır, engellemez`}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <div className="w-[420px] max-w-full">
          <TemperatureCard points={points} />
        </div>
        {/* Gün şeridi formun ALTINDA: önce iş yapılır, sonra sonuca bakılır. Üstte olsaydı her
            girişten sonra göz yukarı kayardı — depocunun turu aşağı doğru ilerliyor. */}
        <div className="w-[420px] max-w-full">
          <TemperatureToday points={points} />
        </div>
      </div>
    </div>
  );
}
