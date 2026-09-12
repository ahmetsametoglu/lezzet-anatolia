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

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/me/tickets` — "Taleplerim" + talep detayı + yeni talep (21.14 · modül 16).

  ŞEMA BURADA YAZILMAZ (`orders.ts` · `addresses.ts` ile aynı gerekçe): sözleşme `@lezzet/types`ta
  ve UÇ DA aynı şemayla üretiyor (02-mimari §3.2) — alan adı değişirse üreten ve tüketen aynı anda
  derlemede kırılır. Bu dosyanın işi yalnız sorgu dizesini kurmak ve şemayı istemciye vermek.

  KORUNAN ÇAĞRI (`authorizedFetch`): talep uçları Bearer'ın arkasında ve oturum yoksa çağrı ağa HİÇ
  çıkmaz — yerel kısa devreyle `401 unauthorized` döner. Ekran bunu MİSAFİR olarak okur (giriş kapısı
  çizer); veri katmanı yönlendirme yapmaz (02-mimari §4).

  `locale` LİSTEDE YOK, DETAYDA VAR ve bu ucun kararı: liste satırında çözülen bir metin yok (tür ve
  durum ekranın sözlüğünde çevriliyor), detay ise hem işaretli ürün adlarını hem yazışmanın ÇEVİRİ
  YÖNÜNÜ dile göre kuruyor (20.2). Gerekçenin tamamı `apps/mobile-api/src/api/v1/tickets.ts`te.
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

/**
 * Talep sayfası — keyset imleçli (`nextCursor === null` → liste bitti).
 *
 * İmleç OPAK bir dizedir: yorumlanmaz, aynen geri verilir. İçinin ne olduğu sunucunun bileceği iş;
 * istemci onu okumaya kalksaydı keyset'in şekli sözleşme olurdu.
 */
export function fetchTickets(cursor?: string): Promise<ApiResult<z.infer<typeof MeTicketPageSchema>>> {
  return authorizedFetch(`/api/v1/me/tickets${queryOf({ cursor })}`, MeTicketPageSchema);
}

/**
 * Tek talebin detayı. Bulunamayan · başkasına ait — ikisi de 404 alır ve ekran "bu talebi bulamadık"
 * bloğunu çizer (ayrım söylenirse kimlik denenerek başkasının talebi doğrulatılabilirdi).
 */
export function fetchTicket(id: string, locale: Locale): Promise<ApiResult<TicketDetail>> {
  return authorizedFetch(`/api/v1/me/tickets/${encodeURIComponent(id)}${queryOf({ locale })}`, MeTicketDetailSchema);
}

/** Yeni talep — cevabı yalnız kimliktir; ekran listeye döner ve liste odakta tazelenir. */
export function createTicket(input: TicketOpenInput): Promise<ApiResult<z.infer<typeof TicketCreatedSchema>>> {
  return authorizedFetch('/api/v1/me/tickets', TicketCreatedSchema, { method: 'POST', body: input });
}

/**
 * Talep fotoğrafı için imzalı yükleme adresi (21.309) — yalnız AÇILIŞ taslağı; yazışmada ek yok
 * (kullanıcı kararı 10.09). `alreadyRequested` bu taslakta kaç fotoğrafın adresinin istendiği:
 * tavanı kapı sayıyor, ekran yalnız sayıyı söylüyor.
 */
export function requestTicketUpload(filename: string, alreadyRequested: number): Promise<ApiResult<TicketUpload>> {
  return authorizedFetch('/api/v1/me/tickets/uploads', TicketUploadSchema, {
    method: 'POST',
    body: { filename, alreadyRequested },
  });
}

/**
 * Fotoğrafı imzalı adrese YÜKLER — dosya sunucumuzdan geçmez, doğrudan R2'ye gider.
 *
 * `Authorization` GÖNDERİLMEZ: imza yetkinin kendisidir ve jetonu kovaya taşımak onu gereksiz bir
 * yere yaymak olurdu (`lib/print/label-file.ts`in kargo etiketi deseni). İçerik türü KAPININ
 * söylediğidir — imza onu bağlıyor, cihazın tahmini değil.
 *
 * Sonuç yalnız "gitti mi": düşen yüklemenin müşteriye söylenecek tek cümlesi var ("fotoğraf
 * yüklenemedi") ve sebebi — kovanın cevabı, kopan ağ — müşterinin düzeltebileceği bir şey değil.
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
    // Ağ koptu ya da dosya okunamadı: ekran "yüklenemedi" der ve fotoğraf eklenmez, talep
    // fotoğrafsız da gönderilebilir. Sessizlik bilinçli — sonuç müşteriye yine söyleniyor.
    return false;
  }
}

/**
 * Yazışmaya cevap — dönen şey GÜNCEL DETAYDIR, tek mesaj değil.
 *
 * Kapanmış talebe yazmak onu yeniden açar (motorun kararı), yani durum da değişmiş olabilir; ekran
 * kendi durumunu tahmin etmesin diye sunucu tam görünümü döndürüyor.
 */
export function replyToTicket(id: string, body: string, locale: Locale): Promise<ApiResult<TicketDetail>> {
  return authorizedFetch(
    `/api/v1/me/tickets/${encodeURIComponent(id)}/messages${queryOf({ locale })}`,
    MeTicketDetailSchema,
    { method: 'POST', body: { body } },
  );
}
