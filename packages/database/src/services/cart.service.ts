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
import { BundleService } from './bundle.service';
import { ProductVariantService } from './product-variant.service';

/**
 * **Sepetin sahibi** — müşteri YA DA sohbet (15.22 · kullanıcı kararı 07.09).
 *
 * Müşteri sepeti bugüne kadarki tek hâldi ve bütün kapılar (`get`, `addItems`, `setQty`…) onu
 * `customerId` ile anmaya devam ediyor — web ve mobil o imzaları çağırıyor, değişmediler. Sohbet
 * sepeti (Messenger/IG'de ajanın kurduğu, kimliksiz sohbetin sepeti) aynı kuralların `*For`
 * ekleriyle anılan hâli: gövde ortak, yalnız satırı bulan anahtar farklı. İkinci bir servis
 * yazılsaydı satır birleştirme kuralı iki yerde yaşar ve bir gün ayrışırdı.
 */
export type CartOwner = { customerId: string; conversationId?: never } | { conversationId: string; customerId?: never };

/**
 * Sunucu sepeti (07.1) — DOMAIN §4, §5.
 *
 * Sahip başına TEK satır; anahtar `customerId` ya da `conversationId` (`unique` kolonlar; bu yüzden
 * `id` tabanlı miras metodlar — `getById`/`update`/`delete` — kullanılmaz, yerlerine buradaki uçlar
 * vardır).
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
  get(customerId: string): Promise<Cart> {
    return this.getFor({ customerId });
  }

  /** Sahibin sepeti (müşteri ya da sohbet); hiç açılmamışsa boş sepet — `id` o hâlde boş dizedir. */
  async getFor(owner: CartOwner): Promise<Cart> {
    const cart = await this.getOneBy(owner);
    return (
      cart ?? {
        id: '',
        customerId: owner.customerId ?? null,
        conversationId: owner.conversationId ?? null,
        sourceConversationId: null,
        items: [],
        savedItems: [],
        updatedAt: new Date().toISOString(),
      }
    );
  }

  /**
   * **Sepete dokunan sohbetin izi** (15.23) — sahiplik değil, damga.
   *
   * Ajan müşterinin sepetine yazdığında ya da bağlantı devralınıp kalemler taşındığında çağrılır;
   * checkout `order_source`u bu sohbetin kanalından yazar (`checkout-draft.ts`). Son dokunan sohbet
   * kazanır: iki sohbet aynı sepete dokunduysa sipariş sonuncusunun kanalını taşır — iki kanal
   * yazmanın yolu yok, tek kolon tek cevap.
   *
   * `upsert` yalnız gönderilen kolonları günceller: kalemlere dokunmaz; sepet satırı henüz yoksa
   * boş kalemle doğar (yazma yolu birazdan zaten dolduracak). Sepet boşalınca (`clear`) satırla
   * birlikte gider — iz ayrıca silinmez, silinmesi gereken bir şey kalmaz.
   */
  stampChat(owner: CartOwner, conversationId: string): Promise<Cart> {
    const onConflict = owner.customerId ? 'customer_id' : 'conversation_id';
    return this.upsert({ ...owner, sourceConversationId: conversationId, updatedAt: new Date().toISOString() }, onConflict);
  }

  /**
   * Kalem ekler. Aynı satır (varyant + parti) zaten varsa **adet birleşir**, ikinci satır açılmaz;
   * gösterilen fiyat İLK eklenişteki kalır (checkout zaten yeniden çözecek, gereksiz oynama yapmaz).
   *
   * Tek kalem, TEK ELEMANLI LİSTEDİR — kural `addItems`te (gerekçesi orada).
   */
  addItem(customerId: string, item: Omit<CartItem, 'addedAt'>): Promise<Cart> {
    return this.addItems(customerId, [item]);
  }

  /**
   * Kalemleri ekler — **TEK okuma, TEK yazma.** Çakışan satırda adetler toplanır, yeni satır sona
   * eklenir; fiyat sunucudaki (daha eski) kalır.
   *
   * ── NEDEN TOPLU BİR METOT VAR (ölçüldü 09.08) ────────────────────────────────
   * Sepet TEK SATIRDA yaşıyor (`cart.items` jsonb). Her ekleme sepeti okur, üstüne ekler, geri
   * yazar — yani art arda değil EŞZAMANLI gelen iki ekleme aynı başlangıcı okur ve son yazan
   * ötekini siler (kayıp güncelleme). Tarif ekranının "Malzemeleri sepete ekle"si üç satırı üç ayrı
   * istekle gönderiyordu: sırayla 3 satır, eşzamanlı 1–2 satır — hangisinin kalacağı belirsiz.
   *
   * Çare "istekleri sıraya diz" DEĞİL: o kural her çağrı yerinde yeniden hatırlanmak zorunda
   * kalırdı ve unutulduğu gün sepet yine sessizce kalem düşürürdü. Bir kullanıcı eylemi tek yazma
   * turuna indiğinde yarışın kaynağı kalmıyor.
   *
   * **Kilit değil, kapsam kararı:** bu, aynı sepete iki AYRI cihazdan aynı anda yazmayı hâlâ
   * korumaz (o, satır düzeyinde kilit ya da veritabanı tarafında birleştirme ister). Kapatılan şey
   * TEK eylemin kendi içinde ürettiği yarıştı — bugünkü arıza buydu.
   */
  addItems(customerId: string, incoming: readonly Omit<CartItem, 'addedAt'>[]): Promise<Cart> {
    return this.addItemsFor({ customerId }, incoming);
  }

  /** `addItems`in sahip-bağımsız gövdesi — sohbet sepeti de buradan yazar (kural tek yerde). */
  async addItemsFor(owner: CartOwner, incoming: readonly Omit<CartItem, 'addedAt'>[]): Promise<Cart> {
    const { items } = await this.getFor(owner);
    const merged = [...items];

    for (const item of await this.existingOnly(incoming)) {
      const index = merged.findIndex((row) => sameLine(row, item));
      if (index >= 0) merged[index] = { ...merged[index]!, qty: merged[index]!.qty + item.qty };
      else merged.push({ ...item, stockId: item.stockId ?? null, addedAt: new Date().toISOString() });
    }
    return this.write(owner, merged);
  }

  /**
   * Adet belirler; **0 veya altı satırı siler** (arayüzde "−" ile sıfıra inmek çıkarmak demektir).
   *
   * SATIR ANAHTARLA ANILIR, varyantla değil (20.08). İmza eskiden `variantId` alıyordu ve bunun
   * ölçülmüş bir bedeli vardı: **paket satırı adreslenemiyordu.** Mobil yüzey paketi bu yüzden
   * sunucuya hiç yazmıyor, cihazda tutuyordu — ve sunucu görmediğini toplayamadığı için müşterinin
   * sepetinde 96,92 € dururken alttaki bar 14,85 € yazıyor, asgari sepet "22,54 € eksik" diyor ve
   * sipariş düğmesi kilitli kalıyordu (ölçüldü cihazda 20.08). `sameLine` paket dalını zaten
   * biliyordu; eksik olan tek şey anahtarın buraya kadar gelmesiydi.
   */
  setQty(customerId: string, ref: CartRef, qty: number): Promise<Cart> {
    return this.setQtyFor({ customerId }, ref, qty);
  }

  async setQtyFor(owner: CartOwner, ref: CartRef, qty: number): Promise<Cart> {
    const { items } = await this.getFor(owner);
    const next =
      qty > 0 ? items.map((row) => (sameLine(row, ref) ? { ...row, qty } : row)) : items.filter((row) => !sameLine(row, ref));
    return this.write(owner, next);
  }

  removeItem(customerId: string, ref: CartRef): Promise<Cart> {
    return this.setQty(customerId, ref, 0);
  }

  removeItemFor(owner: CartOwner, ref: CartRef): Promise<Cart> {
    return this.setQtyFor(owner, ref, 0);
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
    const owner: CartOwner = { customerId };
    const { items: current } = await this.getFor(owner);
    const next = items.map((item) => ({
      ...item,
      stockId: item.stockId ?? null,
      addedAt: current.find((row) => sameLine(row, item))?.addedAt ?? new Date().toISOString(),
    }));
    return this.write(owner, next);
  }

  /**
   * **VAR OLMAYAN KİMLİK SEPETE GİRMEZ** (ölçüldü 28.08).
   *
   * `cart.items` bir `jsonb` kolonudur, yani varyant ve paket kimliklerini koruyan bir yabancı
   * anahtar YOKTUR — kural veride duramıyor, burada durmak zorunda. Kapı yokken uydurma bir kimlik
   * `POST /me/cart/items` ile **200** alıyor ve sepete adsız · fiyatsız bir satır yazılıyordu:
   * sayaç onu sayıyor (`itemCount` 7), toplam saymıyor (43,93 €) — başlık ile para birbirini
   * yalanlıyordu. Sipariş yine de açılmıyordu (`blocked_lines`, motor sağlam), ama müşteri
   * çıkaramadığı bir satırla kilitli kalıyordu.
   *
   * Gerçek hayatta bu, kötü niyet değil ZAMAN farkıdır: cihazdaki sepet katalogdan eski kalır
   * (ürün satıştan kalkar, kimlik yenilenir) ve giriş anındaki devir onu sunucuya taşır.
   *
   * **REDDETMEZ, SÜZER.** `400` dönseydi meşru bir hâlde — kalemlerinden biri gerçekten silinmiş
   * bir sepet devrederken — müşteri sepetine HİÇBİR ŞEY ekleyemez olurdu; bir kalemin yokluğu
   * ötekileri de düşürürdü. "Olmayan şey sepete girmez" tek başına yeterli ve dürüst bir kural.
   *
   * İZ: süzülen satır ayrıca loglanmıyor, çünkü bu paket `@lezzet/observability`e bağlı değil ve
   * bağımlılık eklemek sepet yazmasının maliyetini bir teşhis satırı için artırırdı. Kaybı da yok:
   * süzülen satır zaten müşterinin göremediği, sunucunun çözemediği bir kimlik — teşhisi gereken
   * şey KİMİN gönderdiği değil, kimliğin neden bayatladığıdır ve o katalog tarafında görülür.
   *
   * TEK EK SORGU, tek turda (`listByIds`): kimlik başına sorgu açılmıyor. Boş listede hiç ağa
   * çıkılmaz.
   */
  private async existingOnly(incoming: readonly Omit<CartItem, 'addedAt'>[]): Promise<readonly Omit<CartItem, 'addedAt'>[]> {
    const variantIds = [...new Set(incoming.map((item) => item.variantId).filter((id): id is string => typeof id === 'string'))];
    const bundleIds = [...new Set(incoming.map((item) => item.bundleId).filter((id): id is string => typeof id === 'string'))];
    if (variantIds.length === 0 && bundleIds.length === 0) return incoming;

    const [variants, bundles] = await Promise.all([
      variantIds.length > 0 ? new ProductVariantService(this.supabase).listByIds(variantIds) : Promise.resolve([]),
      bundleIds.length > 0 ? new BundleService(this.supabase).listByIds(bundleIds) : Promise.resolve([]),
    ]);
    const knownVariants = new Set(variants.map((row) => row.id));
    const knownBundles = new Set(bundles.map((row) => row.id));

    /* Satırın TÜRÜ kimliğin varlığından okunur (`sameLine`in aynı kuralı): paket satırında
       `bundleId` doludur, varyant satırında `variantId`. İkisi de boşsa satır zaten adressizdir. */
    return incoming.filter((item) =>
      typeof item.bundleId === 'string'
        ? knownBundles.has(item.bundleId)
        : typeof item.variantId === 'string' && knownVariants.has(item.variantId),
    );
  }

  /** Sipariş kapandığında ya da müşteri boşalttığında — satır silinir, boş sepet satırı bırakılmaz. */
  clear(customerId: string): Promise<void> {
    return this.clearFor({ customerId });
  }

  /** Sohbet sepeti müşteriye TAŞINDIĞINDA da buradan: sahipsiz satır bırakılmaz (0055 künyesi). */
  clearFor(owner: CartOwner): Promise<void> {
    return this.deleteWhere(owner);
  }

  /**
   * **Anonim sepeti devralma** (07.1): misafir tarayıcıda sepet doldurup sonra giriş yapar.
   * Sunucudaki sepet KORUNUR, gelen kalemler üstüne eklenir — giriş, daha önce eklenmiş bir ürünü
   * sessizce kaybettirmemeli.
   *
   * Kural `addItems`in TA KENDİSİDİR; ad çağrı yerinde niyeti söylediği için duruyor ("sepeti
   * devral" ile "şu kalemleri ekle" aynı fiil değil, aynı sonuçtur). Gövdesi kopyalanmıyor —
   * kopyalandığı sürece devirdeki birleştirme ile eklemedeki birleştirme bir gün ayrışırdı.
   *
   * Sohbetten gelen sepet de (15.21 bağlantısı) BU kapıdan geçer: üçüncü bir birleştirme kuralı yok.
   */
  takeOver(customerId: string, incoming: readonly Omit<CartItem, 'addedAt'>[]): Promise<Cart> {
    return this.addItems(customerId, incoming);
  }

  /**
   * Sonraya kaydedilenleri (K35) verilen listeye EŞİTLER. Sepetle aynı desen: istemci tam listeyi
   * tutar, tek yönlü eşitleme iki tarafın ayrışmasını imkânsız kılar.
   */
  async replaceSaved(customerId: string, saved: readonly Omit<CartItem, 'addedAt'>[]): Promise<Cart> {
    const owner: CartOwner = { customerId };
    const cart = await this.getFor(owner);
    const next = saved.map((item) => ({
      ...item,
      stockId: item.stockId ?? null,
      // `addedAt` KORUNUR: kalem sepetten buraya taşınırken ilk eklenme anı da taşınır — "iki
      // haftadır bekliyor" bilgisi sepet ile liste arasında gidip gelirken sıfırlanmamalı.
      addedAt: [...cart.items, ...cart.savedItems].find((row) => sameLine(row, item))?.addedAt ?? new Date().toISOString(),
    }));
    return this.write(owner, cart.items, next);
  }

  /**
   * Tek yazma yolu — `updatedAt` her dokunuşta tazelenir (sepet kurtarma zamanlaması buna bakar).
   *
   * İki liste birlikte yazılır: `saved` verilmezse MEVCUDU korunur. Verilmediğinde boş dizi
   * yazılsaydı, sepete bir kalem eklemek sonraya kaydedilenleri sessizce silerdi.
   *
   * **`as CartInsert` KALDIRILDI (10.08).** Cast, alan `CartInsertSchema`'da bulunmadığı hâlde
   * çağrıyı geçerli gösteriyordu; `upsert` girdiyi `insertSchema.parse`ten geçirince Zod damgayı
   * sessizce atıyor ve bu künyenin vaadi yerine gelmiyordu. Şema düzeltildi, cast de gitti —
   * bundan sonra alan yeniden düşerse derleyici uyaracak. Bir dönüşüm, kapının kendisini kapatır.
   *
   * Çakışma anahtarı SAHİBE göre: iki `unique` kolon var ve `upsert` hangisine çarpacağını bilmeli.
   */
  private async write(owner: CartOwner, items: CartItem[], saved?: CartItem[]): Promise<Cart> {
    const savedItems = saved ?? (await this.getFor(owner)).savedItems;
    const onConflict = owner.customerId ? 'customer_id' : 'conversation_id';
    return this.upsert({ ...owner, items, savedItems, updatedAt: new Date().toISOString() }, onConflict);
  }
}

