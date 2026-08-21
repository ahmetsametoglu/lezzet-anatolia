import type { MessageKind } from '@lezzet/types';

/*
  SOSYAL EKRANLARIN METİN TÜRETMELERİ — liste satırı ile sohbet başlığı AYNI kurallara bakar
  (`ticket-format.ts`in aynı gerekçesi): ayrı yazılsalardı kart bir ad, başlık başka bir ad
  gösterebilirdi. Web karşılığı `social-read.ts` (`titleOf`) — sözleşme HAM alan taşıdığı için
  (kontrat künyesi) her yüzey bu zinciri kendisi kurar; cümleler kendi sözlüğünden gelir.
*/

/**
 * Sohbetin görünen adı — **müşteri kaydı > sağlayıcı profili > ham anahtar** (web `titleOf`un
 * aynı zinciri): kimliği bağlanmış sohbet müşterinin adını, bağlanmamışı sağlayıcı profil adını
 * gösterir; ikisi de yoksa ham anahtar kalır — WhatsApp'ta okunaklı telefondur, Messenger/IG'de
 * opak PSID/IGSID'dir ve boş bir başlıktan iyidir (satır adressiz kalamaz).
 */
export function socialTitle(row: { customerName: string | null; profileName: string | null; externalRef: string }): string {
  return row.customerName?.trim() || row.profileName?.trim() || row.externalRef;
}

/**
 * Satır önizlemesi — son mesajın metni; metinsiz türde (medya/kart) türün köşeli parantezli
 * etiketi (web `MESSAGE_KIND_LABELS` kararı: boş balon "mesaj kayboldu" okutur). Etiket sözlükten
 * gelir — bu dosya cümle kurmaz, seçer.
 */
export function socialPreview(
  row: { lastMessageText: string | null; lastMessageKind: MessageKind | null },
  kindLabels: Record<MessageKind, string>,
): string {
  const text = row.lastMessageText?.trim();
  if (text) return text;
  return row.lastMessageKind === null ? '' : kindLabels[row.lastMessageKind];
}

/**
 * Kısa damga — bugünse saat (`14:32`), değilse gün.ay (`21.08`). Operatör kuyruğunun sorusu
 * "ne kadar bekliyor"dur; tam tarih detayın işi. `Intl` kullanılmıyor: iki biçim de dilden
 * bağımsız (operasyon yüzeyi tek dilli Türkçe).
 */
export function socialStamp(iso: string | null, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameDay =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return sameDay ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : `${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
}

/** İhraç EDİLMİYOR (knip): tipin adını yazan tüketici yok — ekran `socialWindowOf` dönüşünden çıkarım yapıyor. */
interface SocialWindowView {
  state: 'open' | 'closed' | 'never';
  /** Yalnız `open`da anlamlı — cümlenin `{hours}` yuvasına gider (tavana yuvarlanır: "23 saat kaldı"). */
  hoursLeft: number;
}

/**
 * Servis penceresinin ekran hâli — karar DEĞİL, sunum: pencerenin kendisi motorda hesaplanıp
 * satıra yazılmıştır (`windowExpiresAt`), burada yalnız üç hâle ayrılır. `null` = pencere hiç
 * açılmadı (müşteri hiç yazmadı) ve `closed`dan AYRI bir cümledir (web `WINDOW_NOTE` kararı).
 */
export function socialWindowOf(windowExpiresAt: string | null, now: Date = new Date()): SocialWindowView {
  if (!windowExpiresAt) return { state: 'never', hoursLeft: 0 };
  const msLeft = new Date(windowExpiresAt).getTime() - now.getTime();
  if (!Number.isFinite(msLeft) || msLeft <= 0) return { state: 'closed', hoursLeft: 0 };
  return { state: 'open', hoursLeft: Math.ceil(msLeft / 3_600_000) };
}
