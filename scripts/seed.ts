/**
 * Seed — `supabase db reset` sonrası veriyi kurar. **Üç katman** (kullanıcı kararı 16.08).
 *
 * Kullanım:  pnpm db:refresh          → `full`   (bugünkü tam fikstür; varsayılan)
 *            pnpm db:refresh:base     → `base`   (YALNIZ gerçek veri — hiçbir şey üretilmez)
 *            pnpm db:refresh:extend   → `extend` (base + kusurlar + bir miktar geçmiş)
 *
 * Katmanın ne olduğu ve neden üç tane olduğu `seed/tier.ts` künyesinde; **buradaki tablo listesi
 * `full` katmanını anlatır.** Katman koşu anında seçilir (`--tier=`), değiştirmek için reset gerekir.
 *
 * `base` üretimde de koşacak (`SEED_ALLOW_REMOTE=true`) ve **uzak hedefe yalnız o geçer**. Yazdığı
 * her satırın arkasında ya üreticinin kataloğu ya kullanıcının bir kararı var; hesaplanmış tek bir
 * alan (fiyat · stok · besin künyesi · alerjen · KDV tahmini · marj) ve uydurulmuş tek bir kayıt
 * (depo · rota · personel · banka hesabı · tedarikçi) yazmaz.
 *
 * Görseller Cloudflare R2'ye yüklenir (R2 env yoksa atlanır). Giriş: OTP kodu Mailpit'e düşer (54324).
 *
 * TABLO KAPSAMI (`full`) — hangi tabloya veri girer, girmeyenin sebebi:
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
 *   ✓ delivery_run(+close) rota+gün başına sefer; 2 sefer kapalı (1 mutabık · 1 FARKLI + açıklama) · kalan AÇIK
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
 *   ✓ vehicle             ölçüm noktası (0045) + seferin aracı (0046) — depo seed'i kuruyor;
 *                         eski "kullanan yok (0042)" notu bayattı, 18.08'de düzeltildi
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
import { seedDeliveryRuns, seedRunCloses } from './seed/courier';
import { seedAddresses, seedDeliveryZones, seedPostalDemand, seedStockNotices, seedZoneNotices } from './seed/delivery';
import { seedDiscounts } from './seed/discount';
import { seedFeedbackRequests, seedPoints, seedProductFeedback } from './seed/feedback';
import { seedJobRuns } from './seed/jobs';
import { seedBankQueue, seedMoney } from './seed/money';
import { seedErrorLog, seedSystemHealth } from './seed/observability';
import { seedBarcodes } from './seed/barcode';
import { seedCarts, seedOrders } from './seed/orders';
import { seedDraftCustomers, seedKisiler, seedStaffLogins } from './seed/people';
import { seedNegotiatedPrices, seedPrices } from './seed/pricing';
import { seedSiteImages } from './seed/site-image';
import { seedRecipes } from './seed/recipe';
import { seedScopedSettings } from './seed/settings';
import { katalogVaryantlari } from './seed/shared';
import { enAz, katmanOku, uzakHedefMi } from './seed/tier';
import { seedStock, seedAdjustments, seedTemperatureLogs } from './seed/stock';
import { seedSupply } from './seed/supply';
import { seedTestLabels } from './seed/test-labels';
import { seedTickets } from './seed/support';
import { seedStoragePoints, seedThresholds, seedTransfer, seedWarehouses } from './seed/warehouse';

// Seed Next.js dışında çalışır — .env'i elle yükle (Node 22 process.loadEnvFile).
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

/**
 * **Seed YALNIZ yerel veritabanına yazar** (08.08 · kullanıcı besin künyesi sorununu sorunca ölçüldü).
 *
 * Koruma YOKTU ve bedeli somuttu: `pnpm db:seed`, `.env`'i ne gösteriyorsa oraya yazıyor. Bir kez
 * yanlış `SUPABASE_URL` ile çalıştırıldığında canlı kataloğa **141 sahte ürün** ve bunların
 * **üretilmiş besin künyeleri** girerdi — besin künyesi INCO kapsamında yasal bir beyandır ve
 * kategori ortalamasından türetilmiş bir sayı orada durursa yanlış beyan olur. Seed'i geri alan bir
 * düğme de yok.
 *
 * **Neden koda gömülü işaret (ör. künyeye "örnek" anahtarı) yerine BU:** `NutritionSchema` kapalı bir
 * nesne ve `NUTRITION_KEYS` onun şeklinden türüyor (INCO beyan sırası — hem form hem müşteri tablosu
 * onu izliyor). Torbaya fazladan bir anahtar koymak müşteri tablosuna sahte bir beyan satırı ekler;
 * Zod da bilinmeyen anahtarı zaten okurken düşürür, yani işaret sessizce kaybolurdu. Verinin şekli
 * bir sözleşme; koruma kapıda durmalı, verinin içinde değil.
 *
 * Yerel ölçüt HOST: Supabase yereli `127.0.0.1`/`localhost` üzerinden konuşur. Bilerek üretime
 * yazmak isteyen (ör. demo ortamı kurulumu) `SEED_ALLOW_REMOTE=true` der — ve o an ne yaptığını
 * bilir; kaza ile yazılmaz.
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
  // Katman koşu ANINDA seçilir (`--tier=base|extend|full`, varsayılan `full`) — künye `seed/tier.ts`.
  const katman = katmanOku();
  /**
   * **UZAK HEDEFE YALNIZ `base` GEÇER** (kullanıcı kararı 16.08).
   *
   * `base` tanımı gereği yalnız gerçek veri yazıyor (kaynak katalog + kullanıcının kararları), o
   * yüzden üretime gidebilir. `extend` ve `full` ise yerel fikstürler: uydurma personel ve onlara
   * açılmış GİRİŞ HESAPLARI, uydurma depo/rota/tedarikçi/banka hesabı, ağırlıktan hesaplanmış
   * fiyat, indisten üretilmiş stok, ve bilinçli olarak bozulmuş kayıtlar. Bunların üretime gitmesi
   * yanlış veri değil, GÜVENLİK AÇIĞI olurdu.
   *
   * Kapı burada, tek yerde: aşağıdaki bölümlerin hiçbiri ayrıca "uzak mıyım" diye sormuyor.
   */
  if (uzakHedefMi() && katman !== 'base') {
    throw new Error(
      `Uzak hedefe yalnız \`base\` katmanı yazılabilir (istenen: ${katman}).\n` +
        '`extend` ve `full` uydurma personel + giriş hesabı, uydurma depo/tedarikçi/banka hesabı,\n' +
        'hesaplanmış fiyat ve bilinçli bozuk kayıtlar yazar. Üretim için: SEED_ALLOW_REMOTE=true pnpm db:seed:base',
    );
  }
  console.log(`▸ BESLEME KATMANI: ${katman}${uzakHedefMi() ? ' · UZAK HEDEF' : ''}`);
  const db = createServiceRoleClient();
  // `db:refresh` = reset + seed. Reset, VERİTABANI sağlıklı olur olmaz döner ama PostgREST o anda hâlâ
  // şema önbelleğini yüklüyor olabilir; ilk sorgu kapıdan 502 alıp seed'i ilk bölümde düşürüyordu.
  await waitForRest(db);
  // ── `base` — YALNIZ GERÇEK VERİ ──────────────────────────────────────────────────────────────
  // Buradaki dört bölümün yazdığı her satırın arkasında ya kaynak katalog ya kullanıcının bir
  // kararı var: kategori ve ürün üreticinin kataloğundan, kapaklar kullanıcının seçiminden,
  // koleksiyon üyeliği kullanıcının kürasyonundan, tarif bizim editoryal metnimiz.
  //
  // **Paket burada YOK ve bu bir tercih değil ŞEMA:** `bundle.total_price` `NOT NULL`, varsayılanı
  // yok ve tutar kalem fiyatlarından türüyor. Fiyat yazılmayan bir katmanda paket kurulamaz.
  // Tarif kalabiliyor çünkü kendi fiyatını SAKLAMIYOR (05.16) — malzeme satırları fiyatsız çizilir.
  await seedCatalog(db, katman);
  await seedCollections(db, katman);
  await seedRecipes(db);
  // Sayfa görselleri hiçbir şeye bağlı DEĞİL (bir varlığa değil bir sayfa yerine ait) — sırası
  // serbest; katalogun yanında duruyor çünkü ikisi de aynı kovaya yazıyor.
  await seedSiteImages(db);

  // FİYAT ARTIK `base`TE (kullanıcı kararı 19.08) — çünkü artık uydurma değil.
  //
  // Eskiden fiyat bu çizginin altındaydı ve haklı olarak: uydurma bir kilo tabanından üretiliyordu.
  // Bugün 34 varyantın fiyatı tedarikçinin 22.12.2025 tarihli teklifinden ve kendi toptan satış
  // listemizden türüyor — ikisi de gerçek belge. Maliyeti OLMAYAN varyant `base`te fiyatsız kalır;
  // uydurma sayı yalnız `extend`+ katmanında doğar (künye `seed/pricing.ts`).
  const varyantlar = await katalogVaryantlari(db);
  await seedPrices(db, varyantlar, katman);

  // ── `base` BURADA BİTER ──────────────────────────────────────────────────────────────────────
  // Buradan sonrasının TAMAMI uydurmadır (kullanıcı kararı 16.08: *"hiçbir içerik
  // üretilmeyecek"*): depo · rota · personel ve giriş hesapları · banka hesapları ·
  // tedarikçiler · ayar değerleri · üretilmiş stok, ve onların üstüne kurulan bütün geçmiş.
  // Gerçek olanları üretimde operatör kurar. Künye `seed/tier.ts`.
  if (!enAz(katman, 'extend')) {
    console.log('✓ seed tamam · KATMAN: base — yalnız gerçek veri (stok · depo · personel · tedarikçi YOK; fiyat YALNIZ teklifteki 34 varyantta; 128 ürün beyansız → is_incomplete)');
    return;
  }

  // Depolar geçmişin EN BAŞINDA: parti, sipariş, bölge ve personel kapsamı hepsi depoya bağlı —
  // deposuz hiçbir satır yazılamaz (DOMAIN §17).
  const depolar = await seedWarehouses(db);
  // Ölçüm noktaları depodan HEMEN sonra (19.28/19.29): hem sıcaklık kaydı hem stok partisi onlara
  // `restrict` ile bağlı, yani ikisinden de önce var olmaları gerekiyor.
  const noktalar = await seedStoragePoints(db, depolar);
  // Ticari zemin — SIRA BAĞLAYICIDIR: her bölüm bir öncekinin ürettiği kimliğe dayanır.
  const kisiler = await seedKisiler(db, depolar);
  // Giriş hesapları profillerden SONRA: trigger yeni auth kullanıcısını e-postayla eşleşen profile
  // bağlıyor, yani profil önce var olmak zorunda (gerekçe `seedStaffLogins` künyesinde).
  await seedStaffLogins(db);
  // Pazarlıklı fiyat müşteriden SONRA: kanal listesini ezen satır bir müşteri kimliğine yazılıyor.
  await seedNegotiatedPrices(db, varyantlar, kisiler);
  // Barkodlar kişilerden SONRA: "öğrenilmiş kod" satırı depocunun kimliğine yazılıyor (Modül 23).
  await seedBarcodes(db, varyantlar, kisiler);
  // Paketler FİYATLARDAN SONRA: paket fiyatı kalemlerin birim fiyatlarından türetiliyor (elle
  // yazılan bir sayı değil). Sıra bozulursa paketler fiyatsız kalemlerle kurulur.
  await seedBundles(db);
  await seedDeliveryZones(db, depolar);
  // Kapsamlı ayarlar BÖLGELERDEN SONRA: bölge kapsamlı satır, bölgenin kimliğine yazılır.
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
  // Para SİPARİŞLERDEN ÖNCE: sipariş tahsilatları bir hesaba yazılıyor (12.2), hesap hazır olmalı.
  await seedMoney(db);
  // Kuponlar SİPARİŞLERDEN ÖNCE: sipariş kuponu uygular ve kullanım kaydını yazar; tanım hazır olmalı.
  const kuponlar = await seedDiscounts(db, kisiler);
  await seedOrders(db, kisiler, varyantlar, kuponlar, depolar, katman);
  // FİZİKSEL test etiketleri siparişlerden SONRA: sabit kodlar tedarik siparişinin ve açık kutulu
  // siparişin GERÇEK kalemlerine bağlanıyor, sonra bağlar DOĞRULANIYOR (künye: `seed/test-labels.ts`).
  await seedTestLabels(db, varyantlar);
  // Eşikler: "eşiğin altında mı" sorusu kullanılabilir stoğa bakar. `full`de transferden SONRA
  // koşuyor (sevk edilen mal o sayıyı düşürür); `extend`te transfer yok, sıra da sorun değil.
  await seedThresholds(db, depolar);
  // Stok bildirimi: tükenmiş varyantlar ancak siparişler işledikten sonra bellidir.
  await seedStockNotices(db, kisiler);
  const davetler = await seedFeedbackRequests(db); // davet teslim edilmiş siparişe gider
  const degerlendirmeler = await seedProductFeedback(db, kisiler, varyantlar, davetler);
  await seedPoints(db, kisiler, degerlendirmeler); // puan, değerlendirmenin izine dayanır

  if (!enAz(katman, 'full')) {
    console.log('✓ seed tamam · KATMAN: extend — base + kusurlar + bir miktar geçmiş');
    return;
  }

  // ── YALNIZ `full` ────────────────────────────────────────────────────────────────────────────
  // Kapsam denetiminin (`pnpm seed:coverage`) zorunlu kovalarının tamamı ancak burada dolar.
  // Banka ekstresi SİPARİŞLERDEN SONRA: eşleştirme kuyruğunun satırları açık siparişlerin
  // tutarlarından türüyor (güçlü aday · çoklu aday · öneri yok). `seedMoney` içinde kalsaydı
  // sipariş tablosu henüz boş olur ve kuyruk tek hâlinde donardı.
  await seedBankQueue(db);
  // Transfer siparişlerden SONRA: sevk kullanılabilir stoğa bakar, rezervasyonlu malı yola çıkarmaz.
  await seedTransfer(db, depolar);
  // Seferler siparişlerden SONRA: hangi (rota, gün) sürülmüş, siparişlerin kendisi söylüyor.
  await seedDeliveryRuns(db, kisiler);
  await seedRunCloses(db, kisiler); // kapanış, seferin tahsilat görünümünü okur
  await seedTickets(db, kisiler); // talep siparişe ve kalemine bağlanır
  await seedJobRuns(db);
  // Gözlemleme EN SONDA: sağlık görüntüsünün "son bir saatte kaç hata" alanı ile hata kaydı aynı
  // hikâyeyi anlatıyor; hata satırları yazılmadan görüntü alınsaydı ekran kendiyle çelişirdi.
  await seedSystemHealth(db);
  await seedErrorLog(db);

  // Seed bir admin açtığı için 0002'nin "ilk giren admin olur" bootstrap'ı artık tetiklenmez.
  console.log('✓ seed tamam · KATMAN: full · operasyon yüzeyi dev bypass ile açık · gerçek hesabı yükseltmek: pnpm set-role <e-posta> admin');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
