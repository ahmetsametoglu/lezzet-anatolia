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
- [x] (02.6) İlk somut servisler (okuma/yazma smoke): `SettingsService` (kapsamlı çözücü: özgül → global) + bir örnek CRUD servisi
  - *Bitti:* Setting çözücüsü "bölge değeri globali ezer" birim testini geçiyor
  - **Durum (27.07):** `0016_setting.sql` + `SettingService`. Özgüllük sırası **bölge > kanal > ülke > global**; hiç satır yoksa çağıranın verdiği varsayılana düşer — kodda sabit kalmaz, varsayılan çağrı yerinde görünür. Süreç içi önbellek (ayarlar her checkout'ta okunur, neredeyse hiç değişmez); yazmada düşer. Bozuk değer akışı kilitlemez, varsayılana döner. 9 test.
  - **Kapsam anahtarı metin:** `scope_id` üç farklı tipi taşıyor (kanal 'b2b', ülke 'FR', bölge uuid) — tip başına ayrı kolon açmak tabloyu boş kolonlarla doldururdu.
- [x] (02.7) Seed: `Setting` varsayılanları (TTL 30 dk, eşikler, tavanlar — `DATA_MODEL.md` Setting listesi) + bir test kategorisi/ürünü
  - *Bitti:* temiz kurulum + seed sonrası vitrin sorgusu veri dönüyor
  - **Durum (27.07):** 15 varsayılan migration'ın kendisinde (`insert`) — seed script'inde değil. Sebep: bunlar test verisi değil, **sistemin çalışması için gereken zemin**; `db:reset` sonrası seed çalıştırılmasa da kesim saati ve TTL yerinde olmalı. Para değerleri cent (STACK §8), yüzdeler tam sayı.

## Netleşecekler

- **Migration aracı:** Supabase CLI mi, kendi küçük runner'ımız mı — artı/eksi masaya konup karar verilecek (STACK §13 statü notu gereği).
- **Veri erişim modeli:** service-role + guard (tek kat) mı, + RLS ikinci hat mı; RLS'nin ilk kapsamı hangi tablolar. Aynı konuşmada karar.

---

**Modül durumu (26.07.2026):** altyapı tamam, şema kapsamı artımlı.
- **Var:** Supabase CLI + numaralı SQL migration'lar (`supabase/migrations/0001–0005`), `pnpm db:migrate/db:reset/db:new/db:seed`, `BaseDbService` (jsonb-güvenli case dönüşümü, `{data,error}`), servisler: `UserProfile`, `StaffRole`, `EmailVerification`, `Category`, `Collection`, `Product`, `ProductVariant`, `ProductCollection`; entegrasyon testleri (`catalog.test.ts`, `product.test.ts`).
- **Yok:** `DATA_MODEL`'deki tabloların çoğu (sipariş, stok, para, mesajlaşma, geri bildirim) — ilgili modülleriyle gelir; `SettingsService` ve `Setting` varsayılan seed'i; seed bugün yalnız kategori/ürün yazıyor.
