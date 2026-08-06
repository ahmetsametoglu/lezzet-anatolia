import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { openDayClose } from '@/lib/courier/day-close';
import { guarded, requireCourier } from '@/lib/guard';
import { DayCloseClient } from './close-client';

// **Gün kapanışı ve kasa mutabakatı** (`/operations/deliveries/close`) — 11.6'nın ekranı.
//
// Gün listesi bütün duraklar sonuçlandığında "kasa mutabakatı için gün kapanışına geçebilirsiniz"
// diyordu ve gidilecek yer YOKTU. Bir ekranın söz verip tutmadığı tek şey, o ekranın en zayıf yeridir.
//
// **Statik segment, `[orderId]`'nin önünde.** Next statik yolu dinamikten önce çözer; `close` bir
// sipariş kimliği sanılmaz.
//
// Kapanış bir **mutabakattır**, para hareketi değil: para kapıda tahsil edilirken yazıldı (11.3).
// Burada beklenen ile sayılan yan yana konur ve fark AYNI GÜN görünür — ertesi güne sarkarsa iz soğur.

export default async function DayClosePage() {
  const access = await guarded(requireCourier);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Gün kapanışı"
        reason="Bu ekran kuryenin kendi gününü kasayla karşılaştırdığı yerdir. İşletme kasası ve hesaplar para ekranındadır."
      />
    );
  }

  const draft = await openDayClose({ courierId: access.user.id });

  return <DayCloseClient draft={draft} />;
}
