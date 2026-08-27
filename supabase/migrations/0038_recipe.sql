-- Modül 05 — TARİFLER ("Sofradan Fikirler") (05.16). Kullanıcı kararları 07.08.
--
-- Tarif bir ürün DEĞİL, bir vitrindir: kendi ürünlerimizi bir yemeğin içinde gösterir ve sepete
-- kalem kalem ekletir. Bu yüzden fiyatı yoktur, stoğu yoktur, siparişe girmez — kalemleri girer.
--
-- İKİ TABLO, üçüncüsü gerekmedi. `steps` (hazırlanış) ve `pantry` (evde olması gerekenler) ayrı
-- birer tabloya değil, TEK yerelleştirilmiş metne yazılır; satır = madde. Emsal `product.ingredients`
-- ("düz metin + `**vurgu**` işareti"). Adım numarasını EKRAN verir. Ödünç yazılı: madde başına veri
-- (adım görseli, adım süresi) gerekirse bu model taşımaz — bugünkü iki tasarımın hiçbirinde yok.

/**
 * ÜÇ DİL DOLU MU — yayın kısıtının tek ölçütü (kullanıcı kararı 07.08).
 *
 * Fonksiyon olmasının sebebi tekrar: yedi alan × üç dil = 21 koşul, kısıtın içine elle yazılsaydı
 * biri gün gelip ötekinden ayrılırdı. `immutable` şart — kısıt ifadesi ancak değişmez fonksiyon
 * çağırabilir.
 *
 * **TANIM ARTIK BURADA DEĞİL, `0004_catalog_category_collection.sql`DE** (27.08): ölçüt tarife özel
 * değilmiş — ürün de aynı soruyu soruyor (`05.36`) ve `product` 0005'te doğduğu için buradaki tanımı
 * göremiyordu. Tek kopya yukarı taşındı; bu dosya onu yalnız kullanıyor. Künyenin geri kalanı
 * (neden fonksiyon, neden `immutable`, neden "varlık değil doluluk") orada duruyor.
 */

create table public.recipe (
  id uuid primary key default gen_random_uuid(),
  slug text not null,                                -- dil-bağımsız; dış URL farkı routing.ts'ten (SEO_I18N)
  name jsonb not null,                               -- LocalizedText
  description jsonb,                                 -- LocalizedText
  -- ── HESAPLANMAYAN ALAN TİP TAŞIMAZ (kullanıcı kararı 07.08) ────────────────
  -- `duration` ve `serves` bir zamanlar `int` düşünülmüştü. İkisinde de hesap yok: kimse süreye
  -- göre süzmüyor, sıralamıyor. Sayı tutulsaydı üç dile birim eki basan bir biçimlendirici
  -- gerekirdi (`dk` · `min` · `Min.`) — hesabı olmayan bir alan için kod.
  -- `serves` ayrıca sayı OLAMAZ: mobil tasarımda "3–4 kişilik" var, yani ARALIK.
  duration jsonb,                                    -- LocalizedText, "35 dk"
  serves jsonb,                                      -- LocalizedText, "3–4 kişilik"
  meal jsonb,                                        -- LocalizedText, "Akşam yemeği"
  steps jsonb,                                       -- LocalizedText; satır = adım
  pantry jsonb,                                      -- LocalizedText; satır = evde olması gereken
  -- Görsel künyesi ürün/paketle AYNI alanlar (Komponent Envanteri §0B): tek 3:2 kaynak + odak.
  image_key text,
  image_focal_x smallint not null default 50,
  image_focal_y smallint not null default 50,
  image_zoom smallint not null default 100,
  image_alt jsonb,
  image_updated_at timestamptz,
  -- **VARSAYILAN `false` ve bu bir tercih DEĞİL, zorunluluk:** aşağıdaki kısıt yayın için üç dili
  -- şart koşuyor. Varsayılan `true` olsaydı tek dille açılan HER tarif kısıtta patlardı, yani
  -- operatör tarifi hiç oluşturamazdı. Taslak olarak doğar, üç dil dolunca yayınlanır.
  is_active boolean not null default false,
  sort_order int not null default 0,                 -- editoryal seçki sırası (müşteri sıralamaz)
  created_at timestamptz not null default now(),
  /**
   * ── ÜÇ DİL DOLMADAN YAYIN YOK — KURAL VERİDE (kullanıcı kararı 07.08) ──────
   * Ekran unutabilir, veritabanı unutmaz.
   *
   * Bunun bir yan kazancı var: **dil yedek zinciri sorusu ortadan kalkıyor.** Yayındaki tarifte
   * eksik dil olmadığı için Fransız müşteriye Türkçe hazırlanış adımı düşmez. (Üründe yedeğe
   * düşmek DOĞRUdur: müşteri ürünü adından tanır. Tarifte yanlıştır: anlaşılmayan bir adım işe
   * yaramaz, üstelik yanlış uygulanırsa yemeği bozar.)
   *
   * Zorlama ÇEVİRİYE değil DOLULUĞA: kısıt "AI çevirdi mi" diye sorsaydı kota bittiği gün tarif
   * yayınlanamaz olurdu (`20.1`: AI anahtarsızken özellik düşmez). Operatör üç dili elle de yazar.
   */
  constraint recipe_publish_requires_all_locales check (
    not is_active
    or (
      public.has_all_locales(name)
      and public.has_all_locales(description)
      and public.has_all_locales(duration)
      and public.has_all_locales(serves)
      and public.has_all_locales(meal)
      and public.has_all_locales(steps)
      and public.has_all_locales(pantry)
    )
  )
);

