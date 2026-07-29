# 02 — `packages/database`: Taban Servis ve İlk Şema

## Kapsam

Veritabanına konuşan tek katman: Supabase istemci kurulumu (yalnız sunucu tarafı), `BaseDbService` (jsonb-güvenli camelCase↔snake_case dönüştürücüler, `{data, error}` deseni, RPC yardımcıları), migration altyapısı ve **ilk şema migration'ları** (tüm tablolar). İş mantığı yok — o `domain-core`'da; burada yalnız erişim ve şema.

## Okunacaklar

- `STACK.md §6` (BaseDbService), `§13` (veri erişim güvenliği + migration — **taslak, netleşecek**)
- `WORKFLOW.md §2-3` (additive-only migration, deploy sırası)
- `DATA_MODEL.md` + `data-model/*.md` (tablolar, kısıtlar için)

## Bağımlılık

`01-types` bitmiş olmalı (şemalar tablo tanımlarının kaynağı).

## Başlarken verilecek izah (örnek)

> "Veritabanı katmanını kuruyoruz: tabloları oluşturan numaralı SQL dosyaları (migration — şema değişikliklerinin sıralı, geri alınamaz kayıtları) ve tüm servislerin miras alacağı bir taban sınıf. Taban sınıf iki dert çözüyor: kod camelCase, veritabanı snake_case konuşur — dönüşümü tek yerde yapar; ve hata fırlatmak yerine `{data, error}` döner, çağıran taraf hatayı bilinçli ele alır. Güvenlik modeli (kim hangi satırı okuyabilir) taslak durumda — kodlamadan önce seçenekleri konuşup netleştireceğiz."

## Görevler

- [x] (02.1) **[Önce netleştir]** Migration aracı ve veri erişim modeli konuşması (aşağıdaki "Netleşecekler") — kod bu karardan sonra
- [x] (02.2) Supabase projesi + env kurulumu (`.env.example` güncellenir; anahtarlar yalnız sunucu tarafında)
  - *Bitti:* lokal bağlantı smoke testi geçiyor
- [x] (02.3) Migration altyapısı: numaralı SQL, tek transaction'da uygulama, `schema_migrations` kaydı, hata durumunda durma
  - *Bitti:* boş projeye sıfırdan kurulum tek komutla; ikinci çalıştırma no-op
- [~] (02.4) İlk şema migration'ları — tüm tablolar + enum tipleri + kısıtlar: FK'lar, unique'ler (`Product.slug`, `Category.slug`, `WebhookEvent(provider, provider_event_id)`, `Cart.customer_id`), temel index'ler (sipariş/stok/hareket sorgu yolları)
  - *Bitti:* `DATA_MODEL.md`'deki her varlığın tablosu var; kısıt ihlali testle doğrulanmış (örnek: aynı webhook event iki kez yazılamıyor)
