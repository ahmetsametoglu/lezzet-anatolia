/**
 * Local seed — `supabase db reset` sonrası örnek/temel veriyi kurar (local stack'e karşı).
 *
 * Kullanım:  pnpm db:reset && pnpm db:seed   (ya da tek komut: pnpm db:refresh)
 * Görseller Cloudflare R2'ye yüklenir (R2 env yoksa atlanır). Giriş: OTP kodu Mailpit'e düşer (54324).
 *
 * TABLO KAPSAMI — hangi tabloya veri girer, girmeyenin sebebi:
 *   ✓ category            4 kategori — 3'ü görselli (anasayfa şeridi), 1'i görselsiz (boş durum)
 *   ✓ product             69 ürün — 5'i elle (yasal beyan/KDV/raf ömrü/marj dolu, farklı durumlar
 *                         örneklenir), 64'ü taban×niteleme çarpımından türetilir (16×4): sayfalama ve
 *                         sonsuz kaydırma ancak gerçekçi hacimde denenebilir — 30'luk sayfada 3 sayfa.
 *                         Görseller 5 PAYLAŞILAN anahtara işaret eder (64 yükleme yerine 5); bir kısmı
 *                         bilinçli görselsiz. Süzgeç dağılımı: 21 beyan eksik · 8 pasif · 5 aday.
 *   ✓ product_variant     ürün başına 1-2 varyant (varyantsız üründe servis varsayılan varyant açar)
 *   ✓ product_image       galeri (ek fotoğraflar) — YENİ DOSYA YÜKLENMEZ, aynı 5 anahtara işaret eder.
 *                         Sayılar arayüzün her durumunu kapsar: dolu (sınır notu) · 2'li · tek · boş;
 *                         kapaksız ürünlere de galeri verilir ("Kapak yap" takası orada denenir).
 *                         Kırpma değerleri bilinçli farklı — odak/zoom etkisi ekranda görünsün.
 *   ✓ collection          4 koleksiyon — açıklama + kapak görseli (paylaşım/OG), aktif+pasif, dolu+boş
 *   ✓ product_collections üyelik + `position` (vitrin kürasyon sırası)
 *   ✓ bundle · bundle_item 3 paket — görselli/kişilikli · görselsiz + HEDİYE kalemli (0 €) · pasif ve
 *                         mutabakatı bilinçli TUTMAYAN (liste rozeti kırmızı görünsün). Kalem fiyatları
 *                         toplamı paket fiyatını verir; kalemler SKU ile varyanta bağlanır
 *   ✓ user_profiles       taslak müşteriler + TİCARİ KARTLAR (B2B onaylı/bekleyen, B2C, DE) + personel
 *                         (dev admin + depo/kurye/muhasebe)
 *   ✓ price               varyant başına b2c TTC + b2b HT; bir kısmında geçmiş liste ve İLERİ TARİHLİ
 *                         zam; 6 satır müşteriye özel → "en özgül kazanır" çözümü denenebilir
 *   ✓ delivery_zone       3 aktif + 1 pasif bölge (rota günü ve kargo dallanması)
 *   ✓ address             rota içi · rota dışı (kargo) · pasif bölgede — "in_route" türetimi denenir
 *   ✓ supplier            3 tedarikçi (biri pasif) + ürün–kod eşlemesi (bir kısmı ÇİFT kaynaklı)
 *   ✓ purchase_order      dört durum: taslak · gönderildi · iptal · mal kabulde kapanan
 *   ✓ stock_intake        2 giriş — biri PO'lu ve bilinçli EKSİK geldi (sipariş↔gelen fark raporu)
 *   ✓ stock              ~140 parti: FEFO için farklı tarihler + sınır durumlar (indirimli teklif,
 *                         yaklaşan, DLC geçmiş, DDM geçmiş, tükenmiş, alış fiyatı girilmemiş)
 *   ✓ stock_adjustment    beş sebebin beşi; sayım farkı İKİ YÖNLÜ (işaretli alan görünsün)
 *   ✓ temperature_log     4 nokta × 21 gün × 2 ölçüm; bir kısmı bilinçli ARALIK DIŞI
 *   ✓ cart                normal · toptan · BAYAT (1 yıllık) + partiye çıpalı teklif satırı
 *   ✓ order               9 durumun hepsi · 4 kaynak (web/whatsapp/door/manual) · tam yol + hızlı
 *                         satış · vadeli gecikmiş/kısmi ödenmiş (açık bakiye türetimi)
 *   ✓ reservation         siparişlerle birlikte doğar (TTL'li checkout + süresiz kapıda/vadeli)
 *   ✓ order_item_batch    hazırlık onayında yazılır → geri çağırma ve gerçek COGS denenebilir
 *   ✓ order_status_log    her geçiş kaydedilir → teslim/kapanış anı buradan türetilir
 *   ✓ account             5 hesap: kasa · 2 banka · Stripe · kapanmış (pasif) — bakiye SAKLANMAZ
 *   ✓ money_movement      açılış bakiyeleri (`capital`) · 9 gider (2'si kampanya etiketli reklam) ·
 *                         tedarikçiye KISMİ ödeme (borç açık kalsın) · 2 transfer (kasa→banka,
 *                         Stripe payout). Sipariş tahsilatları YOK — onlar 12.2'de siparişe bağlı doğar
 *   ✓ job_run             3 iş izi (biri HATALI — "koştu ama düştü" ile "hiç koşmadı" ayrımı)
 *   ✓ settings            migration 0016'da seed'li (16 varsayılan) — burada tekrarlanmaz
 *   ✗ email_verifications GEÇİCİ OTP kaydı — seed'lenmez (dakikalar içinde ölür, giriş akışı üretir)
 *   ✗ auth.users          seed auth hesabı AÇMAZ; profiller auth'suz durur (giriş yapılınca 0002
 *                         trigger'ı e-postadan eşleştirip bağlar)
 *
 * ADMİN — dikkat: dev auth bypass'ı (`apps/web/lib/guard.ts`, dev'de varsayılan AÇIK) operasyon
 * kapılarını atlayıp sabit bir kimlik enjekte eder. Seed o kimlikle GERÇEK bir admin profili açar
 * (`DEV_ADMIN_PROFILE_ID`) — zorunlu, çünkü `order_status_log.actor_id` gibi alanlar
 * `user_profiles`'a FK'lidir; profilsiz sahte kullanıcı ilk durum geçişinde FK ihlali verirdi.
 *
 * BEDELİ: veritabanında artık bir admin bulunduğu için 0002'nin "ilk giriş yapan admin olur"
 * bootstrap'ı ARTIK TETİKLENMEZ — gerçek hesabınız `customer` olarak açılır. Kendi hesabınızı
 * yükseltmek için: `pnpm set-role <e-posta> admin`. (Seed yalnız YEREL kurulumdur; üretim
 * veritabanına atılmadığı için oradaki bootstrap olduğu gibi durur.)
 *
 * Her bölüm kendi guard'ıyla idempotent: dolu tabloyu atlar, bu yüzden tekrar çalıştırmak güvenlidir.
 * Değerler DETERMİNİSTİK (indise göre) — rastgelelik yok: iki koşu aynı veriyi kurar.
 */

