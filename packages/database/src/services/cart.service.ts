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
    return cart ?? { customerId, items: [], updatedAt: new Date().toISOString() };
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

  /** Tek yazma yolu — `updatedAt` her dokunuşta tazelenir (sepet kurtarma zamanlaması buna bakar). */
  private write(customerId: string, items: CartItem[]): Promise<Cart> {
    return this.upsert({ customerId, items, updatedAt: new Date().toISOString() } as CartInsert, 'customer_id');
  }
}

/** Aynı sepet satırı mı: varyant VE parti eşleşmeli — teklif satırı normal satırdan ayrı yaşar. */
function sameLine(a: { variantId: string; stockId?: string | null }, b: { variantId: string; stockId?: string | null }): boolean {
  return a.variantId === b.variantId && (a.stockId ?? null) === (b.stockId ?? null);
}
