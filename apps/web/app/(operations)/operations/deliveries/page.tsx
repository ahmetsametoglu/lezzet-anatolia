import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { listCourierDay } from '@/lib/courier/day';
import { guarded, requireAdmin, requireCourier } from '@/lib/guard';
import { readWarehouseContext } from '@/lib/warehouse/context';
import { DeliveriesClient } from './deliveries-client';
import { DISPATCH_NOTES } from './deliveries-labels';
import { parseDeliveriesUrl, toIsoDate } from './deliveries-url';
import { DispatchClient } from './dispatch-client';
import { readDispatchDay } from './dispatch-read';
import { RoutesClient } from './routes-client';
import { readRoutes } from './routes-read';
import { RunsClient } from './runs-client';
import { readRunsPage } from './runs-read';

// **Teslimat & Rota** (`/operations/deliveries`) — İKİ DAL, TEK ADRES.
//
// ── NEDEN TEK SAYFA ─────────────────────────────────────────────────────────
// Sevkiyatçının gün planı (09.15) ve kuryenin günü (11.1) aynı veriye bakıyor: o günün çıkışları.
// Nav da tek giriş taşıyor ("Teslimat & Rota"). Ayrı rotalar açmak, aynı günü iki adresten anlatmak
// olurdu — ve "kurye atandı mı" sorusunun cevabı iki ekranda ayrı ayrı türetilirdi.
//
// ── DAL ROLDEN SEÇİLİR, ADRESTEN DEĞİL ──────────────────────────────────────
// Yönetici günün planını görür, kurye kendi durak listesini. `?view=mine` yalnız **iki şapkayı da
// taşıyan** kişi için var (`admin` + `courier` sık bir bileşim) — yetki değiştirmez, GÖRÜNÜM seçer:
// kurye dalı kimliği yine guard'dan alıyor, adresten değil. `?courierId=` gibi bir parametre olsaydı
// bir kurye başkasının gününü açardı.
//
// ── TASARIM SÖZLEŞMESİ ──────────────────────────────────────────────────────
// `design/pages/admin-teslimat.md` (sevkiyatçı dalı) + `kurye-gun.md` (kurye dalı). Sayfanın adı
// "Rotalar" değil "Teslimat": bu sistemde rota bir sayfa değil bir teslimat TÜRÜDÜR.

interface DeliveriesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DeliveriesPage({ searchParams }: DeliveriesPageProps) {
  const params = await searchParams;
  const urlState = parseDeliveriesUrl(params, toIsoDate(new Date()));

  const admin = await guarded(requireAdmin);
  if (admin.ok && urlState.view !== 'mine') {
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

  const courier = await guarded(requireCourier);
  if (!courier.ok) return <NoAccessPane title="Teslimat & Rota" reason={DISPATCH_NOTES.noAccess} />;

  // **Kurye kimliği GUARD'dan.** Kurye dalı gün seçmez: sahadaki soru "bugün ne var" — geçmiş bir
  // günün durakları üzerinde yapılacak bir iş de yok.
  const stops = await listCourierDay({ courierId: courier.user.profileId });

  return <DeliveriesClient stops={stops} />;
}
