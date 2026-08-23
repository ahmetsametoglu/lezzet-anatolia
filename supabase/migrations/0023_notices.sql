-- Posta kodu talebi — "nereye getirelim" sorusunun işletme tarafındaki karşılığı (K33).
--
-- Müşteriye teslimat yerini sormamızın BİRİNCİ sebebi ona ne gönderebileceğimizi söylemek; ikincisi
-- burada: hangi posta kodlarından talep geldiğini bilmek, teslimat bölgesini nereye genişleteceğimize
-- dair tek gerçek sinyaldir. Bugün rota dışı kalan bir kod yarın bir rotanın gerekçesi olur.
--
-- **YALNIZ TOPLU SAYAÇ.** Ziyaretçi kimliği, oturum, IP ya da e-posta BURAYA YAZILMAZ ve tablo buna
-- yer bırakmaz. Talep sinyali için kim olduğu gereksiz; kaydetmek ise kişisel veri yükünü hiçbir
-- karşılık almadan üstlenmek olurdu. Kod başına tek satır, tek sayı.
--
-- Bölge içi kodlar da sayılır: talebin nerede yoğunlaştığı rota planlamasının (gün/sıklık) girdisidir.

create table public.postal_code_demand (
  -- Kodun kendisi anahtar: normalize edilmiş hâliyle yazılır (boşluksuz, büyük harf).
  postal_code text primary key,
  -- Kaç kez soruldu. Aynı ziyaretçinin tekrar sorması ayrı sayılır ve bu bilinçli: tekilleştirmek
  -- için kimlik tutmak gerekirdi, tutmuyoruz. Sayı mutlak bir "kişi" değil, ilgi yoğunluğudur.
  request_count integer not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.postal_code_demand enable row level security;

-- Bölge dışı talebi sıralamak için: en çok sorulan koda inen okuma (operasyon → analitik).
create index postal_code_demand_count_idx on public.postal_code_demand (request_count desc);

/**
 * Sayacı bir artır. Fonksiyon olmasının sebebi ATOMİKLİK: okuyup-yazan iki adımlı bir güncelleme,
 * aynı anda gelen iki istekte birini kaybeder. `on conflict` tek turda çözer.
 *
 * Karar VERMEZ (STACK §4): rota içi mi, bölge açılmalı mı — hiçbirini bilmez, yalnız sayar.
 */
create or replace function public.record_postal_code_demand(p_postal_code text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.postal_code_demand as d (postal_code, request_count)
  values (upper(regexp_replace(p_postal_code, '\s', '', 'g')), 1)
  on conflict (postal_code) do update
    set request_count = d.request_count + 1,
        last_seen_at = now();
$$;


-- ═══ BÖLGE BİLDİRİMİ ═══
-- Buraya AYRI BİR MIGRATION dosyasından taşındı (02.11 · denetim P2 — aile içi
-- birleştirme). İçerik değişmedi; eski dosya numarasıyla anılmıyor, çünkü o numara artık yok.

-- Bölge haberi — "buraya gelince haber verin" kaydı (K34'ün üçüncü çıkışı).
--
-- **Bu bir SÖZ DEĞİL, bir KAYITTIR.** Ekran "haber göndeririz" demez, "not aldık" der: bölge
-- genişletme kararı verilmemiş, tetikleyici de yazılmamıştır. Sözü tutamayacakken vermek, müşteriyi
-- bekletip sonra hiç aramamak olurdu. Tetikleyici geldiğinde (bölge kaydedilince kontrol) elimizde
-- gerçek bir liste bulunur — kaydı bugünden almanın tek sebebi bu.
--
-- İşletme tarafındaki değeri `postal_code_demand`'den FARKLI: orada anonim bir sayaç var ("bu koddan
-- N kişi sordu"), burada iletişime izin vermiş somut kişiler. İkisi ayrı sorulara cevap verir ve
-- birleştirilemez — sayacın kimliği yoktur, olması da istenmez (0023).
--
-- ── BU TABLO "TESLİMAT TALEBİ"NİN TA KENDİSİDİR (21.16 · mobil talebi 09.08) ─
-- Mobil şerit bölge dışı müşterinin *"buraya kendi aracınızla gelin"* cevabını yazacak bir yer
-- aradı ve bulamadı (arananlar: `%interest%`, `%waitlist%`, `%lead%`, `%consent%`). Aranmayan
-- sözcük `notice` idi — kayıt buradaydı: posta kodu + iletişim kanalı + müşteri bağı + gönderim
-- damgası, üstelik okuyan işiyle birlikte (`apps/backend/src/jobs/zone-available.ts`).
--
-- İkinci bir tablo AÇILMADI (CLAUDE §1): iki tablo da *"kim bölge açılmasını bekliyor"* sorusuna
-- cevap verirdi ve haber işi ikisini birden okumak zorunda kalırdı — o gün biri unutulur, o
-- listedeki müşteri hiç haber almaz. Bunun yerine üç alan eklendi (`country`, `place_name`,
-- `source`); talebin istediği ayrım da zaten burada: **sayaç zayıf sinyal, bu satır kuvvetli.**

create table public.zone_notice (
  id uuid primary key default gen_random_uuid(),
  -- Normalize edilmiş posta kodu; hangi bölgenin açılması bekleniyor.
  postal_code text not null,
  -- ── ÜLKE: kod TEK BAŞINA yeri belirlemiyor ────────────────────────────────
  -- Ölçüldü (09.08): `postal_code_place`'teki 16 878 satırın 610 kodu İKİ ülkeye birden çözülüyor.
  -- Bu tablo koddan ibaretken haber işi iki ülkeyi de deniyor ve *"biri tutarsa kapsanmış say"*
  -- diyordu (`zone-available.ts`) — yani Fransa'da açılan bir bölge, aynı kodu yazmış Alman
  -- müşteriye "bölgeniz açıldı" diye gidebilirdi. Küçük kardeşi bu dersi zaten almıştı
  -- (`variant_stock_notice.country`, 19.8); burası ondan eski olduğu için geride kalmıştı.
  country country_code not null,
  -- Kaydın alındığı gün çözülen şehir adı. Kod tablosu ileride değişse de o günkü ad kalır:
  -- operatör "68000" değil "Colmar" okur ve bölge açma kararını isimle verir.
  place_name text,
  -- Kaydın hangi YÜZEYDEN geldiği (`web` · `app-account` · `app-onboarding` …). Enum DEĞİL:
  -- değer bir karar girdisi değil, bir denetim izidir — yeni bir ekran açıldığında migration
  -- yazdırmasının karşılığı yok. Boş bırakılamaz, çünkü "bilinmiyor" diye bir yüzey yok.
  source text not null default 'web',
  -- İletişim adresi. Ziyaretçi de kayıt bırakabilir — hesap ZORUNLU DEĞİL: "haber ver"in önüne
  -- giriş duvarı koymak, tam da vazgeçmeye en yakın anda ikinci bir engel çıkarmaktır.
  email text not null,
  -- Girişli müşteride kim olduğu; ziyaretçide null. Hesap sayfası kendi kayıtlarını bununla bulur.
  customer_id uuid references public.user_profiles (id) on delete set null,
  -- Kaydı bıraktığı SAYFANIN dili (14.10). Ziyaretçi kaydı hesapsızdır, yani haber gönderilirken
  -- dili çözecek bir profil çoğu zaman YOKTUR — kaydetmezsek tahmin etmek zorunda kalırdık ve
  -- Alman müşteriye Fransızca mail giderdi. `null` = bilinmiyor (eski kayıtlar); okuyan taraf
  -- önce profile, sonra varsayılana düşer.
  locale preferred_language,
  created_at timestamptz not null default now(),
  -- Haber gönderildiğinde damgalanır. **Tek hatırlatma** sözü (tasarım) bu alanla tutulur: dolu
  -- olan satıra ikinci kez yazılmaz.
  notified_at timestamptz,
  /*
    Tercih bağının OTURUMSUZ anahtarı (22.08) — bu tablonun kaydı HESAPSIZ olabildiği için gerekli.

    On mail şablonunun altbilgisi "Bildirim tercihleri" bağı taşıyor; dokuzunun alıcısında mutlaka
    bir profil var, **bu kaydınkinde çoğu zaman yok** (`customer_id null` — ziyaretçi bıraktı).
    Profil jetonuyla (`user_profiles.notification_token`) çözülemeyen tek yol burası; jetonsuz
    bırakılsaydı "haber ver" diyen ziyaretçi tercih bağına bastığında hesabı olmayan bir giriş
    ekranında kalırdı — vazgeçmenin önüne konmuş ikinci bir engel, tam da tablonun künyesinin
    reddettiği şey.

    Kayıtla birlikte doğar (`feedback_request.token` deseni). Açtığı sayfa yalnız AYNI E-POSTAYA
    bağlı bekleyen kayıtları gösterir ve iptal ettirir — kimlik, adres, sipariş görünmez.
  */
  token text unique
);

alter table public.zone_notice enable row level security;

comment on table public.zone_notice is
  'Bölge açılma talebi + haber kaydı (K34 · 21.16). KUVVETLİ sinyal: kimliği ve kanalı var — postal_code_demand ise anonim sayaç.';

-- Aynı kişi aynı YER için iki kez kayıt bırakmasın — düğmeye ikinci kez basmak yeni bir bekleyiş
-- değil, aynı bekleyişin tekrarıdır. Ülke anahtarın parçası: aynı kodun Fransız ve Alman hâli iki
-- ayrı yerdir ve biri açıldı diye ötekini bekleyen kişinin kaydı kapanmamalı.
create unique index zone_notice_unique_idx on public.zone_notice (country, postal_code, lower(email));

-- Bölge açıldığında "bu yere bekleyen var mı" sorgusu: henüz haber verilmemişler.
create index zone_notice_pending_idx on public.zone_notice (country, postal_code) where notified_at is null;


-- ═══ STOK BİLDİRİMİ ═══
-- Buraya AYRI BİR MIGRATION dosyasından taşındı (02.11 · denetim P2 — aile içi
-- birleştirme). İçerik değişmedi; eski dosya numarasıyla anılmıyor, çünkü o numara artık yok.

-- 0045 — Varyant + yer bazlı "gelince haber ver" (19.12)
--
-- `zone_notice` (0023) ile KARIŞTIRILMAZ, iki farklı sözdür:
--   zone_notice          → "bölgenize henüz gelmiyoruz"   (rota hiç yok)
--   variant_stock_notice → "bölgenize geliyoruz ama BU ÜRÜN burada şu an yok"
--
-- İkincisi 19.10'un dördüncü hâlidir (`elsewhere`): ürün ağda var, müşterinin yerine ulaşamıyor —
-- soğuk zincir olduğu için kargoya da verilemiyor. Tek bir "yok" mesajına indirmek müşteriyi
-- gelmeyecek bir mal için bekletir ya da gelecek malı kaçırtır.
--
-- ── ANAHTAR DEPO DEĞİL, YER ─────────────────────────────────────────────────────
-- Kayıt `(ülke, posta kodu)` ile tutulur, `warehouse_id` ile DEĞİL. Müşteriye verilen söz kendi
-- adresi hakkındadır, bizim iç coğrafyamız hakkında değil: bir bölgeyi ileride başka depoya
-- bağlarsak söz ayakta kalmalı. Depo anahtarlı kayıt o gün sessizce yanlış listeye düşerdi — ve
-- "müşteri depoyu hiç görmez" kuralı (DOMAIN §17) veride de korunmuş olur.

create table public.variant_stock_notice (
  id uuid primary key default gen_random_uuid(),
  -- Hangi boy bekleniyor: karar varyant düzeyindedir, ürün düzeyinde değil. 700 g'ı bekleyen
  -- müşteriye 1,5 kg geldi diye haber vermek, sözü tutmak değil bozmaktır.
  variant_id uuid not null references public.product_variant (id) on delete cascade,
  -- Yer: müşterinin cevabı (19.9 çerezi ile aynı ikili). Ülke posta kodundan türer (19.8) ve
  -- burada SAKLANIR — kod tek başına 610 vakada iki ülkeye çözülüyor.
  country country_code not null,
  postal_code text not null,
  -- İletişim adresi. Ziyaretçi de kayıt bırakabilir — hesap ZORUNLU DEĞİL: "haber ver"in önüne
  -- giriş duvarı koymak, tam da vazgeçmeye en yakın anda ikinci bir engel çıkarmaktır.
  email text not null,
  -- Girişli müşteride kim olduğu; ziyaretçide null. Hesap sayfası kendi kayıtlarını bununla bulur.
  customer_id uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Haber gönderildiğinde damgalanır. **Tek hatırlatma** sözü bu alanla tutulur: dolu olan satıra
  -- ikinci kez yazılmaz.
  notified_at timestamptz
);

alter table public.variant_stock_notice enable row level security;

comment on table public.variant_stock_notice is
  'Varyant + yer bazlı stok bildirimi (19.12). "Bölgenize geliyoruz ama bu ürün burada yok" hâli; zone_notice''tan farklı — o "bölgenize gelmiyoruz" der.';

-- Aynı kişi aynı ürün + aynı yer için tek AÇIK kayıt tutar. Kısmi: haber verilmiş satır yeni bir
-- bekleyişi engellemez — müşteri aynı ürünü aylar sonra yeniden bekleyebilir ve bu yeni bir sözdür.
create unique index variant_stock_notice_open_idx
  on public.variant_stock_notice (variant_id, country, postal_code, lower(email))
  where notified_at is null;

-- "Bu varyant bu yerde stoklandı, bekleyen var mı" sorgusu — tetikleyicinin okuması.
create index variant_stock_notice_pending_idx
  on public.variant_stock_notice (variant_id, country, postal_code)
  where notified_at is null;

-- Hesap sayfasının "beklediklerim" listesi.
create index variant_stock_notice_customer_idx
  on public.variant_stock_notice (customer_id, created_at desc)
  where customer_id is not null;
