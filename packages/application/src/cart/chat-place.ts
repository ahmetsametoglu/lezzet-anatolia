// `z` porttan gelir: SDK tek zod örneği bekliyor.
import { z } from '@lezzet/ai';
import { AddressService, ConversationService, type Db } from '@lezzet/database';
import { isValidPostalCode, normalizePostalCode } from '@lezzet/address';
import { logger } from '@lezzet/observability';
import { COUNTRY_LABELS, CountryEnum, type Address, type Conversation, type Country } from '@lezzet/types';
import type { PlaceWarehouses } from '../catalog/storefront-types';
import { resolvePlaceForPostalCode, resolvePlaceWarehouses, UNRESOLVED_PLACE } from '../delivery/place';

/*
  Sohbetin yeri bu sırayla okunur: bu turda söylenen kod, sohbette saklanan kod, kimlik kapısı izin veriyorsa kayıtlı adres;
  söylenen öndedir, çünkü "annemin evine" diyen müşteride kayıtlı adres yanlış cevap verir. Yalnız referansta bulunan kod saklanır,
  yazım hatası saklansaydı sohbet yanlış yere kilitlenirdi.
*/

const LOG = 'cart/chat-place';

/** Yer okuyan araçların ortak ülke girdisi; model yalnız müşterinin söylediği ülkeyi geçer, tahmin etmez. */
export const ULKE_GIRDISI = z
  .enum(CountryEnum.options)
  .optional()
  .describe(
    `Posta kodu birden çok ülkede geçerliyse müşterinin SÖYLEDİĞİ ülke: ${CountryEnum.options.map((c) => `${c} (${COUNTRY_LABELS[c]})`).join(' ya da ')}. ` +
      'Araç "ulkeBelirsiz" demediyse ve müşteri söylemediyse boş bırak — tahmin etme.',
  );

/** İki araç seti aynı turda aynı nesneyi paylaşır. */
export interface ChatPlaceMemory {
  known(): string | null;
  /** Kod iki ülkeli ve ülke henüz sorulmadıysa `null`. */
  knownCountry(): Country | null;
  /** Yalnız gerçek kodu yazar. Ülke bir seçimdir: kodun geçerli olmadığı ülke yazılmaz, eski yer yerinde kalır. */
  remember(postalCode: string, country?: Country): Promise<void>;
}

export function chatPlaceMemory(db: Db, conversation: Pick<Conversation, 'id' | 'postalCode' | 'postalCountry'>): ChatPlaceMemory {
  let kod = conversation.postalCode;
  let ulke = conversation.postalCountry;
  return {
    known: () => kod,
    knownCountry: () => ulke,
    remember: async (postalCode, country) => {
      const temiz = normalizePostalCode(postalCode);
      if (!isValidPostalCode(temiz)) return;
      if (temiz === kod && (country === undefined || country === ulke)) return;
      const cozum = await resolvePlaceForPostalCode(db, temiz, country);
      // Yazım hatası ya da kodun geçerli olmadığı ülke saklanmaz.
      if (cozum.kind === 'unknown') return;
      // İki ülkeli kodda da kod saklanır ki sonraki tur yalnız ülkeyi sorsun.
      const yeniUlke = cozum.kind === 'ambiguous' ? null : cozum.country;
      await new ConversationService(db).update({ id: conversation.id, postalCode: temiz, postalCountry: yeniUlke });
      kod = temiz;
      ulke = yeniUlke;
      // Posta kodu kişisel yer bilgisi: log'a kimlik yazılır, kod yazılmaz.
      logger.info({ context: LOG, conversationId: conversation.id }, 'sohbetin posta kodu saklandı');
    },
  };
}

/** Araçların ne söyleyebileceğini ve sepete yazıp yazamayacağını belirler. */
export type ChatPlaceState =
  /** Sepete yazılmaz, posta kodu sorulur. */
  | 'bilinmiyor'
  /** Böyle bir kod yok ya da seçilen ülkede yok; büyük olasılıkla yazım hatası. */
  | 'gecersiz'
  /** İki hizmet ülkesinde geçerli ve ülke seçilmedi: depo seçilemez, ülke sorulur. */
  | 'belirsiz'
  /** Gerçek kod ama oraya ne rota ne kargo gidiyor. */
  | 'hizmet-yok'
  /** Rota ya da kargo deposu çözüldü. */
  | 'biliniyor';

