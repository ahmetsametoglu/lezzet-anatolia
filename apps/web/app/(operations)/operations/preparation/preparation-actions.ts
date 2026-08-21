'use server';

import { revalidatePath } from 'next/cache';
import { confirmPreparation, recordShipment } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { CarrierEnum, type PreparationPick } from '@lezzet/types';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';
import { readWorkWarehouse } from '@/lib/warehouse/context';

/**
 * Hazırlık masasının tek yazma yolu (10.1–10.3).
 *
 * **Kural yazmıyor, kapıya devrediyor.** Kilitli parti kontrolü, parti kaydı, sipariş durumu ve
 * eksik tavsiyesi `confirmPreparation`'ın içinde; burada yalnız kimlik soruluyor ve cevap Türkçeye
 * çevriliyor. Ekranın karar sandığı her satır bir gün kapıyla ayrışırdı.
 *
 * **Depo kimliği İSTEMCİDEN GELMEZ** (10.7): sunucuda bağlamdan yeniden çözülür. Parametre olarak
 * alsaydık, çereze dokunmadan doğrudan action'a başka bir depo kimliği gönderen bir istek o deponun
 * siparişini kapatırdı — kapının `out_of_scope` kontrolü de kanmış olurdu, çünkü ona verilen kimlik
 * "operatörün deposu" diye geçerdi. Bağlam kapısı kimliği kapsama karşı doğrulanmış hâlde döndürür.
 */
const PREP_PATH = '/operations/preparation';

interface ConfirmResult {
  /** Yazılan kalem sayısı. */
  items: number;
  /** Sipariş "hazır"a geçti mi — tüm kalemler toplandıysa. */
  ready: boolean;
  /** Eksik kalan kalemler ve motorun tavsiyesi — **karar depocunun**, kapı onun yerine vermez. */
  shortfalls: { itemId: string; suggestion: { action: string; reason: string; missingQty: number } }[];
}

export async function confirmPreparationAction(
  orderId: string,
  picks: PreparationPick[],
): Promise<ActionResult<ConfirmResult>> {
  try {
    // İki ayrı soru, iki ayrı kapı: guard "bu kişi depo personeli mi" (fail-closed), bağlam ise
    // "bugün hangi depoda çalışıyor". Kimliği guard'dan almak yetmezdi — kapsam çok depolu
    // olabilir ve o zaman "hangisi" sorusunun cevabı guard'da yok.
    const { user } = await requireWarehouseScope();
    const workplace = await readWorkWarehouse();
    if (workplace.status !== 'ok') {
      throw new Error('Hangi depoda çalıştığınız belli değil — üst bardan depo seçip tekrar deneyin. Hiçbir kayıt yazılmadı.');
    }

    const result = await confirmPreparation(serviceDb(), {
      orderId,
      warehouseId: workplace.warehouseId,
      picks,
      actorId: user.profileId,
    });

    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    // **Başka deponun siparişi: HİÇBİR yazım yapılmadı.** Kuyruk zaten süzülü olduğu için normal
    // akışta görünmez; buraya düşmesi bayat bir sekmenin ya da bağlam değişikliğinin işaretidir.
    if (result.status === 'forbidden') {
      throw new Error(
        `Bu sipariş ${workplace.name} deposunun değil — başka bir deponun kuyruğundan geliyor. Hiçbir kayıt yazılmadı; sayfayı tazeleyin.`,
      );
    }
    // **Kilitli kalem ihlali: HİÇBİR yazım yapılmadı.** Cümle bunu açıkça söylüyor — "olmadı" ile
    // "yarısı oldu" arasındaki farkı depocu bilmek zorunda, yoksa kalemi ikinci kez toplar.
    if (result.status === 'pinned_violation') {
      throw new Error(
        'Bu kalem belirli bir partiye kilitli (indirimli teklif) ve başka partiden verilemez. Hiçbir kayıt yazılmadı — satırdaki partiyi kullanın.',
      );
    }

    revalidatePath(PREP_PATH);
    return {
      data: { items: result.items, ready: result.ready, shortfalls: result.shortfalls },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Kargo künyesi** (10.9) — taşıyıcı + takip numarası. Depo kimliği burada da istemciden gelmez;
 * `confirmPreparationAction` ile aynı iki kapıdan geçer. Taşıyıcı değeri `CarrierEnum.parse` ile
 * doğrulanır: server action'a gelen her şey istemci girdisidir, tip imzası onu doğrulamaz.
 */
export async function setShipmentAction(
  orderId: string,
  carrier: string,
  trackingNumber: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    await requireWarehouseScope();
    const workplace = await readWorkWarehouse();
    if (workplace.status !== 'ok') {
      throw new Error('Hangi depoda çalıştığınız belli değil — üst bardan depo seçip tekrar deneyin. Hiçbir kayıt yazılmadı.');
    }

    const result = await recordShipment(serviceDb(), {
      orderId,
      warehouseId: workplace.warehouseId,
      carrier: CarrierEnum.parse(carrier),
      // Boş kutu = "numara henüz elde değil" — geçerli bir hâl, boş dizgi olarak SAKLANMAZ.
      trackingNumber: trackingNumber.trim() || null,
    });

    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    if (result.status === 'forbidden') {
      throw new Error(
        `Bu sipariş ${workplace.name} deposunun değil — başka bir deponun kuyruğundan geliyor. Hiçbir kayıt yazılmadı; sayfayı tazeleyin.`,
      );
    }
    if (result.status === 'not_shipping') {
      throw new Error('Bu bir rota siparişi — taşıyıcı yalnız kargo siparişine yazılır. Hiçbir kayıt yazılmadı.');
    }

    revalidatePath(PREP_PATH);
    return { data: { ok: true }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
