import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { AuthError } from '@/lib/guard';
import { ReceivingClient } from './receiving-client';
import { readIntakeHandoff } from './receiving-handoff';
import { readReceiving } from './receiving-read';

/**
 * **Mal kabul** (`/operations/receiving`) — 10.4.
 * Tasarım: `design/project/Operasyon - Depo Stok Giris.dc.html` (*"· web"* karesi).
 *
 * ── DEPO SÜZGECİ YOK, DEPO KAPSAMDAN ────────────────────────────────────────
 * Bekleyen liste depo-üstüdür ve öyle olmalı: tedarik siparişi bir depoya ait değil. Depo sorusu
 * YAZMA anında sorulur — kabul edilen kapıyı operatör **bitirme diyaloğunda açıkça seçer** ve
 * varsayılan üretilmez. Varsayılan bir depo, malın yanlış kapıdan girmesinin en sessiz yoludur.
 *
 * Bu yüzden bu sayfada `WarehouseChoicePane` YOK (hazırlık ve stoktan düşte var): burada liste
 * depo bilinmeden de anlamlıdır, kapatılacak tek şey yazma anıdır.
 *
 * ── YALNIZ MASAÜSTÜ ─────────────────────────────────────────────────────────
 * Rampadaki tek-kalem akışı native uygulamanın işi (`21.11`); burası tasarımın deyişiyle *"irsaliye
 * masada"* çalışılan yer — bütün kalemler tek tabloda.
 */
interface ReceivingPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ReceivingPage({ searchParams }: ReceivingPageProps) {
  const params = await searchParams;
  let data;
  try {
    data = await readReceiving();
  } catch (err) {
    if (!(err instanceof AuthError)) throw err;
    return (
      <NoAccessPane
        title="Mal kabul"
        reason="Mal kabul depo personeline açıktır. Bir depoya atanmamış hesap kabul yazamaz."
      />
    );
  }

  /**
   * **Asistan önerisinden gelindiyse** (`?proposal=<id>`) masa ön doldurulur (22.5): satırlar,
   * SKT ve lot dolu gelir — ADET boş kalır (`receiving-handoff` künyesi: sayım gözle yapılır).
   * `null` dönen üç hâlde (satır yok · artık `pending` değil · devir tipi değil) ekran normal açılır.
   */
  const handoff = await readIntakeHandoff(typeof params.proposal === 'string' ? params.proposal : null);

  return <ReceivingClient key={handoff?.proposalId ?? 'manual'} data={data} handoff={handoff} />;
}
