import { OrderBoxService, UserProfileService } from '@lezzet/database';
import { DeliveryProofRecordSchema, type Order } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * **SİPARİŞİN KUTU İZİ** — "bu siparişin hangi kutuları çıktı" sorusunun tek okuma kapısı
 * (kullanıcı kararı 07.09: operasyon mobilde gerçekleşir, web'den de GÖRÜNMELİ).
 *
 * ── ÜÇ DAMGA, ÜÇ KAYNAK ─────────────────────────────────────────────────────
 * Kutunun hayatı üç ayrı yerde damgalanıyor: mühür (`seal_order_box` → `sealed_at/by`), araca
 * yükleme ya da taşıyıcıya devir (`loaded_at/by` — aynı kolon, iki kulvarda iki fiil) ve kapıda
 * okutma — o damga kutu satırında DEĞİL, teslim KANITININ `boxCodes` listesinde (23.8). Hazırlık
 * kuyruğu ve kurye günü kendi ihtiyaçları kadarını kuruyor (`preparation.ts` · `courier/day.ts`);
 * sipariş detayının sorusu üçünü birden ister. Web bunu kendi servis kompozisyonuyla kursaydı
 * okuma katmanındaki ikizlere bir yenisi eklenirdi (`BACKLOG §17`) — kapı burada, iki yüzey de
 * buradan okur.
 *
 * ── ÖLÇÜLEMEYEN DEĞER SIFIR DEĞİLDİR (CLAUDE §1) ────────────────────────────
 * `scannedAtDoor` üç değerli: kanıt yoksa `null` — henüz teslim yok ya da kutusuz eski kayıt.
 * `false` yazmak, olmayan bir teslimi "okutulmadan yapılmış" gibi okuturdu.
 *
 * Personel adları tek turda çözülür (`listByIds`, N+1 yok); silinmiş ya da adsız hesap `null` —
 * ad uydurulmaz. `totalBoxes` her satırda taşınır: ekran "Kutu 2/3" yazar, sayıyı kendi saymaz.
 */
export interface OrderBoxTrace {
  boxId: string;
  boxNo: number;
  totalBoxes: number;
  /** QR'ın içeriği (`KT-…`) — sipariş referansı değil. */
  code: string;
  /** `null` = kutu hâlâ açık, masada dolduruluyor. */
  sealedAt: string | null;
  sealedBy: string | null;
  printedAt: string | null;
  /** Rota kulvarında araca yükleme, kargoda rampada taşıyıcıya devir. `null` = depoda. */
  loadedAt: string | null;
  loadedBy: string | null;
  /** Kapıda okutuldu mu — teslim kanıtından. `null` = kanıt yok (henüz teslim yok ya da eski kayıt). */
  scannedAtDoor: boolean | null;
  /** Kargo kutusunun takip numarası ve bağlantısı; rotada ve henüz atanmamışsa `null`. */
  trackingNumber: string | null;
  trackingUrl: string | null;
}

export async function listOrderBoxes(
  db: SupabaseClient,
  order: Pick<Order, 'id' | 'deliveryProof'>,
): Promise<OrderBoxTrace[]> {
  const boxes = await new OrderBoxService(db).listByOrder(order.id);
  if (boxes.length === 0) return [];

  // Kanıt şeması tek kaynak (`DeliveryProofRecordSchema`); eski biçimde yazılmış bir kayıt
  // "kanıt yok" sayılır — yarım kanıttan "okutuldu/okutulmadı" türetilmez.
  const proof = DeliveryProofRecordSchema.safeParse(order.deliveryProof);
  const scanned = proof.success && proof.data.boxCodes ? new Set(proof.data.boxCodes) : null;

  const actorIds = [...new Set(boxes.flatMap((box) => [box.sealedBy, box.loadedBy]).filter((id): id is string => id !== null))];
  const profiles = actorIds.length > 0 ? await new UserProfileService(db).listByIds(actorIds) : [];
  const names = new Map(profiles.map((profile) => [profile.id, profile.name?.trim() || null] as const));
  const nameOf = (id: string | null): string | null => (id ? (names.get(id) ?? null) : null);

  return boxes.map((box) => ({
    boxId: box.id,
    boxNo: box.boxNo,
    totalBoxes: boxes.length,
    code: box.code,
    sealedAt: box.sealedAt,
    sealedBy: nameOf(box.sealedBy),
    printedAt: box.printedAt,
    loadedAt: box.loadedAt,
    loadedBy: nameOf(box.loadedBy),
    scannedAtDoor: scanned ? scanned.has(box.code) : null,
    trackingNumber: box.trackingNumber,
    trackingUrl: box.trackingUrl,
  }));
}
