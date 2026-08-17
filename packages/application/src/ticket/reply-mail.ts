import { TicketService, type Db } from '@lezzet/database';
import { logger } from '@lezzet/observability';
import type { Ticket } from '@lezzet/types';
import { notifyTicketReplied } from './notify';

/*
  CEVAP MAİLİ ARTIK ANINDA GİTMİYOR — OKUNMAMIŞSA GİDİYOR (kullanıcı isteği 16.08, karar 17.08).

  ── ÇÖZÜLEN ARIZA ───────────────────────────────────────────────────────────
  Kullanıcı: *"Mail gidiyor, her cevapta. Eğer kullanıcı talep kısmından anlık yazışıyorsa bu
  maillerin gidip gelmesi de çok hoş değil."* Ölçüldü ve haklıydı: `notify.ts` başka her olayı
  eliyordu (müşterinin kendi mesajı · personelin açtığı talep · `in_progress` · müşterinin yeniden
  açması) ama **karşı taraf cevabı istisnasız mail doğuruyordu**. Operatör üç dakikada beş satır
  yazınca beş mail gidiyordu.

  Canlı zil (16.8) bunu daha da gereksiz kıldı: ekranı açık müşteri cevabı zaten ANINDA görüyor,
  o an giden mail hiçbir şey söylemiyor.

  ── KURAL: GECİKTİR, SUSTURMA ───────────────────────────────────────────────
  Maili tamamen kesmek yanlış olurdu — müşteri yazıp uygulamayı kapatmış olabilir ve cevabı hiç
  öğrenmez. Bu yüzden cevap maili SUSTURULMUYOR, ERTELENİYOR: talep "okunmamış cevap var" diye
  damgalanır, dakikalık süpürge gecikme dolduğunda HÂLÂ okunmamışsa gönderir. Müşteri o arada
  okursa damga boşalır ve mail hiç gitmez.

  ── ÖZET BEDAVA GELİYOR ─────────────────────────────────────────────────────
  Mail şablonu zaten son dört mesajı taşıyor (`HISTORY_LIMIT`). Yani beş satırlık bir cevap
  patlamasının ardından giden TEK mail, ayrı ayrı gidecek beş mailden daha eksik değil — daha
  bütün. Ayrıca bir "digest" makinesi yazmaya gerek kalmadı.

  ── NE ERTELENMEZ ───────────────────────────────────────────────────────────
  Açılış teyidi ve durum değişimi (çözüldü / personel yeniden açtı) AYNEN ANINDA gider: ikisi de
  talep ömrü boyunca bir-iki kez olur, yani gürültü kaynağı değiller — ve "talebiniz bize ulaştı"
  gecikirse anlamını yitirir.
*/

/**
 * Gecikme (dakika) — cevabın okunması için tanınan süre.
 *
 * Parametrik ve tek yerde. Küçültülürse anlık yazışmada mail yine kaçar; büyütülürse ekranı
 * kapatmış müşteri cevabı geç duyar. 5 dakika, "bir sohbet turu" ile "gitti" arasındaki eşik.
 */
const REPLY_MAIL_DELAY_MIN = Number(process.env.TICKET_REPLY_MAIL_DELAY_MIN ?? 5);

/**
 * Karşı taraf (personel ya da AI) cevap yazdı — mail kuyruğuna al.
 *
 * **Damga YALNIZ boşsa yazılır ve bu kritik:** her satırda tazelenseydi hızlı yazan operatör maili
 * sonsuza dek erteler, müşteri hiç haber almazdı. Gecikme İLK okunmamış cevaptan sayılır.
 *
 * Fırlatmaz: cevap zaten yazılmış durumda, mail kuyruğuna alınamaması onu geri aldırmaz.
 */
export async function queueTicketReplyMail(db: Db, ticket: Ticket): Promise<void> {
  if (ticket.replyPendingSince !== null) return;
  try {
    await new TicketService(db).update({ id: ticket.id, replyPendingSince: new Date().toISOString() });
  } catch (err) {
    logger.warn(
      { context: 'application/ticket-reply-mail', ticketId: ticket.id, err: (err as Error).message },
      'cevap maili kuyruğa alınamadı',
    );
  }
}

/**
 * Müşteri yazışmayı OKUDU — bekleyen mail iptal.
 *
 * Çağıran yeri müşteri talep detayının okuma kapısıdır; zilin tetiklediği sessiz tazeleme de oradan
 * geçiyor, yani **ekranı açık duran müşteri her zilde okumuş sayılıyor** — istenen davranış tam
 * budur.
 *
 * **Kimlikle çalışır, nesneyle değil:** okuma kapısı talebi kuyruk GÖRÜNÜMÜNDEN okuyor ve o görünüm
 * bu damgayı taşımıyor. Damgayı görünüme eklemek, operasyon kuyruğunun sözleşmesini müşteri
 * tarafının ihtiyacı için genişletmek olurdu; tek anahtarlı bir okuma daha ucuz.
 *
 * Damga zaten boşsa YAZMA YAPILMAZ — okuma yolu her çağrıda bir yazma tetiklemesin.
 */
export async function clearTicketReplyMail(db: Db, ticketId: string): Promise<void> {
  try {
    const tickets = new TicketService(db);
    const ticket = await tickets.getById(ticketId);
    if (!ticket || ticket.replyPendingSince === null) return;
    await tickets.update({ id: ticket.id, replyPendingSince: null });
  } catch (err) {
    logger.warn(
      { context: 'application/ticket-reply-mail', ticketId, err: (err as Error).message },
      'bekleyen cevap maili iptal edilemedi',
    );
  }
}

/**
 * **Süpürge** — gecikmesi dolmuş, hâlâ okunmamış cevapların mailini gönderir.
 *
 * Taramalı ve idempotent (`runner.ts` disiplini): damga gönderimden ÖNCE temizlenir, böylece
 * sağlayıcı yavaşlarken üst üste gelen iki tur aynı maili iki kez göndermez. Sıra bilinçli — mail
 * zaten sessizce başarısız olabilen bir yol (`notify.ts`); iki kez giden mail, hiç gitmeyenden
 * daha kötü bir gürültüdür ve bu işin varlık sebebi gürültüyü kesmek.
 */
export async function sweepTicketReplyMails(db: Db, opts: { delayMinutes?: number } = {}): Promise<Record<string, number>> {
  const delay = opts.delayMinutes ?? REPLY_MAIL_DELAY_MIN;
  const cutoff = new Date(Date.now() - delay * 60_000).toISOString();
  const tickets = new TicketService(db);
  const due = await tickets.listReplyPendingBefore(cutoff);

  let sent = 0;
  for (const ticket of due) {
    await tickets.update({ id: ticket.id, replyPendingSince: null });
    await notifyTicketReplied(db, ticket);
    sent += 1;
  }
  return { sent };
}
