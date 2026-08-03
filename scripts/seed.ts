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
 *   ✓ purchase_order      BEŞ durumun beşi: taslak · gönderildi · iptal · kısmi teslim · TAM teslim
 *   ✓ stock_intake        2 giriş — biri PO'lu ve bilinçli EKSİK geldi (sipariş↔gelen fark raporu)
 *   ✓ stock              ~140 parti: FEFO için farklı tarihler + sınır durumlar (indirimli teklif,
 *                         yaklaşan, DLC geçmiş, DDM geçmiş, tükenmiş, alış fiyatı girilmemiş)
 *   ✓ stock_adjustment    beş sebebin beşi; sayım farkı İKİ YÖNLÜ (işaretli alan görünsün)
 *   ✓ temperature_log     4 nokta × 21 gün × 2 ölçüm (STR) + 7 gün (KEHL) — İKİ depo, biri aralık DIŞI
 *   ✓ cart                normal · toptan · BAYAT (1 yıllık) + partiye çıpalı teklif satırı
 *   ✓ order               9 durumun hepsi · 4 kaynak (web/whatsapp/door/manual) · tam yol + hızlı
 *                         satış · vadeli gecikmiş/kısmi ödenmiş (açık bakiye türetimi) · KUPONLU
 *                         siparişler · KISMİ İADE (restock/discard/goodwill üçü de) · kurye günleri ·
 *                         SINIR ÖTESİ (DE teslimat · reverse charge/Autoliquidation · OSS izlemi) ·
 *                         PARA İADESİ (tam + kısmi → `refunded`) · İKİNCİ DEPODAN çıkan siparişler ·
 *                         üç dilde (`locale` tr/fr/de) — mail ve belge yolları denenebilsin
 *   ✓ reservation         siparişlerle birlikte doğar (TTL'li checkout + süresiz kapıda/vadeli)
 *   ✓ order_item_batch    hazırlık onayında yazılır → geri çağırma ve gerçek COGS denenebilir
 *   ✓ order_status_log    her geçiş kaydedilir → teslim/kapanış anı buradan türetilir
 *   ✓ account             5 hesap: kasa · 2 banka · Stripe · kapanmış (pasif) — bakiye SAKLANMAZ
 *   ✓ money_movement      açılış bakiyeleri (`capital`) · 9 gider (2'si kampanya etiketli reklam) ·
 *                         tedarikçiye KISMİ ödeme (borç açık kalsın) · 2 transfer (kasa→banka,
 *                         Stripe payout). Sipariş tahsilatları YOK — onlar 12.2'de siparişe bağlı doğar
 *   ✓ discount            11 tanım: 8 kupon (geçerli · ilk-sipariş · süresi dolmuş · başlamamış ·
 *                         tek haklı · kişiye özel · pasif · kişi-başı sınırlı) + 3 otomatik kampanya
 *                         (kategori · koleksiyon · asgari sepetli). Kupon kutusunun HER cevabı denenir
 *   ✓ discount_use        kullanım kaydı siparişten doğar — "kaç hak kaldı" sayaçtan değil buradan
 *   ✓ courier_day_close   2 gün kapalı (1 mutabık · 1 FARKLI + kuryenin açıklaması) · kalan gün AÇIK
 *   ✓ ticket              8 talep: 3 durum · 4 kaynak · AI + insan devralma · iade tetikli ·
 *   ✓ ticket_message      fotoğraflı · yeniden açılmış · sonu müşteride biten (kuyrukta cevap bekler)
 *   ✓ product_feedback    yayında · moderasyon kuyruğunda · reddedilmiş · metinsiz yıldız · beğeni ·
 *                         3 dilde yorum · çok yorumlu ürün (sayfalama) · düşük puanlı ürün ·
 *                         aday kaydırmaları (kimlikli + ziyaretçi + eşik altı süre = sinyal kalitesi)
 *   ✓ feedback_request    5 davet: tamamlanmış · yarım (ilerleme çubuğu) · hiç gönderilmemiş ·
 *                         SÜRESİ DOLMUŞ token · WhatsApp kanallı. Kalan sipariş davetsiz (cron kuyruğu)
 *   ✓ points_entry        7 sebebin hepsi · kazanım + harcama · elle düzeltme (+ ve −) ·
 *                         kupona çevirme RPC ile (negatif satır + kişisel kupon aynı turda)
 *   ✓ postal_code_demand  7 posta kodu, YOĞUNLAŞMIŞ dağılım (47 → 2) — "bölge nereye açılmalı"
 *   ✓ zone_notice         6 kayıt: bekleyen + haber verilmiş · kayıtlı müşteri + kayıtsız ziyaretçi
 *   ✓ webhook_event       işlenmiş · DÜŞMÜŞ (hata metinli) · bekleyen · dinlenmeyen tür
 *   ✓ job_run             2 iz — adlar `apps/backend/src/jobs`'takilerle BİREBİR (uydurma ad, ekranda
 *                         hiç tazelenmeyen hayalet satır bırakır). Biri HATALI; kayıtsız iş = hiç koşmadı
 *   ✓ system_health_snapshot 7 günlük seri (yakında 2 dk, geçmişte 30 dk çözünürlük): disk %60→%84
 *                         tırmanıyor, ~2 gün önce %92 ile KRİTİK pencere, 6–9 sa arası ÖLÇÜLEMEDİ.
 *                         Sertifika günü de zamanla azalır → hüküm ok/warn/crit ÜÇÜ de doğar. Hüküm
 *                         elle yazılmaz, `healthStatusOf` hesaplar — yoksa seed eşikleri gizlerdi
 *   ✓ error_log           10 satır: 3 seviye · açık/çözülmüş · 1 REGRESYON (aynı parmak izinin kapalı
 *                         ikizi). Parmak izi servisin fonksiyonundan; sayaç tek satırda kurulur
 *   ✓ settings            global satırlar migration'da; seed KAPSAMLI satırları ekler (ülke · kanal ·
 *                         bölge) — "en özgül kazanır" zinciri ancak aynı anahtarın üç kapsamı varsa
 *                         denenir. `warehouse` kapsamı YAZILMAZ: servisin öncelik listesinde yok
 *   ✗ email_verifications GEÇİCİ OTP kaydı — seed'lenmez (dakikalar içinde ölür, giriş akışı üretir)
 *   ✓ bank_import         şablon + bir ekstre yüklemesi; satırlar GERÇEK okuyucudan geçer →
 *                         eşleştirme kuyruğu dolu gelir (money bölümünde)
 *   ✓ warehouse           2 depo (STR kargo çıkışı · KEHL sınır) — tek depolu veri, depo süzgeci
 *                         hatalarının hiçbirini göstermez (CLAUDE.md §1)
 *   ✓ warehouse_transfer  3 sevkiyat: yolda · kabul edilmiş (biri EKSİK geldi) · iptal
 *   ✓ warehouse_variant_threshold  depo bazlı asgari stok — yarısı eşiğin ALTINDA (yeniden sipariş
 *                         uyarısı yansın). İki katmanlı ezme kuralı ancak depo satırı varsa görünür
 *   ✓ variant_stock_notice "stok gelince haber ver": aynı varyantı bekleyen üç kişi · ziyaretçi +
 *                         kayıtlı · başka ÜLKE (yer süzgeci) · haber verilmiş (damgalı) kayıt
 *   ✗ vehicle             tablo var, kodda KULLANAN YOK (0042) — ekranı olmayan tabloyu doldurmak
 *                         çalışan bir şey varmış izlenimi bırakır
 *   ✗ document_counter    numara VERİLDİKÇE dolar (0033) — önceden doldurmak sayacı yalanlar
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
import { seedCourierDayCloses } from './seed/courier';
import { seedAddresses, seedDeliveryZones, seedPostalDemand, seedStockNotices, seedZoneNotices } from './seed/delivery';
import { seedDiscounts } from './seed/discount';
import { seedFeedbackRequests, seedPoints, seedProductFeedback } from './seed/feedback';
import { seedJobRuns } from './seed/jobs';
import { seedMoney } from './seed/money';
import { seedErrorLog, seedSystemHealth } from './seed/observability';
import { seedCarts, seedOrders } from './seed/orders';
import { seedDraftCustomers, seedKisiler } from './seed/people';
import { seedPrices } from './seed/pricing';
import { seedScopedSettings } from './seed/settings';
import { katalogVaryantlari } from './seed/shared';
import { seedStock, seedAdjustments, seedTemperatureLogs } from './seed/stock';
import { seedSupply } from './seed/supply';
import { seedTickets } from './seed/support';
import { seedThresholds, seedTransfer, seedWarehouses } from './seed/warehouse';

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
  // Depolar EN BAŞTA: parti, sipariş, bölge ve personel kapsamı hepsi depoya bağlı — deposuz
  // hiçbir satır yazılamaz (DOMAIN §17).
  const depolar = await seedWarehouses(db);
  await seedCatalog(db);
  await seedCollections(db);
  await seedDraftCustomers(db);

  // Ticari zemin — SIRA BAĞLAYICIDIR: her bölüm bir öncekinin ürettiği kimliğe dayanır.
  const kisiler = await seedKisiler(db, depolar);
  const varyantlar = await katalogVaryantlari(db);
  await seedPrices(db, varyantlar, kisiler);
  // Paketler FİYATLARDAN SONRA: paket fiyatı kalemlerin birim fiyatlarından türetiliyor (elle yazılan
  // bir sayı değil). Sıra bozulursa paketler fiyatsız kalemlerle kurulur ve seed anlamsız veri üretir.
  await seedBundles(db);
  await seedDeliveryZones(db, depolar);
  // Kapsamlı ayarlar BÖLGELERDEN SONRA: bölge kapsamlı satır, bölgenin kimliğine yazılır.
  await seedScopedSettings(db);
  await seedAddresses(db, kisiler);
  await seedPostalDemand(db);
  await seedZoneNotices(db, kisiler);
  const tedarik = await seedSupply(db, varyantlar);
  await seedStock(db, varyantlar, tedarik, depolar);
  await seedAdjustments(db, kisiler);
  await seedTemperatureLogs(db, kisiler, depolar);
  await seedCarts(db, kisiler, varyantlar);
  // Para SİPARİŞLERDEN ÖNCE: sipariş tahsilatları bir hesaba yazılıyor (12.2), hesap hazır olmalı.
  await seedMoney(db);
  // Kuponlar SİPARİŞLERDEN ÖNCE: sipariş kuponu uygular ve kullanım kaydını yazar; tanım hazır olmalı.
  const kuponlar = await seedDiscounts(db, kisiler);
  await seedOrders(db, kisiler, varyantlar, kuponlar, depolar);
  // Transfer siparişlerden SONRA: sevk kullanılabilir stoğa bakar, rezervasyonlu malı yola çıkarmaz.
  await seedTransfer(db, depolar);
  // Eşikler TRANSFERDEN SONRA: "eşiğin altında mı" sorusu kullanılabilir stoğa bakar ve sevk edilen
  // mal o sayıyı düşürür — önce yazılsaydı eşikler bir daha hiç tutmayan bir fotoğrafa göre kurulurdu.
  await seedThresholds(db, depolar);
  // Stok bildirimi: tükenmiş varyantlar ancak siparişler ve sevkiyat işledikten sonra bellidir.
  await seedStockNotices(db, kisiler);

  // Siparişten DOĞAN kayıtlar — hepsi sipariş kimliğine dayanır, sıra bağlayıcıdır.
  await seedCourierDayCloses(db, kisiler); // kapanış, günün tahsilat görünümünü okur
  await seedTickets(db, kisiler); // talep siparişe ve kalemine bağlanır
  const davetler = await seedFeedbackRequests(db); // davet teslim edilmiş siparişe gider
  const degerlendirmeler = await seedProductFeedback(db, kisiler, varyantlar, davetler);
  await seedPoints(db, kisiler, degerlendirmeler); // puan, değerlendirmenin izine dayanır
  await seedJobRuns(db);
  // Gözlemleme EN SONDA: sağlık görüntüsünün "son bir saatte kaç hata" alanı ile hata kaydı aynı
  // hikâyeyi anlatıyor; hata satırları yazılmadan görüntü alınsaydı ekran kendiyle çelişirdi.
  await seedSystemHealth(db);
  await seedErrorLog(db);

  // Seed bir admin açtığı için 0002'nin "ilk giren admin olur" bootstrap'ı artık tetiklenmez.
  console.log('✓ seed tamam · operasyon yüzeyi dev bypass ile açık · gerçek hesabı yükseltmek: pnpm set-role <e-posta> admin');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
