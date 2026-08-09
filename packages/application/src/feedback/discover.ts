import { ProductFeedbackService, ProductService } from '@lezzet/database';
import { initialFeedbackStatus } from '@lezzet/domain-core';
import { resolveLocalizedText, type FeedbackVote, type PreferredLanguage, type ProductFeedback } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { imageOf } from '../catalog/map';
import type { StorefrontImage } from '../catalog/storefront-types';
import { awardFeedbackPoints } from './points';

/*
  KEŞİF TURU (08.7 · 17.3 · terfi 21.19) — web'de üç dosyaya dağılmış olan aday ürün akışının paket
  hâli: deste okuması (`apps/web/lib/feedback/discover.ts`), kaydırmanın yazımı
  (`apps/web/lib/feedback/product-feedback.ts` → `recordVote`in `candidate` DALI) ve ziyaretçi
  turunun hesaba bağlanması (`apps/web/lib/feedback/discover-claim.ts`). Web dosyaları KÖPRÜ olarak
  duruyor; benimsemeleri web şeridinin işi (`invite.ts`/`write.ts` terfilerinin aynı sözleşmesi).

  ── NEDEN ŞİMDİ, NEDEN AYRI DOSYA ───────────────────────────────────────────
  `write.ts` künyesi keşfi bilerek dışarıda bırakmıştı: *"`candidate` bağlamı, ziyaretçi (kimliksiz)
  kaydı ve `dwellMs` sinyali — bunlar keşif yüzeyinin işi ve bugün tek yüzeyde (web) yaşıyor."*
  İkinci yüzey doğdu (mobil keşif ekranı + `/api/v1/discover`), yani terfi ölçütü karşılandı.
  `write.ts`e eklenmedi çünkü o dosyanın tek kuralı *"kimlik TOKEN'dan çözülür"*dür ve keşifte token
  yoktur — kimlik ya oturumdan gelir ya HİÇ yoktur. İki farklı kimlik rejimini tek dosyaya koymak,
  bir gün birinin ötekinin kapısından geçmesi demekti.

  ── ADAY ÜRÜN SATILABİLİR ÜRÜN DEĞİLDİR ─────────────────────────────────────
  Kart `StorefrontProduct` DEĞİL: vitrin sözleşmesi fiyat, stok, varyant ve "sepete ekle" taşır;
  aday üründe bunların hiçbiri yok ve tasarımın yasağı tam bu (`design/pages/musteri-kesif.md §6`:
  *"aday ürünler satın alınabilir gibi sunulmaz"*). Vitrin tipini yeniden kullansaydık kart
  doldurulmamış fiyat alanlarıyla gelir ve bir gün biri onları çizerdi. Taşınmayan alan,
  yanlışlıkla gösterilemez.

  ── ZİYARETÇİ DE KAYDIRIR; TEKİLLEŞTİRME YALNIZ GİRİŞLİDE ───────────────────
  Tasarım *"daha önce oyladığı kartlar tekrar sorulmaz"* diyor; girişsizde bunun yolu yok ve
  olmaması bilinçli — tekilleştirmek kimlik tutmak demektir. Ziyaretçi turu yenilerse aynı kartları
  görür: kusur değil, kimlik tutmamanın (daha ucuz olan) bedeli.
*/

/** Turun tek kartı — fiyat/stok/varyant YOK ve olmayacak. */
export interface DiscoverCard {
  productId: string;
  name: string;
  /** Kısa tanıtım; yoksa kart yalnız ad ve görselle durur (uydurma metin yazılmaz). */
  description: string | null;
  image: StorefrontImage;
}

/**
 * Deste boyu. Tavan var çünkü keşif bir LİSTE değil bir TUR: tasarım "kartlar tükenince bitiş
 * durumu" diyor, yani turun bitmesi akışın parçası. Sınırsız bir deste bitiş ekranını hiç göstermez
 * ve tur "bitmeyen bir görev"e döner.
 *
 * Sayfalama YOK ve `CLAUDE.md §1`'in ölçütüyle uyumlu: aday kümesi veriyle değil operatörün eliyle
 * büyür (ürünü aday yapan admin) — doğal tavanı olan küme tek turda çekilir.
 */
