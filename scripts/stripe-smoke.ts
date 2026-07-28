/**
 * Stripe duman testi (07.4) — `pnpm stripe:smoke`
 *
 * GERÇEK anahtarla, test modunda bir ödeme oturumu açar ve şu zinciri uçtan uca doğrular:
 * anahtar okunuyor mu · stok ayrılıyor mu · oturum penceresi rezervasyon TTL'iyle eşit mi.
 *
 * Neden var: birim/entegrasyon testleri sağlayıcıya ağdan GİTMEZ (oturum üreteci bir porttur, test
 * sahtesini verir). O yüzden "kod doğru" ile "anahtarlar doğru" ayrı sorulardır; bu script
 * ikincisini cevaplar. Kurulumdan, anahtar değişiminden ve canlıya çıkıştan sonra çalıştırılır.
 *
 * Kendi verisini kurar ve TAMAMINI geri siler; Stripe'ta da oturumu kapatır — panelde iz bırakmaz.
 */
const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;

// SIRA ÖNEMLİ: Node var olan bir değişkeni EZMEZ, ilk yükleyen kazanır. Uygulama anahtarları
// `apps/web/.env.local`'dedir; kökte aynı adla BOŞ bir satır varsa gerçek değeri gölgeler. Bu
// yüzden uygulama env'i önce yüklenir, kök `.env` yalnız eksikleri (Supabase) tamamlar.
try {
  load?.('apps/web/.env.local');
} catch {
  // Yoksa sorun değil: değişkenler ortamdan gelmiş olabilir (CI).
}
try {
  load?.('.env');
} catch {
  // aynı
}

const { CategoryService, OrderService, ProductService, ReservationService, StockService, UserProfileService, serviceDb } =
  await import('@lezzet/database');
const { purgeTestData } = await import('@lezzet/database/testing');
const { createCheckoutSession } = await import('../apps/web/lib/order/checkout-session');
const { stripeClient } = await import('../apps/web/lib/stripe');

const db = serviceDb();
const stamp = Date.now();
const dayOffset = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const category = await new CategoryService(db).create({ name: { tr: `Stripe duman ${stamp}` } });
const { product, variants } = await new ProductService(db).create({
  name: { tr: `Duman testi ürünü ${stamp}`, fr: `Produit test ${stamp}` },
  categoryId: category.id,
});
const variantId = variants[0]!.id;
const profile = await new UserProfileService(db).insert({ name: 'Duman testi', email: `smoke-${stamp}@example.test` });
await new StockService(db).insert({ variantId, physicalQty: 10, expiryDate: dayOffset(30), purchasePrice: 4 });

const { order } = await new OrderService(db).create(
  { customerId: profile.id, channel: 'b2c', deliveryType: 'route', total: 24 },
  [{ variantId, qty: 2, unitPrice: 12, vatRate: 5.5 }],
);

const outcome = await createCheckoutSession({
  orderId: order.id,
  successUrl: 'https://lezzet-anatolia.fr/ok',
  cancelUrl: 'https://lezzet-anatolia.fr/iptal',
});

console.warn('SONUÇ:', JSON.stringify(outcome, null, 2));

if (outcome.status === 'ok') {
  const reserved = (await new ReservationService(db).listActiveByOrder(order.id)).reduce((sum, row) => sum + row.qty, 0);
  const minutes = Math.round((new Date(outcome.expiresAt).getTime() - Date.now()) / 60_000);
  console.warn(`AYRILAN: ${reserved} adet · PENCERE: ${minutes} dk (rezervasyon TTL'iyle eşit olmalı)`);

  // Panelde açık oturum bırakmayız: duman testi iz bırakmamalı.
  await stripeClient()?.checkout.sessions.expire(outcome.sessionId);
  console.warn('OTURUM KAPATILDI');
} else if (outcome.status === 'provider_unavailable') {
  console.warn('Anahtar okunamadı. Kökteki `.env` içinde BOŞ bir STRIPE_SECRET_KEY satırı olabilir — o satır gerçek anahtarı gölgeler.');
}

await new ReservationService(db).releaseByOrder(order.id);
await db.from('order').delete().eq('customer_id', profile.id);
await db.from('stock').delete().eq('variant_id', variantId);
await purgeTestData(db, { productIds: [product.id], categoryIds: [category.id], profileIds: [profile.id] });
console.warn('TEMİZLENDİ');
