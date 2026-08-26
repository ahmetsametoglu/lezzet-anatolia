import type { SupabaseClient } from '@supabase/supabase-js';
import { TicketQueueService, UserProfileService } from '@lezzet/database';
import type { ComplaintDetail } from '@lezzet/types';
import { getStaffTicketDetail } from '../ticket/staff-read';

/*
  Y1 · ŞİKÂYET/TALEP DETAYI — mobil yönetim görünümü (21.12).

  `getStaffTicketDetail`in ÜSTÜNE iner, yanına değil: kuyruk satırı + yazışma + çeviri hep o
  kapıdan gelir (web talepler sayfasıyla AYNI okuma); burada yalnız mobil ekranın taşımadığı
  alanlar düşer (müşteri e-posta/telefonu — v2 ekranı çizmiyor, taşımayan zarf sızdırmaz) ve
  personel mesajlarına YAZAN ADI eklenir ("OPERATÖR · Selim", v2:557).
*/

/** Mobil zarfa indirger; personel mesajlarının yazar adları TEK turda çözülür. */
async function toComplaint(
  db: SupabaseClient,
  detail: NonNullable<Awaited<ReturnType<typeof getStaffTicketDetail>>>,
): Promise<ComplaintDetail> {
  const authorIds = [
    ...new Set(detail.messages.map((m) => m.authorId).filter((id): id is string => typeof id === 'string')),
  ];
  const authors = authorIds.length > 0 ? await new UserProfileService(db).listByIds(authorIds) : [];
  const nameOf = new Map(authors.map((profile) => [profile.id, profile.name]));

  return {
    ticketId: detail.ticket.id,
    type: detail.ticket.type,
    status: detail.ticket.status,
    source: detail.ticket.source,
    handledBy: detail.ticket.handledBy,
    awaitingReply: detail.ticket.awaitingReply,
    customerName: detail.customer.name,
    orderReferenceNo: detail.order?.referenceNo ?? null,
    lastMessageAt: detail.ticket.lastMessageAt,
    aiDraftReply: detail.ticket.aiDraftReply,
    messages: detail.messages.map((message) => ({
      id: message.id,
      sender: message.sender,
      body: message.body,
      bodyTranslated: message.bodyTranslated,
      originalBody: message.originalBody,
      language: message.language,
      authorName: message.authorId ? (nameOf.get(message.authorId) ?? null) : null,
      attachmentUrls: message.attachmentUrls,
      createdAt: message.createdAt,
    })),
  };
}

/**
 * Kimliği verilen talep — ya da (`next`) cevap bekleyen EN TAZE talep. İkisi de yoksa `null`:
 * karar kutusu boşalmış demektir, bu bir hata değil iyi haber.
 */
export async function readComplaint(
  db: SupabaseClient,
  input: { ticketId: string } | { next: true },
): Promise<ComplaintDetail | null> {
  let ticketId: string | null = 'ticketId' in input ? input.ticketId : null;
  if (ticketId === null) {
    const page = await new TicketQueueService(db).list({ openOnly: true, awaitingReply: true }, undefined, 1);
    ticketId = page.rows[0]?.id ?? null;
  }
  if (ticketId === null) return null;

  // Operasyon dili: yazışma personele Türkçe açılır (staff-read'in ters yön kuralı).
  const detail = await getStaffTicketDetail(db, 'tr', ticketId);
  return detail === null ? null : toComplaint(db, detail);
}
