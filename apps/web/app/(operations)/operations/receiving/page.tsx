import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { AuthError, requireWarehouseScope } from '@/lib/guard';
import { ReceivingClient } from './receiving-client';
import { readReceiving } from './receiving-read';

/**
 * **Mal kabul** (`/operations/receiving`) — 10.4.
 * Tasarım: `design/project/Operasyon - Depo Stok Giris.dc.html` (*"· web"* karesi).
 *
 * ── DEPO SÜZGECİ YOK, DEPO KAPSAMDAN ────────────────────────────────────────
 * Depocu kendi evreninde çalışır: başka deponun bekleyen siparişi bu ekranda görünmez. Yönetici
 * (`all`) hepsini görür ama kabul ettiği depoyu **bitirme diyaloğunda açıkça seçer** — varsayılan
 * üretilmez. Varsayılan bir depo, malın yanlış kapıdan girmesinin en sessiz yoludur.
 *
 * ── YALNIZ MASAÜSTÜ ─────────────────────────────────────────────────────────
 * Rampadaki tek-kalem akışı native uygulamanın işi (`21.11`); burası tasarımın deyişiyle *"irsaliye
 * masada"* çalışılan yer — bütün kalemler tek tabloda.
 */
export default async function ReceivingPage() {
  let scope;
  try {
    ({ scope } = await requireWarehouseScope());
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    return (
      <NoAccessPane
        title="Mal kabul"
        reason="Mal kabul depo personeline açıktır. Bir depoya atanmamış hesap kabul yazamaz."
      />
    );
  }

  return <ReceivingClient data={await readReceiving(scope)} />;
}
