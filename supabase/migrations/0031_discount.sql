-- İndirim tanımı (05.6) — kupon ve otomatik kampanya TEK varlıkta.
--
-- İkisini ayrı tabloya bölmedik çünkü ayrımları tek alan: **nasıl tetiklendiği**. Kupon kodla
-- (müşteri yazar), kampanya kendiliğinden. Koşullar, kapsam, tarih, sınırlar ve değer hesabı
-- ikisinde de aynı — iki tablo, aynı sekiz alanı iki kez tanımlamak ve motorun iki kez okuması
-- olurdu.
--
-- **KARAR BURADA DEĞİL, MOTORDA.** "Hangi indirim, ne kadar" sorusunu `domain-core/pricing.
-- applyBestDiscount` yanıtlar; bu tablo yalnız kuralın kendisini saklar. Alanlar motorun
-- `DiscountRule` sözleşmesiyle BİREBİR: biri eklenirse öbürü de eklenir, yoksa okunmayan bir kolon
-- ya da uydurulan bir varsayılan doğar.
--
-- **Tek-en-büyük kuralı** (DOMAIN §5) burada YAZILI DEĞİL, motorda uygulanır: indirimler üst üste
-- binmez, en büyüğü kazanır. Tabloya bir "öncelik" kolonu koymak, aynı kararı iki yerde tutmak olurdu.
--
-- Pakete ve near-expiry teklife hiçbir genel indirim binmez; o muafiyet de motorda (kalem
-- `bundle_id`/`offer_stock_id` taşıyorsa matrahın dışında).

create type discount_trigger as enum ('coupon', 'automatic');
create type discount_type as enum ('percent', 'fixed');
create type discount_scope as enum ('cart', 'category', 'collection');

