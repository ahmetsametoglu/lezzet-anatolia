/**
 * `supabase db reset` sonrası veriyi katmanla kurar (`seed/tier.ts`): `base` yalnız gerçek veri ve uzağa yalnız o geçer. Sipariş
 * zinciri yazılmaz, çünkü yarım zincir enkaz bırakır; deneme siparişleri ve kurye sahnesi gerçek kapılardan geçer.
 */

import { createServiceRoleClient, waitForRest } from '@lezzet/database';
import { seedBundles, seedCatalog, seedCollections } from './seed/catalog';
import { seedConversations } from './seed/conversation';
import { seedAddresses, seedDeliveryZones, seedPostalDemand, seedStockNotices, seedZoneNotices } from './seed/delivery';
import { seedDiscounts } from './seed/discount';
import { seedJobRuns } from './seed/jobs';
import { seedBankQueue, seedMoney } from './seed/money';
import { seedErrorLog, seedSystemHealth } from './seed/observability';
import { seedAssistantProposals } from './seed/assistant';
import { seedBarcodes } from './seed/barcode';
import { seedCarts } from './seed/cart';
import { seedCourierReturn } from './seed/courier-return';
import { seedTestOrders } from './seed/test-orders';
import { seedDraftCustomers, seedKisiler, seedStaffLogins } from './seed/people';
import { seedNegotiatedPrices, seedPrices } from './seed/pricing';
import { seedSiteImages } from './seed/site-image';
import { seedRecipes } from './seed/recipe';
import { seedScopedSettings } from './seed/settings';
import { gorselOzeti, katalogVaryantlari } from './seed/shared';
import { enAz, katmanOku, uzakHedefMi } from './seed/tier';
import { seedStock, seedAdjustments, seedTemperatureLogs } from './seed/stock';
import { seedSupply } from './seed/supply';
import { seedTestLabels } from './seed/test-labels';
import { seedNotifications } from './seed/notifications';
import { seedStoragePoints, seedShippingBoxes, seedThresholds, seedTransfer, seedWarehouses } from './seed/warehouse';

// Seed Next.js dışında çalışır — .env'i elle yükle (Node 22 process.loadEnvFile).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

/**
 * Seed yalnız yerel veritabanına yazar: üretilmiş besin künyesi canlı kataloğa girerse yanlış yasal beyan olur ve geri alan düğme yoktur.
 * Ölçüt host'tur; bilerek uzağa yazmak `SEED_ALLOW_REMOTE=true` ister.
 */
