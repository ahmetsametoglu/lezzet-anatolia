import { z } from 'zod';
import { CountryEnum, DeliveryZoneInsertSchema, type DeliveryZonePostalCode } from '@lezzet/types';
import type { ZoneMapPoint } from '@/components/operation/ui/zone-map-model';

// Rota kurulumunun tipleri (19.20).
//
// **Kardeş sayfadan ithal EDİLMİYOR** (STACK §7): `warehouses-types` de aynı şekli tanımlıyor ama
// ikisi de ORTAK ŞEMADAN türüyor (`packages/types`), yani kopya değil iki türetim — tek kaynak
// pakette. Kardeşten ithal etmek iki sayfayı birbirine bağlar ve biri taşındığında öteki kırılır.

/** Rotaya eklenen kod: `(ülke, kod)`. `67000` iki ülkede geçerli — ülkesiz anahtar eksik bir sorudur. */
const PostalCodePickSchema = z.object({ country: CountryEnum, postalCode: z.string().min(1) });
export type PostalCodePick = Pick<DeliveryZonePostalCode, 'country' | 'postalCode'>;

/**
 * Bir posta kodunun **ağırlığı** — rota rayındaki analitiğin satırı (kullanıcı isteği 07.08:
 * *"rota düzenlemesi yapılırken posta kodlarıyla alakalı analitikler, müşteri eğilimleri"*).
 *
 * **Sınır bilinçli.** Ray tek bir soruya hizmet ediyor: *"bu kod rotada yerini hak ediyor mu?"*
 * Ürün kırılımı, marj, geri bildirim puanı, kohort/RFM buraya GİRMEZ — onlar Analitik'in işi ve
 * rota kurarken verilecek karara girdi değiller. Rota ekranında gösterilen her sayı, o ekranda
 * verilen kararı değiştirebilmeli.
 */
export interface CodeStatsView {
  /** Bu koddan çıkan sipariş — TÜM ZAMAN (`analytics_postal_code_orders`). */
  orderCount: number;
  revenueCents: number;
  /**
   * Kaç kişi bu kod için haber bekliyor — **kimlikli ve izinli** (`zone_notice`). Anonim talep
   * sayacıyla (`postal_code_demand`) TOPLANMAZ ve ağırlık rayında gösterilmez: o kapının tek
   * okuması bir liderlik tablosu (`listTop`), kod bazında sorulamıyor. Liderlik tablosundan
   * bakılsaydı listede olmayan kod için "0 talep" yazardık — oysa doğrusu "bilinmiyor"
   * (`CLAUDE §1`). Sayaç ÖNERİDE kullanılıyor, çünkü orada soru zaten liderlik sorusudur.
   */
  waitingCount: number;
}

/**
 * **Önerilen kod** (kullanıcı isteği 07.08: *"akıllı şekilde bölge oluşturmak mümkün mü — bir
 * bölgeye eklenmemiş posta kodlarından önerilerde bulunulması gerekiyor"*).
 *
 * Öneri bir TAHMİN değil, bir HATIRLATMADIR: sistemin zaten topladığı üç kanıtı (bekleyen kişi ·
 * gitmiş sipariş · sorulma) bir araya getirip *"buraya hâlâ gitmiyoruz"* der. Uydurulan hiçbir
 * sinyal yok — her sayının arkasında bir kayıt duruyor ve ekran o sayıları HAM gösteriyor ki
 * operatör kararı puana değil kanıta versin.
 *
 * **Ölçüsü olmayan sinyal eklenmedi.** "Nüfus", "gelir düzeyi", "rakip yoğunluğu" gibi alanlar
 * cazip ama elimizde yok; olmayan veriyi tahmine çevirmek, öneriyi kehanete döndürürdü.
 *
 * `ZoneMapPoint`'ten TÜRÜYOR, alanları yeniden yazılmıyor (`CLAUDE §1`): bir öneri zaten haritanın
 * çizdiği noktanın kendisidir, üstüne gerekçesi binmiştir. Kopyalansaydı bir gün ikisi ayrışır ve
 * öneriye tıklamak yanlış koordinat taşırdı.
 */
export interface SuggestionView extends ZoneMapPoint {
  /** Kimlikli ve izinli bekleyen kişi (`zone_notice`) — en pahalı sinyal: iletişim bilgisi verdiler. */
  waitingCount: number;
  /** Bu koda gitmiş sipariş — bugün KARGOYLA hizmet ediliyorlar, yani müşteri zaten var. */
  orderCount: number;
  revenueCents: number;
  /** Anonim "buraya geliyor musunuz" sorusu (`postal_code_demand`). */
  requestCount: number;
  /**
   * Son sorunun YAŞI, dakika — bir yıl önce susmuş talep bugünkü kadar değerli değil.
   *
   * Dakika olarak taşınıyor, ISO olarak değil: `agoShort` sözleşmesi yaşın SUNUCUDA hesaplanmasını
   * istiyor (künyesi: iki tarafta ayrı `Date.now()` okunursa ilk boyama sunucununkinden farklı çıkar
   * ve hidrasyon uyuşmazlığı doğar).
   */
  lastAskedMinutes: number | null;
}

/**
 * Rotaya özel eşik saatleri — **yalnız istisnalar** (17.08).
 *
 * Anahtarı burada olmayan eşik genel değeri okur; değeri `null` olan eşiğin istisnası KALDIRILIR.
 * "Yok" ile "genele dön" ayrı iki niyet: birincisi dokunulmamış, ikincisi bilinçli geri alma —
 * ikisini tek hâlde toplamak, hiç dokunulmamış bir formu kaydetmeyi silme işlemine çevirirdi.
 *
 * Anahtar kümesi burada YENİDEN yazılmıyor: sözleşme gevşek (`string`), doğrulamayı kapı
 * `DAY_HOUR_KEYS`e karşı yapıyor (`routes-actions`). Dört anahtarı bir de burada listelemek,
 * eşik seti büyüdüğünde sessizce ayrışacak ikinci bir liste demekti (`CLAUDE §1`).
 */
const ZoneHoursSchema = z.record(z.string(), z.string().nullable());

/** Rota formunun şeması — yazma eyleminin (`saveZoneAction`) girdisi. */
export const ZoneFormSchema = DeliveryZoneInsertSchema.pick({ name: true, weekdays: true, isActive: true })
  .partial({ isActive: true })
  .extend({ postalCodes: z.array(PostalCodePickSchema), hours: ZoneHoursSchema.optional() });
