// `z` porttan geliyor — SDK tek zod örneği bekliyor (`support-tools.ts` künyesi).
import { z } from '@lezzet/ai';
import { AddressService, ConversationService, type Db } from '@lezzet/database';
import { isValidPostalCode, normalizePostalCode } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import { COUNTRY_LABELS, CountryEnum, type Address, type Conversation, type Country } from '@lezzet/types';
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
  yanlış bir yere kilitlenir ve her cevap "oraya gitmiyoruz" derdi.

  ── YER = KOD + ÜLKE (kullanıcı kararı 10.09) ───────────────────────────────────
  610 kod iki hizmet ülkesinde birden geçerli (yerelde ölçülen örnekler: 01640 · 01990 · 02620) ve
  ülke bilinmeden depo seçilemez. Eskiden bu kod hiç saklanmıyor, müşteri siteye yollanıyordu — ve
  bir sonraki tur kodu da bilmediği için posta kodunu YENİDEN soruyordu. Artık kod saklanır, ülke
  müşteriye sorulur, cevabı `conversation.postal_country`ye yazılır. Kural web'in yer çerezindekiyle
  aynı (`country` alanı): ülke tahmin edilmez, SEÇİLİR; seçim de kodun geçerli olduğu ülkelerle
  sınırlıdır (süzgeç — `resolvePlaceForPostalCode`). Tek ülkeli kodda ülke koddan türer ve yine yazılır.
*/

const LOG = 'cart/chat-place';

/**
 * Araçların ÜLKE girdisi — yer okuyan yedi araçta aynı tanım (sepet ve ürün araçları, posta kodu
 * kontrolü). Seçenekler ülke sözlüğünden türer; model yalnız müşterinin söylediğini geçer.
 */
export const ULKE_GIRDISI = z
  .enum(CountryEnum.options)
  .optional()
  .describe(
    `Posta kodu birden çok ülkede geçerliyse müşterinin SÖYLEDİĞİ ülke: ${CountryEnum.options.map((c) => `${c} (${COUNTRY_LABELS[c]})`).join(' ya da ')}. ` +
      'Araç "ulkeBelirsiz" demediyse ve müşteri söylemediyse boş bırak — tahmin etme.',
  );

/** Sohbette hatırlanan yer — iki araç seti aynı turda aynı nesneyi paylaşır. */
export interface ChatPlaceMemory {
  /** Sohbette saklanan kod — müşteri daha önce söyledi; yoksa `null`. */
  known(): string | null;
  /** Saklanan kodun ülkesi — koddan türedi ya da müşteri seçti; kod iki ülkeli ve ülke sorulmadıysa `null`. */
  knownCountry(): Country | null;
  /**
   * Müşterinin söylediği kodu (ve söylediyse ülkesini) sohbete yazar — yalnız gerçek bir kodsa. Ülke
   * bir SEÇİMDİR: kodun geçerli olmadığı ülke yazılmaz, eski yer yerinde kalır.
   */
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
      // Aynı kod, yeni bir ülke bilgisi olmadan yeniden söylendi — yazılacak bir şey yok.
      if (temiz === kod && (country === undefined || country === ulke)) return;
      const cozum = await resolvePlaceForPostalCode(db, temiz, country);
      // Tanınmayan kod (yazım hatası) ya da kodun geçerli olmadığı ülke saklanmaz.
      if (cozum.kind === 'unknown') return;
      // İki ülkeli kodda ülke henüz yok: kod yine saklanır ki sonraki tur yalnız ÜLKEYİ sorsun, kodu değil.
      const yeniUlke = cozum.kind === 'ambiguous' ? null : cozum.country;
      await new ConversationService(db).update({ id: conversation.id, postalCode: temiz, postalCountry: yeniUlke });
      kod = temiz;
      ulke = yeniUlke;
      // Kod KİŞİSEL bir yer bilgisi — log'a kimlik yazılır, kodun kendisi değil (CLAUDE §1).
      logger.info({ context: LOG, conversationId: conversation.id }, 'sohbetin posta kodu saklandı');
    },
  };
}

/** Yerin hâli — araçların neyi söyleyebileceğini ve sepete yazıp yazamayacağını belirler. */
export type ChatPlaceState =
  /** Kod yok — "bu adrese gider mi" okunamaz; sepete yazılmaz, posta kodu sorulur. */
  | 'bilinmiyor'
  /** Kod söylendi ama böyle bir posta kodu yok (ya da seçilen ülkede yok) — büyük olasılıkla yazım hatası. */
  | 'gecersiz'
  /** Kod iki hizmet ülkesinde birden geçerli ve ülke henüz seçilmedi — depo seçilemez, ülke sorulur. */
  | 'belirsiz'
  /** Gerçek kod, ama oraya ne rota ne kargo gidiyor. */
  | 'hizmet-yok'
  /** Rota ya da kargo deposu çözüldü — "bu adrese gider mi" okunabilir. */
  | 'biliniyor';

export interface ChatPlace {
  kod: string | null;
  /** Kodun ülkesi — seçilen ya da koddan türeyen; bilinmiyorsa `null`. */
  ulke: Country | null;
  place: PlaceWarehouses;
  durum: ChatPlaceState;
  /** Yalnız `belirsiz` hâlde dolu: kodun geçerli olduğu hizmet ülkeleri — müşteriye sorulacak seçenekler. */
  adaylar: readonly Country[];
}

/** Varsayılan adres, yoksa ilk adres — müşterinin "benim adresim" dediği tek yer. */
export function birincilAdres(adresler: Address[]): Address | null {
  return adresler.find((a) => a.isDefault) ?? adresler[0] ?? null;
}

/**
 * **Sohbetin yeri** — dört kaynaktan, dosya başındaki sırayla. Söylenen kod gerçekse sohbete yazılır;
 * kod söylenmeden gelen ülke saklı koda eklenir (iki ülkeli kodun cevabı). Depo çözülemezse sebebi
 * ayrıca okunur, çünkü müşteriye söylenecek cümle değişiyor: yazım hatası "kodu teyit eder misiniz",
 * iki ülke "hangi ülke", hizmet yok "oraya şu an gitmiyoruz".
 */
export async function resolveChatPlace(
  db: Db,
  input: {
    said?: string | null;
    /** Müşterinin söylediği ülke — kodla birlikte ya da tek başına (kod zaten saklıysa) gelebilir. */
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

  /* Ülke kodla AYNI kaynaktan: söylenen ülke önce; yoksa saklı kodun saklı ülkesi ya da kayıtlı adresin
     kendi ülkesi. Söylenen kod saklanamadıysa (tanınmadı) eski kodun ülkesi ona UYGULANMAZ. */
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