function assertLocalDatabase(): void {
  if (process.env.SEED_ALLOW_REMOTE === 'true') {
    console.warn('⚠ SEED_ALLOW_REMOTE=true — UZAK veritabanına yazılıyor. Bilerek yaptığınızdan emin olun.');
    return;
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') return;

  throw new Error(
    `Seed YEREL veritabanı bekliyor, hedef: ${host || '(SUPABASE_URL okunamadı)'}\n` +
      'Seed sahte katalog ve ÜRETİLMİŞ besin künyeleri yazar — canlı veriye girmesi yasal bir beyan hatasıdır.\n' +
      'Gerçekten uzak bir ortamı doldurmak istiyorsanız: SEED_ALLOW_REMOTE=true pnpm db:seed',
  );
}

async function main(): Promise<void> {
  assertLocalDatabase();
  const katman = katmanOku();
  // `extend` ve `full` uydurma personel ve giriş hesabı yazar; uzağa gitmeleri güvenlik açığı olurdu. Kapı tek yerde, burada.
  if (uzakHedefMi() && katman !== 'base') {
    throw new Error(
      `Uzak hedefe yalnız \`base\` katmanı yazılabilir (istenen: ${katman}).\n` +
        '`extend` ve `full` uydurma personel + giriş hesabı, uydurma depo/tedarikçi/banka hesabı,\n' +
        'hesaplanmış fiyat ve bilinçli bozuk kayıtlar yazar. Üretim için: SEED_ALLOW_REMOTE=true pnpm db:seed:base',
    );
  }
  console.log(`▸ BESLEME KATMANI: ${katman}${uzakHedefMi() ? ' · UZAK HEDEF' : ''}`);
  const db = createServiceRoleClient();
  // Reset veritabanı hazır olunca döner ama PostgREST şema önbelleğini hâlâ yüklüyor olabilir; ilk sorgu 502 alırdı.
  await waitForRest(db);
  // Paket `base`te kurulamaz: `bundle.total_price` zorunlu ve kalem fiyatlarından türer. Tarif fiyat saklamaz, kalabilir.
  await seedCatalog(db, katman);
  await seedCollections(db, katman);
  await seedRecipes(db);
  await seedSiteImages(db);
  // Görsel ölçüsü CDN'e sorulmaz, künyeden gelir; her soru yeni bir CDN dönüşümüdür ve ücretsiz kotayı bitirir.

  // Fiyat `base`te, çünkü tedarikçi teklifinden ve toptan listemizden türer; maliyeti olmayan varyant fiyatsız kalır.
  const varyantlar = await katalogVaryantlari(db);
  await seedPrices(db, varyantlar, katman);

  // Buradan sonrası uydurmadır; gerçek olanları üretimde operatör kurar.
  if (!enAz(katman, 'extend')) {
    gorselOzeti();
    console.log('✓ seed tamam · KATMAN: base — yalnız gerçek veri (stok · depo · personel · tedarikçi YOK; fiyat YALNIZ teklifteki 34 varyantta; 128 ürün beyansız → is_incomplete)');
    return;
  }

  // Sıra bağlayıcıdır: her bölüm öncekinin ürettiği kimliğe dayanır ve deposuz hiçbir satır yazılamaz.
  const depolar = await seedWarehouses(db);
  const noktalar = await seedStoragePoints(db, depolar);
  await seedShippingBoxes(db, depolar);
  const kisiler = await seedKisiler(db, depolar);
  // Trigger yeni auth kullanıcısını e-postayla eşleşen profile bağlar; profil önce var olmalı.
  await seedStaffLogins(db);
  await seedNegotiatedPrices(db, varyantlar, kisiler);
  await seedBarcodes(db, varyantlar, kisiler);
  // Paket fiyatı kalemlerin birim fiyatlarından türer; fiyatlardan önce koşsa paket fiyatsız kurulurdu.
  await seedBundles(db);
  gorselOzeti();
  await seedDeliveryZones(db, depolar);
  await seedScopedSettings(db, depolar);
  await seedDraftCustomers(db);
  await seedAddresses(db, kisiler);
  await seedPostalDemand(db);
  await seedZoneNotices(db, kisiler);
  const tedarik = await seedSupply(db, varyantlar);
  await seedStock(db, varyantlar, tedarik, depolar, noktalar);
  await seedAdjustments(db, kisiler);
  await seedTemperatureLogs(db, kisiler, depolar, noktalar);
  await seedCarts(db, kisiler, varyantlar);
  await seedMoney(db);
  await seedDiscounts(db, kisiler);
  await seedTestLabels(db, varyantlar);
  // Eşik kullanılabilir stoğa bakar; `full`de transfer o sayıyı düşürdüğü için transferden sonra koşar.
  await seedThresholds(db, depolar);
  await seedStockNotices(db, kisiler);
  // Deneme siparişleri sonda: rezervasyon kurulu stoğa, teslim günü bölgenin gününe bakar.
  await seedTestOrders(db, varyantlar, depolar);
  // Kurye dönüşü sahnesi deneme siparişlerinin müşterilerini ve adreslerini kullanır.
  await seedCourierReturn(db, varyantlar, depolar);

  if (!enAz(katman, 'full')) {
    console.log('✓ seed tamam · KATMAN: extend — base + kusurlar + bir miktar geçmiş');
    return;
  }

  await seedBankQueue(db);
  await seedTransfer(db, depolar);
  await seedConversations(db);
  // Bildirim satırları bölge kaydından türer.
  await seedNotifications(db, kisiler);
  // Asistan dilekçeleri gerçek kimlikler taşır; erken koşsa sahte uuid ile doğar ve onayda FK ihlaliyle kesilirdi.
  await seedAssistantProposals(db, varyantlar, kisiler);
  await seedJobRuns(db);
  // Sağlık görüntüsünün hata sayısı hata kaydıyla aynı hikâyeyi anlatmalı.
  await seedSystemHealth(db);
  await seedErrorLog(db);

  // Seed bir admin açtığı için "ilk giren admin olur" bootstrap'ı tetiklenmez.
  console.log('✓ seed tamam · KATMAN: full · operasyon yüzeyi dev bypass ile açık · gerçek hesabı yükseltmek: pnpm set-role <e-posta> admin');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
