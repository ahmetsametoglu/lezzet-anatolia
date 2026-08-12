import { z } from 'zod';

/*
  DAVET KARŞILAMASI — `GET /api/v1/invite/:code` (17.9 · 21.43).

  Davet bağlantısı bir WEB adresidir (`https://…/tr/davet/AB12CD34`) ve uygulaması olan davetlide
  işletim sistemi onu uygulamaya yönlendirir. O anda uygulamanın cevaplaması gereken soru web
  sayfasınınkiyle birebir aynıdır: "bu kod kimin, ve bunu açan kim?" — bu yüzden hâller de aynı
  dörtlüdür ve kaynağı tektir (`@lezzet/application` → `readInviteWelcome`).

  ŞEMA NEDEN VAR, MOTORUN TİPİ DURURKEN: bu TEL sözleşmesidir, motorun iç tipi değil. Uç cevabı bu
  şemayla `parse` eder ve parse bir SÜZGEÇTİR — motorun tipine yarın bir alan eklenirse (getirenin
  kimliği, sipariş sayısı) zarfa sızmaz. Aynı karar `MeSchema`/`MePointsViewSchema`da da verildi:
  varlık/motor tipi ile telin gördüğü küme ayrı yaşar, ikisini bağlayan yer uçtaki `parse`tır.
*/

/**
 * Karşılamanın dört hâli — `@lezzet/application`ın `InviteWelcome`ının tel karşılığı.
 *
 * **Ayrık birlik, "geçerli mi" bayrağı değil:** dördü de ekranda AYRI bir cümledir ve ikisi
 * (`self`, `already_customer`) aslında bir hata değil, bilgidir. Tek bir `valid: boolean` dönseydi
 * ekran "bağlantı geçersiz" demek zorunda kalırdı — oysa kendi bağlantısını açan müşteriye
 * söylenecek şey, bağlantısının ÇALIŞTIĞIDIR.
 *
 * **Getirenin YALNIZ adı geçer** (ilk sözcük — motor kırpar): bağlantı tanımadığımız kanallarda
 * dolaşıyor ve onu açan herkes bu cevabı görüyor. Soyadı, e-posta, telefon, sipariş geçmişi
 * hiçbiri sözleşmede yok — olmadığı için sızamaz.
 *
 * Ad BOŞ olabilir (WhatsApp'tan açılmış kayıtta yalnız telefon vardır): o hâlde davet İSİMSİZ ama
 * düzgün bir cümleyle çizilir ve o cümleyi kuran taraf ekrandır, sunucu değil.
 */
export const InviteWelcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), referrerName: z.string() }),
  z.object({ status: z.literal('unknown') }),
  z.object({ status: z.literal('self') }),
  z.object({ status: z.literal('already_customer') }),
]);

export type InviteWelcomeView = z.infer<typeof InviteWelcomeSchema>;

/*
  KOMŞU DAVETİNİN KARŞILAMASI — `GET /api/v1/neighbor/:token` (17.10 · 21.45).

  Getiren davetinin kardeşi ama AYNI şema değil ve olamaz: getiren daveti bir KİŞİYE çağırır
  ("seni şu kişi davet etti"), komşu daveti bir GÜNE ("aracımız Salı günü sokağınızda"). Hâl
  kümesi de farklı — komşu davetinin seferi GEÇEBİLİR ve kontenjanı DOLABİLİR; getiren davetinde
  ikisinin de karşılığı yok. Tek şemaya sığdırmak, hiçbir zaman dolmayan alanlar taşımak olurdu.
*/

/**
 * Karşılamanın beş hâli — `@lezzet/application`ın `NeighborWelcome`ının tel karşılığı.
 *
 * **`deliveryDate` reddedilen hâllerde de var** ve bu bilinçli: "sefer geçti" cümlesi hangi seferin
 * geçtiğini söyleyebilmeli (*"14 Ağustos seferi için artık geç"*). Tarihi olmayan bir ret, komşuya
 * neyi kaçırdığını söylemez.
 *
 * **Davet edenin YALNIZ adı geçer** (ilk sözcük — motor kırpar): bağlantı tanımadığımız kanallarda
 * dolaşıyor. Sipariş içeriği, adres, tutar hiçbiri sözleşmede yok — olmadığı için sızamaz.
 *
 * `deliveryZoneId` KASITLI olarak dışarıda: komşuya söylenecek şey gün, bölge kimliği değil; onu
 * telde taşımak operasyonun iç künyesini müşteri yüzeyine açardı.
 */
export const NeighborWelcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ok'), inviterName: z.string(), deliveryDate: z.string() }),
  z.object({ status: z.literal('unknown') }),
  z.object({ status: z.literal('self') }),
  z.object({ status: z.literal('run_closed'), deliveryDate: z.string() }),
  z.object({ status: z.literal('full'), deliveryDate: z.string() }),
]);

export type NeighborWelcomeView = z.infer<typeof NeighborWelcomeSchema>;

/**
 * Siparişin komşu daveti — sipariş tamamlandı ekranının paylaştığı bağlantı (21.45).
 *
 * **Adresi sunucu üretir, ekran KURMAZ** (`inviteUrl`un aynı kararı): rota adı üç dilde ayrı ve
 * web'de yaşıyor. `null` = davet açılamadı ve bu bir arıza değil, meşru hâl: kargo siparişinde
 * "aynı sefer" diye bir şey yok, kesim saati dolmuş seferde de çağrılacak kimse kalmamıştır.
 * Ekran o hâlde şeridi hiç çizmez — boş bir şerit "burada bir şey vardı ama çalışmıyor" der.
 */
export const OrderNeighborInviteSchema = z.object({ inviteUrl: z.string().nullable() });