export interface ChatPlace {
  kod: string | null;
  /** Seçilen ya da koddan türeyen ülke. */
  ulke: Country | null;
  place: PlaceWarehouses;
  durum: ChatPlaceState;
  /** Yalnız `belirsiz` hâlde dolu: müşteriye sorulacak ülkeler. */
  adaylar: readonly Country[];
}

/** Müşterinin "benim adresim" dediği yer: varsayılan, yoksa ilk adres. */
export function birincilAdres(adresler: Address[]): Address | null {
  return adresler.find((a) => a.isDefault) ?? adresler[0] ?? null;
}

/**
 * Kodsuz gelen ülke saklı koda eklenir; iki ülkeli kodun cevabıdır. Depo çözülemezse sebep ayrıca okunur, çünkü müşteriye
 * söylenecek cümle her sebepte başka.
 */
export async function resolveChatPlace(
  db: Db,
  input: {
    said?: string | null;
    /** Kodla birlikte ya da kod zaten saklıysa tek başına gelebilir. */
    saidCountry?: Country;
    memory: ChatPlaceMemory | null;
    addressCustomerId: string | null;
  },
): Promise<ChatPlace> {
  const soylenen = input.said?.trim() ? normalizePostalCode(input.said) : null;
  const yazilacak = soylenen ?? (input.saidCountry ? (input.memory?.known() ?? null) : null);
  if (yazilacak) await input.memory?.remember(yazilacak, input.saidCountry);
  const saklanan = input.memory?.known() ?? null;
  const adres =
    !soylenen && !saklanan && input.addressCustomerId
      ? birincilAdres(await new AddressService(db).listByCustomer(input.addressCustomerId))
      : null;
  const kod = soylenen || saklanan || adres?.postalCode || null;
  if (!kod) return { kod: null, ulke: null, place: UNRESOLVED_PLACE, durum: 'bilinmiyor', adaylar: [] };

  /* Ülke kodla aynı kaynaktan okunur. Söylenen kod saklanamadıysa eski kodun ülkesi ona uygulanmaz. */
  const ulke =
    input.saidCountry ??
    (kod === saklanan ? (input.memory?.knownCountry() ?? null) : kod === adres?.postalCode ? adres.country : null);
  const place = await resolvePlaceWarehouses(db, kod, ulke ?? undefined);
  if (place.warehouseId || place.shippingWarehouseId) return { kod, ulke, place, durum: 'biliniyor', adaylar: [] };
  const cozum = await resolvePlaceForPostalCode(db, kod, ulke ?? undefined);
  if (cozum.kind === 'ambiguous') {
    return { kod, ulke: null, place, durum: 'belirsiz', adaylar: cozum.candidates.map((aday) => aday.country) };
  }
  return { kod, ulke, place, durum: cozum.kind === 'unknown' ? 'gecersiz' : 'hizmet-yok', adaylar: [] };
}

/**
 * Sepet özeti, sepete yazma engeli ve ürün araması aynı notu buradan alır; anahtar hâlin adıdır ki model hangisini gördüğüne göre
 * konuşsun.
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
      return {
        postaKoduGecersiz: `"${yerim.kod}" diye bir posta kodu bulunamadı${yerim.ulke ? ` (${COUNTRY_LABELS[yerim.ulke]})` : ''} — müşteriden posta kodunu teyit et.`,
      };
    case 'belirsiz':
      return {
        ulkeBelirsiz:
          `${yerim.kod} birden çok ülkede geçerli: ${yerim.adaylar.map((c) => `${COUNTRY_LABELS[c]} (${c})`).join(' · ')}. ` +
          'Müşteriye hangi ülkede olduğunu SOR, tahmin etme; cevabı gelince aracı `ulke` ile yeniden çağır. Kod saklandı — posta kodunu yeniden SORMA.',
      };
    case 'hizmet-yok':
      return {
        teslimatYok: `${yerim.kod} posta koduna şu an teslimat yapmıyoruz — ne kapıya ne kargoyla. Müşteriye açıkça söyle; başka bir teslimat adresi varsa onun posta kodunu sorabilirsin.`,
      };
  }
}
