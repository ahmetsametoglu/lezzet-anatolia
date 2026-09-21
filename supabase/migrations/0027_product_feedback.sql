-- Ürün geri bildirimi (DOMAIN §14): yıldız, yorum ve beğen/geç tek varlıkta, çünkü müşteri, tekillik, puan, skor ve silme
-- yolu üçünde aynıdır. Kimliğe bağlı ve puan kazandıran bir beyan olduğu için analitik olay defterinde duramaz.

-- Moderasyon yalnız metinlidir: metinsiz kayıt doğrudan yayına girer, metin düzenlenmez, yalnız onaylanır ya da reddedilir.

create type review_status as enum ('pending', 'approved', 'rejected');
-- Değerlendirmenin bağlamı — **kapıları farklıdır**: `purchase` satın alma doğrulaması ister
-- (doğrulanmamış yorum sosyal kanıt değil reklamdır); `candidate` isteyemez, çünkü aday ürün henüz
-- satılmıyor ve kimse almamıştır.
create type feedback_context as enum ('purchase', 'candidate');
create type feedback_vote as enum ('like', 'dislike');

create table public.product_feedback (
  id uuid primary key default gen_random_uuid(),

  -- Değerlendirme ÜRÜN düzeyindedir, varyant değil: "1 kg'lık paketi beğendim" diye bir yargı yok —
  -- tat, tazelik ve sunum ürünün kendisine aittir. Boy seçimi bir satın alma kararıdır, görüş değil.
  product_id uuid not null references public.product (id) on delete cascade,

  -- **null = giriş yapmamış ziyaretçinin keşif kaydırması.** Aday ürün panosu onu da saymalı; ama
  -- puan yalnız kimliklide doğar ve tekillik de yalnız orada kurulabilir (aşağıdaki indeks).
  customer_id uuid references public.user_profiles (id) on delete cascade,

  -- Doğrulanmış alışveriş. `purchase` bağlamında kapı bunu kendisi yazar.
  order_id uuid references public.order (id) on delete set null,
  -- Alım-sonrası davetten geldiyse; davetin tamamlanma ilerlemesi buradan türetilir.
  feedback_request_id uuid,

  context feedback_context not null,

  rating int check (rating between 1 and 5),
  vote feedback_vote,
  comment text,
  -- Üç biçimden en az biri: hiçbiri yoksa ortada bir değerlendirme yoktur.
  constraint feedback_has_content check (
    rating is not null or vote is not null or length(btrim(coalesce(comment, ''))) > 0
  ),

  -- Metnin gerçekten yazıldığı dil (ISO 639; müşteri Boşnakça yazabilir), `null` tespit henüz koşmadı demek.
  -- Yalnız çeviri işi yazar, çünkü sayfanın dili metnin dili için kanıt değildir ve yanlış etiket çeviriyi hiç tetiklemez.
  language text check (language ~ '^[a-z]{2,3}$'),
  -- Makine çevirileri {tr?,fr?,de?} — **kaynak dil torbada BULUNMAZ** (orijinal zaten `comment`'te).
  -- Ayrı çeviri tablosu bilinçli reddedildi: kaynak üç ayrı tabloda olduğu için `source_id`
  -- polimorfik, yani FK'siz olurdu — silinen yorumun çevirisi öksüz kalır ve kimse görmez.
  translations jsonb,
  -- Çeviri işi bu satıra baktı mı; başarısızlıkta da yazılır, yoksa çevrilemeyen satır kuyruğu sonsuza dek tıkar.
  -- Çevirisiz ama damgalı satırda okuyan taraf orijinali gösterir.
  translated_at timestamptz,
  constraint feedback_language_needs_text check (
    length(btrim(coalesce(comment, ''))) > 0 or (language is null and translations is null)
  ),

  -- Kartta geçirilen süre — **sinyal kalitesi** için (DOMAIN §14 "ödül ≠ güven"). Yalnız kaydırmada
  -- anlamlıdır: yazılı yorumun süresi bir şey söylemez.
  dwell_ms int check (dwell_ms >= 0),

  status review_status not null default 'pending',
  moderated_at timestamptz,
  moderated_by uuid references public.user_profiles (id) on delete set null,
  -- Damga insanın kararına aittir: `pending`te ve metinsiz kayıtta olamaz, metinli kararda zorunludur.
  -- `moderated_by` zorlanmaz, çünkü personel silinince `set null` olur ve zorunluluk silmeyi imkânsız kılardı.
  constraint feedback_moderation_stamp check (
    case
      when status = 'pending' then moderated_at is null
      when length(btrim(coalesce(comment, ''))) > 0 then moderated_at is not null
      else true
    end
  ),
  -- Metinsiz kayıt beklemez: moderasyonun konusu metindir.
  constraint feedback_textless_is_published check (
    length(btrim(coalesce(comment, ''))) > 0 or status = 'approved'
  ),

  -- "Bu ürün geldi" haberi bu kişiye verildi mi; ilgi zaten bu satırda (`like` + tekillik), ayrı tablo aynı gerçeği iki yerde
  -- tutardı. `null` haber verilmedi demek, söz bir kez tutulur.
  notified_at timestamptz,

  created_at timestamptz not null default now()
);

alter table public.product_feedback enable row level security;

-- Yorumunu değiştiren müşterinin eski çevirisi silinir, yoksa okuyucu geri alınmış cümlenin çevirisini okurdu.
create trigger product_feedback_comment_translation_trg
  before update on public.product_feedback
  for each row
  execute function public.reset_translation_on_text_change('comment', 'translations', 'translated_at');

-- Aynı ürüne bir müşteriden bağlam başına tek kayıt: iki yıldız ortalamayı iki kez etkilerdi ve puan tavanı buna yaslanır.
-- Ziyaretçide tekillik yok, çünkü kimlik tutmak gerekirdi; aday sayısı bu yüzden kişi değil ilgi yoğunluğudur.
create unique index product_feedback_customer_key
  on public.product_feedback (customer_id, product_id, context)
  where customer_id is not null;

-- Moderasyon kuyruğu: bekleyenler en eski önce (bekleyeni bekletmemek). Metinsiz kayıt buraya hiç
-- düşmediği için indeks de dar kalır.
create index product_feedback_pending_idx on public.product_feedback (created_at) where status = 'pending';
-- Ürün sayfasının okuması: o ürünün yayınlanmış YAZILI yorumları, yeniden eskiye.
create index product_feedback_published_idx on public.product_feedback (product_id, created_at desc)
  where status = 'approved' and comment is not null;
-- Ürün kataloğa girince haber verilecek küme: aday, beğeni, kimlikli ve henüz haber verilmemiş. Haber verildikçe satır
-- indeksten düşer, bu yüzden indeks küçülür.
create index product_feedback_awaiting_notice_idx
  on public.product_feedback (product_id)
  where context = 'candidate' and vote = 'like' and customer_id is not null and notified_at is null;

-- Çeviri kuyruğu, en eski önce; damga dolunca satır düşer ve indeks işlenmemiş işin boyuyla büyür.
create index product_feedback_untranslated_idx
  on public.product_feedback (created_at)
  where translated_at is null and comment is not null;

-- Skor ve pano toplamaları.
create index product_feedback_product_idx on public.product_feedback (product_id, context);
create index product_feedback_customer_idx on public.product_feedback (customer_id) where customer_id is not null;
create index product_feedback_request_idx on public.product_feedback (feedback_request_id) where feedback_request_id is not null;

-- ── Ürün skoru ──────────────────────────────────────────────────────────────
-- Türetilir, çünkü saklanan ortalama tazelemeyi unutan tek yolla kalıcı yanlışa düşer; birleşik puan formülü motordadır.
-- Yalnız onaylı `purchase` bağlamı sayılır: aday kaydırması tadılmamış bir ilgidir ve tekilleştirilmez.
create or replace view public.product_rating with (security_invoker = true) as
select f.product_id,
       round(avg(f.rating) filter (where f.rating is not null), 2) as rating_avg,
       count(*) filter (where f.rating is not null)                as rating_count,
       count(*) filter (where f.vote = 'like')                     as like_count,
       count(*) filter (where f.vote = 'dislike')                  as dislike_count,
       count(*) filter (where length(btrim(coalesce(f.comment, ''))) > 0) as comment_count,
       -- Yıldız dağılımı burada, çünkü sayfalanmış listeden sayılan histogram yanlış olur. Tek dizi, çünkü `rating_1_count`
       -- gibi bir ad `snakeToCamel` dönüşümünden sağ çıkmaz; indis 0 = 1★ … 4 = 5★ sırası elle kurulu ve bir test sabitliyor.
       array[
         count(*) filter (where f.rating = 1),
         count(*) filter (where f.rating = 2),
         count(*) filter (where f.rating = 3),
         count(*) filter (where f.rating = 4),
         count(*) filter (where f.rating = 5)
       ]::int[]                                                    as rating_breakdown
  from public.product_feedback f
 where f.status = 'approved'
   and f.context = 'purchase'
 group by f.product_id;

comment on view public.product_rating is
  'Ürün skorunun HAM sayıları — yıldız + beğeni; tek puana çevirme motorda (17.1).';
