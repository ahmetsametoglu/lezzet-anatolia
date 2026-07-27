# 06 — Stok ve Tedarik: Parti, Rezervasyon, Satın Alma

## Kapsam

Stoğun ve tedariğin iş katmanı: parti (`Stock`) servisleri, **atomik rezervasyon RPC'si**, TTL süpürme cron işi, stok girişi (`StockIntake`) + tedarik akışı (`Supplier / SupplierProduct / PurchaseOrder`), eşik bazlı "sipariş zamanı" önerisi, imha/fire (`StockAdjustment`), sıcaklık kaydı (`TemperatureLog`), FEFO öneri hesabının veriye bağlanması ve hazırlıkta `OrderItemBatch` yazımı. **UI yok** — depo ekranları `10`'da, admin tedarik ekranları `09`'da. Siparişin stokla kesiştiği uçlar (teslim RPC'si, hızlı satış, iptalde geri bırakma) `07`'dedir; buradaki rezervasyon RPC'si onların çağıracağı yapı taşıdır.

## Okunacaklar

- `DOMAIN.md §4` (stok kuralları — tamamı), `§16` (tedarik)
- `data-model/stok-tedarik.md` (tamamı) + `data-model/musteri-siparis.md` (`OrderItemBatch`)
- `ORDER_LIFECYCLE.md` (stok etkileşimi tablosu)
- `STACK.md §13` (çok-tablolu yazım = RPC ilkesi, cron disiplini — taslak statüsü)

## Bağımlılık

`01-types`, `02-database`, `03-domain-core` bitmiş olmalı (rezervasyon/FEFO/raf ömrü karar fonksiyonları buradan çağrılır).

## Başlarken verilecek izah (örnek)

> "Stok sistemini kuruyoruz. Stok, parti parti tutulur: her partinin son tarihi ve alış fiyatı vardır; müşteriye görünen 'kullanılabilir stok' ise fiili stoktan ayrılmış (rezerve) miktarın düşülmesiyle hesaplanır. En kritik parça rezervasyon: iki müşteri aynı anda son ürünü isterse veritabanı tek hamlede yalnız birine ayırır — 'önce baktım vardı, sonra yazdım' açığı hiç oluşmaz. Süresi dolan rezervasyonları arka planda çalışan bir süpürücü düzenli tarayıp serbest bırakır. İkinci yarı tedarik: tedarikçi kartları, ürünlerin tedarikçideki kodları, sipariş listesi üretimi (gönderimi sen yaparsın, sistem temiz liste/PDF hazırlar) ve mal kabulde partilerin stoğa işlenmesi. Stok bir eşiğin altına düşünce sistem 'sipariş zamanı' diye önerir — karar yine senin."

## Görevler

