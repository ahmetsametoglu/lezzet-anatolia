import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { listCourierDay } from '@/lib/courier/day';
import { guarded, requireAdmin, requireCourier } from '@/lib/guard';
import { DeliveriesClient } from './deliveries-client';
import { DISPATCH_NOTES } from './deliveries-labels';
import { parseDeliveriesUrl, toIsoDate } from './deliveries-url';
import { DispatchClient } from './dispatch-client';
import { readDispatchDay } from './dispatch-read';
import { RoutesClient } from './routes-client';
import { readZoneHandoff } from './routes-handoff';
import { readRoutes } from './routes-read';

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
      const warehouseId = typeof params.depo === 'string' ? params.depo : null;
      /**
       * **Asistan önerisinden gelindiyse** (`?proposal=<id>`) rota kurulumu ÖN DOLDURULUR (22.5).
       *
       * Sebep kullanıcının kendi cümlesi: *"bölgeye hangi posta kodlarının gireceğine haritaya
       * bakmadan karar veremem — diğer kodlar nerede, nerede değil."* Kuyruk bu yüzden bu tipi
       * uygulamıyor; buraya getiriyor. Kodlar önerinin kümesiyle **başlar**, operatör haritada
       * çıkarır/ekler ve kaydedilen küme ONUN kümesidir.
       *
       * `readHandoffProposal` üç hâlde `null` döner (satır yok · artık `pending` değil · devir
       * tipi değil) ve üçünde de ekran normal açılır — uyarı göstermez. Sonuncusu bir yetki
       * kapısıdır: adrese elle kimlik yazan biri `apply` modundaki bir öneriyi bu yoldan
       * uygulatamaz (mod künyeden okunur, adresin iddiasından değil).
       */
      const handoff = await readZoneHandoff(typeof params.proposal === 'string' ? params.proposal : null);
      return (
        <RoutesClient
          // Öneriden gelen kod kümesi ilk taslağı kuruyor; öneri değişince bileşen yeniden doğmalı.
          key={`${urlState.routeId ?? handoff?.zoneId ?? 'new'}:${handoff?.proposalId ?? ''}`}
          data={await readRoutes()}
          // Öneri bir bölgeyi işaret ediyorsa adres seçim taşımasa bile o rota açılır: operatör
          // "hangi rotaydı" diye aramak zorunda kalmamalı.
          routeId={urlState.routeId ?? handoff?.zoneId ?? null}
          warehouseId={warehouseId}
          handoff={handoff}
        />
      );
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
