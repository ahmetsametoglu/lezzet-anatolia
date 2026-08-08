import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { WarehouseChoicePane } from '@/components/operation/ui/warehouse-choice-pane';
import { AuthError } from '@/lib/guard';
import { readWorkWarehouse } from '@/lib/warehouse/context';
import { AdjustmentsClient } from './adjustments-client';
import { readAdjustments } from './adjustments-read';

/**
 * **Stoktan düş** (`/operations/adjustments`) — 10.5.
 * Tasarım: `design/project/Operasyon - Depo Imha Sayim.dc.html` (*"· web"* karesi).
 *
 * Depocu yalnız kendi deposunun partisini düşebilir: başka deponun malını buradan eksiltmek,
 * olmayan bir rafı saymak olurdu (`DOMAIN §17`). Kapsamsız personel hiçbir şey göremez.
 *
 * **Depo seçilmeden liste kurulmuyor** (10.7): eskiden çok depolu kapsamda bütün depoların partisi
 * tek listede geliyordu ve düşülen parti "hangi depodan" sorusunu ancak kimliğiyle cevaplıyordu.
 * Kapı artık kimlik istiyor ve haklı — imha tutanağı bir rafın tutanağıdır.
 */
export default async function AdjustmentsPage() {
  let workplace;
  try {
    workplace = await readWorkWarehouse();
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    return (
      <NoAccessPane
        title="Stoktan düş"
        reason="Stok düşme kaydı depo personeline açıktır. Bir depoya atanmamış hesap kayıt yazamaz."
      />
    );
  }

  if (workplace.status !== 'ok') {
    return (
      <WarehouseChoicePane
        title="Stoktan düş"
        hasOptions={workplace.status === 'needs_choice'}
        reason={
          workplace.status === 'none'
            ? 'Kapsamınızdaki depoların tamamı kapalı.'
            : 'Düşülecek parti bir deponun rafındadır — hangi rafa baktığınız belli olmadan liste kurulamaz.'
        }
      />
    );
  }

  return <AdjustmentsClient data={await readAdjustments({ id: workplace.warehouseId, name: workplace.name })} />;
}
