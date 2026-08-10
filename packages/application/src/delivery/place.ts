import { DeliveryZoneService, PostalCodePlaceService, WarehouseService } from '@lezzet/database';
import { findShippingWarehouse, resolvePlaceByPostalCode, type PostalCodeResolution } from '@lezzet/domain-core';
import { normalizePostalCode } from '@lezzet/helper';
import type { Country } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlaceWarehouses } from '../catalog/storefront-types';

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

/**
 * Posta kodu → **okumanın yer bağlamı** (`PlaceWarehouses`). Üstteki çözümün üstüne, vitrin/katalog
 * okumalarının doğrudan tüketebileceği ikiliyi kurar.
 *
 * ── NEDEN AYRI BİR KAPI ───────────────────────────────────────────────────────
 * `resolvePlaceForPostalCode` müşteriye ANLATILACAK cevabı verir (rota mı kargo mu, hangi yer adı,
 * belirsiz mi); okumaların istediği ise iki depo kimliğidir. İkisi aynı şey değil ve eşleme
 * **kuralın kendisi** — web'de `apps/web/lib/delivery/read-place.ts`te yaşıyor ve ölçülmüş bir
 * arızanın düzeltmesini taşıyor (09.08):
 *
 *   `warehouseId` YALNIZ ROTA deposudur. Çözümün `warehouseId` alanı `shipping` hâlinde KARGO
 *   deposunu taşır — tek kutu iki anlam. Olduğu gibi yayılınca rota DIŞINDAKİ müşteriye
 *   "ücretsiz kapı teslimi" işareti veriliyordu (web ölçümü: 75011 ile 67000 birebir aynı sonucu
 *   üretiyordu, oysa biri rota dışı).
 *
 * Bu eşlemeyi mobil ucun kendi içinde ikinci kez yazmak, aynı arızayı ikinci kez doğurmaya davetti
 * (CLAUDE §1: hiçbir türde duplication yok). Kural buraya taşındı; web köprüsünün benimsemesi web
 * şeridinin takviminde.
 *
 * ── DEPO KİMLİĞİ İSTEMCİDEN ALINMAZ ───────────────────────────────────────────
 * Girdi POSTA KODUDUR, depo kimliği değil (`place-types.ts` güvenlik sınırı): istemcinin
 * yazabildiği bir değer hangi deponun stoğunu göstereceğimizi belirleyemez. Çözüm her istekte
 * sunucuda yeniden yapılır.
 *
 * ── ÇÖZÜLEMEYEN KOD BİR ARIZA DEĞİL ───────────────────────────────────────────
 * `unknown` / `ambiguous` / `unresolved` hâllerinde ikili `(null, null)` döner — yani "yer
 * bilinmiyor". Okuma o hâlde depo-üstüne düşer ve "yok" ancak hiçbir depoda yoksa denir (C3).
 * Tahmin edilmez: yanlış depo, yanlış stok ve yanlış teslimat sözü demektir.
 */
export async function resolvePlaceWarehouses(db: SupabaseClient, postalCode: string): Promise<PlaceWarehouses> {
  const [resolution, warehouses] = await Promise.all([
    resolvePlaceForPostalCode(db, postalCode),
    new WarehouseService(db).list({ activeOnly: true }),
  ]);

  if (resolution.kind !== 'route' && resolution.kind !== 'shipping') return UNRESOLVED_PLACE;

  return {
    // Rota deposu YALNIZ rota hâlinde vardır; kargo hâlinde `null` ki yerel havuz boş kalsın.
    warehouseId: resolution.kind === 'route' ? resolution.warehouseId : null,
    // Kargo deposu ÜLKEDEN türer, rotadan değil: rota içindeki müşteri de kargo dolgusu alabilir.
    shippingWarehouseId: findShippingWarehouse(resolution.country, warehouses)?.id ?? null,
  };
}

/** Yer bilinmiyor — iki `null` bir hâldir, eksik veri değil (`PlaceWarehouses` künyesi). */
export const UNRESOLVED_PLACE: PlaceWarehouses = { warehouseId: null, shippingWarehouseId: null };

/**
 * Adres kaydının ÜLKESİ — koddan türetilir, beyandan değil (21.28).
 *
 * ── ADRES DEFTERİ HİZMET ALANINI BİLMEZ (kullanıcı kararı 10.08) ─────────────
 * İlk yazım bu işi `resolvePlaceForPostalCode`e yaptırıyordu ve YANLIŞTI: o motor adayları
 * **hizmet ülkelerimizle kesiştiriyor** (`activeCountries`), yani `KEHL` deposunun aktifliği
 * müşterinin adresinin ülkesini etkiliyordu. Üstelik kapı çözemediği kodda kaydı REDDEDİYORDU —
 * müşteri Paris'e, Berlin'e, Lizbon'a adres girebilmeli; oraya gidip gidemediğimiz SİPARİŞ anının
 * sorusudur, adres defterinin değil.
 *
 * Doğrusu referansın kendisi: `postal_code_place` kodun hangi ülkelerde geçerli olduğunu söyler ve
 * bu **coğrafi bir gerçektir** — depo tablomuzdan bağımsız.
 *
 * ── NEDEN İSTEMCİNİN `country`'Sİ DOĞRUDAN YAZILMAZ ──────────────────────────
 * `0033_postal_code_place.sql` künyesinin yasağı: *"müşterinin doldurduğu bir alanın vergi sonucu
 * doğurması kabul edilemez."* Gelen değer bir beyan gibi değil, bir SEÇİM gibi işlenir: kodun
 * geçerli olduğu ülkelerle kesiştirilir. `{postalCode:'67000', country:'DE'}` konsoldan gönderilse
 * bile Alman KDV'si seçilemez — ama kayıt REDDEDİLMEZ, yalnız seçim yok sayılır.
 *
 * ── `null` = "ÇÖZEMEDİM, VARSAYILANA BIRAK" ──────────────────────────────────
 * Kod referansta hiç yoksa (yazım hatası ya da referansın kapsamadığı bir kod) ve müşteri de bir
 * seçim yapmamışsa ülke yazılmaz: kolon `not null` ve varsayılanı `FR` — yani bugünkü davranış
 * aynen sürer. Burada bir tahmin ÜRETMİYORUZ; olmayan bilgiyi olmayan bırakıyoruz.
 */
export async function resolveAddressCountry(
  db: SupabaseClient,
  input: { postalCode: string; country?: Country },
): Promise<Country | null> {
  const matches = await new PostalCodePlaceService(db).findByPostalCode(normalizePostalCode(input.postalCode));
  const options = matches.map((match) => match.country);

  // Referansın tanımadığı kodda müşterinin seçimi TEK bilgimizdir — doğrulayacak veri yok.
  if (options.length === 0) return input.country ?? null;
  if (input.country !== undefined) return options.includes(input.country) ? input.country : null;
  // Kod tek ülkeye düşüyorsa cevap kesin. Birden çoksa (610 kod) tahmin edilmez: iki adayın farkı
  // teslimat yolu değil **KDV oranıdır** (motorun kayıtlı gerekçesi) — seçim müşterinin.
  return options.length === 1 ? (options[0] ?? null) : null;
}
