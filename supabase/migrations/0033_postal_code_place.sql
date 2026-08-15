-- 0033 — Posta kodu referansı: ŞEMA (19.8)
--
-- **ELLE BAKILAN DOSYA.** Veri ayrı: `0034_postal_code_place_data.sql`, o ÜRETİLİR
-- (`scripts/build-postal-codes.mjs` · `pnpm postal:build`) ve elle düzenlenmez.
-- Kaynak veri: GeoNames posta kodu dökümü, CC-BY 4.0 (https://download.geonames.org/export/zip/).
--
-- **Neden ayrıldılar** (02.11 · denetim P1): ikisi tek dosyadayken 1,8 MB ediyordu (≈450k token) ve
-- dosyayı açan bir AI aracının bağlam bütçesi anında bitiyordu. Dosya kendisiyle de çelişiyordu:
-- başlığı "elle düzenlenmez" diyordu ama şema yorumları elle bakılan metindi — ve fiilen elle
-- düzenlendiler. 19.19'un `text_pattern_ops` düzeltmesi üretece değil ÇIKTIYA yazılmıştı; bir
-- sonraki `postal:build` ölçülmüş bir kazancı (36,9 ms → 0,11 ms) sessizce geri alacaktı.
--
-- NEDEN VAR: müşteriye "önce ülke, sonra posta kodu" sordurmamak için. Ülke bir ALAN değil, posta
-- kodundan türeyen bir SONUÇtur. İki gerekçe:
--   1. Sürtünme — ülke sormak, cevabı zaten elimizde olan bir soruyu sormaktır.
--   2. Vergi — serbestçe seçilen ülke KDV oranını ve Alman B2B muafiyetini etkiler (DOMAIN §5).
--      Müşterinin doldurduğu bir alanın vergi sonucu doğurması kabul edilemez.
--
-- KAPSAM: ülke ayrımı, gösterilecek yer adı, "yazılan şehir bu koda ait mi" sorusu ve kodun
-- haritadaki yeri (19.18). Adres DOĞRULAMA değil — sokak/numara doğruluğu bu tablonun işi değildir
-- ve olmayacaktır; nokta bir ADRESİ değil kodun kapsadığı alanın merkezini gösterir.
--
-- ÖLÇÜM (02.08): FR 6.065 + DE 10.813 kod; **610'u iki ülkede birden geçerli** — FR kodlarının
-- %10,1'i, DE'nin %5,6'sı. Bugünkü rota kodlarımız çakışmıyor ama çakışmalar tam genişleme
-- koridorunda: Bas-Rhin ile Rheinland-Pfalz aynı `67` önekini paylaşıyor
-- (67240 Bischwiller ↔ Bobenheim-Roxheim, 67150 Nordhouse ↔ Niederkirchen).

-- ── ARANABİLİR AD METNİ İÇİN İKİ ÖN ŞART (OB-03, 15.08) ─────────────────────────────────────
--
-- İhtiyaç: operatör rota kurarken posta kodunu BİLMİYOR. Kullanıcının arayüz testinde bildirdiği
-- eksik bu — "Strasbourg" ya da "Kehl" yazıp o yerleşimin kodlarını bulabilmeli. Bugün yalnız kodun
-- ilk haneleriyle arama var (`67…`), yani kodu bilmeyenin hiçbir yolu yok.
--
-- `places` bir DİZİ (`text[]`) ve dizinin İÇİNDEKİ adlarda parça araması PostgREST'ten yapılamaz:
-- kolonun tamamına bakılabiliyor, elemanlarına değil. Bu yüzden aranabilir hâli veritabanı
-- tutuyor — üretilmiş (`generated ... stored`) bir kolon olarak, yani hiçbir yazma yolu onu
-- güncellemeyi unutamaz.

-- (1) `pg_trgm` — üç harfli parça indeksi.
--
-- Aranan şey ÖNEK değil PARÇA (`%strasb%`): düzleştirilmiş metin kodun TÜM adlarını taşıyor
-- ("bischheim hoenheim") ve önek araması yalnız ilk adı bulurdu — yani çok yerleşimli kodların
-- ikinci ve sonraki adları aranamaz kalırdı, ki bu tam olarak `OB-04`'te kapattığımız körlüğün
-- arama tarafı olurdu. İki taraflı joker hiçbir btree indeksini kullanamaz (`base.service`
-- künyesi bunu zaten yazıyor); trigram indeksi kullanabilen tek yapı.
--
-- Şema `extensions`: Supabase'in kendi eklentileri orada duruyor (`uuid-ossp`, `pgcrypto`, `pg_net`)
-- ve `public`i eklenti nesneleriyle karıştırmamak onların kuralı.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- (2) Düzleştirme fonksiyonu — ve **NEDEN BİR FONKSİYON GEREKTİ.**
--
-- İlk tasarım kolonun içine doğrudan `array_to_string(places, ' ')` yazıyordu. **Ölçüldü ve
-- OLMUYOR:** `array_to_string` `provolatile = 's'` (STABLE), üretilmiş kolon ise yalnız IMMUTABLE
-- ifade kabul eder — migration uygulanırken patlardı. STABLE olmasının sebebi genel: dizi eleman
-- tipi `timestamptz` olsaydı çıktı oturumun saat dilimine bağlı olurdu. **`text[]` için böyle bir
-- bağımlılık yok**, o yüzden sarmalayıcı `text[]` alıp IMMUTABLE ilan ediyor — bu, yazarın
-- daraltılmış girdi üzerinden verdiği geçerli bir taahhüt, kaçamak değil.
--
-- Normalleştirme `domain-core`'daki `normalizePlaceName`in AYNISI olmak zorunda: aranan terim orada
-- normalleşiyor, aranan metin burada. İkisi ayrışırsa "Hœnheim" yazan operatör kendi kaydını
-- bulamaz. Sıra da aynı — önce bire-çok harfler (œ→oe, æ→ae, ß→ss), sonra NFD ayrıştırıp birleşen
-- işaretleri atmak. Ters sırada `ß` çözülmeden kalırdı.
create or replace function public.place_search_text(places text[])
  returns text
  language sql
  immutable
  strict
  parallel safe
as $$
  -- Sıra ÖNEMLİ: önce bire-çok harfler, sonra aksan atma.
  --
  -- `œ → oe` · `æ → ae` · `ß → ss` ELLE yazılıyor ve `unaccent`e bırakılmıyor: bunlar aksan değil
  -- AYRI harfler, ve sözlüğün onları nasıl açtığı sürümden sürüme değişebilir (bazı sürümlerde
  -- `œ → o`). Kural `domain-core`daki `normalizePlaceName` ile bire bir aynı olmak zorunda —
  -- ayrışırlarsa "Hœnheim" yazan operatör kendi kaydını bulamaz — o yüzden bu dört eşleme burada
  -- açıkça duruyor, sözlüğe emanet edilmiyor.
  --
  -- Aksanlar `unaccent`in İKİ ARGÜMANLI biçimiyle atılıyor: sözlük adı açıkça verildiğinde
  -- fonksiyon IMMUTABLE olur (tek argümanlı biçim varsayılan sözlüğü aradığı için yalnız STABLE
  -- ve üretilmiş kolonda kullanılamaz).
  select lower(
    extensions.unaccent(
      'extensions.unaccent',
      replace(replace(replace(replace(array_to_string(places, ' '), 'œ', 'oe'), 'Œ', 'OE'), 'æ', 'ae'), 'ß', 'ss')
    )
  );
$$;

comment on function public.place_search_text(text[]) is
  'Yerleşim adları dizisini aranabilir tek metne indirger (küçük harf, aksansız). domain-core normalizePlaceName ile AYNI kuralı uygular — ikisi ayrışırsa arama kendi kaydını bulamaz.';

create table public.postal_code_place (
  country       country_code not null,
  postal_code   text not null,
  -- Kodun kapsadığı TÜM yerleşimler (19.17) — indirgenmemiş liste.
  --
  -- İlk sürüm (19.8) burada tek bir ad tutuyor, çok yerleşimli kodda bir üst idari birime çıkıyor
  -- ve "daha geniş ama asla yanlış değil" diyordu. İDDİA YANLIŞTI: Fransız arrondissement'ı çoğu
  -- zaman merkez kasabasının adını taşır, yani üretilen etiket geçerli bir belediye adı gibi okunur.
  -- 67800 tabloda "Strasbourg" yazıyordu; orası Bischheim / Hœnheim. Ayırt edilemeyen bir yanlış,
  -- ve kodların ~%39'unu etkiliyor.
  --
  -- Gösterilecek ad buradan TÜRETİLİR (`placeLabel`: tek yerleşimse adı, çoksa null) — kararı veriye
  -- gömmek yerine tek bir saf fonksiyonda tutmak, aynı listenin adres doğrulamasına da hizmet
  -- etmesini sağlıyor. Kolon `not null`: liste BOŞ olabilir, ama yokluk bir değer değildir.
  places        text[] not null,
  -- ARANABİLİR HÂLİ — `places`in düzleştirilmiş, küçük harfli, aksansız ikizi (OB-03).
  --
  -- **Türetilmiş, kopya DEĞİL** (`generated ... stored`): değeri veritabanı hesaplıyor, yani
  -- `places` değişince bu da değişir ve hiçbir yazma yolu güncellemeyi unutamaz. Elle tutulan bir
  -- kolon olsaydı bir gün ikisi ayrışır ve arama var olmayan bir adı bulur (ya da var olanı
  -- bulamaz) hâle gelirdi — üstelik sessizce.
  --
  -- Neden ayrı kolon: aranan şey dizinin İÇİ ve dizinin elemanlarında parça araması okuma
  -- katmanımızdan (PostgREST) yapılamıyor. Düzleştirilmiş metin, mevcut arama altyapısının
  -- (`searchFilters` → `ilike '%q%'`) hiç değişmeden çalışabildiği tek şekil.
  --
  -- `stored`, çünkü `virtual` üretilmiş kolon indekslenemez ve bu kolonun VARLIK SEBEBİ indeks.
  places_search text generated always as (public.place_search_text(places)) stored,
  -- MERKEZ NOKTA (19.18) — bölge kurulumu haritadan yapılıyor ve harita kod başına tek işaret
  -- basıyor (`design/pages/admin-depolar.md`). Kodun kapsadığı yerleşimlerin ORTALAMASI: birini
  -- seçmek keyfi olurdu, aynı "tek ad" hatasının coğrafi karşılığı.
  --
  -- Nullable, çünkü yokluk bir değer değildir: koordinatsız bir kod haritada BASILMAZ, (0, 0)'a
  -- düşmez — Gine Körfezi'nde bir işaret, eksik ölçümü sağlıklıymış gibi okuturdu. Bugünkü dökümde
  -- eksik yok (ölçüldü: 0/60.496), ama kural veride durmalı.
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

-- Koddan ÜLKEYE gidiş bu tablonun asıl sorgusu: "67000 hangi ülke(ler)de geçerli?" PK ülkeyle
-- başladığı için o yönde kullanılamaz, ayrı indeks gerekir.
--
-- **`text_pattern_ops` — ikinci bir indeks DEĞİL, aynı indeksin doğru sınıfı (19.19).** Kod alanı
-- artık ÖNEK de aranıyor (autocomplete, `searchPrefix`) ve varsayılan işleç sınıfı bunu yapamaz:
-- veritabanının harmanlaması C değil, o yüzden `like '672%'` aralık taramasına çevrilemiyor ve
-- planlayıcı tabloyu geziyor. Ölçüldü (16.878 satır, yerel): `672%` → **36,9 ms** tarama;
-- `text_pattern_ops` ile aynı sorgu **0,11 ms** indeks taraması. Uç tuş yolunda, fark görünür.
--
-- Eşitlik ("67000 hangi ülkelerde") bu sınıfla da çalışır — `=` her iki sınıfta aynı; kaybedilen
-- şey yalnız harmanlamaya duyarlı SIRALAMA ve bu kolonda böyle bir sorgu yok (kodlar ASCII).
-- Bu yüzden ikinci bir indeks eklenmiyor: aynı işi iki indeksle yapmak, her yazımda iki ağaç
-- güncellemek demekti.
create index postal_code_place_code on public.postal_code_place (postal_code text_pattern_ops);

-- **AD ARAMASI — trigram indeksi** (OB-03).
--
-- Yukarıdaki `text_pattern_ops` ÖNEK içindir (`like '672%'`) ve ad aramasına yaramaz: aranan şey
-- parçadır (`ilike '%strasb%'`), çünkü düzleştirilmiş metin kodun BÜTÜN adlarını yan yana taşıyor
-- ("bischheim hoenheim") ve önek yalnız ilkini bulurdu — çok yerleşimli kodların (~%39) ikinci ve
-- sonraki adları aranamaz kalırdı.
--
-- İki taraflı joker hiçbir btree indeksini kullanamaz; GIN + trigram bunu yapabilen tek yapı.
-- Aynı dosyadaki önek ölçümünün gösterdiği şey burada da geçerli: 16.878 satırda indekssiz bir
-- `ilike` her tuş vuruşunda tam tarama demektir ve bu yol tam olarak tuş yoludur.
create index postal_code_place_places_search
  on public.postal_code_place using gin (places_search extensions.gin_trgm_ops);

-- Referans verisi herkese açık okunur: yer çözümü giriş yapmamış ziyaretçi için de çalışır ve
-- burada kişisel veri yoktur (kamuya açık coğrafi liste).
alter table public.postal_code_place enable row level security;
create policy postal_code_place_read on public.postal_code_place for select using (true);
