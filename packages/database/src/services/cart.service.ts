import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CartSchema,
  CartInsertSchema,
  CartUpdateSchema,
  type Cart,
  type CartInsert,
  type CartItem,
  type CartUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/**
 * Sunucu sepeti (07.1) — DOMAIN §4, §5.
 *
 * Müşteri başına TEK satır; anahtar `customerId` (bu yüzden `id` tabanlı miras metodlar —
 * `getById`/`update`/`delete` — kullanılmaz, yerlerine buradaki uçlar vardır).
 *
 * **Sepetteki fiyat bağlayıcı değildir** (DOMAIN §5): gösterim ve değişiklik tespiti içindir;
 * bağlayıcı fiyat checkout başlangıcında çözülür (stok + ödeme ile aynı pencerede). Servis fiyatı
 * ZATEN çözmez — hangi fiyatın geçerli olduğu motorun kararıdır (`domain-core/pricing.resolvePrice`),
 * çağıran çözüp buraya değerle gelir.
 *
 * **Sepette stok ayrılmaz** (DOMAIN §4): rezervasyon checkout başlarken yapılır. Sepet niyet kaydıdır.
 */
export class CartService extends BaseDbService<Cart, CartInsert, CartUpdate> {
  constructor(supabase: SupabaseClient) {
    super(supabase, 'cart', CartSchema, CartInsertSchema, CartUpdateSchema);
  }

  /** Müşterinin sepeti; hiç açılmamışsa boş sepet döner — çağıranın `null` kontrolü gerekmez. */
  async get(customerId: string): Promise<Cart> {
    const cart = await this.getOneBy({ customerId });
    return cart ?? { customerId, items: [], savedItems: [], updatedAt: new Date().toISOString() };
  }

  /**
   * Kalem ekler. Aynı satır (varyant + parti) zaten varsa **adet birleşir**, ikinci satır açılmaz;
   * gösterilen fiyat İLK eklenişteki kalır (checkout zaten yeniden çözecek, gereksiz oynama yapmaz).
   */
  async addItem(customerId: string, item: Omit<CartItem, 'addedAt'>): Promise<Cart> {
    const { items } = await this.get(customerId);
    const index = items.findIndex((row) => sameLine(row, item));

    const next =
      index >= 0
        ? items.map((row, i) => (i === index ? { ...row, qty: row.qty + item.qty } : row))
        : [...items, { ...item, stockId: item.stockId ?? null, addedAt: new Date().toISOString() }];

    return this.write(customerId, next);
  }

  /** Adet belirler; **0 veya altı satırı siler** (arayüzde "−" ile sıfıra inmek çıkarmak demektir). */
  async setQty(customerId: string, variantId: string, qty: number, stockId: string | null = null): Promise<Cart> {
    const { items } = await this.get(customerId);
    const next =
      qty > 0
        ? items.map((row) => (sameLine(row, { variantId, stockId }) ? { ...row, qty } : row))
        : items.filter((row) => !sameLine(row, { variantId, stockId }));
    return this.write(customerId, next);
  }

  async removeItem(customerId: string, variantId: string, stockId: string | null = null): Promise<Cart> {
    return this.setQty(customerId, variantId, 0, stockId);
  }

  /**
   * Sepeti verilen listeye **eşitler** — ekleme, adet değişimi ve çıkarma tek yoldan geçer.
   *
   * Vitrin bunu kullanır: istemci zaten tam listeyi tutuyor (ziyaretçininki tarayıcıda), ayrı
   * `addItem`/`setQty`/`removeItem` çağırmak iki tarafın listesinin ayrışabildiği üç yol açardı.
   * Tek yönlü eşitleme o ayrışmayı imkânsız kılar.
   *
   * `addedAt` KORUNUR: satır zaten varsa ilk eklenme anı taşınır. Sepet kurtarma ("iki gündür
   * bekleyen sepet") bu zamana bakar; her adet değişiminde tazelenirse o sinyal ölür.
   */
  async replace(customerId: string, items: readonly Omit<CartItem, 'addedAt'>[]): Promise<Cart> {
    const { items: current } = await this.get(customerId);
    const next = items.map((item) => ({
      ...item,
      stockId: item.stockId ?? null,
      addedAt: current.find((row) => sameLine(row, item))?.addedAt ?? new Date().toISOString(),
    }));
    return this.write(customerId, next);
  }

