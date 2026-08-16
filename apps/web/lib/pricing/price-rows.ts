import { costOf, isBelowTargetMargin, revenueHtOf, targetMarginFor, tightestMargin, type CostBasis } from '@lezzet/domain-core';
import { publicImageUrl } from '@lezzet/storage';
import { resolveLocalizedText, type Channel, type Price, type ProductPriceRow, type ProductStatus } from '@lezzet/types';
import { titleOf } from '@/lib/catalog/title';

// FİYAT SATIRI KURULUMU — iki yüzeyin ortak indirgemesi (16.08): fiyat ekranı (liste + sonraki
// sayfalar) ve ürünler önizlemesinin fiyat bakışı diyaloğu. Sayfa klasöründen (`prices/prices-read`)
// buraya taşındı çünkü ikinci tüketen doğdu ve kardeş sayfadan yalnız `*-url` import edilir
// (STACK §7) — kopyalamak, marj tanımının iki yerde yaşaması demekti.
//
// KARARLAR BURADA SORULUR, BURADA VERİLMEZ: marj tanımı ve marj-altı ölçütü `domain-core/pricing`'in
// işidir (STACK §4). Bu dosya yalnız veriyi motorun istediği tabana çevirir — ve çevirinin kendisi
// kritiktir: b2c fiyatı KDV DAHİL, b2b hariç, maliyet hariç. Tabanı karıştırmak marjı KDV oranı
// kadar şişirir ve zararına satışı kârlı gösterir.

export interface ChannelPriceCell {
  amountCents: number | null;
  /** Fiyatın geçerlilik başlangıcı — "ne zamandan beri bu fiyat" sorusu ekranda yanıtlanabilsin. */
  validFrom: string | null;
}

/**
 * Fiyat listesinin satırı — satır BOYDUR (satılabilir birim), ama kararın yarısı üründen gelir
 * (KDV oranı, hedef marj, otomatik fiyat anahtarı).
 */
export interface PriceRow {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  /** Listede görünen tam ad — "Fıstıklı Baklava · 1 kg". */
  title: string;
  /** Ürün görseli (public URL) — satır başındaki küçük görsel; yoksa placeholder ikon (`Thumbnail`). */
  imageUrl: string | null;
  categoryName: string;
  status: ProductStatus;
  /** Boy satışa kapalıysa fiyatı yine görünür; ekran sebebi söyler. */
  variantActive: boolean;
  b2c: ChannelPriceCell;
  b2b: ChannelPriceCell;
  /**
   * Yenileme maliyeti: SON alış fiyatı (KDV hariç) — "bunu yeniden almak kaça". `null` = hiç alış yok —
   * "bilmiyorum", sıfır değil: maliyeti sıfır saymak marjı sonsuz gösterirdi.
   */
  costCents: number | null;
  /** Kanallar içindeki EN DAR marj — uyarının ölçütü (bkz. `tightestMargin`). */
  marginPercent: number | null;
  /** Dar marjın hangi kanaldan geldiği — tek sayının hangi fiyata ait olduğu görünsün. */
  marginChannel: Channel | null;
  targetMarginPercent: number | null;
  /** B2B'ye özel hedef (15.08); `null` = ortak hedef B2B'de de geçerli (`targetMarginFor`). */
  targetMarginB2bPercent: number | null;
  /**
   * HERHANGİ bir kanal KENDİ hedefinin altında mı; hiçbir kanal için karar verilemiyorsa `null`.
   * Kanal başına hedefle (15.08) tek soruya indirgenemezdi: uyarının işi riski göstermek.
   */
  belowTarget: boolean | null;
  autoPrice: boolean;
  /**
   * Son alış geçmişten belirgin saptıysa dolu — otomatik fiyat bu satırda BEKLER, karar admin'in.
   * `null` = taban güvenilir (ya da hiç maliyet yok; onu `costCents` söyler).
   */
  costJump: { medianCents: number; deviationPercent: number } | null;
  /** Ürünün KDV oranı (yüzde) — diyalog marjı bu tabana göre çevirir. */
  vatRate: number;
  /** En az bir kanalda fiyat yok — "o kanalda satışa kapalı" göstergesi. */
  missingPrice: boolean;
}

/** İki kanalın "şu an geçerli" fiyat satırları, varyant kimliğine göre. */
export interface ChannelPriceMaps {
  b2c: Map<string, Price>;
  b2b: Map<string, Price>;
}

const cellOf = (price: Price | undefined): ChannelPriceCell =>
  price ? { amountCents: price.amountCents, validFrom: price.validFrom } : { amountCents: null, validFrom: null };

