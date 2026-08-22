import 'server-only';
import { logger } from '@lezzet/observability';
import type { ConversationSource } from '@lezzet/types';

/**
 * **Messenger / Instagram profil adı çözümü** (15.7 · canlı ölçüm 22.08).
 *
 * ── NEDEN AYRI BİR ÇAĞRI ────────────────────────────────────────────────────
 * WhatsApp webhook'u gönderenin adını gövdede taşır (`contacts[].profile.name`) — Messenger ve
 * Instagram TAŞIMAZ, yalnız opak kişi kimliğini verir (`sender.id` = PSID/IGSID). Canlı turda
 * ölçüldü: gerçek bir Messenger mesajında `profile_name` boş kaldı ve gelen kutusunun başlığı
 * `38324983613781600` oldu — operatöre hiçbir şey söylemeyen bir sayı. Ad yalnız Graph'tan gelir.
 *
 * ── AD KOZMETİK DEĞİL, AMA MESAJDAN DA ÖNEMLİ DEĞİL ─────────────────────────
 * Bu çağrının HİÇBİR hâli mesaj yazımını durduramaz. Jeton yoksa, çağrı düşerse, Meta kişiyi
 * çözemezse (development modunda uygulamada rolü olmayan kişiyi çözmüyor — bu da ölçüldü) sonuç
 * `null`'dur ve konuşma adsız açılır. "Adı alamadım" bir arıza değil, bilinmeyen bir değerdir;
 * mesajı kaybetmek ise gerçek arızadır (0039'un kuralı).
 *
 * ── ALAN ADLARI KANALA GÖRE FARKLI ──────────────────────────────────────────
 * Messenger kişi düğümü `first_name`/`last_name` verir; Instagram düğümü `name`/`username`. Tek
 * alan listesi ikisine birden sorulamaz — istenmeyen alan `#100` ile tüm çağrıyı düşürür.
 *
 * Jeton İKİSİ İÇİN DE SAYFA jetonudur: Instagram mesajlaşması bağlı Facebook Sayfası üzerinden
 * yürür, ayrı bir IG jetonu yoktur.
 */

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Sayfa erişim jetonu — yoksa ad çözümü sessizce atlanır (mesaj yine yazılır). */
function pageAccessToken(): string | null {
  return process.env.META_PAGE_ACCESS_TOKEN ?? null;
}

interface ProfileBody {
  first_name?: string;
  last_name?: string;
  name?: string;
  username?: string;
  error?: { message?: string; code?: number };
}

/**
 * Kişi kimliğinden okunabilir ad. Bulunamazsa `null` — çağıran o zaman adı BOŞ bırakır, uydurmaz.
 *
 * WhatsApp bu kapıdan geçmez: adı zaten webhook gövdesinde gelir, ikinci bir tur israf olurdu.
 */
export async function fetchMetaProfileName(source: ConversationSource, personId: string): Promise<string | null> {
  if (source === 'whatsapp') return null;
  const token = pageAccessToken();
  if (!token) return null;

  const fields = source === 'instagram' ? 'name,username' : 'first_name,last_name';
  try {
    const url = `${GRAPH}/${encodeURIComponent(personId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { cache: 'no-store' });
    const body = (await response.json()) as ProfileBody;

    if (!response.ok || body.error) {
      /* Beklenen ret: development modunda uygulamada rolü OLMAYAN kişi çözülemez (ölçüldü 22.08).
         `captureError` DEĞİL — kapının bilinen sınırı, uygulama arızası değil. Kimlik loglanır,
         içerik loglanmaz (CLAUDE §1). */
      logger.info(
        { context: 'messaging/meta-profile', source, personId, code: body.error?.code ?? response.status },
        'meta profil adı çözülemedi — konuşma adsız kalır',
      );
      return null;
    }

    const name =
      source === 'instagram'
        ? (body.name?.trim() || body.username?.trim() || '')
        : [body.first_name?.trim(), body.last_name?.trim()].filter(Boolean).join(' ');
    return name || null;
  } catch (err) {
    // Ağ hatası da aynı sınıf: ad bilinmiyor. Mesaj yazımı bu yüzden ASLA durmaz.
    logger.info({ context: 'messaging/meta-profile', source, personId, err: String(err) }, 'meta profil adı okunamadı');
    return null;
  }
}
