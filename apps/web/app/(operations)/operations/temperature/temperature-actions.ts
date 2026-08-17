'use server';

import { revalidatePath } from 'next/cache';
import { StorageAreaService, TemperatureLogService, VehicleService, serviceDb } from '@lezzet/database';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';
import { readWorkWarehouse } from '@/lib/warehouse/context';
import { isUnusualReading } from './temperature-read';
import type { TemperatureDeviation, TemperaturePointKind } from './temperature-types';

/**
 * Sıcaklık kaydının yazma yolu (10.6).
 *
 * ── SIRA DIŞI DEĞER UYARIR, ENGELLEMEZ ──────────────────────────────────────
 * Tasarım: *"−8° girildi — donuk gıda için beklenmedik yüksek. Yazım hatası mı, gerçek sorun mu?
 * (kayıt engellenmez)"*. Bu MLOR uyarısının ikizidir (`DOMAIN §4`): karar sahadaki insanındır.
 * Reddetseydik iki kötü sonuçtan biri olurdu — ya gerçek bir arıza kayda GİRMEZDİ (dolap bozuldu,
 * sistem "böyle bir derece olamaz" dedi), ya da depocu kaydı geçirmek için sayıyı düzeltirdi.
 * İkisi de hijyen defterini yalancı yapar.
 *
 * Uyarı **kayıttan sonra** döner: `{ recorded: true, outOfRange }`. "Yazılmadı" ile "yazıldı ama
 * tuhaf" arasındaki farkı depocu bilmek zorunda.
 *
 * ── DEPO KİMLİĞİ İSTEMCİDEN GELMEZ ──────────────────────────────────────────
 * 10.7'nin kuralı burada da geçerli: kimlik sunucuda bağlamdan çözülür. Ölçüm bir TESİSİN
 * kaydıdır ve "Dolap 1" iki depoda da vardır — kimliği istemciye bırakmak, bir deponun ölçümünü
 * ötekinin defterine yazmanın en sessiz yolu olurdu.
 */
const ADJ_PATH = '/operations/adjustments';
/** Şeridin kendi sayfası — kayıt sonrası "bugün ölçülmedi" sayacı tazelensin. */
const TEMPERATURE_PATH = '/operations/temperature';

/**
 * Fiziksel sınır — **aralık uyarısı DEĞİL, akıl sağlığı kapısı.** Beklenen aralık ayardan gelir ve
 * dışı yalnız uyarır; buradaki sınır ise parmak kaymasını yakalar (`-185` yazılmış `-18,5`).
 * Kaydı reddetmesi meşru: dünyada o derece yok, yani ölçüm değil hatadır.
 */
const SANE_MIN_C = -60;
const SANE_MAX_C = 60;

export async function recordTemperatureAction(input: {
  kind: TemperaturePointKind;
  pointId: string;
  temperatureC: number;
}): Promise<ActionResult<{ name: string; deviation: TemperatureDeviation | null; usualC: number | null }>> {
  try {
    const { user } = await requireWarehouseScope();
    const workplace = await readWorkWarehouse();
    if (workplace.status !== 'ok') {
      throw new Error('Hangi depoda çalıştığınız belli değil — üst bardan depo seçip tekrar deneyin. Hiçbir kayıt yazılmadı.');
    }

    if (!input.pointId) throw new Error('Ölçüm noktası seçin.');
    if (!Number.isFinite(input.temperatureC)) throw new Error('Derece girin.');
    if (input.temperatureC < SANE_MIN_C || input.temperatureC > SANE_MAX_C) {
      throw new Error(`${SANE_MIN_C}° ile ${SANE_MAX_C}° arasında bir derece girin — bu değer bir ölçüm değil, yazım hatası.`);
    }

    const db = serviceDb();
    /**
     * **Nokta bu tesise ait mi — SUNUCUDA doğrulanıyor.**
     *
     * Eskiden nokta serbest metindi ve doğrulanacak bir şey yoktu; kimlik geldiğinde soru doğdu:
     * istemciden gelen bir uuid başka tesisin dolabını gösterebilir. Veritabanı bunu reddetmez
     * (`temperature_log.warehouse_id` ile noktanın deposu arasında kısıt yok) — yani kontrol
     * buradaysa vardır, yoksa hiç yoktur. Depo kimliği zaten istemciden gelmiyor (aşağıdaki künye);
     * nokta da gelmemeli.
     */
    const point =
      input.kind === 'area'
        ? await new StorageAreaService(db).getById(input.pointId)
        : await new VehicleService(db).getById(input.pointId);
    if (!point || (point.warehouseId !== null && point.warehouseId !== workplace.warehouseId)) {
      throw new Error('Bu ölçüm noktası bu tesise tanımlı değil — hiçbir kayıt yazılmadı.');
    }
    const name = 'plate' in point ? (point.label ? `${point.plate} · ${point.label}` : point.plate) : point.name;

    await new TemperatureLogService(db).insert({
      warehouseId: workplace.warehouseId,
      ...(input.kind === 'area' ? { storageAreaId: input.pointId } : { vehicleId: input.pointId }),
      temperatureC: input.temperatureC,
      recordedBy: user.profileId,
    });

    // Sapma kararı okuma tarafıyla AYNI fonksiyondan: ikisi ayrı hesaplasaydı bir gün kayıt anında
    // "normal" denip şeritte amber görünürdü ve hangisinin doğru olduğu belirsiz kalırdı.
    // Kayıttan SONRA soruluyor — yeni ölçüm de o noktanın geçmişinin parçası.
    const verdict = await isUnusualReading({
      warehouseId: workplace.warehouseId,
      kind: input.kind,
      pointId: input.pointId,
      temperatureC: input.temperatureC,
    });

    revalidatePath(ADJ_PATH);
    revalidatePath(TEMPERATURE_PATH);
    // `null` (ölçüt yok) ile "normal" AYRI: ekran ikisini aynı cümleye katlamıyor.
    return {
      data: { name, deviation: verdict?.deviation ?? null, usualC: verdict?.usualC ?? null },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