/** İki kanalın çözüm haritasını satır haritasına indirger — özel fiyat burada aranmaz (kanal listesi). */
export function toChannelMaps(
  b2c: Map<string, { channelPrice: Price | null }>,
  b2b: Map<string, { channelPrice: Price | null }>,
): ChannelPriceMaps {
  const pick = (map: Map<string, { channelPrice: Price | null }>): Map<string, Price> =>
    new Map([...map].flatMap(([id, { channelPrice }]) => (channelPrice ? [[id, channelPrice] as const] : [])));
  return { b2c: pick(b2c), b2b: pick(b2b) };
}

interface PriceRowInput {
  products: ProductPriceRow[];
  prices: ChannelPriceMaps;
  /**
   * Varyant başına maliyet TABANI (kuruş) — yenileme maliyeti + aykırı freni (`readCostBasis`).
   * Otomatik fiyatın kullandığı tabanın AYNISI: ayrılsalardı ekran, sistemin kendi yazdığı fiyatı
   * "marj-altı" diye işaretleyebilirdi.
   */
  costs: Map<string, CostBasis>;
  categoryNames: Map<string, string>;
}

/**
 * Ürün sayfasını fiyat SATIRLARINA açar: bir ürün, boyları kadar satır üretir.
 *
 * Pasif boy de listelenir ve bu bilinçli: fiyatı olan ama satışa kapalı bir boy, "neden satılmıyor"
 * sorusunun cevabıdır — gizlemek soruyu görünmez kılardı.
 */
export function toPriceRows({ products, prices, costs, categoryNames }: PriceRowInput): PriceRow[] {
  return products.flatMap((product) => {
    const productName = resolveLocalizedText(product.name);
    const categoryName = product.categoryId ? (categoryNames.get(product.categoryId) ?? '') : '';

    // Boy sırası SABİT: gömülü seçim sırayı garanti etmez, aynı ürünün boyları iki yenilemede yer
    // değiştirirse fiyat karşılaştırması yapılamaz.
    const variants = [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder);

    return variants.map((variant): PriceRow => {
      const b2c = cellOf(prices.b2c.get(variant.id));
      const b2b = cellOf(prices.b2b.get(variant.id));
      const basis = costs.get(variant.id);
      const costCents = basis ? costOf(basis) : null;

      // Marj her kanal için ayrı çıkar; ekran TEK sayı gösterir → en darı (bkz. `tightestMargin`).
      const entries: Array<{ channel: Channel; revenueHtCents: number }> = [];
      if (b2c.amountCents !== null) entries.push({ channel: 'b2c', revenueHtCents: revenueHtOf('b2c', b2c.amountCents, product.vatRate) });
      if (b2b.amountCents !== null) entries.push({ channel: 'b2b', revenueHtCents: revenueHtOf('b2b', b2b.amountCents, product.vatRate) });

      const tightest = tightestMargin(entries, costCents);

      // Marj-altı kararı KANAL BAŞINA (15.08): her kanal KENDİ hedefine kıyaslanır (B2B'ye özel
      // hedef varsa o). Uyarı herhangi bir kanal hedef altındaysa yanar — en dar marjı tek ortak
      // hedefe kıyaslamak, B2B hedefi ayrışınca yanlış kanalı suçlardı.
      const channelVerdicts = entries.map((e) =>
        isBelowTargetMargin(
          e.revenueHtCents,
          costCents,
          targetMarginFor(e.channel, product.targetMarginPercent, product.targetMarginB2bPercent),
        ),
      );
      const decided = channelVerdicts.filter((v): v is boolean => v !== null);

      return {
        variantId: variant.id,
        productId: product.id,
        productName,
        variantLabel: resolveLocalizedText(variant.label),
        title: titleOf(productName, resolveLocalizedText(variant.label)),
        // Görsel ÜRÜNÜN — aynı ürünün boyları aynı görseli taşır (products-read ile aynı türetme).
        imageUrl: publicImageUrl(product.imageKey, product.imageUpdatedAt),
        categoryName,
        status: product.status,
        variantActive: variant.isActive,
        b2c,
        b2b,
        costCents,
        marginPercent: tightest?.percent ?? null,
        marginChannel: (tightest?.channel as Channel | undefined) ?? null,
        targetMarginPercent: product.targetMarginPercent,
        targetMarginB2bPercent: product.targetMarginB2bPercent,
        belowTarget: decided.length === 0 ? null : decided.some(Boolean),
        autoPrice: product.autoPrice,
        // Maliyet sıçraması satırla birlikte taşınır: otomatik fiyatın neden beklediğini ekran
        // ancak bu bilgiyle söyleyebilir (sessiz duran otomatik, bozuk otomatiktir).
        costJump:
          basis?.status === 'outlier'
            ? { medianCents: basis.medianCents, deviationPercent: Math.round(basis.deviationPercent) }
            : null,
        vatRate: product.vatRate,
        missingPrice: b2c.amountCents === null || b2b.amountCents === null,
      };
    });
  });
}
