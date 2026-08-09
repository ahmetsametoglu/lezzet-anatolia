-- Modül 09 — SAYFA GÖRSELLERİ (`site_image`, 09.16 · 08.31). Talep: müşteri şeridi 09.08.
--
-- ── VARLIĞA DEĞİL, YERE BAĞLI GÖRSEL ────────────────────────────────────────
-- Ürünün, kategorinin, koleksiyonun, paketin ve tarifin görseli KENDİ satırının künyesinde durur
-- (`image_key` + odak/zoom, 0004/0005/0038). Sebebi basit: o görsel varlığın kendisine aittir ve
-- varlık silinince görsel de anlamsızlaşır.
--
-- Buradakiler ise bir varlığa değil bir **SAYFA YERİNE** aittir: ana sayfanın kahramanı, boş
-- sepetin çizimi. Karşılık gelen bir satır yoktur ve olmayacaktır — "boş sepet" diye bir varlık
-- yok. Bu yüzden ürün görselinin yolu burada kullanılamaz; kendi tablosu gerekiyor.
--
-- ── ANAHTAR ENUM, SERBEST METİN DEĞİL ───────────────────────────────────────
-- Slot kümesi KAPALIDIR: yeni bir slot ancak onu çizen ekran doğunca doğar. Serbest metin olsaydı
-- ekranda karşılığı olmayan bir görsel yüklenebilirdi — yüklendiği anda kaybolan, operatörün
-- "yükledim ama görünmüyor" diye aradığı bir dosya. Enum, *"bu görsel nereye gidiyor"* sorusunu
-- veriye yazar ve yeni slot açmayı migration'a — yani gözden geçirilen bir yere — taşır.
--
-- ── SATIR VARSA GÖRSEL VAR ──────────────────────────────────────────────────
-- `image_key` **not null**: satırın kendisi görseldir. Anahtarsız satır bir hayalettir — ekran onu
-- "dolu" sanıp boş çerçeve çizer. Boş slot = satır YOK; okuyan taraf bugünkü yer tutucusunu
-- çizmeye devam eder ve kova boş diye sayfa kırılmaz.
--
-- ── ÇOK DİLLİLİK GEREKMİYOR (ama alt metin dilli) ───────────────────────────
-- Görselin İÇİNDE metin yok; aynı fotoğraf üç dile de hizmet eder — dil başına ayrı dosya, üç kat
-- yükleme işi karşılığında sıfır kazanç olurdu. `image_alt` yine de çok dilli, çünkü o görselin
-- kendisi değil onun EKRAN OKUYUCUYA ve arama motoruna söylediği cümledir.
--
-- ── ODAK/KIRPIM NEDEN BURADA DA VAR ─────────────────────────────────────────
-- Aynı fotoğraf iki çerçeveye farklı oturuyor: `home_hero` 16:9, `packages_hero` 3:2. Kırpma
-- dosyayı değiştirmez (CSS'te uygulanır), bu yüzden `image_updated_at` damgası yalnız yükleme
-- akışında yazılır — kardeş tabloların hepsinde aynı karar.

create type public.site_image_slot as enum (
  'home_hero',            -- ana sayfa kahramanı (web + mobil web) · 16:9
  'packages_hero',        -- Paketler sayfası kahramanı · 3:2
  'professionals_hero',   -- Professionnels sayfası kahramanı · 16:9
  'empty_cart'            -- boş sepet çizimi (illüstrasyon oranı)
);

comment on type public.site_image_slot is
  'Sayfa görseli yerleri — KAPALI küme. Yeni slot ancak onu çizen ekran doğunca eklenir (09.16).';

create table public.site_image (
  id uuid primary key default gen_random_uuid(),
  slot public.site_image_slot not null,
  -- Depo anahtarı, tam URL değil (STACK §5). Prefix R2 çağrısında eklenir (`resolvePrefixedKey`).
  image_key text not null,
  image_focal_x smallint not null default 50,   -- odak %, 0-100 (object-position X)
  image_focal_y smallint not null default 50,   -- odak %, 0-100 (object-position Y)
  image_zoom smallint not null default 100,     -- zoom %, 100-400
  image_alt jsonb,                              -- LocalizedText; erişilebilirlik + SEO
  image_updated_at timestamptz                  -- dosyanın sürüm damgası (public cache'i kırar)
);

alter table public.site_image enable row level security;

comment on table public.site_image is
  'Sayfa (yer) görselleri — bir VARLIĞA değil bir sayfa yerine bağlı. Boş slot = satır yok (09.16).';

-- Bir slot bir görsel taşır. Yeni yükleme eskisinin ÜZERİNE yazar; ikinci satır "hangisi geçerli"
-- sorusunu doğururdu ve o sorunun ekranda cevabı yok.
create unique index site_image_slot_idx on public.site_image (slot);
