import { AddressService, ConversationService, type Db } from '@lezzet/database';
import { isValidPostalCode, normalizePostalCode } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import type { Address, Conversation } from '@lezzet/types';
import type { PlaceWarehouses } from '../catalog/storefront-types';
import { resolvePlaceForPostalCode, resolvePlaceWarehouses, UNRESOLVED_PLACE } from '../delivery/place';

/*
  SOHBETİN TESLİMAT YERİ (15.20 · kullanıcı kararı 10.09) — ajanın araçları "bu adrese gider mi"yi
  hangi posta koduna göre okur ve o kod sohbette nasıl hatırlanır.

  ── NEDEN (canlı Messenger turu, 10.09) ────────────────────────────────────────
  Müşteri posta kodu söylemeden baklava ve yaş pasta istedi; ajan ikisini de sepete koydu, toplamı
  ve "Sepetiniz hazır"ı söyledi — o adrese hizmet verip vermediğimizi ve soğuk zincir ürününün
  gidip gidemeyeceğini bilmeden. Araçlar "posta kodunu sor" diyordu ama bu bir ricaydı; model başka
  bir soru sordu. Kural artık araçta: sepete yazan araç yer bilinmeden YAZMAZ (`agent-tools.ts`).

  ── YER DÖRT KAYNAKTAN, BU SIRAYLA — TEK YERDE ─────────────────────────────────
  (1) bu turda SÖYLENEN kod · (2) sohbette SAKLANAN kod · (3) kayıtlı adres (yalnız kimlik kapısı
  izin veriyorsa) · (4) hiçbiri. Söylenen öndedir: "annemin evine, 75001'e" diyen müşteride kayıtlı
  adres yanlış cevabı verirdi. Sıra önceden üç araçta ayrı ayrı yazılıydı (ürün araması, ürün
  çözümü, sepet); biri bir gün saklanan kodu unutsaydı aynı sohbet iki ayrı yere bakardı.

  ── KOD BİR KEZ SÖYLENİR ────────────────────────────────────────────────────────
  Söylenen kod `conversation.postal_code`a yazılır; sonraki turlar sormaz. Yalnız GERÇEK bir kod
  saklanır (referans tablosunda var — hizmet versek de vermesek de). Yazım hatası saklansaydı sohbet
  yanlış bir yere kilitlenir ve her cevap "oraya gitmiyoruz" derdi; iki ülkede birden geçerli kod
  da saklanmaz, çünkü ülke bilinmeden depo seçilemez.
*/

const LOG = 'cart/chat-place';

/** Sohbette hatırlanan posta kodu — iki araç seti aynı turda aynı nesneyi paylaşır. */
export interface ChatPlaceMemory {
  /** Sohbette saklanan kod — müşteri daha önce söyledi; yoksa `null`. */
  known(): string | null;
  /** Müşterinin söylediği kodu sohbete yazar — yalnız gerçek ve tek ülkeli bir posta koduysa. */
  remember(postalCode: string): Promise<void>;
}

export function chatPlaceMemory(db: Db, conversation: Pick<Conversation, 'id' | 'postalCode'>): ChatPlaceMemory {
  let kod = conversation.postalCode;
  return {
    known: () => kod,
    remember: async (postalCode) => {
      const temiz = normalizePostalCode(postalCode);
      if (temiz === kod || !isValidPostalCode(temiz)) return;
      const cozum = await resolvePlaceForPostalCode(db, temiz);
      if (cozum.kind === 'unknown' || cozum.kind === 'ambiguous') return;
      await new ConversationService(db).update({ id: conversation.id, postalCode: temiz });
      kod = temiz;
      // Kod KİŞİSEL bir yer bilgisi — log'a kimlik yazılır, kodun kendisi değil (CLAUDE §1).
      logger.info({ context: LOG, conversationId: conversation.id }, 'sohbetin posta kodu saklandı');
    },
  };
}

