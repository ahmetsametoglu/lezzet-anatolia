import { DiscountService, type Db } from '@lezzet/database';
import type { Discount, LocalizedText } from '@lezzet/types';

/*
  KAPSAM KAMPANYASININ TEK KAPISI (08.44) — "bu kategoride / bu koleksiyonda açık bir kampanya var mı".

  ── NEDEN VAR ───────────────────────────────────────────────────────────────
  Otomatik kampanya bugün YALNIZ sepette görünüyor: motor onu `resolveCartDiscount` içinde
  hesaplıyor, müşteri de ancak sepete gelince öğreniyor. Oysa kategori ve koleksiyon kapsamlı
  kampanya ürüne atfedilebilir bir gerçektir — *Baklava haftası %15* açıkken vitrindeki baklava
  bandının bunu söylememesi, operatörün açtığı kampanyanın yarısını görünmez bırakıyor.

  ── NEDEN FİYAT DEĞİL, ROZET ────────────────────────────────────────────────
  Kampanya ürün FİYATINA yazılamaz ve gerekçesi ölçüldü (`08.44` görev satırı): `applyBestDiscount`
  kazananı TÜM SEPET üzerinden tek-en-büyük seçer ve kalemlere oransal dağıtır. 20 € baklava
  (kategori %15 → 3,00 €) + 40 € başka ürün sepetinde sepet kampanyası (%8 → 4,80 €) kazanır ve
  baklava kalemine düşen pay %8 olur — kartta vaat edilen %15 değil. Sepetten BAĞIMSIZ olmayan bir
  indirim, birim fiyat olarak vaat edilemez. Bu kapı bu yüzden **tutar değil, kampanyanın kendisini**
  döndürür; yüzey onu bir rozet ya da cümle olarak söyler, fiyatı değiştirmez.

  ── KİMLER DIŞARIDA VE NEDEN ────────────────────────────────────────────────
  · **Kupon** — kodu olmayan müşteriye kampanya diye duyurulamaz.
  · **Sepet kapsamı** — ürüne atfedilemez; onun yeri sepet (`08.43`'ün "elinin altındaki" cümlesi).
  · **Kişiye özel kampanya** (`customerId` dolu) — vitrin herkesin gördüğü yüzey; bir kişinin
    kampanyasını oraya yazmak hem yanlış vaat hem de o kişinin kaydını ifşadır.
  · **İlk siparişe bağlı** (`firstOrderOnly`) — vitrinde kimin ilk siparişte olduğu bilinmiyor.
  · **Tarih penceresi dışı / pasif** — zaten yürürlükte değil.

  **Eşikli kampanya DIŞARIDA DEĞİL:** `minBasketCents` taşınır ve yüzey isterse cümleye koyar
  (*"60 € üzeri sepette %15"*). Eşiği olan kampanyayı hiç göstermemek, düzelttiğimiz sessizliğin
  aynısını başka yerde açardı.
*/

export interface ScopeCampaign {
  /** Kampanyanın kimliği — yüzey aynı kampanyayı iki yerde anarken karşılaştırabilsin. */
  id: string;
  /** Müşteriye görünen ad; `null` = operatör yazmamış, yüzey adsız konuşur (MB-22a). */
  label: LocalizedText | null;
  type: 'percent' | 'fixed';
  /** `type === 'percent'` ise dolu (15 = %15), değilse `null`. */
  percent: number | null;
  /** `type === 'fixed'` ise dolu (cent), değilse `null`. */
  amountCents: number | null;
  /** Eşik (cent) — `null` = koşulsuz, kampanya her sepette geçerli. */
  minBasketCents: number | null;
}

export interface ScopeCampaigns {
  byCategory: Map<string, ScopeCampaign>;
  byCollection: Map<string, ScopeCampaign>;
}

export const EMPTY_SCOPE_CAMPAIGNS: ScopeCampaigns = { byCategory: new Map(), byCollection: new Map() };

/**
 * Verilen kategori/koleksiyon kimlikleri için yürürlükteki kampanyalar.
 *
 * **Tek okuma, kimlik başına sorgu YOK:** `listCandidates` aktif kuralların tamamını getiriyor
 * (tablo operatörün elle kurduğu, doğal tavanı olan bir küme — `CLAUDE §1`'in "sayfalama ölçütü"
 * ayrımında sınırsız büyüyen tarafta değil), süzme bellekte yapılıyor. Kimlik listesi boşsa hiç
 * sorgu atılmaz.
 *
 * **Aynı hedefe birden çok kampanya uyarsa:** önce KOŞULSUZ olan kazanır (müşteriye şartsız
 * söylenebilen tek şey odur), eşitlikte daha yeni kural. Tutarları karşılaştırmak mümkün değil —
 * yüzde ile sabit tutar ancak bir sepet varken kıyaslanır, burada sepet yok.
 */
export async function readScopeCampaigns(
  db: Db,
  opts: { categoryIds?: readonly string[]; collectionIds?: readonly string[]; now?: Date },
): Promise<ScopeCampaigns> {
  const categoryIds = new Set(opts.categoryIds ?? []);
  const collectionIds = new Set(opts.collectionIds ?? []);
  if (categoryIds.size === 0 && collectionIds.size === 0) return EMPTY_SCOPE_CAMPAIGNS;

  const now = opts.now ?? new Date();
  const rows = await new DiscountService(db).listCandidates(null);

  const byCategory = new Map<string, ScopeCampaign>();
  const byCollection = new Map<string, ScopeCampaign>();
  for (const row of rows) {
    if (!announceable(row, now)) continue;
    if (row.scope === 'category' && row.categoryId && categoryIds.has(row.categoryId)) {
      put(byCategory, row.categoryId, row);
    } else if (row.scope === 'collection' && row.collectionId && collectionIds.has(row.collectionId)) {
      put(byCollection, row.collectionId, row);
    }
  }
  return { byCategory, byCollection };
}

/** Vitrinde duyurulabilir mi — künyedeki "kimler dışarıda" listesinin kod hâli. */
function announceable(row: Discount, now: Date): boolean {
  if (row.trigger !== 'automatic') return false;
  if (!row.isActive) return false;
  if (row.customerId !== null) return false;
  if (row.firstOrderOnly) return false;
  if (row.validFrom && new Date(row.validFrom) > now) return false;
  if (row.validTo && new Date(row.validTo) < now) return false;
  // Değeri olmayan kural duyurulmaz: "%0 indirim" diye bir şey yoktur (motorun aynı korunması).
  return row.type === 'percent' ? row.percent != null : row.amountCents != null;
}

function put(target: Map<string, ScopeCampaign>, key: string, row: Discount): void {
  const next = toCampaign(row);
  const current = target.get(key);
  if (current === undefined || (current.minBasketCents !== null && next.minBasketCents === null)) {
    target.set(key, next);
  }
}

function toCampaign(row: Discount): ScopeCampaign {
  return {
    id: row.id,
    label: labelOf(row),
    type: row.type,
    percent: row.type === 'percent' ? row.percent : null,
    amountCents: row.type === 'fixed' ? row.amountCents : null,
    minBasketCents: row.minBasketCents,
  };
}

/**
 * Müşteriye görünen ad — boş dilleri olan nesne (`{tr:''}`) form artığıdır, ad değildir.
 * Sepetteki `publicLabelOf` ile AYNI kural; ikisi ayrışırsa aynı kampanya iki yerde iki türlü anılır.
 */
function labelOf(row: Discount): LocalizedText | null {
  const label = row.publicLabel;
  if (!label) return null;
  return label.tr?.trim() || label.fr?.trim() || label.de?.trim() ? label : null;
}
