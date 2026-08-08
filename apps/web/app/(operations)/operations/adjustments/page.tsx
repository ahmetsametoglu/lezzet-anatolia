import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { AuthError, requireWarehouseScope } from '@/lib/guard';
import { AdjustmentsClient } from './adjustments-client';
import { readAdjustments } from './adjustments-read';

/**
 * **Stoktan düş** (`/operations/adjustments`) — 10.5.
 * Tasarım: `design/project/Operasyon - Depo Imha Sayim.dc.html` (*"· web"* karesi).
 *
 * Depocu yalnız kendi deposunun partisini düşebilir: başka deponun malını buradan eksiltmek,
 * olmayan bir rafı saymak olurdu (`DOMAIN §17`). Kapsamsız personel hiçbir şey göremez.
 */
export default async function AdjustmentsPage() {
  let scope;
  try {
    ({ scope } = await requireWarehouseScope());
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    return (
      <NoAccessPane
        title="Stoktan düş"
        reason="Stok düşme kaydı depo personeline açıktır. Bir depoya atanmamış hesap kayıt yazamaz."
      />
    );
  }

  return <AdjustmentsClient data={await readAdjustments(scope)} />;
}