/** Yerin hâli — araçların neyi söyleyebileceğini ve sepete yazıp yazamayacağını belirler. */
export type ChatPlaceState =
  /** Kod yok — "bu adrese gider mi" okunamaz; sepete yazılmaz, posta kodu sorulur. */
  | 'bilinmiyor'
  /** Kod söylendi ama böyle bir posta kodu yok — büyük olasılıkla yazım hatası. */
  | 'gecersiz'
  /** Kod iki hizmet ülkesinde birden geçerli — ülke bilinmeden depo seçilemez. */
  | 'belirsiz'
  /** Gerçek kod, ama oraya ne rota ne kargo gidiyor. */
  | 'hizmet-yok'
  /** Rota ya da kargo deposu çözüldü — "bu adrese gider mi" okunabilir. */
  | 'biliniyor';

export interface ChatPlace {
  kod: string | null;
  place: PlaceWarehouses;
  durum: ChatPlaceState;
}

/** Varsayılan adres, yoksa ilk adres — müşterinin "benim adresim" dediği tek yer. */
export function birincilAdres(adresler: Address[]): Address | null {
  return adresler.find((a) => a.isDefault) ?? adresler[0] ?? null;
}

/**
 * **Sohbetin yeri** — dört kaynaktan, dosya başındaki sırayla. Söylenen kod gerçekse sohbete yazılır.
 * Depo çözülemezse sebebi ayrıca okunur, çünkü müşteriye söylenecek cümle değişiyor: yazım hatası
 * "kodu teyit eder misiniz", hizmet yok "oraya şu an gitmiyoruz".
 */
export async function resolveChatPlace(
  db: Db,
  input: { said?: string | null; memory: ChatPlaceMemory | null; addressCustomerId: string | null },
): Promise<ChatPlace> {
  const soylenen = input.said?.trim() ? normalizePostalCode(input.said) : null;
  if (soylenen) await input.memory?.remember(soylenen);
  const saklanan = input.memory?.known() ?? null;
  const adres =
    !soylenen && !saklanan && input.addressCustomerId
      ? birincilAdres(await new AddressService(db).listByCustomer(input.addressCustomerId))
      : null;
  const kod = soylenen || saklanan || adres?.postalCode || null;
  if (!kod) return { kod: null, place: UNRESOLVED_PLACE, durum: 'bilinmiyor' };

  const place = await resolvePlaceWarehouses(db, kod);
  if (place.warehouseId || place.shippingWarehouseId) return { kod, place, durum: 'biliniyor' };
  const cozum = await resolvePlaceForPostalCode(db, kod);
  return { kod, place, durum: cozum.kind === 'unknown' ? 'gecersiz' : cozum.kind === 'ambiguous' ? 'belirsiz' : 'hizmet-yok' };
}

/**
 * Yer okunamadıysa modele ne söyleneceği — sepet özetinin ek satırı, sepete yazmanın engeli ve ürün
 * aramasının yer notu buradan (10.09). Anahtar hâlin adıdır; model hangisini gördüğüne göre konuşur.
 */
export function yerNotu(yerim: ChatPlace): Record<string, string> {
  switch (yerim.durum) {
    case 'biliniyor':
      return {};
    case 'bilinmiyor':
      return {
        yerBilinmiyor:
          'Adres bilinmiyor — "bu adrese gider mi" okunamadı; sepete ancak posta koduyla yazılır. Cevabının TEK sorusu posta kodu olsun, ' +
          'müşteri söyleyince aracı `postaKodu` ile yeniden çağır. Kod bir kez söylenir ve saklanır.',
      };
    case 'gecersiz':
      return { postaKoduGecersiz: `"${yerim.kod}" diye bir posta kodu bulunamadı — müşteriden posta kodunu teyit et.` };
    case 'belirsiz':
      // BEKLEYEN(15.20): iki ülkede birden geçerli kodda sohbetten ülke seçilemiyor — müşteri siteden devam eder.
      return { ulkeBelirsiz: `${yerim.kod} iki ülkede birden geçerli; sohbetten ülke seçilemiyor. Müşteriye siparişini sitemizden verebileceğini söyle.` };
    case 'hizmet-yok':
      return {
        teslimatYok: `${yerim.kod} posta koduna şu an teslimat yapmıyoruz — ne kapıya ne kargoyla. Müşteriye açıkça söyle; başka bir teslimat adresi varsa onun posta kodunu sorabilirsin.`,
      };
  }
}
