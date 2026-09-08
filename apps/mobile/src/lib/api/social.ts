import type { z } from 'zod';
import {
  SocialConversationDetailSchema,
  SocialDraftConsumeResponseSchema,
  SocialDraftResponseSchema,
  SocialInboxResponseSchema,
  SocialModeResponseSchema,
  SocialReplyResponseSchema,
  type ConversationSource,
  type SocialConversationDetail,
  type SocialReplyResponse,
  type SocialConversationRowContract,
  type SocialMessageContract,
  type ConversationHandler,
} from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import { queryString, type ApiResult } from './client';

/*
  `/api/v1/social/*` — operasyonun sosyal gelen kutusu (15.15 mobil ayağı): üç Meta kanalı
  (WhatsApp · Messenger · Instagram DM) tek kuyrukta.

  ŞEMA BURADA YAZILMAZ (`tickets.ts` ile aynı gerekçe): sözleşme `@lezzet/types`ta
  (`social-api.schema.ts`) ve UÇ DA aynı şemayla üretiyor (02-mimari §3.2) — alan adı değişirse
  üreten ve tüketen aynı anda derlemede kırılır.

  KORUNAN ÇAĞRI (`authorizedFetch`): uçlar Bearer'ın + `admin` rol kapısının arkasında. Oturumsuz
  çağrı ağa çıkmadan 401 döner; rolsüz personel 403 `forbidden` görür — ekran ikisini de "bu kapı
  sana kapalı" olarak okur, operasyon kabuğu (`(operations)/_layout`) zaten admin'i içeri almıştı.

  `reply` GÖNDERİR (21.286): defter evresi bitti, uç `sendOutboundMessage` çağırıyor ve dönen zarf
  akıbeti taşıyor. Giden yönde MEDYA yok (21.287) — gelen fotoğraf/ses okunur, cevap yalnız metin.
*/

/** Kuyruk satırı — alan kümesi sözleşmenin kendisi. */
export type SocialRow = SocialConversationRowContract;
/** Sohbet mesajı — baloncuğun okuduğu şekil (YENİDEN ESKİYE gelir; sırayı ekran çevirir). */
export type SocialMessage = SocialMessageContract;
export type { SocialConversationDetail };

/** Sorgu dizesi — verilmemiş (`undefined`) parametre YAZILMAZ (talep/sipariş istemcilerinin kuralı). */

/**
 * Kuyruk sayfası — keyset imleçli; süzgeç (`awaiting`) ve kanal daraltması sorguda. Başlık
 * sayaçları aynı cevapta gelir (sözleşme künyesi) — devam sayfasında ekran onları yok sayar.
 */
export function fetchSocialInbox(params: {
  cursor?: string;
  filter?: 'all' | 'awaiting';
  source?: ConversationSource;
  /** Yürütücü süzgeci (21.289) — insan · hibrit · yapay zekâ; verilmezse hepsi. */
  handledBy?: ConversationHandler;
}): Promise<ApiResult<z.infer<typeof SocialInboxResponseSchema>>> {
  return authorizedFetch(
    `/api/v1/social/conversations${queryString({
      cursor: params.cursor,
      filter: params.filter,
      source: params.source,
      handledBy: params.handledBy,
    })}`,
    SocialInboxResponseSchema,
  );
}

/** Sohbet — künye + mesaj sayfası. `cursor` daha ESKİ mesajlara gider (`nextCursor === null` → geçmiş bitti). */
export function fetchSocialConversation(
  id: string,
  cursor?: string,
): Promise<ApiResult<SocialConversationDetail>> {
  return authorizedFetch(
    `/api/v1/social/conversations/${encodeURIComponent(id)}${queryString({ cursor })}`,
    SocialConversationDetailSchema,
  );
}

/**
 * Cevabı GÖNDER (21.286 — eskiden yalnız deftere işliyordu).
 *
 * Dönen zarf akıbeti taşır (`sent` · `refused` · `failed`), detay yalnız gönderildiğinde dolu:
 * gönderilmemiş bir cevaptan sonra yazışmayı tazelemek değişmemiş bir listeyi ikinci kez
 * çizdirirdi. Ret ile başarısızlık AYRI, çünkü operatörün yapacağı şey farklı — biri "başka yol
 * dene", öteki "yeniden dene" (sözleşme künyesi).
 */
export function sendSocialReply(id: string, text: string): Promise<ApiResult<SocialReplyResponse>> {
  return authorizedFetch(`/api/v1/social/conversations/${encodeURIComponent(id)}/reply`, SocialReplyResponseSchema, {
    method: 'POST',
    body: { text },
  });
}

/**
 * Yürütücü modu — ÜÇ değer (human · hybrid · ai) ve üçü de motorda bir kapı açıp kapatıyor; ayrım
 * uç künyesinde. Aynı moda ikinci çağrı 409 `mode_unchanged` döner (yarış işareti).
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
