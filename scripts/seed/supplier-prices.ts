import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * TEDARİKÇİ FİYAT BELGESİ — üç bölümün ortak okuduğu tek kaynak (19.08).
 *
 * `data/sources/prices-supplier-2025-12.json` iki gerçek belgeyi taşıyor: LEZZA FOODS BV'nin
 * 22.12.2025 tarihli fiyat teklifi (34 SKU alış) ve kendi toptan satış listemiz (6 emin eşleşme).
 *
 * **Neden ayrı bir modül:** üç bölüm birden aynı listeye bakıyor ve üçü de aynı soruyu soruyor —
 * *"bu varyantın gerçek alış fiyatı var mı?"*
 *   · `pricing.ts`      → fiyatı ondan türetiyor
 *   · `catalog-lezza.ts`→ ürünün ADAY mı AKTİF mi doğacağına onunla karar veriyor
 *   · `stock.ts`        → hangi ürünün gerçekten stoklanacağını ondan biliyor
 * Üçü kendi kopyasını okusaydı, bir gün biri güncellenip ötekiler unutulurdu ve ortaya alış fiyatı
 * olan ama aday doğan (ya da tersi) bir ürün çıkardı. Modülün hiç importu yok — kimseyle çevrim
 * kurmaz, herkes güvenle içeri alabilir.
 */
export interface TedarikciFiyatlari {
  purchase: Record<string, { unitHt: number; boxHt: number; unitsPerBox: number; boxesPerPallet: number }>;
  salesB2bHt: Record<string, { unitHt: number; from: string }>;
}

const KAYNAK = join(dirname(fileURLToPath(import.meta.url)), 'data/sources/prices-supplier-2025-12.json');
const KATALOG = join(dirname(fileURLToPath(import.meta.url)), 'data/lezza-catalog.json');

let onbellek: TedarikciFiyatlari | null = null;

export function tedarikciFiyatlari(): TedarikciFiyatlari {
  onbellek ??= JSON.parse(readFileSync(KAYNAK, 'utf8')) as TedarikciFiyatlari;
  return onbellek;
}

/**
 * GERÇEK alış fiyatı olan SKU'lar. **Fonksiyon, sabit değil** — modül yüklenme sırasına bağlı bir
 * TDZ tuzağı bırakmamak için (`kurguReferanslari` ile aynı gerekçe).
 */
export function teklifSkulari(): ReadonlySet<string> {
  return new Set(Object.keys(tedarikciFiyatlari().purchase));
}

/**
 * TAHMİNİ maliyet (€/kg) — teklifte OLMAYAN varyantlar için, kendi KATEGORİSİNİN medyanından.
 *
 * ── NEDEN GEREKTİ (ölçüldü 19.08, `db:refresh` sonrası) ──────────────────────────────────────
 * Teklif 34 SKU taşıyor, katalog 175 varyant. Kalanın fiyatı uydurma bir formülden geliyordu
 * (`kg × 14,50 € + 1,20 €`) ve o formül gerçek fiyatların YANINDA dururken bariz yanlış görünüyordu:
 * sabit 1,20 €'luk paketleme payı küçük boyda oranı patlatıyor (70 g'da 31,7 €/kg'a çıkıyor).
 *
 * Ölçülen çelişki: **aynı dondurmanın sade dilimi 0,98 €, kakaolu dilimi 1,95 €** — tek fark
 * birinin teklifte olması. Kakaolu 250 g'lık kutu ise 19,32 €/kg'a düşüyordu, oysa `anadoludanikram`
 * ve `gurmeavrupa` 500 g'ı 12,00 €/kg'a satıyor.
 *
 * Çözüm ayrı bir formül DEĞİL, aynı eğriye gerçekçi bir girdi: kategorinin teklifte ölçülen medyan
 * kilo maliyeti. Böylece fikstür fiyatı gerçek fiyatla aynı dünyada durur — cheesecake dilimi bütün
 * cheesecake'in, 160 g simit 135 g simidin yanına oturur. Ölçülen medyanlar (€/kg): bakery 2,75 ·
 * anatolian 5,68 · ice-cream 7,78 · cake 8,91 · dessert 13,75 · genel 6,00.
 *
 * **Tahmin olduğu KAYBOLMUYOR:** çağıran `gercek` bayrağını ayrı tutuyor — `base` katmanı yalnız
 * gerçek maliyetliyi yazıyor, b2b seyreltmesi de yalnız tahminliye uygulanıyor.
 */
export function tahminiKiloMaliyeti(): Map<string, number> {
  const { purchase } = tedarikciFiyatlari();
  const katalog = JSON.parse(readFileSync(KATALOG, 'utf8')) as {
    products: Array<{ category: string; variants: Array<{ sku?: string | null; netWeightG?: number | null }> }>;
  };
  const kategoriler = new Map<string, number[]>();
  const hepsi: number[] = [];
  for (const p of katalog.products) {
    for (const v of p.variants) {
      const alis = v.sku ? purchase[String(v.sku)]?.unitHt : undefined;
      if (alis === undefined || !v.netWeightG) continue;
      const kg = alis / (v.netWeightG / 1000);
      kategoriler.set(p.category, [...(kategoriler.get(p.category) ?? []), kg]);
      hepsi.push(kg);
    }
  }
  const medyan = (x: number[]): number => {
    const d = [...x].sort((a, b) => a - b);
    const o = Math.floor(d.length / 2);
    return d.length % 2 ? d[o]! : (d[o - 1]! + d[o]!) / 2;
  };
  // Kategorisi teklifte hiç geçmeyen ürün genel medyana düşer — uydurma bir sabite değil, yine ölçüme.
  const genel = hepsi.length > 0 ? medyan(hepsi) : 6;
  const kategoriMedyan = new Map([...kategoriler].map(([k, v]) => [k, medyan(v)]));
  const harita = new Map<string, number>();
  for (const p of katalog.products) {
    for (const v of p.variants) if (v.sku) harita.set(String(v.sku), kategoriMedyan.get(p.category) ?? genel);
  }
  return harita;
}