create table public.discount (
  id uuid primary key default gen_random_uuid(),

  -- Operatörün listede tanıyacağı ad ("Bayram indirimi"). Kod DEĞİL: kod müşterinin yazdığı şey,
  -- ad işletmenin kendi dili. Kampanyanın kodu yoktur ama adı olmalıdır.
  name text not null,

  -- MÜŞTERİYE GÖRÜNEN ad, üç dilde ({"tr":"Hoş geldin indirimi","fr":"Offre de bienvenue",...}).
  --
  -- `name`'den ayrı bir alan, çünkü iki farklı okuyucusu var: `name` operasyonun kendi diliyle
  -- yazılmış iç etikettir (Türkçe, listede aranır, raporda geçer); bu ise vitrinde ve mailde
  -- müşterinin gördüğü cümledir. Tek alan olsaydı ya Fransız müşteri "Bayram indirimi" görürdü ya
  -- da operatör kendi listesini Fransızca aramak zorunda kalırdı.
  --
  -- NULL/boş = ad verilmemiş → yüzey genel "İndirim / Remise / Rabatt"a düşer. Zorunlu değil:
  -- adsız bir kampanya çalışır, yalnız daha az şey anlatır.
  public_label jsonb,

  trigger discount_trigger not null,
  -- Kupon KODLARI burada değil, `discount_code` tablosunda (aşağıda): bir kuponun birden çok kodu
  -- olabilir ve hepsi aynı kotayı paylaşır.

  type discount_type not null,
  -- `percent` → yüzde (15 = %15) · `fixed` → EURO tutar. Uygulama katmanı motora verirken sabit
  -- tutarı KURUŞA çevirir (STACK §8: DB'de euro, hesapta cent).
  value numeric(10, 2) not null check (value > 0),

  scope discount_scope not null,
  -- Kapsam kategoriyse/koleksiyonsa hedefi; sepet kapsamında ikisi de boş.
  category_id uuid references public.category (id) on delete cascade,
  collection_id uuid references public.collection (id) on delete cascade,

  -- Koşullar. Hepsi opsiyonel: boş olan koşul YOKTUR (motor `null`'ı "sınırsız" okur), 0 ile
  -- karıştırılmamalı — asgari sepet 0 ile "asgari sepet yok" aynı şey değildir.
  min_basket numeric(10, 2) check (min_basket >= 0),
  first_order_only boolean not null default false,
  valid_from timestamptz,
  valid_to timestamptz,

  -- Kişisel kupon (çoğu puan kullanımından doğar): yalnız bu müşteri kullanır. Boşsa herkese açık.
  customer_id uuid references public.user_profiles (id) on delete cascade,

  -- Kullanım sınırları. Sayaç TUTULMAZ, `discount_use` satırlarından türetilir (rezervasyon
  -- desenindeki gibi): sayaç ile gerçek kayıt ayrışabilir, türetilen sayı ayrışamaz.
  max_uses int check (max_uses > 0),
  per_customer_limit int check (per_customer_limit > 0),

  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  -- Kapsam hedefi tutarlı olmalı: kategori kapsamı kategori ister, koleksiyon koleksiyon; sepet
  -- kapsamı ikisini de istemez. Hedefsiz kapsam, hiçbir kaleme uymayan sessiz bir kural doğururdu.
  constraint discount_scope_target check (
    (scope = 'cart' and category_id is null and collection_id is null)
    or (scope = 'category' and category_id is not null and collection_id is null)
    or (scope = 'collection' and collection_id is not null and category_id is null)
  ),
  -- Yüzde 100'ü aşamaz; sabit tutarın tavanı yoktur (matrahla sınırlanır, motorun işi).
  constraint discount_percent_range check (type <> 'percent' or value <= 100),
  -- Tarih aralığı ters yazılamaz — "31 Tem'den 24 Tem'e" hiç geçerli olmayan bir kampanyadır.
  constraint discount_valid_range check (valid_from is null or valid_to is null or valid_from <= valid_to)
);

alter table public.discount enable row level security;

-- Sepet çözümünün okuması: aktif ve tarihi geçerli kurallar. Kupon adayları koda göre elenir,
-- kampanyalar toptan gelir.
create index discount_active_idx on public.discount (trigger) where is_active = true;
create index discount_customer_idx on public.discount (customer_id) where customer_id is not null;

-- ── Kupon kodları ─────────────────────────────────────────────────────────────
-- **Bir kuponun BİRDEN ÇOK kodu olur; hepsi AYNI kuralın ve aynı kotanın kapısıdır.**
--
-- Sebep dildir: "HOSGELDIN" bir Türk müşteriye bir şey anlatır, Fransız'a hiçbir şey. Aynı kampanya
-- için "BIENVENUE" ve "WILLKOMMEN" da açılabilmeli — ama bunlar üç ayrı kampanya DEĞİLDİR: koşulları,
-- değeri, tarihi ve kullanım tavanı tektir. Üç ayrı `discount` satırı açmak, "toplam 100 kullanım"
-- sınırını sessizce 300'e çıkarırdı.
--
-- Kod bu yüzden kuralın bir KOLONU değil, kurala bağlı satırlardır. Kota `discount.max_uses`'ta
-- kalır ve `discount_use` sayımı kural üzerinden yapılır — hangi kapıdan girildiği kotayı bölmez.
--
-- `locale` kodun hangi dil için yazıldığıdır; **NULL = dilden bağımsız** (ör. matbu bir kart üstündeki
-- tek kod). Zorunlu değil, çünkü her kod bir dile ait olmak zorunda değildir. Aynı dilde birden çok
-- kod da mümkündür (A/B denemesi, basılı kupon) — form bugün dil başına bir kod üretiyor, tablo bunu
-- şart koşmuyor.
create table public.discount_code (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discount (id) on delete cascade,
  code text not null check (length(trim(code)) > 0),
  locale preferred_language,
  created_at timestamptz not null default now()
);

alter table public.discount_code enable row level security;

-- Kod tekilliği HARF AYRIMSIZ ve **TÜM kurallar arasında GLOBAL**: müşteri kutuya bir kod yazar ve o
-- kod tek bir kuralı göstermelidir. İki kampanya aynı kodu taşısaydı hangisinin uygulanacağı yazılma
-- sırasına kalırdı — kimsenin göremediği bir kura.
create unique index discount_code_key on public.discount_code (upper(code));
create index discount_code_discount_idx on public.discount_code (discount_id);

-- Kod YALNIZ kuponun olur. Kural uygulama katmanında da var ama son emniyet burada: "otomatik"
-- adının yalanı olan kodlu bir kampanya, kutuya yazılınca uygulanır ve kimse neden olduğunu anlamaz.
create or replace function public.discount_code_requires_coupon() returns trigger
language plpgsql as $$
begin
  if (select d.trigger from public.discount d where d.id = new.discount_id) <> 'coupon' then
    raise exception 'Otomatik kampanyanın kodu olamaz (discount %)', new.discount_id;
  end if;
  return new;
end;
$$;

create trigger discount_code_coupon_only
  before insert or update on public.discount_code
  for each row execute function public.discount_code_requires_coupon();

-- ── Kullanım kaydı ────────────────────────────────────────────────────────────
-- "Bu kupon kaç kez, kim tarafından kullanıldı" — sayacın kaynağı.
--
-- Sipariş tarafı (07/09.6) yazar; tanım ekranı yalnız okur. Ayrı tablo olmasının sebebi sayaç
-- yerine KAYIT tutmak: `used_count` kolonu tutulsaydı iptal/iade sonrası düzeltmek elle bir işe
-- dönerdi ve "kim kullandı" sorusu yanıtsız kalırdı (müşteri başına sınır bu yüzden şart).
create table public.discount_use (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discount (id) on delete cascade,
  -- HANGİ KAPIDAN girildi — kotayı bölmez, sayımı zenginleştirir: "TR kodu mu FR kodu mu tuttu"
  -- sorusunun cevabı budur ve kampanyanın hangi dilde karşılık bulduğunu söyler. Otomatik
  -- kampanyada boş (kod yoktur). Kod silinirse kullanım kaydı KALIR (`set null`): geçmiş bir
  -- kullanımı, kapısı kapandı diye silmek raporun geçmişini değiştirmek olurdu.
  discount_code_id uuid references public.discount_code (id) on delete set null,
  customer_id uuid references public.user_profiles (id) on delete set null,
  order_id uuid references public.order (id) on delete cascade,
  -- Uygulanan tutar — kuralın değeri değil, o sepette GERÇEKTEN inen indirim (matrah küçükse sabit
  -- tutar kırpılır). Raporun sorduğu sayı budur.
  amount numeric(10, 2) not null check (amount >= 0),
  used_at timestamptz not null default now()
);

alter table public.discount_use enable row level security;

-- Sayım sorguları: toplam kullanım ve müşteri başına kullanım.
create index discount_use_discount_idx on public.discount_use (discount_id);
create index discount_use_customer_idx on public.discount_use (discount_id, customer_id) where customer_id is not null;
-- Aynı sipariş bir kuralı iki kez tüketemez (tek-en-büyük zaten tek indirim uygular).
create unique index discount_use_order_key on public.discount_use (discount_id, order_id) where order_id is not null;
-- "Hangi kod ne kadar tuttu" sayımı — kod bazlı rapor bu indeksin üstünde durur.
create index discount_use_code_idx on public.discount_use (discount_code_id) where discount_code_id is not null;
