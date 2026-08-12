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
