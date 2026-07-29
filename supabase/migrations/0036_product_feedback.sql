-- Modül 17 — Ürün geri bildirimi ve ürün skoru (17.1, 17.3). DOMAIN §14.
--
-- **Müşterinin bize VERMEYİ SEÇTİĞİ değerlendirme.** Üç biçim tek varlıkta: yıldız, yazılı yorum,
-- beğen/geç. Ayrımları biçimden ibarettir — müşteri, ürün, tarih, puan kazanımı, "aynı ürüne bir
-- kez" tekilliği, ürün skoruna katkı ve GDPR silme yolu üçünde de aynıdır. `discount`'ın kuponu ve
-- otomatik kampanyayı tek tabloda tutmasıyla aynı gerekçe (0031): iki tablo, aynı yedi alanı iki kez
-- tanımlamak ve skoru iki ayrı yerden toplamak olurdu.
--
-- ── BURASI BEYAN, `analytics_event` İZ ────────────────────────────────────────
-- Beğen/geç bir zamanlar analitik olayı olarak tasarlanmıştı; oraya AİT DEĞİL (29.07 düzeltmesi).
-- Ölçüt basit: kayıt puan kazandırıyor mu, kişiye bağlanıyor mu, "bir kez" kuralı var mı, silme
-- talebinde gitmeli mi — dördü de evet. Bunların hiçbiri, akıp giden ve "kişisel kimlik yok" diye
-- tanımlanmış bir olay defterinde duramaz. Analitiğin "toplu ölçüm, çerez banner'ı gerekmez"
-- iddiası da tam olarak orada kimlik olmamasına dayanır.
--
-- ── MODERASYON METNİN İŞİDİR ─────────────────────────────────────────────────
-- Bir yıldızı ya da bir beğeniyi "reddetmek" anlamsızdır: okunacak bir şey yoktur. Metinsiz kayıt
-- kuyruğa hiç düşmez, doğrudan yayına girer. Kuyruk yalnız insanın okuyacağı bir cümle olduğunda
-- vardır. Metin DÜZENLENMEZ — onay/ret vardır, sansürlü yeniden yazım yoktur (tasarım §6).

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
  -- Alım-sonrası davetten geldiyse (17.2) — davetin tamamlanma ilerlemesi buradan türetilir.
  feedback_request_id uuid,

  context feedback_context not null,

  rating int check (rating between 1 and 5),
  vote feedback_vote,
  comment text,
  -- Üç biçimden en az biri: hiçbiri yoksa ortada bir değerlendirme yoktur.
  constraint feedback_has_content check (
    rating is not null or vote is not null or length(btrim(coalesce(comment, ''))) > 0
  ),

  -- Metnin dili. **Çevrilmez**: yorum müşterinin kendi cümlesidir, makine çevirisi onu söylemediği
  -- bir hâle sokar. Metinsiz kayıtta boştur — ortada dil taşıyan bir şey yoktur.
  language preferred_language,
  constraint feedback_language_needs_text check (
    (length(btrim(coalesce(comment, ''))) > 0) = (language is not null)
  ),

  -- Kartta geçirilen süre — **sinyal kalitesi** için (DOMAIN §14 "ödül ≠ güven"). Yalnız kaydırmada
  -- anlamlıdır: yazılı yorumun süresi bir şey söylemez.
  dwell_ms int check (dwell_ms >= 0),

  status review_status not null default 'pending',
  moderated_at timestamptz,
  moderated_by uuid references public.user_profiles (id) on delete set null,
  -- **Damga İNSANIN kararına aittir.** Üç hâl, üç kural:
  --   · `pending`      → henüz karar yok, damga da olamaz
  --   · metinli + karar → kim ne zaman karar verdi yazılı olmalı (iz)
  --   · metinsiz        → kendiliğinden yayına girdi; kimse karar vermedi, damgası da yok
  -- Damgayı üçüncü hâlde de zorunlu kılmak, olmayan bir moderatörü kayda geçirmek olurdu.
  -- **Kısıt `moderated_by`'ı ZORLAMAZ ve bu bilinçlidir:** kolon `on delete set null`'dır (personel
  -- profili silinince iz null'a döner). `not null` istenseydi bir moderatörü silmek, geçmişteki her
  -- kararını ihlal hâline getirir ve silmeyi imkânsız kılardı. "Kim" bu yüzden en-iyi-çaba bir izdir;
  -- YAZILDIĞINI garanti eden yer kapıdır (`moderate(id, status, moderatedBy)` — imzada zorunlu).
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

  created_at timestamptz not null default now()
);

