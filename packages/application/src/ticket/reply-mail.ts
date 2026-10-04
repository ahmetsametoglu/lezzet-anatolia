import { TicketService, type Db } from '@lezzet/database';
import { logger } from '@lezzet/observability';
import type { Ticket } from '@lezzet/types';
import { mailTicketReply } from './notify';

/*
  Cevabın cihaz bildirimi hemen gider; e-postası ertelenir: talep "okunmamış cevap var" diye damgalanır ve süpürge gecikme dolduğunda hâlâ
  okunmamışsa tek bir e-posta gönderir, ki anlık yazışmada her satır ayrı mail doğurmasın. Açılış teyidi ve durum değişimi ertelenmez.
*/

/** Cevabın okunması için tanınan süre (dakika); küçülürse anlık yazışmada mail kaçar, büyürse ekranı kapatmış müşteri geç duyar. */
const REPLY_MAIL_DELAY_MIN = Number(process.env.TICKET_REPLY_MAIL_DELAY_MIN ?? 5);

/**
 * Karşı taraf cevap yazdı, e-posta kuyruğa alınır; damga yalnız boşsa yazılır, yoksa hızlı yazan operatör maili sonsuza dek ertelerdi.
 * Fırlatmaz, çünkü cevap zaten yazılmıştır.
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
 * Müşteri yazışmayı okudu, bekleyen mail iptal; zilin tetiklediği sessiz tazeleme de okuma sayılır, yani ekranı açık müşteriye mail gitmez.
 * Damga zaten boşsa yazma yapılmaz, ki okuma yolu her çağrıda yazma tetiklemesin.
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
 * Süpürge gecikmesi dolmuş, hâlâ okunmamış cevapların mailini gönderir. Damga gönderimden önce temizlenir, ki üst üste gelen iki tur aynı
 * maili iki kez göndermesin.
 */
export async function sweepTicketReplyMails(db: Db, opts: { delayMinutes?: number } = {}): Promise<Record<string, number>> {
  const delay = opts.delayMinutes ?? REPLY_MAIL_DELAY_MIN;
  const cutoff = new Date(Date.now() - delay * 60_000).toISOString();
  const tickets = new TicketService(db);
  const due = await tickets.listReplyPendingBefore(cutoff);

  let sent = 0;
  for (const ticket of due) {
    await tickets.update({ id: ticket.id, replyPendingSince: null });
    await mailTicketReply(db, ticket);
    sent += 1;
  }
  return { sent };
}