- [x] (06.1) **[Önce netleştir]** TS ↔ SQL sınırı konuşması (03'ün "Netleşecekler" maddesinin uygulaması): hangi kararlar TS'te kalır, hangi yazımlar RPC olur — karar bu modülün RPC listesini belirler
  - *Bitti:* kısa karar notu `STACK.md §13`'e işlendi; RPC listesi netleşti
  - **Durum (27.07):** kullanıcı kararı **dar liste**. Eşik: RPC yalnız (a) eşzamanlılık yarışı olan ya da (b) bölünemez çok-tablolu yazımlara. Bu modülde **üç RPC**: `reserve_stock` · `receive_intake` · `adjust_stock`. TS'te kalanlar: rezervasyon serbest bırakma, TTL süpürme (06.4), Stock/Supplier/SupplierProduct CRUD, PO taslağı (06.9), `TemperatureLog` (06.7), FEFO önerisi (06.5 — okuma + 03 motoru). Gerekçe: RPC'nin bedeli var (migration'a bağlı, testi yerel Supabase ister, iş kuralı SQL'e sızabilir); yalnız veri bozulmasına karşı ödenir. `STACK.md §13`'e "Yazmada RPC eşiği" olarak yazıldı.
- [x] (06.2) **Stock servisi + kullanılabilir hesabı:** parti CRUD (DLC, lot, alış fiyatı, konum) + varyant ve parti düzeyinde `kullanılabilir = fiili − aktif rezervasyon` türetme sorguları; kalan raf ömrü % (03 fonksiyonuyla)
  - *Bitti:* rezervasyonlu senaryoda kullanılabilir doğru dönüyor; near-expiry eşiği altındaki parti işaretli listeleniyor
  - **Durum (27.07):** `0007_stock.sql` (tablolar + `available_stock` görünümü) · `StockService` · `stock.schema.ts`. Kullanılabilir SQL görünümünde türetilir; süresi geçmiş rezervasyon sayılmaz (görünüm cron'u beklemez). Görünüm **karar vermez**: `expired_dlc_qty` olgudur, "satma" kararı motorundur. `listByVariantWithDates` ürünün tarih alanlarını gömülü `select` ile aynı turda getirir (N+1 yok); `getAvailableMap` çok varyantı tek sorguda okur.
  - **Ek (03'ün eksiği):** görev "03 fonksiyonuyla" diyordu ama domain-core'da raf ömrü hesabı yoktu → `domain-core/stock/shelf-life.ts` yazıldı: kalan %, satılabilirlik (DLC geçmiş = hayır, DDM geçmiş = evet), uyarı durumu, MLOR. Eşikler parametrik (%25/%75). Raf ömrü girilmemişse **eşik kararı verilmez** — uydurma yüzdeyle yanlış alarm üretmektense sessiz kalır. 15 test.
  - **Adlandırma değişikliği:** `Stock.dlc` → `expiry_date`. Tarihin TİPİ üründedir (`date_type`); DDM'li bir partinin kolonuna `dlc` demek yanıltıcıydı. DATA_MODEL güncellendi (greenfield — migration doğrudan düzenlendi).
- [x] (06.3) **Atomik rezervasyon RPC'si:** `available >= qty` koşullu tek sorguda `Reservation` yazımı; normal (varyant-toplamı) ve batch-pinned (`stock_id` dolu) aynı mekanizma; `expires_at` parametreli; serbest bırakma ucu
  - *Bitti:* paralel yarış testi (iki eşzamanlı istek son birimi ister → yalnız biri kazanır) yerel Supabase'te geçiyor
  - **Durum (27.07):** `0008_reserve_stock.sql` + `ReservationService.reserve()`. Kilit: varyantın parti satırları `for update` ile kilitlenir → ikinci istek birincinin yazımını görene kadar bekler. Eşzamanlı yeni parti girişi kilitlenmez (kullanılabiliri yalnız artırır). Kısmi ayırma yok: yetmezse satır yazılmaz, o anki kullanılabilir bildirilir. Çıpalı ayırmada yalnız o partinin kullanılabiliri sayılır. **Yarış testleri geçti:** 2 istek/1 birim → 1 kazanan; 10 istek/5 birim → tam 5 kazanan, aşırı-satış yok. Fonksiyon karar taşımaz (TTL süresi, tavan → motorda); `anon`/`authenticated` rollerinden execute yetkisi alındı.
- [x] (06.4) **TTL süpürme cron'u (`apps/backend`):** süresi dolan rezervasyonları geri bırakan **taramalı-idempotent** iş; kaçan tik sonraki taramada telafi olur; `last_run` izi
  - *Bitti:* geçmiş `expires_at`'li satırlar tek taramada temizleniyor; ikinci tarama no-op
  - **Durum (27.07):** `jobs/sweep-reservations.ts` + ortak kabuk `jobs/runner.ts` (üst üste binme koruması, hata yakalama, iz yazımı) + `job_run` tablosu (`0009_job_run.sql`) ve `JobRunService`. Dakikada bir koşar — TTL'den (30 dk) çok küçük olmalı ki serbest kalan stok hemen açılsın. Tarama "süresi geçmiş TÜM satırlar" üzerinedir, "şu dakikanınkiler" değil → kaçan tik telafi olur, ikinci tarama no-op (testli). Hatalı turda da `last_run_at` yazılır: "koştu ama düştü" ile "hiç koşmadı" ayrımı alarmın (18.6) girdisidir.
- [ ] (06.5) **FEFO önerisi + `OrderItemBatch` yazımı:** 03'ün FEFO kararını parti verisine bağlayan öneri servisi (**pinned rezervasyon o partinin kullanılabilirinden düşülür**) + "hazırlandı" onayında çıkan partileri `OrderItemBatch`'e yazan servis (depocu öneriden saparsa satır değiştirilebilir)
  - *Bitti:* iki partili senaryoda öneri FEFO sırasında ve pinned miktar düşülmüş; onay sonrası Σ qty = kalemin `fulfilled_qty`'si
- [ ] (06.6) **StockAdjustment servisi:** imha/fire/sayım farkı kaydı — fiiliden düşüm + `unit_cost` snapshot'ı tek işlemde; teslim-sonrası iade restoku için sebep notu zorunlu
  - *Bitti:* imha kaydı fiiliyi düşürüyor, maliyet snapshot'lı; fire toplamı sorgusu ürün bazında doğru
- [ ] (06.7) **TemperatureLog servisi:** dolap/araç bazlı elle giriş + listeleme
  - *Bitti:* kayıt ve tarih aralıklı listeleme çalışıyor
- [ ] (06.8) **Supplier + SupplierProduct servisleri:** tedarikçi kartı CRUD, varyant↔kod eşlemesi, tercihli tedarikçi işareti, **borç türetme** sorgusu (Σ girişler − Σ ödemeler)
  - *Bitti:* seed hareketlerle tedarikçi borcu doğru dönüyor; bir varyanta iki tedarikçi bağlanabiliyor
- [ ] (06.9) **PurchaseOrder akışı:** taslak PO (kalemler tedarikçi kodlarıyla) → temiz liste/PDF üretimi (sistem **göndermez**) → `sent` işaretleme; iptal yolu
  - *Bitti:* taslak PO'dan tedarikçi kodlarıyla yazılmış PDF/liste üretiliyor; durum geçişleri loglu
- [ ] (06.10) **Mal kabul (StockIntake) RPC'si:** PO kalemleriyle önceden dolu kabul verisi; kabulde partiler (DLC/lot/maliyet) + `Stock.intake_id` bağı + PO `received` + `last_purchase_price` güncellemesi tek transaction; MLOR eşiği altında uyarı (03 hesabıyla)
  - *Bitti:* kabul sonrası partiler girişe bağlı, PO kapanmış, eksik gelen kalem fark olarak görünüyor; MLOR altı parti uyarı üretiyor
- [ ] (06.11) **"Sipariş zamanı" önerisi:** kullanılabilir stoğu `min_stock_qty` altına düşen varyantları tedarikçiye göre gruplayan sorgu + listeden tek dokunuş PO taslağı üreten servis
  - *Bitti:* eşik altı varyant listede; listeden oluşturulan PO taslağı doğru tedarikçi ve kodlarla dolu

## Netleşecekler

- **Rezervasyon RPC'lerinin kapsamı:** ilk görevdeki sınır konuşmasının çıktısı — hangi akışların (ayır / serbest bırak / süpür / kabul) tek RPC olduğu orada kesinleşir.
- **PDF üretim aracı:** tedarik listesi PDF'i için hafif bir varsayılan seçilir (büyük karar değil; aynı araç 14'teki teslimat özetinde de kullanılacaksa o gözle seçilir).