create unique index recipe_slug_key on public.recipe (slug);
-- Vitrin okuması: yayındakiler, editoryal sırayla. Kısmi indeks — taslaklar sıcak yolda taranmaz.
create index recipe_active_idx on public.recipe (sort_order, created_at desc) where is_active;

alter table public.recipe enable row level security;

comment on table public.recipe is
  'Tarif ("Sofradan Fikirler", 05.16). Fiyat/stok TAŞIMAZ — kalemleri taşır. Yayın için üç dil şart.';

-- ── TARİF KALEMİ ─────────────────────────────────────────────────────────────
-- Bağ VARYANTA kurulur, ÜRÜNE değil: sepet yalnız varyantla çalışır. `product_id` de tutmak, bir
-- gün ayrışan İKİ gerçek demekti (`CLAUDE §1`) — ürün varyanttan zaten türüyor.
create table public.recipe_item (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipe (id) on delete cascade,
  -- `restrict`: tarifte duran varyant silinemez — `bundle_item` ile aynı karar, aynı gerekçe.
  -- Varyant silme zaten okunabilir hataya çevriliyor (`ProductVariantService.deleteVariant`);
  -- tarif de o cümlenin kaynaklarından biri olur.
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  -- **Sayı kalan TEK alan** — çünkü gerçekten hesaba giriyor: toplam = Σ qty × fiyat.
  qty int not null check (qty > 0),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  -- Aynı varyant bir tarifte iki kez yazılamaz: iki satır olsaydı toplam iki kez sayardı ve
  -- ekranda aynı malzeme alt alta iki kere görünürdü. Adet artırmak için `qty` var.
  constraint recipe_item_variant_unique unique (recipe_id, variant_id)
);

-- Kalemler tarif başına ve SIRALI okunur.
create index recipe_item_recipe_idx on public.recipe_item (recipe_id, sort_order);
-- "Bu varyant hangi tariflerde geçiyor" — varyant silinemediğinde sebebi göstermek için.
create index recipe_item_variant_idx on public.recipe_item (variant_id);

alter table public.recipe_item enable row level security;

comment on table public.recipe_item is
  'Tarifin ürün malzemesi. Bağ VARYANTA (sepet varyantla çalışır). Malzeme TOPLAMI saklanmaz: '
  'fiyat personaya ve depoya bağlı, saklanan toplam ilk gün yalan söyler.';