const DECK_SIZE = 20;

/**
 * **Turun destesi.** Girişli müşteride daha önce oyladığı kartlar elenir; ziyaretçide elenecek bir
 * geçmiş yok ve okuma HİÇ YAPILMAZ — boşuna bir sorgu, ziyaretçinin ilk kartını geciktirirdi.
 */
export async function openDiscoverDeck(
  db: SupabaseClient,
  locale: PreferredLanguage,
  customerId: string | null,
): Promise<DiscoverCard[]> {
  const candidates = await new ProductService(db).listCandidates();
  if (candidates.length === 0) return [];

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
async function votedProductIds(db: SupabaseClient, customerId: string): Promise<Set<string>> {
  const rows = await new ProductFeedbackService(db).listByCustomer(customerId);
  return new Set(rows.filter((r) => r.context === 'candidate').map((r) => r.productId));
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Kaydırmanın sonucu — adlı retlerle (`addCustomerAddress` · `updateCustomerPreferences` emsali).
 *
 * `not_candidate` motorun iç ayrımıdır ve müşteriye anlatılacak bir şey değildir; ayrı taşınıyor
 * çünkü TAŞIMA katmanının kararı olmalı: uç ikisini de tek anahtara indirir, ama sözleşme ona bu
 * seçeneği bırakır (`MePointsRedeemErrorEnum` künyesindeki aynı ilke).
 */
export type DiscoverSwipeOutcome =
  | { status: 'ok'; swipe: DiscoverSwipeRecord }
  | { status: 'not_found' | 'not_candidate' };

export interface DiscoverSwipeRecord {
  /**
   * Kaydırma satırının kimliği — **yalnız KİMLİKSİZ kaydırmada dolu.**
   *
   * Ziyaretçi bu kimlikleri cihazında saklar ve giriş dönüşünde talep kapısına getirir
   * (`claimDiscoverSwipes`). Girişli müşteride `null`: satır zaten sahibinin üstünde ve talep kapısı
   * kimlikli satırı kabul ETMİYOR — dönseydi istemci hiçbir zaman kullanılamayacak bir liste
   * biriktirirdi ve o listeyi bir gün kapıya götürüp sessizce sıfır sonuç alırdı.
   */
  id: string | null;
  /**
   * Bu kaydırma için GERÇEKTEN yazılan puan. `null` = kimliksiz kaydırma, yani ödülün henüz sahibi
   * yok (SIFIR DEĞİL — `CLAUDE §1`: ölçülemeyen değer sıfır değildir; puan giriş dönüşünde talep
   * kapısında doğar). `0` ise gerçekten yazılmadı: günlük tavan, B2B ya da aynı ürüne ikinci oy.
   *
   * Taşınıyor çünkü ekran turun sonunda *"+N puan kazandınız"* diyor ve bu cümlenin sayısı
   * ayardan/tavandan bağımsız uydurulamaz (29.07 denetiminin dersi: ekranın vaat ettiği ile motorun
   * yazdığı ayrışırsa müşteri gelmeyecek bir ödül için hareket eder).
   */
  pointsAwarded: number | null;
}

/**
 * **Bir kartın kaydırılması** (👍 beğen / ✕ geç).
 *
 * Adaylık DOĞRULANIR: aday olmayan ürün keşif kartlarına düşmez, oradan gelen bir oy tutarsızdır.
 * Adaylık ayrı bir bayrak değil bir DURUMDUR (`product.status`) — satılabilir ürün aynı anda aday
 * olamaz, ikisi aynı eksenin iki değeridir.
 *
 * `dwellMs` sinyal KALİTESİNİN girdisidir, puanın değil (DOMAIN §14 "ödül ≠ güven"): ekran ölçer,
 * motor değerlendirir (`weighSwipesByProduct`). Kalitesiz kaydırma da ödülünü alır, yalnız aday
 * panosundaki iş kararını bozmaz.
 *
 * Puan SESSİZ yazılır: tavana takılmak ya da B2B olmak kaydırmayı geri çevirmez.
 */
export async function recordDiscoverSwipe(
  db: SupabaseClient,
  input: {
    /** `null`/verilmemiş = ziyaretçi. Kimlik ÇAĞIRANIN çözdüğü şeydir (oturum/Bearer), istemcinin iddiası değil. */
    customerId?: string | null;
    productId: string;
    vote: FeedbackVote;
    dwellMs?: number | null;
  },
): Promise<DiscoverSwipeOutcome> {
  const product = await new ProductService(db).getById(input.productId);
  if (!product) return { status: 'not_found' };
  if (product.status !== 'candidate') return { status: 'not_candidate' };

  const service = new ProductFeedbackService(db);
  // Metin YOK ve olmayacak (kart bir metin kutusu taşımıyor); statüyü yine de MOTOR söylüyor —
  // "metinsiz kayıt yayına doğar, metinli kuyruğa" kuralının tek sahibi o (STACK §4).
  const status = initialFeedbackStatus(null);

  if (!input.customerId) {
    // Kimliksiz kaydırma: güncellenecek bir "önceki" yok (tekilleştirme kimlik ister), doğrudan
    // yazılır. Puan doğmaz — ödülün sahibi yok; talep kapısı onu giriş dönüşünde verir.
    const created = await service.insert({
      productId: input.productId,
      context: 'candidate',
      vote: input.vote,
      dwellMs: input.dwellMs ?? null,
      status,
    });
    return { status: 'ok', swipe: { id: created.id, pointsAwarded: null } };
  }

  // Tekillik `(müşteri, ürün, bağlam)` üzerinde: aynı ürüne ikinci oy YENİ satır açmaz, fikrini
  // günceller — aynı kişinin iki kaydırması aday panosunu iki kez etkileyemez.
  const existing = await service.findByCustomerProduct(input.customerId, input.productId, 'candidate');
  const saved = existing
    ? // Süre VERİLMEDİYSE dokunulmaz (`?? null` yazsaydık ikinci oy önceki ölçümü SİLERDİ ve
      // panonun güven kolonu sessizce nötre düşerdi — web `upsertFeedback`in aynı kısmi güncelleme
      // kuralı: "verilmeyen alan silinmez").
      await service.update({ id: existing.id, vote: input.vote, ...(input.dwellMs != null ? { dwellMs: input.dwellMs } : {}) })
    : await service.insert({
        productId: input.productId,
        customerId: input.customerId,
        context: 'candidate',
        vote: input.vote,
        dwellMs: input.dwellMs ?? null,
        status,
      });

  // İkinci oyda puan İKİNCİ KEZ verilmez: defterdeki tekillik `(müşteri, sebep, kaynak)` üzerinde
  // ve satır aynı satır (DOMAIN §14: "aynı ürüne swipe BİR KEZ puan verir").
  const entry = await awardFeedbackPoints(db, saved);
  return { status: 'ok', swipe: { id: null, pointsAwarded: entry?.points ?? 0 } };
}

/**
 * Ziyaretçi turunun hesaba bağlanmasının sonucu.
 */
export interface DiscoverClaimResult {
  /** Hesaba bağlanan kaydırma sayısı — ekranın "N kaydırma hesabınıza işlendi" cümlesi. */
  linked: number;
  /** Gerçekten YAZILAN puan; tavana takılan ya da zaten ödenmiş olan buraya girmez. */
  points: number;
}

/**
 * **Turun HESABA BAĞLANMASI** — ziyaretçinin kaydırmaları, sonradan açtığı hesaba puan olarak
 * yazılır (kullanıcı kararı 03.08). Böylece hem veri hem müşteri kazanılıyor: kaydırmalar boşa
 * gitmiyor ve giriş daveti, değerin gösterildiği anda geliyor.
 *
 * ── SAHİPLİK İSTEMCİDEN GELİR AMA DOĞRULANIR ────────────────────────────────
 * Cihaz kendi satır kimliklerini saklıyor (uuid; tahmin edilemez). Yine de her satır burada üç
 * kapıdan geçer: **kimliksiz olmalı** (başkasının kaydını devralmak yok), **`candidate` bağlamında
 * olmalı** (alım-sonrası anket bu yoldan puan alamaz) ve **oy taşımalı**. Kimliksizlik şartı yalnız
 * güvenlik değil, ikinci kez ödemeyi de imkânsız kılıyor: bir kez bağlanan satır artık kimliksiz
 * değildir.
 *
 * ── TEKRAR TEKRAR PUAN KAPALI ───────────────────────────────────────────────
 * Girişli müşteride tekilliği upsert sağlıyor; ziyaretçide kimlik olmadığı için her kaydırma YENİ
 * satır açıyor. Bu yüzden bağlama **ürün başına** yapılır, satır başına değil: aynı ürünün birden
 * çok kaydırmasından yalnız EN YENİSİ bağlanır ve müşterinin o ürüne ait bir `candidate` kaydı
 * ZATEN varsa hiç bağlanmaz. İkincisi turu tekrarlayarak puan biriktirme yolunu kapatıyor.
 *
 * Üstüne mevcut korumalar duruyor ve burada YENİDEN YAZILMADI: günlük tavan ve B2C sınırı
 * `awardPoints` içinde, defterin tekilliği veritabanı indeksinde.
 *
 * ── BAĞLANMAYAN SATIRLAR SİLİNMEZ ───────────────────────────────────────────
 * Aynı ürünün fazla kaydırmaları kimliksiz kalır; aday panosunda tek kişinin tekrarları hâlâ birden
 * çok sayılır. Bu bugün de böyle (ziyaretçi kaydırması hiç tekilleştirilmiyordu), yeni bir açık
 * değil — geri bildirim satırı silmek/birleştirmek yazma katmanının sahibinin kararı
 * (`docs/talep/not-arka-uc-kesif-mukerrer-kaydirma.md`).
 */
export async function claimDiscoverSwipes(
  db: SupabaseClient,
  customerId: string,
  swipeIds: readonly string[],
): Promise<DiscoverClaimResult> {
  if (swipeIds.length === 0) return { linked: 0, points: 0 };

  const feedback = new ProductFeedbackService(db);
  const rows = await feedback.listByIds(swipeIds);

  const claimable = rows.filter((r) => r.customerId === null && r.context === 'candidate' && r.vote !== null);
  if (claimable.length === 0) return { linked: 0, points: 0 };

  // Müşterinin o ürüne ait kaydı zaten varsa ürün kapalıdır — hem bu turdan hem önceki turlardan.
  const already = new Set(
    (await feedback.listByCustomer(customerId)).filter((r) => r.context === 'candidate').map((r) => r.productId),
  );

  let linked = 0;
  let points = 0;
  for (const row of newestPerProduct(claimable)) {
    if (already.has(row.productId)) continue;
    // Sıradaki turda aynı ürün ikinci kez bağlanmasın diye küme anında büyür.
    already.add(row.productId);

    const attached = await feedback.update({ id: row.id, customerId });
    linked += 1;
    // Puan yazılmayabilir (günlük tavan, B2B, sıfır değerli aksiyon) — bağlama yine de geçerlidir:
    // sinyalin sahibi belli oldu, ödül ayrı bir sorudur.
    const entry = await awardFeedbackPoints(db, attached);
    points += entry?.points ?? 0;
  }

  return { linked, points };
}

/**
 * Ürün başına EN YENİ kaydırma — müşterinin son fikri neyse o.
 *
 * İlkini almak da bir seçenekti; sonuncusu seçildi çünkü girişli akışta upsert de aynısını yapıyor
 * (son oy öncekini eziyor). İki yolun aynı davranması, "ziyaretçiyken başka, girişliyken başka"
 * diyen bir fark bırakmıyor.
 */
function newestPerProduct(rows: readonly ProductFeedback[]): ProductFeedback[] {
  const byProduct = new Map<string, ProductFeedback>();
  for (const row of rows) {
    const current = byProduct.get(row.productId);
    if (!current || row.createdAt > current.createdAt) byProduct.set(row.productId, row);
  }
  return [...byProduct.values()];
}
