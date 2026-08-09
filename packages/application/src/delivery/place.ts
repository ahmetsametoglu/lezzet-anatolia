import { DeliveryZoneService, PostalCodePlaceService, WarehouseService } from '@lezzet/database';
import { resolvePlaceByPostalCode, type PostalCodeResolution } from '@lezzet/domain-core';
import { normalizePostalCode } from '@lezzet/helper';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  POSTA KODU → YER ÇÖZÜMÜ — girdilerin toplanıp motora sorulması, paket hâlinde (21.6'nın B ayağı;
  `apps/mobile-api/src/api/v1/catalog.ts` `UNKNOWN_PLACE` künyesinin beklediği terfi).

  İKİ YÜZEY ölçütü karşılandı: web aynı kompozisyonu kendi lib'inde kuruyor
  (`apps/web/lib/delivery/read-place.ts` — çerezden okuyup ülke süzgeciyle çözer) ve mobil
  onboarding şimdi aynı soruyu soruyor ("bu posta kodu nereye düşer"). KARAR BURADA DEĞİL:
  belirsizlik/bilinmezlik/rota kararlarının tamamı saf motorda (`resolvePlaceByPostalCode`);
  burası yalnız üç girdiyi toplar. Web köprüsünün benimsemesi web şeridinin işi.

  ÇEREZ/CİHAZ BİLMEZ: müşterinin saklanmış cevabı (ülke) ve saklama biçimi taşıma katmanının işi —
  web çerezden, mobil cihaz deposundan okur; ikisi de sonucu HER İSTEKTE yeniden çözer. Çözülmüş
  depo kimliği istemciye verilmez ve istemciden alınmaz (`place-types.ts` güvenlik sınırı:
  istemcinin yazabildiği bir değer hangi deponun stoğunu göstereceğimizi belirleyemez).
*/

/**
 * Posta kodundan yer çözümü — **ülke sorulmadan** (19.8: ülke bir beyan değil, veriden türeyen
 * bir sonuçtur; 610 kod iki ülkede birden geçerli ve o hâlde motor `ambiguous` döner, tahmin etmez).
 *
 * Girdi kuralları web okumasıyla BİREBİR:
 * · Bölgeler AKTİFLİK SÜZGECİSİZ (19.16a): pasif bölgedeki kod da bizim kaydımızdır ve ülkesi
 *   ondan türer — süzülseydi kapalı bölgedeki müşteri "bu kodu tanımadık" cevabı alırdı, oysa
 *   doğrusu "rota kapalı, kargoyla gönderiyoruz". Rotanın açıklığına MOTOR karar verir.
 * · Depolar yalnız aktifler: kapalı depo ne rota ne kargo verebilir.
 * · Kod NORMALİZE edilerek sorulur (boşluksuz, büyük harf) — referans tablosu öyle saklıyor;
 *   ham "67 000" sorgusu satırı bulamaz ve kod sessizce "tanınmadık" görünürdü.
 */
export async function resolvePlaceForPostalCode(db: SupabaseClient, postalCode: string): Promise<PostalCodeResolution> {
  const code = normalizePostalCode(postalCode);
  const [matches, zones, warehouses] = await Promise.all([
    new PostalCodePlaceService(db).findByPostalCode(code),
    new DeliveryZoneService(db).listWithCodes(),
    new WarehouseService(db).list({ activeOnly: true }),
  ]);
  return resolvePlaceByPostalCode(code, matches, zones, warehouses);
}
