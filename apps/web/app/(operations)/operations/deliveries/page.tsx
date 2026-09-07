import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { guarded, requireAdmin } from '@/lib/guard';
import { readWarehouseContext } from '@/lib/warehouse/context';
import { DISPATCH_NOTES } from './deliveries-labels';
import { parseDeliveriesUrl, toIsoDate } from './deliveries-url';
import { DispatchClient } from './dispatch-client';
import { readDispatchDay } from './dispatch-read';
import { RoutesClient } from './routes-client';
import { readRoutes } from './routes-read';
import { RunsClient } from './runs-client';
import { readRunsPage } from './runs-read';

// **Teslimat & Rota** (`/operations/deliveries`) — sevkiyat masası: günü planla · rotayı tanımla ·
// gerçekleşeni oku. Üçü aynı işin üç anı, tek adres.
//
// ── KURYE DALI BURADAN ÇIKTI (kullanıcı kararı 07.09) ───────────────────────
// 05.08'den 07.09'a kadar bu adres iki dal taşıyordu: yöneticiye günün planı, kuryeye kendi durak
// listesi (`?view=mine`), kapıda teslim (`[orderId]`) ve sefer kapanışı (`close`). Kuryenin günü
// sahada geçer ve native uygulama o akışı uçtan uca taşıyor (21.10 · 21.271); web'deki kopya ise
// aynı kapının gerisinde kalmıştı — üç değişmez yalnız pakete yazıldı (`BACKLOG §17`). Mobilde
// çalışan bir saha akışı web'de ikinci kez kurulmaz. Sevkiyatçının "omuz üstünden bakma" ihtiyacı
// plan sekmesinde zaten karşılanıyor (durak, kurye, ilerleme, sefer).
//
// ── TASARIM SÖZLEŞMESİ ──────────────────────────────────────────────────────
// `design/pages/admin-teslimat.md`. Sayfanın adı "Rotalar" değil "Teslimat": bu sistemde rota bir
// sayfa değil bir teslimat TÜRÜDÜR.

interface DeliveriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DeliveriesPage({ searchParams }: DeliveriesPageProps) {
  const params = await searchParams;
  const urlState = parseDeliveriesUrl(params, toIsoDate(new Date()));

  const admin = await guarded(requireAdmin);
  if (!admin.ok) return <NoAccessPane title="Teslimat & Rota" reason={DISPATCH_NOTES.noAccess} />;

  // İKİ SEKME, TEK SAYFA (tasarım): rota TANIMLAMAK ile günü PLANLAMAK aynı işin iki anı —
  // "bir bölge tanımlamak, bir dağıtım güzergâhı tanımlamaktır; günü gelince o rota dağıtıma
  // çıkar" (kullanıcı kararı 07.08). İkisini iki sayfaya bölmek, operatörü aynı işin ortasında
  // gezinmeye zorluyordu.
  if (urlState.tab === 'routes') {
    /**
     * **Başlıktaki depo bağlamı buraya kadar geliyordu ama HİÇBİR ŞEYE dokunmuyordu** (ölçüldü
     * 17.08): sayfa yalnız `?depo=`yi okuyor, o da bir süzgeç değil yeni rota taslağının
     * varsayılan deposuydu. Yani operatör "Kehl" seçse bile rota listesi bütün kalıyordu —
     * seçici bu sayfada işlevsizdi (öteki operasyon ekranlarının hepsi bu bağlamı okuyor).
     *
     * Bağlam artık YALNIZ seçicinin listesini daraltıyor; harita ve öneriler bütün kalıyor
     * (kullanıcı kararı 17.08 — gerekçe `routes.desktop`'ta).
     */
    const ctx = await readWarehouseContext();
    // Adresteki depo (Depolar'dan gelen köprü) bağlamı EZER: operatörün o tıklamadaki niyeti
    // kalıcı tercihinden tazedir.
    const warehouseId = typeof params.depo === 'string' ? params.depo : ctx.activeWarehouseId;
    /**
     * ── DEVİR YOLU SÖKÜLDÜ (22.24 · 26.08) ────────────────────────────────
     * Burada `?proposal=<id>` okunup rota kurulumu ön doldurulurdu (22.5). `zone_extend` artık
     * kuyruğun İÇİNDE, kendi haritasıyla karara bağlanıyor (22.36) — yani bu ekrana devreden
     * öneri kalmadı. Okuma zaten ölüydü: `readHandoffProposal` mod kontrolüyle başlıyordu ve
     * hiçbir tip `handoff` olmadığı için her çağrıda `null` dönüyordu.
     */
    return (
      <RoutesClient
        key={urlState.routeId ?? 'new'}
        data={await readRoutes()}
        routeId={urlState.routeId ?? null}
        warehouseId={warehouseId}
        contextWarehouseId={ctx.activeWarehouseId}
      />
    );
  }
  // ÜÇÜNCÜ AN (18.08): gerçekleşen seferler — plan siparişten türetir, burası kaydın kendisini
  // okur (kim sürdü, hangi araç, saatler, mutabakat). `docs/feature/sefer.md` Faz 5.
  if (urlState.tab === 'runs') {
    return <RunsClient initial={await readRunsPage()} />;
  }
  return <DispatchClient day={await readDispatchDay(urlState.date)} />;
}
