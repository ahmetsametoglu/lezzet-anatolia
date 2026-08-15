'use server';

import { revalidatePath } from 'next/cache';
import { TemperatureLogService, serviceDb } from '@lezzet/database';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';
import { readWorkWarehouse } from '@/lib/warehouse/context';
import { isUnusualReading } from './temperature-read';

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

/** Nokta adının tavanı — dolap adı/plaka; uzun metin bir not değil, yanlış alan kullanımıdır. */
const LOCATION_MAX = 60;

/**
 * Fiziksel sınır — **aralık uyarısı DEĞİL, akıl sağlığı kapısı.** Beklenen aralık ayardan gelir ve
 * dışı yalnız uyarır; buradaki sınır ise parmak kaymasını yakalar (`-185` yazılmış `-18,5`).
 * Kaydı reddetmesi meşru: dünyada o derece yok, yani ölçüm değil hatadır.
 */
const SANE_MIN_C = -60;
const SANE_MAX_C = 60;

export async function recordTemperatureAction(input: {
  location: string;
  temperatureC: number;
}): Promise<ActionResult<{ location: string; unusual: { usualC: number } | null }>> {
  try {
    const { user } = await requireWarehouseScope();
    const workplace = await readWorkWarehouse();
    if (workplace.status !== 'ok') {
      throw new Error('Hangi depoda çalıştığınız belli değil — üst bardan depo seçip tekrar deneyin. Hiçbir kayıt yazılmadı.');
    }

    const location = input.location.trim();
    if (!location) throw new Error('Ölçüm noktası seçin ya da adını yazın.');
    if (location.length > LOCATION_MAX) throw new Error(`Nokta adı en çok ${LOCATION_MAX} karakter olabilir.`);

    if (!Number.isFinite(input.temperatureC)) throw new Error('Derece girin.');
    if (input.temperatureC < SANE_MIN_C || input.temperatureC > SANE_MAX_C) {
      throw new Error(`${SANE_MIN_C}° ile ${SANE_MAX_C}° arasında bir derece girin — bu değer bir ölçüm değil, yazım hatası.`);
    }

    await new TemperatureLogService(serviceDb()).insert({
      warehouseId: workplace.warehouseId,
      location,
      temperatureC: input.temperatureC,
      recordedBy: user.profileId,
    });

    // Sıra dışılık kararı okuma tarafıyla AYNI fonksiyondan: ikisi ayrı hesaplasaydı bir gün kayıt
    // anında "normal" denip şeritte amber görünürdü ve hangisinin doğru olduğu belirsiz kalırdı.
    // Kayıttan SONRA soruluyor — yeni ölçüm de o noktanın geçmişinin parçası.
    const verdict = await isUnusualReading({
      warehouseId: workplace.warehouseId,
      location,
      temperatureC: input.temperatureC,
    });

    revalidatePath(ADJ_PATH);
    // `null` (yeterli geçmiş yok) ile "normal" AYRI: ekran ikisini aynı cümleye katlamıyor.
    return {
      data: { location, unusual: verdict?.unusual ? { usualC: verdict.usualC } : null },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
