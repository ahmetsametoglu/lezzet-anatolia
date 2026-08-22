import type { z } from 'zod';
import {
  SocialConversationDetailSchema,
  SocialDraftConsumeResponseSchema,
  SocialDraftResponseSchema,
  SocialInboxResponseSchema,
  SocialModeResponseSchema,
  type ConversationSource,
  type SocialConversationDetail,
  type SocialConversationRowContract,
  type SocialMessageContract,
  type ConversationHandler,
} from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/social/*` — operasyonun sosyal gelen kutusu (15.15 mobil ayağı): üç Meta kanalı
  (WhatsApp · Messenger · Instagram DM) tek kuyrukta.

  ŞEMA BURADA YAZILMAZ (`tickets.ts` ile aynı gerekçe): sözleşme `@lezzet/types`ta
  (`social-api.schema.ts`) ve UÇ DA aynı şemayla üretiyor (02-mimari §3.2) — alan adı değişirse
  üreten ve tüketen aynı anda derlemede kırılır.

  KORUNAN ÇAĞRI (`authorizedFetch`): uçlar Bearer'ın + `admin` rol kapısının arkasında. Oturumsuz
  çağrı ağa çıkmadan 401 döner; rolsüz personel 403 `forbidden` görür — ekran ikisini de "bu kapı
  sana kapalı" olarak okur, operasyon kabuğu (`(operations)/_layout`) zaten admin'i içeri almıştı.

  BURADAN MESAJ GÖNDERİLMEZ: `reply` DEFTER yazar (uç künyesi) — operatör metni telefonundan/
  Business Suite'ten gönderir, gönderdiğini buraya işler. Gönderen kanal 15.11'in işi.
*/

/** Kuyruk satırı — alan kümesi sözleşmenin kendisi. */
export type SocialRow = SocialConversationRowContract;
/** Sohbet mesajı — baloncuğun okuduğu şekil (YENİDEN ESKİYE gelir; sırayı ekran çevirir). */
export type SocialMessage = SocialMessageContract;
export type { SocialConversationDetail };

/** Sorgu dizesi — verilmemiş (`undefined`) parametre YAZILMAZ (talep/sipariş istemcilerinin kuralı). */
function queryOf(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/**
 * Kuyruk sayfası — keyset imleçli; süzgeç (`awaiting`) ve kanal daraltması sorguda. Başlık
 * sayaçları aynı cevapta gelir (sözleşme künyesi) — devam sayfasında ekran onları yok sayar.
 */
export function fetchSocialInbox(params: {
  cursor?: string;
  filter?: 'all' | 'awaiting';
  source?: ConversationSource;
}): Promise<ApiResult<z.infer<typeof SocialInboxResponseSchema>>> {
  return authorizedFetch(
    `/api/v1/social/conversations${queryOf({ cursor: params.cursor, filter: params.filter, source: params.source })}`,
    SocialInboxResponseSchema,
  );
}

/** Sohbet — künye + mesaj sayfası. `cursor` daha ESKİ mesajlara gider (`nextCursor === null` → geçmiş bitti). */
export function fetchSocialConversation(
  id: string,
  cursor?: string,
): Promise<ApiResult<SocialConversationDetail>> {
  return authorizedFetch(
    `/api/v1/social/conversations/${encodeURIComponent(id)}${queryOf({ cursor })}`,
    SocialConversationDetailSchema,
  );
}

/**
 * Cevabı deftere işle — dönen şey GÜNCEL DETAYDIR, tek mesaj değil (talep istemcisinin aynı
 * kararı): yazım son mesajı ve "top bizde" durumunu da oynatır; ekran kendi durumunu tahmin etmez.
 */
export function recordSocialReply(id: string, text: string): Promise<ApiResult<SocialConversationDetail>> {
  return authorizedFetch(`/api/v1/social/conversations/${encodeURIComponent(id)}/reply`, SocialConversationDetailSchema, {
    method: 'POST',
    body: { text },
  });
}

/**
 * Yürütücü modu — sohbette İKİ değer (human · hybrid); `ai` sunucuda da reddedilir, çünkü özerk
 * sohbet motoru yok (15.13 künyesi `ConversationHandlerEnum`de). Aynı moda ikinci çağrı 409
 * `mode_unchanged` döner (yarış işareti).
 */
export function setSocialMode(id: string, mode: ConversationHandler): Promise<ApiResult<z.infer<typeof SocialModeResponseSchema>>> {
  return authorizedFetch(`/api/v1/social/conversations/${encodeURIComponent(id)}/mode`, SocialModeResponseSchema, {
    method: 'POST',
    body: { mode },
  });
}

/** Taslak öner — metin dönmez, satıra yazılır; ekran detayı yeniden okur (web ile aynı akış). */
export function generateSocialDraft(id: string): Promise<ApiResult<z.infer<typeof SocialDraftResponseSchema>>> {
  return authorizedFetch(`/api/v1/social/conversations/${encodeURIComponent(id)}/draft`, SocialDraftResponseSchema, {
    method: 'POST',
  });
}

/**
 * Taslağı tüket — metin SUNUCUDAN döner (başka operatör az önce tüketmiş olabilir; ekrandaki kopya
 * bayat olabilir). "Gönderildi" demez: ekran metni cevap kutusuna taşır, defter kaydı `reply` ile.
 */
export function consumeSocialDraft(id: string): Promise<ApiResult<z.infer<typeof SocialDraftConsumeResponseSchema>>> {
  return authorizedFetch(
    `/api/v1/social/conversations/${encodeURIComponent(id)}/draft/consume`,
    SocialDraftConsumeResponseSchema,
    { method: 'POST' },
  );
}