/**
 * Aynı sepet satırı mı?
 *   varyant satırı → varyant VE parti eşleşmeli; teklif satırı normal satırdan ayrı yaşar (DOMAIN §5).
 *   paket satırı   → paketin kimliği yeter; paketin partisi ya da varyantı yoktur (DOMAIN §13).
 * İki tür asla eşleşmez: biri paket, öbürü varyantsa aynı satır değildir.
 */
type LineKey = { variantId?: string | null; bundleId?: string | null; stockId?: string | null };

/**
 * SATIRIN ADRESİ — varyant (+ parti) ya da paket. `setQty`/`removeItem`in tek anahtarı.
 *
 * Dışa veriliyor çünkü uçlar bu şekli kurup geçiyor; kendi nesnelerini uydursalardı paket dalını
 * biri bir gün unutur ve satır sessizce bulunamazdı (`setQty` eşleşmeyen anahtarda sepeti
 * DEĞİŞTİRMEDEN yazar — hata fırlatmaz, yalnız hiçbir şey olmaz).
 */
export type CartRef = LineKey;

function sameLine(a: LineKey, b: LineKey): boolean {
  if (a.bundleId || b.bundleId) return (a.bundleId ?? null) === (b.bundleId ?? null);
  return (a.variantId ?? null) === (b.variantId ?? null) && (a.stockId ?? null) === (b.stockId ?? null);
}
