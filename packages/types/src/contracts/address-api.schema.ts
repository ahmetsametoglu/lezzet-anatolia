import { z } from 'zod';
import { AddressSchema } from '../entities/address.schema';

/**
 * `/api/v1/me/addresses` SÖZLEŞME şemaları (21.15) — mobil adres uçlarının ve hesap ekranının
 * ortak dili. Terfi gerekçesi `me-api.schema.ts` ile aynı (02-mimari §3.2 "sözleşme tek kaynak");
 * entity/taşıma ayrımı da oradaki künyede: `address.schema.ts` DB satırının aynasıdır, bu dosya
 * "bu yüzey tele ne verir"i söyler.
 */

/**
 * Küme EKRANIN OKUDUĞU alanlardır (v3 hesap listesi + adres çekmecesi): etiket, iki adres satırı,
 * posta kodu, şehir, varsayılan bayrağı. Bilinçli dışarıda: `customerId` (jetondan çözülür, tele
 * dönmesi gereksiz), `recipient`/`phone`/`country` (çekmece göstermiyor; checkout dilimi bu alanları
 * istediği gün küme oradan büyür — sözleşme ekranın ihtiyacını taşır), `createdAt` (sıralama
 * sunucuda). `line2` kümede: çekmece göstermese de web'den girilmiş bir "Kat 2 / Daire 5" satırını
 * listede yutmak teslimat adresini eksik gösterirdi.
 */
export const MeAddressSchema = AddressSchema.pick({
  id: true,
  label: true,
  line1: true,
  line2: true,
  postalCode: true,
  city: true,
  isDefault: true,
});

/**
 * Uçların cevabı HER ZAMAN güncel listedir — yazma uçları dahil. Varsayılan değişimi ve "varsayılan
 * silinirse en yeni devralır" kuralı TEK satırı değil komşularını da oynatır; tek kaydı dönmek
 * istemciyi ikinci bir liste çağrısına mecbur bırakırdı.
 */
export const MeAddressListSchema = z.array(MeAddressSchema);

/**
 * Yazma gövdesi (create ve update AYNI form — v3 `shAddr` çekmecesi iki hâlde de aynı dört alanı
 * gösterir). `label` boş geçilebilir (etiketsiz adreste ekran şehri başlık yapar — entity künyesi);
 * boş metnin `null`a indirgenmesi uygulama kapısının işi. `isDefault` BİLEREK YOK: varsayılan
 * seçimi kendi ucudur (`POST /:id/default`) — gövdeden sızması iki varsayılan bırakır
 * (web kapısının testle yakaladığı hata, `lib/account/addresses.ts` künyesi).
 *
 * `postalCode` beş haneli Fransız kodu: teslimat bölgesi kararı bu anahtarla veriliyor (modül 07);
 * serbest metin kabul etmek bölge süzgecini sessizce boşa düşürürdü.
 */
export const AddressWriteSchema = z.object({
  label: z.string().nullish(),
  line1: z.string().min(1),
  line2: z.string().nullish(),
  postalCode: z.string().regex(/^\d{5}$/),
  city: z.string().min(1),
});