- [x] (02.5) `BaseDbService`: jsonb-güvenli case dönüştürücüler (LocalizedText içleri dönüşmez), `{data, error}` deseni, `toRpcParams` yardımcısı
  - *Bitti:* dönüştürücü birim testleri (jsonb alanı bozulmuyor) geçiyor
  - **Durum (28.07 — yerel yığının aralıklı 502'si teşhis edildi ve kapatıldı):** Haftalardır rastgele
    görünen `An invalid response was received from the upstream server` bir kod hatası değildi. Kong
    günlüğü sebebi yazıyordu: `recv() failed (104: Connection reset by peer) while reading response
    header from upstream`. PostgREST boşta duran keep-alive bağlantısını kapatıyor, Kong o bayat
    bağlantıyı yeniden kullanıyor. **GET'i Kong kendiliğinden taze bağlantıyla yeniden deniyor** — bu
    yüzden okumalar hiç düşmüyordu ve belirti "rastgele" görünüyordu; POST'u denemiyor (idempotent
    değil), dolayısıyla hata HER ZAMAN bir yazmada çıkıyordu (testlerin `beforeAll` insert'leri,
    seed'in ilk bölümü). İki katmanda kapatıldı: **(1)** `waitForRest` — `db reset`/`start`
    konteynerleri yeniden başlatır ve komut VERİTABANI sağlıklı olur olmaz döner, PostgREST hâlâ şema
    önbelleğini yüklüyor olabilir; seed ve test kurulumu ilk sorgudan önce hazır olmasını bekler
    (tavana varınca sessizce devam etmez, hatayı yükseltir). **(2)** yerel istemcide bayat keep-alive
    için TEK seferlik yeniden deneme — bağlantı istek okunmadan kapandığı için yazma hiç
    gerçekleşmemiştir, tarayıcıların yaptığı da budur. `LOCAL_HOST` sınamasıyla **yalnız yerelde**
    devrede: üretimde 502 işlemin ORTASINDA da doğabilir, orada sessiz yeniden deneme kaydı ikizler.
    Ayrıca `purgeTestData` tanımsız kimlikleri ayıklıyor — `beforeAll` düşünce teardown
    `invalid input syntax for uuid: "undefined"` diye İKİNCİ bir hata basıp asıl sebebi gömüyordu.
    Sonuç: üç koşu üst üste 49/49 dosya · 491/491 test.
- [x] (02.6) İlk somut servisler (okuma/yazma smoke): `SettingsService` (kapsamlı çözücü: özgül → global) + bir örnek CRUD servisi
  - *Bitti:* Setting çözücüsü "bölge değeri globali ezer" birim testini geçiyor
  - **Durum (27.07):** `0016_setting.sql` + `SettingService`. Özgüllük sırası **bölge > kanal > ülke > global**; hiç satır yoksa çağıranın verdiği varsayılana düşer — kodda sabit kalmaz, varsayılan çağrı yerinde görünür. Süreç içi önbellek (ayarlar her checkout'ta okunur, neredeyse hiç değişmez); yazmada düşer. Bozuk değer akışı kilitlemez, varsayılana döner. 9 test.
  - **Kapsam anahtarı metin:** `scope_id` üç farklı tipi taşıyor (kanal 'b2b', ülke 'FR', bölge uuid) — tip başına ayrı kolon açmak tabloyu boş kolonlarla doldururdu.
- [x] (02.7) Seed: `Setting` varsayılanları (TTL 30 dk, eşikler, tavanlar — `DATA_MODEL.md` Setting listesi) + bir test kategorisi/ürünü
  - *Bitti:* temiz kurulum + seed sonrası vitrin sorgusu veri dönüyor
  - **Durum (27.07):** 16 varsayılan migration'ın kendisinde (`insert`) — seed script'inde değil. Sebep: bunlar test verisi değil, **sistemin çalışması için gereken zemin**; `db:reset` sonrası seed çalıştırılmasa da kesim saati ve TTL yerinde olmalı. Para değerleri cent (STACK §8), yüzdeler tam sayı.
  - **Seed genişletildi (27.07) — 15 tablo daha.** Katalog doluyken alt zemin boştu: fiyatsız ürün satılamıyor, stoksuz ürün vitrinde "tükendi" görünüyordu. Eklenenler: fiyat (b2c TTC + b2b HT, geçmiş/ileri tarihli liste, müşteriye özel) · teslimat bölgesi · adres · tedarikçi + ürün-kod eşlemesi + tedarik siparişi + mal kabul · stok partileri · stok düzeltmesi · sıcaklık kaydı · ticari müşteri kartları + personel · sepet · sipariş (kalem, parti, geçiş logu, rezervasyon) · iş izi.
  - **Ölçüt "bir ekranın her hâli listede bulunabilmeli"dir**, satır sayısı değil. Bu yüzden sınır durumlar bilinçli serpiştirildi: tarihi geçmiş DLC (satılamaz) ve DDM (satılabilir) parti, indirimli near-expiry teklif, alış fiyatı girilmemiş parti, eksik gelen tedarik siparişi, pasif bölge, rota dışı adres, bayat sepet, vadesi geçmiş ödenmemiş sipariş, hatalı biten cron. Tek "mutlu yol" satırı bu hâllerin hiçbirini göstermezdi.
  - **Siparişler gerçek akışla kurulur** (ayır → onayla → hazırla → yola çık → teslim et → kapat), elle durum yazılarak değil: rezervasyon, kalem–parti kaydı, geçiş logu ve kâr snapshot'ı böylece kendiliğinden tutarlı doğar. Seed aynı zamanda 06/07 zincirinin uçtan uca dumanı olur.
  - **Dev admin SEED'LENİR — ve bu zorunludur.** Dev auth bypass'ı (`apps/web/lib/guard.ts`) operasyon kapılarını atlayıp sabit bir kimlik enjekte ediyor; o kimliğin `user_profiles`'ta karşılığı yoksa `order_status_log.actor_id` FK'si yüzünden **ilk durum geçişinde patlar**. Seed o id ile gerçek bir admin profili açar. Id iki yere kopyalanmasın diye ortak sabit: `DEV_ADMIN_PROFILE_ID` (`@lezzet/types`) — `guard.ts` `server-only` olduğu için seed onu import edemezdi.
  - **Bedeli açıkça yazıldı:** veritabanında admin bulunduğu için 0002'nin "ilk giriş yapan admin olur" bootstrap'ı **artık tetiklenmez**; gerçek hesap `customer` açılır, yükseltme `pnpm set-role <e-posta> admin` iledir. Seed yalnız yerel kurulumdur — üretim veritabanına atılmadığı için oradaki bootstrap olduğu gibi durur.
  - **Değerler deterministik** (indise göre, rastgelelik yok) ve her bölüm kendi guard'ıyla idempotent — seed'i tekrar çalıştırmak güvenlidir, iki koşu aynı veriyi kurar.
- [ ] (02.8) **`order_item_batch` junction servisi (kural borcu — STACK §6):** `OrderService` içindeki üç ham okuma (`listBatches`, kalem maliyetleri, `recallByStocks`) kendi `BaseDbService` alt sınıfına taşınır
  - **Neden bir borç:** kural "junction tablosu = kendi alt sınıfı" diyor; bugün kalem–parti kaydı sipariş servisinin içinden ham `this.supabase` ile okunuyor. Üçü BİRLİKTE taşınır — yalnız birini ayırmak aynı tabloyu iki eve bölerdi, ki bu bugünkü hâlden kötüdür.
  - **Acelesi yok, sırası var:** okumalar çalışıyor ve testli; borç davranış değil biçim borcudur. Kalem–parti kaydına dokunan bir sonraki iş (geri çağırma ekranı ya da kâr raporu) bunu ödemeden başlamasın.

## Netleşecekler

- **Migration aracı:** Supabase CLI mi, kendi küçük runner'ımız mı — artı/eksi masaya konup karar verilecek (STACK §13 statü notu gereği).
- **Veri erişim modeli:** service-role + guard (tek kat) mı, + RLS ikinci hat mı; RLS'nin ilk kapsamı hangi tablolar. Aynı konuşmada karar.

---

**Modül durumu (26.07.2026):** altyapı tamam, şema kapsamı artımlı.
- **Var:** Supabase CLI + numaralı SQL migration'lar (`supabase/migrations/0001–0005`), `pnpm db:migrate/db:reset/db:new/db:seed`, `BaseDbService` (jsonb-güvenli case dönüşümü, `{data,error}`), servisler: `UserProfile`, `StaffRole`, `EmailVerification`, `Category`, `Collection`, `Product`, `ProductVariant`, `ProductCollection`; entegrasyon testleri (`catalog.test.ts`, `product.test.ts`).
- **Yok:** `DATA_MODEL`'deki tabloların bir kısmı (para, mesajlaşma, geri bildirim) — ilgili modülleriyle gelir.

**Adlandırma (27.07, kullanıcı kararı):** ayar tarafı **çoğuldur** — tablo `settings`, servis `SettingsService`. Gerekçe: orada bir ayar değil, ayarlar tutulur. Satır tipi tekil kalır (`Setting`) — bir satır bir ayardır; aynı desen `user_profiles` → `UserProfile`'da zaten var.

> **Açık kalan tutarsızlık:** tabloların 23'ü tekil (`product`, `order`, `stock`…), 4'ü çoğul (`settings`, `user_profiles`, `email_verifications`, `product_collections`). "Tabloda çoğul şey durur" argümanı hepsi için geçerli; yani ya hepsi çoğul olmalı ya da ayrım bilinçli sayılmalı. Toptan yeniden adlandırma greenfield'da mümkün ama `user_profiles` her yerde geçiyor ve `product_collections` başka ajanın aktif alanında — ürün tarafı boşaldığında tek seferde konuşulacak.
