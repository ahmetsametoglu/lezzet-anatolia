import type { SupabaseClient } from '@supabase/supabase-js';
import { ConversationService, TicketQueueService, UserProfileService, type TicketQueueFilter } from '@lezzet/database';
import type { ComplaintDetail, KeysetCursor, TicketType } from '@lezzet/types';
import { getStaffTicketDetail, listTicketQueue } from '../ticket/staff-read';
import type { TicketQueueItem } from '../ticket/ticket-types';

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

  /* SERVİS PENCERESİ (21.301) — bandın "22 sa kaldı" yarısı. Talebin arkasında konuşma varsa
     (WhatsApp kaynağı) penceresi okunur; yoksa kavram yoktur ve `null` kalır. Tek talep, tek
     okuma — kuyruğun toplu haritasının tekil hâli (`windowsByIds`). */
  const conversationId = detail.ticket.conversationId ?? null;
  const windows = conversationId === null ? new Map() : await new ConversationService(db).windowsByIds([conversationId]);

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
    windowExpiresAt: conversationId === null ? null : (windows.get(conversationId) ?? null),
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

/** Şerit sayaçları — `TicketQueueService.countForFilters`ın döndürdüğü şeklin adı. */
export type ComplaintQueueCounts = Awaited<ReturnType<TicketQueueService['countForFilters']>>;

/** Süzgeç şeridinin telde taşınan hâli — çipler birbirini dışlar (v3:29'da tam bir çip koyu). */
export type ComplaintQueueFilter =
  | { kind: 'all' }
  | { kind: 'awaiting' }
  | { kind: 'resolved' }
  | { kind: 'type'; type: TicketType };

/**
 * Talep listesi (21.281 · v3:29) — kuyruk sayfası + şerit sayaçları TEK turda.
 *
 * **`listTicketQueue`in üstüne iner, yanına değil** (`readComplaint`in aynı kararı): kuyruk satırı,
 * önizleme ve çeviri hep o kapıdan gelir — web'in talepler sayfası da aynı okumayı kullanıyor, yani
 * iki yüzey kuyruğu farklı sıralayamaz ya da farklı çeviremez.
 *
 * **Süzgeç burada `TicketQueueFilter`e çevrilir**, ekranda değil: hangi çipin hangi süzgeç anlamına
 * geldiği bir İŞ kuralıdır ("açık kuyruk = `open` + `in_progress`") ve iki yüzeye ayrı ayrı
 * yazılsaydı biri bir gün `resolved`ı açık sayardı — `OPEN_TICKET_FILTER` künyesinin uyardığı şey.
 *
 * **Sayaçlar süzgeçten BAĞIMSIZ** ve her sayfada aynı: çip "bozuk · 3" derken bu sayı seçili
 * süzgece göre değişseydi şeridin kendisi okunamaz olurdu — operatör başka bir çipe geçmeden
 * oradaki sayıyı göremezdi.
 */
export async function readComplaintQueue(
  db: SupabaseClient,
  filter: ComplaintQueueFilter,
  cursor?: KeysetCursor,
  limit?: number,
): Promise<{ rows: TicketQueueItem[]; nextCursor: KeysetCursor | null; counts: ComplaintQueueCounts }> {
  const queue: TicketQueueFilter =
    filter.kind === 'resolved'
      ? { status: 'resolved' }
      : filter.kind === 'awaiting'
        ? { openOnly: true, awaitingReply: true }
        : filter.kind === 'type'
          ? { openOnly: true, type: filter.type }
          : { openOnly: true };

  // İkisi birbirine bakmıyor; sırayla beklemek ekran açılışını iki katına çıkarırdı (sosyal uç deseni).
  const [page, counts] = await Promise.all([
    // Operasyon dili: kuyruk da personele Türkçe açılır (`readComplaint`in aynı satırı).
    listTicketQueue(db, 'tr', queue, cursor, limit),
    new TicketQueueService(db).countForFilters(),
  ]);

  return { rows: page.rows, nextCursor: page.nextCursor, counts };
}
