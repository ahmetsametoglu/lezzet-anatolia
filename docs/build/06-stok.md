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

- [ ] (06.1) **[Önce netleştir]** TS ↔ SQL sınırı konuşması (03'ün "Netleşecekler" maddesinin uygulaması): hangi kararlar TS'te kalır, hangi yazımlar RPC olur — karar bu modülün RPC listesini belirler
  - *Bitti:* kısa karar notu `STACK.md §13`'e işlendi; RPC listesi netleşti
- [ ] (06.2) **Stock servisi + kullanılabilir hesabı:** parti CRUD (DLC, lot, alış fiyatı, konum) + varyant ve parti düzeyinde `kullanılabilir = fiili − aktif rezervasyon` türetme sorguları; kalan raf ömrü % (03 fonksiyonuyla)
  - *Bitti:* rezervasyonlu senaryoda kullanılabilir doğru dönüyor; near-expiry eşiği altındaki parti işaretli listeleniyor
- [ ] (06.3) **Atomik rezervasyon RPC'si:** `available >= qty` koşullu tek sorguda `Reservation` yazımı; normal (varyant-toplamı) ve batch-pinned (`stock_id` dolu) aynı mekanizma; `expires_at` parametreli; serbest bırakma ucu
  - *Bitti:* paralel yarış testi (iki eşzamanlı istek son birimi ister → yalnız biri kazanır) yerel Supabase'te geçiyor
- [ ] (06.4) **TTL süpürme cron'u (`apps/backend`):** süresi dolan rezervasyonları geri bırakan **taramalı-idempotent** iş; kaçan tik sonraki taramada telafi olur; `last_run` izi
  - *Bitti:* geçmiş `expires_at`'li satırlar tek taramada temizleniyor; ikinci tarama no-op
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
