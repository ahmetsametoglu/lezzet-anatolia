import type { z } from 'zod';
import {
  MeTicketDetailSchema,
  MeTicketPageSchema,
  TicketCreatedSchema,
  type MeTicketDetail,
  type MeTicketSummary,
  type TicketOpenSchema,
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
/** Yeni talep gövdesi — `type` + anlatım + (varsa) sipariş numarası ve işaretli kalemler. */
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
