import { sweepTicketReplyMails } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';

export const TICKET_REPLY_MAIL = 'ticket_reply_mail';

/**
 * **BEKLEYEN CEVAP MAİLLERİ** (17.08) — gecikmesi dolmuş, hâlâ okunmamış cevapların maili.
 *
 * Karar ve gerekçe `@lezzet/application`ın `ticket/reply-mail.ts` künyesinde; burada yalnız
 * zamanlayıcının ucu var. İş **paketten** çağrılıyor çünkü aynı kuralı üç yazıcı birden doğuruyor
 * (personel · AI · gelecekteki yüzeyler) ve kural onların yanında durmalı — cron'un içinde
 * dursaydı, backend'i çalıştırmayan bir ortamda mail kuralı da yok olurdu.
 *
 * `serviceDb()` İŞİN İÇİNDE çağrılır, modül üstünde değil: bu dosyanın künyesi `index.ts` başında
 * ölçülmüş bir arızadır — modül-üstü `serviceDb()` env yüklenmeden koşup "Supabase env eksik" ile
 * düşüyordu.
 */
export function ticketReplyMailJob(): Promise<Record<string, number>> {
  return sweepTicketReplyMails(serviceDb());
}