import { createServiceRoleClient, waitForRest } from '@lezzet/database';
import { seedBundles, seedCatalog, seedCollections } from './seed/catalog';
import { seedDeliveryZones, seedAddresses } from './seed/delivery';
import { seedJobRuns } from './seed/jobs';
import { seedMoney } from './seed/money';
import { seedCarts, seedOrders } from './seed/orders';
import { seedDraftCustomers, seedKisiler } from './seed/people';
import { seedPrices } from './seed/pricing';
import { katalogVaryantlari } from './seed/shared';
import { seedStock, seedAdjustments, seedTemperatureLogs } from './seed/stock';
import { seedSupply } from './seed/supply';

// Seed Next.js dışında çalışır — .env'i elle yükle (Node 22 process.loadEnvFile).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

async function main(): Promise<void> {
  const db = createServiceRoleClient();
  // `db:refresh` = reset + seed. Reset, VERİTABANI sağlıklı olur olmaz döner ama PostgREST o anda hâlâ
  // şema önbelleğini yüklüyor olabilir; ilk sorgu kapıdan 502 alıp seed'i ilk bölümde düşürüyordu.
  await waitForRest(db);
  await seedCatalog(db);
  await seedCollections(db);
  // Paketler kataloğun ARDINDAN: kalemleri varyant kimliğine bağlı (SKU ile çözülür).
  await seedBundles(db);
  await seedDraftCustomers(db);

  // Ticari zemin — SIRA BAĞLAYICIDIR: her bölüm bir öncekinin ürettiği kimliğe dayanır.
  const kisiler = await seedKisiler(db);
  const varyantlar = await katalogVaryantlari(db);
  await seedPrices(db, varyantlar, kisiler);
  await seedDeliveryZones(db);
  await seedAddresses(db, kisiler);
  const tedarik = await seedSupply(db, varyantlar);
  await seedStock(db, varyantlar, tedarik);
  await seedAdjustments(db, kisiler);
  await seedTemperatureLogs(db, kisiler);
  await seedCarts(db, kisiler, varyantlar);
  // Para SİPARİŞLERDEN ÖNCE: sipariş tahsilatları bir hesaba yazılıyor (12.2), hesap hazır olmalı.
  await seedMoney(db);
  await seedOrders(db, kisiler, varyantlar);
  await seedJobRuns(db);

  // Seed bir admin açtığı için 0002'nin "ilk giren admin olur" bootstrap'ı artık tetiklenmez.
  console.log('✓ seed tamam · operasyon yüzeyi dev bypass ile açık · gerçek hesabı yükseltmek: pnpm set-role <e-posta> admin');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
