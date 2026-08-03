import 'server-only';
import { ProductFeedbackService, ProductService, serviceDb } from '@lezzet/database';
import { resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { imageOf } from '@/lib/storefront/map';
import type { StorefrontImage } from '@/lib/storefront/storefront-types';

/**
 * Keşif destesinin OKUMA kapısı (08.7 · design/pages/musteri-kesif.md).
 *
 * Yazma tarafı aylardır hazırdı (`recordVote` + `candidate` bağlamı: adaylığı doğruluyor,
 * ziyaretçiyi de kabul ediyor, puanı veriyor); eksik olan **hangi kartların gösterileceğiydi.**
 *
 * ── ADAY ÜRÜN SATILABİLİR ÜRÜN DEĞİLDİR ─────────────────────────────────────
 * Bu yüzden dönüş `StorefrontProduct` DEĞİL. Vitrin sözleşmesi fiyat, stok, varyant ve "sepete
 * ekle" taşıyor; aday üründe bunların hiçbiri yok ve tasarımın yasağı da tam bu (§6: *"aday
 * ürünler satın alınabilir gibi sunulmaz — fiyat, stok, sepete ekleme yoktur"*). Vitrin tipini
 * yeniden kullansaydım kart, doldurulmamış fiyat alanlarıyla gelir ve bir gün biri onları
 * çizerdi. Taşınmayan alan, yanlışlıkla gösterilemez.
 *
 * ── AYNI KARTI İKİ KEZ SORMAYIZ, AMA YALNIZ GİRİŞLİDE ───────────────────────
 * Tasarım *"daha önce oyladığı kartlar tekrar sorulmaz"* diyor. Girişsiz ziyaretçide bunu yapmanın
 * yolu yok ve **olmaması bilinçli**: tekilleştirmek kimlik tutmak demektir (`recordVote` künyesi
 * de aynı sınırı yazıyor). Ziyaretçi turu yenilerse aynı kartları görür — bu bir kusur değil,
 * kimlik tutmamanın bedeli ve daha ucuz olanı.
 */

/** Kartın taşıdığı her şey — fiyat/stok/varyant YOK ve olmayacak. */
export interface DiscoverCard {
  productId: string;
  name: string;
  /** Kısa tanıtım; yoksa kart yalnız ad ve görselle durur (uydurma metin yazılmaz). */
  description: string | null;
  image: StorefrontImage;
}

/**
 * Deste boyu. Tavan var çünkü keşif bir LİSTE değil bir tur: tasarım "kartlar tükenince bitiş
 * durumu" diyor, yani turun bitmesi akışın parçası. Sınırsız bir deste bitiş ekranını hiç
 * göstermez ve tur "bitmeyen bir görev"e döner.
 *
 * Sayfalama YOK ve `CLAUDE.md §1`'in ölçütüyle uyumlu: aday kümesi veriyle değil, operatörün
 * eliyle büyüyor (ürünü aday yapan admin) — doğal tavanı olan küme tek turda çekilir.
 */
const DECK_SIZE = 20;

export async function openDiscoverDeck(locale: Locale, customerId: string | null): Promise<DiscoverCard[]> {
  const db = serviceDb();
  const candidates = await new ProductService(db).listCandidates();
  if (candidates.length === 0) return [];

  // Girişsizde okuma HİÇ YAPILMAZ: elenecek bir geçmiş yok ve boşuna bir sorgu, ziyaretçinin
  // ilk kartını geciktirirdi.
  const seen = customerId ? await votedProductIds(db, customerId) : new Set<string>();

  return candidates
    .filter((p) => !seen.has(p.id))
    .slice(0, DECK_SIZE)
    .map((p) => ({
      productId: p.id,
      name: resolveLocalizedText(p.name, locale),
      // Boş/boşluk metin YOK sayılır — boş bir paragraf kartın altında açıklanmamış bir boşluk bırakır.
      description: p.description ? textOrNull(resolveLocalizedText(p.description, locale)) : null,
      image: imageOf(p),
    }));
}

/** Müşterinin daha önce kaydırdığı aday ürünler. */
async function votedProductIds(db: ReturnType<typeof serviceDb>, customerId: string): Promise<Set<string>> {
  const rows = await new ProductFeedbackService(db).listByCustomer(customerId);
  return new Set(rows.filter((r) => r.context === 'candidate').map((r) => r.productId));
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
