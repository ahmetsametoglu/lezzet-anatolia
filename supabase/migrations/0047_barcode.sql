-- Modül 23 — Ürün barkodu: taranabilir kod ↔ varyant eşlemesi (kullanıcı kararları 17.08,
-- `docs/feature/barkod-okuyucu.md §1`; operasyona geçiş 21.08).
--
-- ── İKİ KİMLİKTEN BİRİNCİSİ ─────────────────────────────────────────────────
-- Bu tablo DIŞ dünyanın kimliğini taşır: paketin/kolinin üstünde basılı EAN/GTIN — "bu hangi mal"
-- sorusunun cevabı. İkinci kimlik (bizim bastığımız kutu QR'ı — "bu hangi kayıt") AYRI iştir ve
-- kutu akışının tasarımı gelince kendi migration'ıyla doğar. İkisini tek tabloda toplamak, dış
-- dünyanın verdiği kodla bizim ürettiğimiz kodu aynı yaşam döngüsüne sokmak olurdu — biri
-- öğrenilir ve geri alınabilir, öteki üretilir ve kalıcıdır.
--
-- ── NEDEN `product_variant.ean` KOLONU DEĞİL (karar §1.2) ───────────────────
-- Gerçek dünyada aynı varyantın BİRDEN ÇOK kodu var: paket EAN-13 taşır, koli GTIN-14 — ve koli
-- kaç adet olduğunu kendisi söyler. Tek kolon bu çokluğu taşıyamaz; çarpanı tedarikçiye yazmak da
-- yanlış olurdu (`supplier_product.pack_qty` "bu tedarikçi koliyle satıyor" bilgisidir; aynı
-- varyantın iki tedarikçisinde koli adedi farklı olabilir — okutulan şey kolinin KENDİ barkodudur).
--
-- ── ÖĞRENEN EŞLEME (karar §1.3) ─────────────────────────────────────────────
-- Tablo mal kabulde KENDİNİ doldurur: okutulan kod sistemde yoksa ekran "bu kod hangi ürün?"
-- diye sorar, depocu satırı seçer, kod buraya yazılır; ikinci gelişte tanınır. Katalogun EAN'ını
-- oturup elle girmek diye bir iş yoktur. `created_by` o yüzden var: eşlemeyi KİM yaptı — yanlış
-- öğretilmiş bir kodun izi sürülebilmeli. Geri alma = satırı silmek (web varyant editöründen);
-- kod tarihçesi tutulmaz, çünkü kayıt bir beyan değil bir EŞLEMEDİR — yanlışı düzeltilir, geçmişi
-- denetlenmez.

-- Kod türü: paket mi koli mi. Küme KAPALI — üçüncü bir tür ("palet"?) gerçek bir ihtiyaç
-- ölçülünce eklenir; bugün açmak, hiç okutulmayacak bir seçeneği ekranlara taşımak olurdu.
create type public.barcode_kind as enum ('unit', 'case');

create table public.variant_barcode (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variant (id) on delete cascade,
  -- Kod GLOBAL benzersizdir: bir kod iki varyanta bağlanamaz (karar §1.3 — "yanlış varyanta
  -- bağlanabilir ama iki varyanta bağlanamaz"). Benzersizlik veride durur; uygulama katmanının
  -- `already_bound` reddi bu kısıtın okunur cümlesidir, kuralın kendisi değil.
  code text not null,
  kind public.barcode_kind not null default 'unit',
  /**
   * Bu kod okutulduğunda KAÇ ADET sayılacağı — çarpan KODUN üstünde durur (karar §1.2).
   *
   * `unit` kod için 1 (check ile zorlanır — "tek paketin çarpanı" diye bir serbestlik yoktur);
   * `case` kod için kolinin içindeki paket adedi. Mal kabulde koli okutulunca gelen adet bu
   * çarpan kadar ÖNERİLİR — beklenen adet değil, kodun kendi söylediği ölçülmüş gerçek.
   */
  qty_per_code int not null default 1,
  /**
   * Eşlemeyi yapan kişi — öğrenen eşlemenin izi. Nullable: seed'in/katalog içe aktarımının
   * yazdığı kodun "öğreteni" yoktur; null = sistem kaydı, dolu = depocunun kabulde öğrettiği.
   * `set null`: personel kaydı silinirse eşleme YAŞAR — kod hâlâ doğru, yalnız izi soluk.
   */
  created_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint variant_barcode_code_uq unique (code),
  constraint variant_barcode_qty_positive check (qty_per_code > 0),
  constraint variant_barcode_unit_is_one check (kind <> 'unit' or qty_per_code = 1)
);

-- Varyantın kodları tek turda: mal kabul formu ve web varyant editörü bu yönden okur.
create index variant_barcode_variant_idx on public.variant_barcode (variant_id);

alter table public.variant_barcode enable row level security;
-- Politika YOK — bilinçli: tabloya yalnız service-role erişir (bütün operasyon servisleri gibi);
-- anon/authenticated için RLS kapalı kapıdır. Müşteri yüzeyinin barkodla İŞİ YOKTUR (karar:
-- "müşteri yüzeyinde yeri yok").