  /** Sipariş kapandığında ya da müşteri boşalttığında — satır silinir, boş sepet satırı bırakılmaz. */
  async clear(customerId: string): Promise<void> {
    return this.deleteWhere({ customerId });
  }

  /**
   * **Anonim sepeti devralma** (07.1): misafir tarayıcıda sepet doldurup sonra giriş yapar.
   * Sunucudaki sepet KORUNUR, gelen kalemler üstüne eklenir — giriş, daha önce eklenmiş bir ürünü
   * sessizce kaybettirmemeli. Çakışan satırda adetler toplanır, fiyat sunucudaki (daha eski) kalır.
   */
  async takeOver(customerId: string, incoming: readonly Omit<CartItem, 'addedAt'>[]): Promise<Cart> {
    const { items } = await this.get(customerId);
    const merged = [...items];

    for (const item of incoming) {
      const index = merged.findIndex((row) => sameLine(row, item));
      if (index >= 0) merged[index] = { ...merged[index]!, qty: merged[index]!.qty + item.qty };
      else merged.push({ ...item, stockId: item.stockId ?? null, addedAt: new Date().toISOString() });
    }
    return this.write(customerId, merged);
  }

  /**
   * Sonraya kaydedilenleri (K35) verilen listeye EŞİTLER. Sepetle aynı desen: istemci tam listeyi
   * tutar, tek yönlü eşitleme iki tarafın ayrışmasını imkânsız kılar.
   */
  async replaceSaved(customerId: string, saved: readonly Omit<CartItem, 'addedAt'>[]): Promise<Cart> {
    const cart = await this.get(customerId);
    const next = saved.map((item) => ({
      ...item,
      stockId: item.stockId ?? null,
      // `addedAt` KORUNUR: kalem sepetten buraya taşınırken ilk eklenme anı da taşınır — "iki
      // haftadır bekliyor" bilgisi sepet ile liste arasında gidip gelirken sıfırlanmamalı.
      addedAt: [...cart.items, ...cart.savedItems].find((row) => sameLine(row, item))?.addedAt ?? new Date().toISOString(),
    }));
    return this.write(customerId, cart.items, next);
  }

  /**
   * Tek yazma yolu — `updatedAt` her dokunuşta tazelenir (sepet kurtarma zamanlaması buna bakar).
   *
   * İki liste birlikte yazılır: `saved` verilmezse MEVCUDU korunur. Verilmediğinde boş dizi
   * yazılsaydı, sepete bir kalem eklemek sonraya kaydedilenleri sessizce silerdi.
   */
  private async write(customerId: string, items: CartItem[], saved?: CartItem[]): Promise<Cart> {
    const savedItems = saved ?? (await this.get(customerId)).savedItems;
    return this.upsert({ customerId, items, savedItems, updatedAt: new Date().toISOString() } as CartInsert, 'customer_id');
  }
}

/**
 * Aynı sepet satırı mı?
 *   varyant satırı → varyant VE parti eşleşmeli; teklif satırı normal satırdan ayrı yaşar (DOMAIN §5).
 *   paket satırı   → paketin kimliği yeter; paketin partisi ya da varyantı yoktur (DOMAIN §13).
 * İki tür asla eşleşmez: biri paket, öbürü varyantsa aynı satır değildir.
 */
type LineKey = { variantId?: string | null; bundleId?: string | null; stockId?: string | null };

function sameLine(a: LineKey, b: LineKey): boolean {
  if (a.bundleId || b.bundleId) return (a.bundleId ?? null) === (b.bundleId ?? null);
  return (a.variantId ?? null) === (b.variantId ?? null) && (a.stockId ?? null) === (b.stockId ?? null);
}
