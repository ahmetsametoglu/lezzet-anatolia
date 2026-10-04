import type { z } from 'zod';
import { fetch as expoFetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import {
  MeTicketDetailSchema,
  MeTicketPageSchema,
  TicketCreatedSchema,
  TicketUploadSchema,
  type MeTicketDetail,
  type MeTicketSummary,
  type TicketOpenSchema,
  type TicketUpload,
} from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  `/api/v1/me/tickets` istemcisi: şema sözleşmede, burada yalnız yol ve sorgu dizesi kurulur. Çağrılar korunur, oturum yoksa ağa
  çıkmadan 401 döner ve ekran bunu misafir olarak okur; dil yalnız detayda gider, çünkü yazışmanın çeviri yönü ona bağlı.
*/

/** Liste satırı — alan kümesi sözleşmenin kendisi. */
export type TicketSummary = MeTicketSummary;
/** Detay — yazışma dahil, sayfanın tamamı tek turda. */
export type TicketDetail = MeTicketDetail;
/** Tek mesaj — baloncuğun okuduğu şekil. */
export type TicketMessage = MeTicketDetail['messages'][number];
/** Yeni talep gövdesi — `type` + anlatım + (varsa) sipariş numarası, işaretli kalemler ve fotoğraflar. */
export type TicketOpenInput = z.input<typeof TicketOpenSchema>;

/** Sorgu dizesi — verilmemiş (`undefined`) parametre YAZILMAZ (sipariş istemcisinin kuralı). */
function queryOf(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/** Talep sayfası; imleç opak bir dizedir ve aynen geri verilir, yoksa keyset'in şekli sözleşmeye dönüşürdü. */
export function fetchTickets(cursor?: string): Promise<ApiResult<z.infer<typeof MeTicketPageSchema>>> {
  return authorizedFetch(`/api/v1/me/tickets${queryOf({ cursor })}`, MeTicketPageSchema);
}

/** Tek talebin detayı; bulunamayan ile başkasına ait aynı 404'ü alır, yoksa kimlik denenerek başkasının talebi doğrulatılırdı. */
export function fetchTicket(id: string, locale: Locale): Promise<ApiResult<TicketDetail>> {
  return authorizedFetch(`/api/v1/me/tickets/${encodeURIComponent(id)}${queryOf({ locale })}`, MeTicketDetailSchema);
}

/** Yeni talep; cevabı yalnız kimliktir ve ekran yazışmayı onunla açar. */
export function createTicket(input: TicketOpenInput): Promise<ApiResult<z.infer<typeof TicketCreatedSchema>>> {
  return authorizedFetch('/api/v1/me/tickets', TicketCreatedSchema, { method: 'POST', body: input });
}

/**
 * Talep fotoğrafı için imzalı yükleme adresi: talep kimliği verilmezse açılış taslağına, verilirse o yazışmaya. `alreadyRequested`
 * bu mesaj için kaç adres istendiği; tavanı kapı sayar.
 */
export function requestTicketUpload(filename: string, alreadyRequested: number, ticketId?: string): Promise<ApiResult<TicketUpload>> {
  const path = ticketId === undefined ? '/api/v1/me/tickets/uploads' : `/api/v1/me/tickets/${encodeURIComponent(ticketId)}/uploads`;
  return authorizedFetch(path, TicketUploadSchema, { method: 'POST', body: { filename, alreadyRequested } });
}

/**
 * Fotoğrafı imzalı adrese doğrudan yükler; `Authorization` gitmez, çünkü imza yetkinin kendisidir ve içerik türü imzanın bağladığı
 * türdür. Sonuç yalnız "gitti mi", çünkü düşen yüklemenin sebebi müşterinin düzeltebileceği bir şey değil.
 */
export async function uploadTicketPhoto(upload: TicketUpload, uri: string): Promise<boolean> {
  try {
    const response = await expoFetch(upload.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': upload.contentType },
      body: new File(uri),
    });
    return response.ok;
  } catch {
    // Ağ koptu ya da dosya okunamadı: ekran "yüklenemedi" der ve mesaj fotoğrafsız da gönderilebilir.
    return false;
  }
}

/** Yazışmaya cevap; dönen şey güncel detaydır, çünkü kapanmış talebe yazmak onu yeniden açar ve ekran durumu tahmin etmemeli. */
export function replyToTicket(id: string, body: string, locale: Locale, attachments: readonly string[]): Promise<ApiResult<TicketDetail>> {
  return authorizedFetch(
    `/api/v1/me/tickets/${encodeURIComponent(id)}/messages${queryOf({ locale })}`,
    MeTicketDetailSchema,
    // Fotoğraf yoksa alan hiç gitmez: boş dizi var olmayan bir eki anlatmaya kalkardı.
    { method: 'POST', body: attachments.length === 0 ? { body } : { body, attachments } },
  );
}
