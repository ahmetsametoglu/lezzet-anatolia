# 02 — `packages/database`: Taban Servis ve İlk Şema

## Kapsam

Veritabanına konuşan tek katman: Supabase istemci kurulumu (yalnız sunucu tarafı), `BaseDbService` (jsonb-güvenli camelCase↔snake_case dönüştürücüler, `{data, error}` deseni, RPC yardımcıları), migration altyapısı ve **ilk şema migration'ları** (tüm tablolar). İş mantığı yok — o `domain-core`'da; burada yalnız erişim ve şema.

## Okunacaklar

- `STACK.md §6` (BaseDbService), `§13` (veri erişim güvenliği + migration — **taslak, netleşecek**)
- `WORKFLOW.md §2-3` (additive-only migration, deploy sırası)
- `DATA_MODEL.md` (tablolar, kısıtlar için)

## Bağımlılık

`01-types` bitmiş olmalı (şemalar tablo tanımlarının kaynağı).

## Başlarken verilecek izah (örnek)

> "Veritabanı katmanını kuruyoruz: tabloları oluşturan numaralı SQL dosyaları (migration — şema değişikliklerinin sıralı, geri alınamaz kayıtları) ve tüm servislerin miras alacağı bir taban sınıf. Taban sınıf iki dert çözüyor: kod camelCase, veritabanı snake_case konuşur — dönüşümü tek yerde yapar; ve hata fırlatmak yerine `{data, error}` döner, çağıran taraf hatayı bilinçli ele alır. Güvenlik modeli (kim hangi satırı okuyabilir) taslak durumda — kodlamadan önce seçenekleri konuşup netleştireceğiz."

## Görevler

- [ ] **[Önce netleştir]** Migration aracı ve veri erişim modeli konuşması (aşağıdaki "Netleşecekler") — kod bu karardan sonra
- [ ] Supabase projesi + env kurulumu (`.env.example` güncellenir; anahtarlar yalnız sunucu tarafında)
  - *Bitti:* lokal bağlantı smoke testi geçiyor
- [ ] Migration altyapısı: numaralı SQL, tek transaction'da uygulama, `schema_migrations` kaydı, hata durumunda durma
  - *Bitti:* boş projeye sıfırdan kurulum tek komutla; ikinci çalıştırma no-op
- [ ] İlk şema migration'ları — tüm tablolar + enum tipleri + kısıtlar: FK'lar, unique'ler (`Product.slug`, `Category.slug`, `WebhookEvent(provider, provider_event_id)`, `Cart.customer_id`), temel index'ler (sipariş/stok/hareket sorgu yolları)
  - *Bitti:* `DATA_MODEL.md`'deki her varlığın tablosu var; kısıt ihlali testle doğrulanmış (örnek: aynı webhook event iki kez yazılamıyor)
- [ ] `BaseDbService`: jsonb-güvenli case dönüştürücüler (LocalizedText içleri dönüşmez), `{data, error}` deseni, `toRpcParams` yardımcısı
  - *Bitti:* dönüştürücü birim testleri (jsonb alanı bozulmuyor) geçiyor
- [ ] İlk somut servisler (okuma/yazma smoke): `SettingsService` (kapsamlı çözücü: özgül → global) + bir örnek CRUD servisi
  - *Bitti:* Setting çözücüsü "bölge değeri globali ezer" birim testini geçiyor
- [ ] Seed: `Setting` varsayılanları (TTL 30 dk, eşikler, tavanlar — `DATA_MODEL.md` Setting listesi) + bir test kategorisi/ürünü
  - *Bitti:* temiz kurulum + seed sonrası vitrin sorgusu veri dönüyor

## Netleşecekler

- **Migration aracı:** Supabase CLI mi, kendi küçük runner'ımız mı — artı/eksi masaya konup karar verilecek (STACK §13 statü notu gereği).
- **Veri erişim modeli:** service-role + guard (tek kat) mı, + RLS ikinci hat mı; RLS'nin ilk kapsamı hangi tablolar. Aynı konuşmada karar.
