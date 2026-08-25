'use server';

import { revalidatePath } from 'next/cache';
import { confirmPreparation, recordShipment } from '@lezzet/application';
// Alt yol: paketin barrel'ı başka şeridin aktif alanı ve aynı turda iki kez çakıştı (23.13).
import { shortfallQuestion } from '@lezzet/application/warehouse/shortfall-question';
import { serviceDb } from '@lezzet/database';
import { CarrierEnum, type PreparationPick } from '@lezzet/types';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireWarehouseScope } from '@/lib/guard';
import { openTicket } from '@/lib/ticket/write';
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

/**
 * **"Müşteriye sorulsun"** (10.3) — eksik kalan kalemin sorusu kuyruğa düşer.
 *
 * ── DEPOCU SORUYU SORMAZ, SORULMASINI İSTER ─────────────────────────────────
 * Açılan talep operasyonun kuyruğuna girer; müşteriyle hangi kanaldan konuşulacağına orası karar
 * verir (kullanıcı kararı 25.08). Müşteriye otomatik mesaj GİTMİYOR — `openTicket` personel
 * kaynaklı talepte teyit maili göndermiyor (16.4) ve biz de ayrıca bir zil çalmıyoruz.
 *
 * ── DEPOCUYA MÜŞTERİ BİLGİSİ DÖNMEZ ─────────────────────────────────────────
 * `customerId` sunucuda çözülüp sunucuda tüketiliyor; eylemin cevabı yalnız "soruldu"dur. Kimliği
 * istemciye göndermek, rol duvarını bir `console.log` uzağına indirirdi.
 *
 * ── GÖVDE TÜRKÇE, MÜŞTERİ KENDİ DİLİNDE OKUR ────────────────────────────────
 * Çeviri `openTicket` içinde, mesaj yazıldıktan hemen sonra (`replyAsStaff` ile aynı sıra).
 */
export async function askCustomerAction(orderItemId: string): Promise<ActionResult<{ ticketId: string }>> {
  try {
    const { user } = await requireWarehouseScope();
    const workplace = await readWorkWarehouse();
    if (workplace.status !== 'ok') {
      throw new Error('Hangi depoda çalıştığınız belli değil — üst bardan depo seçip tekrar deneyin. Soru sorulmadı.');
    }

    const draft = await shortfallQuestion(serviceDb(), { orderItemId, warehouseId: workplace.warehouseId });
    if (draft.status === 'not_found') throw new Error('Sipariş kalemi bulunamadı.');
    if (draft.status === 'out_of_scope') {
      throw new Error(
        `Bu sipariş ${workplace.name} deposunun değil — başka bir deponun kuyruğundan geliyor. Soru sorulmadı; sayfayı tazeleyin.`,
      );
    }
    // Eksik kapanmışsa soru anlamsızdır — ve bu bir hata değil, iyi haber: sayfa bayat.
    if (draft.status === 'no_shortfall') {
      throw new Error('Bu kalemde eksik kalmamış — sayfayı tazeleyin. Soru sorulmadı.');
    }
    // Çift talep koruması kapıda; buradaki cümle onu operatöre okunur hâle getiriyor.
    if (draft.status === 'already_asked') {
      throw new Error('Bu kalem için zaten açık bir soru var — operasyon takip ediyor. İkinci soru açılmadı.');
    }

    const result = await openTicket({
      customerId: draft.customerId,
      // `admin`: ilk sözü işletme söylüyor. `question`: bir arıza bildirimi değil, bir soru.
      source: 'admin',
      type: 'question',
      body: draft.body,
      subject: draft.subject,
      orderId: draft.orderId,
      // Kalem bağı ŞART: kuyruk "hangi kalem" sorusunu cevaplayabilmeli ve çift talep koruması
      // (`findOpenByOrderItem`) tam bu alandan okuyor.
      orderItemIds: [draft.orderItemId],
      authorId: user.profileId,
    });
    if (!result.ok) throw new Error(`Soru açılamadı (${result.reason}).`);

    revalidatePath(PREP_PATH);
    return { data: { ticketId: result.data.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