alter table public.product_feedback enable row level security;

-- **Aynı ürüne bir müşteriden, bağlam başına tek kayıt.** İkinci kez alan müşteri görüşünü
-- GÜNCELLER; aynı kişinin iki yıldızı ortalamayı iki kez etkilerdi. Puan tavanı ("aynı ürüne bir
-- kez puan") da bu tekliğe yaslanır.
--
-- Ziyaretçide (`customer_id` null) tekillik YOKTUR ve olamaz: tekilleştirmek kimlik tutmayı
-- gerektirirdi. Aday panosundaki sayı bu yüzden mutlak bir "kişi" değil ilgi yoğunluğudur —
-- `postal_code_demand` ile aynı bilinçli kabul (0029).
create unique index product_feedback_customer_key
  on public.product_feedback (customer_id, product_id, context)
  where customer_id is not null;

-- Moderasyon kuyruğu: bekleyenler en eski önce (bekleyeni bekletmemek). Metinsiz kayıt buraya hiç
-- düşmediği için indeks de dar kalır.
create index product_feedback_pending_idx on public.product_feedback (created_at) where status = 'pending';
-- Ürün sayfasının okuması: o ürünün yayınlanmış YAZILI yorumları, yeniden eskiye.
create index product_feedback_published_idx on public.product_feedback (product_id, created_at desc)
  where status = 'approved' and comment is not null;
-- Skor ve pano toplamaları.
create index product_feedback_product_idx on public.product_feedback (product_id, context);
create index product_feedback_customer_idx on public.product_feedback (customer_id) where customer_id is not null;
create index product_feedback_request_idx on public.product_feedback (feedback_request_id) where feedback_request_id is not null;

-- ── Ürün skoru ──────────────────────────────────────────────────────────────
-- **Türetilir, saklanmaz** (DATA_MODEL "türetme ilkesi"): kaynak daima `product_feedback`. Bir
-- `rating_avg` kolonu tutulsaydı, reddedilen bir yorumdan sonra tazelenmeyi unutan tek bir yol
-- ürünün puanını kalıcı olarak yanlış gösterirdi.
--
-- **Görünüm HAM sayıları verir, birleştirmez.** "Yıldız ortalaması + beğeni oranı → tek puan"
-- formülü motorda tek yerde durur (`domain-core/feedback`): katsayı burada gömülü olsaydı, ekranın
-- gösterdiği skorla motorun hesapladığı bir gün ayrışırdı.
--
-- Moderasyon süzgeci reddedilmiş bir yorumun YILDIZINI da dışarıda bırakmak için gerekli — metinsiz
-- kayıtlar zaten hep `approved` doğar.
--
-- **Yalnız `purchase` bağlamı sayılır.** Aday kaydırması bir SATIN ALMA beyanı değildir: ürünü
-- görmemiş, tatmamış birinin "ilgimi çekti"si ile ürünü yiyip beğenenin sözü aynı kefeye konamaz.
-- Üstelik ziyaretçi kaydırması tekilleştirilmiyor — aday evresinde toplanan yüzlerce savurma, ürün
-- satışa geçtiğinde puanını hiç kimse almamışken 4.8 gösterirdi. Aday sinyali kendi panosunda ve
-- kendi ağırlığıyla yaşar (`listCandidateDemand`).
create or replace view public.product_rating as
select f.product_id,
       round(avg(f.rating) filter (where f.rating is not null), 2) as rating_avg,
       count(*) filter (where f.rating is not null)                as rating_count,
       count(*) filter (where f.vote = 'like')                     as like_count,
       count(*) filter (where f.vote = 'dislike')                  as dislike_count,
       count(*) filter (where length(btrim(coalesce(f.comment, ''))) > 0) as comment_count
  from public.product_feedback f
 where f.status = 'approved'
   and f.context = 'purchase'
 group by f.product_id;

comment on view public.product_rating is
  'Ürün skorunun HAM sayıları — yıldız + beğeni; tek puana çevirme motorda (17.1).';

-- ── Aday ürün talep panosu: GÖRÜNÜM YOK ─────────────────────────────────────
-- Burada bir `candidate_demand` görünümü vardı ve KALDIRILDI. Sebebi duplication: panonun sayıları
-- zaten uygulama katmanında hesaplanıyor (`listCandidateDemand`), çünkü sıralama ham beğeniye değil
-- **ağırlıklı** sinyale göredir ve ağırlık kuralı motorda yaşar (`swipeWeight`). Görünüm aynı
-- soruya ikinci ve ağırlıksız bir cevap veriyordu; ikisi bir gün ayrışırdı.
