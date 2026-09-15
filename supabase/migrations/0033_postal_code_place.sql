-- Posta kodu referansı: kodun hangi ülkelerde geçerli olduğu ve kapsadığı yerleşimler. Veri GeoNames dökümünden (CC-BY 4.0)
-- `pnpm postal:build` ile `0034`e üretilir, elle düzenlenmez; ülke bu tablodan türer, çünkü serbest seçilen ülke KDV oranını etkilerdi.

-- Aranabilir ad metni: operatör posta kodunu bilmeden yerleşim adıyla arayabilmeli, ama dizinin içindeki adlarda PostgREST
-- parça araması yapamaz; bu yüzden düzleştirilmiş hâli veritabanı üretilmiş kolon olarak tutar.

-- (1) `pg_trgm`: aranan şey önek değil parça, çünkü düzleştirilmiş metin kodun bütün adlarını taşır ve iki taraflı joker yalnız
-- trigram indeksini kullanabilir. Şema `extensions`, Supabase eklentilerinin durduğu yer.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- (2) Düzleştirme fonksiyonu: `array_to_string` STABLE olduğu için üretilmiş kolona giremez, `text[]` girdisi ise saat dilimine
-- bağlı olmadığından sarmalayıcı IMMUTABLE olabilir. Kural TypeScript'teki `normalizePlaceName` ile aynı olmalı, yoksa "Hœnheim"
-- yazan operatör kendi kaydını bulamaz.
create or replace function public.place_search_text(places text[])
  returns text
  language sql
  immutable
  strict
  parallel safe
as $$
  -- Sıra önemli: önce bire-çok harfler (œ, æ, ß) elle açılır, çünkü sözlük onları sürümden sürüme farklı açabilir; sonra aksanlar
  -- `unaccent`in iki argümanlı, IMMUTABLE biçimiyle atılır.
  select lower(
    extensions.unaccent(
      'extensions.unaccent',
      replace(replace(replace(replace(array_to_string(places, ' '), 'œ', 'oe'), 'Œ', 'OE'), 'æ', 'ae'), 'ß', 'ss')
    )
  );
$$;

comment on function public.place_search_text(text[]) is
  'Yerleşim adları dizisini aranabilir tek metne indirger (küçük harf, aksansız). TypeScript normalizePlaceName ile AYNI kuralı uygular — ikisi ayrışırsa arama kendi kaydını bulamaz.';

create table public.postal_code_place (
  country       country_code not null,
  postal_code   text not null,
  -- Kodun bütün yerleşimleri, indirgenmemiş: üst idari birimin adı yanlış belediyeyi gösterir (67800 Bischheim / Hœnheim'dır,
  -- Strasbourg değil). Gösterilecek ad `placeLabel` ile türetilir; liste boş olabilir ama yokluk bir değer değildir.
  places        text[] not null,
  -- Aranabilir ikiz, türetilmiş ve saklı: `places` değişince o da değişir, hiçbir yazma yolu güncellemeyi unutamaz. `stored`,
  -- çünkü sanal üretilmiş kolon indekslenemez ve bu kolonun varlık sebebi indeks.
  places_search text generated always as (public.place_search_text(places)) stored,
  -- Kodun merkez noktası, yerleşimlerin ortalaması: birini seçmek keyfi olurdu. Boş olabilir, çünkü koordinatsız kod haritaya
  -- basılmamalı; (0, 0) Gine Körfezi'nde bir işaret olurdu.
  lat           numeric(9, 6),
  lng           numeric(9, 6),
  -- PK ülkeyi İÇERİR: aynı kod iki ülkede geçerli olabilir ve ikisi de doğrudur. Tekil anahtar
  -- sadece koddan oluşsaydı 610 kod birbirini ezerdi.
  primary key (country, postal_code),
  -- İkisi birlikte var ya da birlikte yok: tek başına enlem bir nokta değildir.
  constraint postal_code_place_point check ((lat is null) = (lng is null))
);

comment on table public.postal_code_place is
  'Posta kodu → ülke + kapsadığı yerleşimler (GeoNames, CC-BY). Üretilmiş veri; kaynağı scripts/build-postal-codes.mjs.';

-- Koddan ülkeye gidiş bu tablonun asıl sorgusu ve PK ülkeyle başladığı için ayrı indeks gerekir. `text_pattern_ops`, çünkü
-- harmanlama C değil ve önek araması (`like '672%'`) varsayılan sınıfta tablo taraması olurdu; eşitlik bu sınıfta da çalışır.
create index postal_code_place_code on public.postal_code_place (postal_code text_pattern_ops);

-- Ad araması parça aradığı için önek indeksi işe yaramaz; GIN ve trigram iki taraflı jokeri kullanabilen tek yapı ve bu yol her
-- tuş vuruşunda sorulur.
create index postal_code_place_places_search
  on public.postal_code_place using gin (places_search extensions.gin_trgm_ops);

-- Referans verisi herkese açık okunur: yer çözümü giriş yapmamış ziyaretçi için de çalışır ve
-- burada kişisel veri yoktur (kamuya açık coğrafi liste).
alter table public.postal_code_place enable row level security;
create policy postal_code_place_read on public.postal_code_place for select using (true);
