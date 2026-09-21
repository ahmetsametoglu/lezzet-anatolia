-- Puan defteri (DOMAIN §14): bakiye Σ `points`tır ve saklanmaz, çünkü düzeltmeyi unutan tek yol onu kalıcı yanlış gösterirdi.
-- "Aynı kaynağa bir kez" tavanı indekste durur ki yeni bir yazma yolu onu delemesin; puanın yalnız B2C olması motordadır (`canEarnPoints`).

create type points_reason as enum (
  -- Yazılı yorum/yıldız — en değerli beyan, en yüksek puan.
  'review',
  -- Alım-sonrası ankette beğeni (`ProductFeedback.context='purchase'`).
  'feedback_purchase',
  -- Keşifte aday ürün kaydırması (`context='candidate'`) — en ucuz aksiyon.
  'feedback_candidate',
  -- Sipariş verme.
  'order',
  -- Getiren müşteri (17.7 zemini · 17.9 bağlantı) — HESAPSIZ birini müşteri yapmanın ödülü.
  'referral',
  -- `referral` yeni müşteri kazandırır, `neighbor` var olan sefere sipariş ekler; tek sebepte iki getirinin cevabı kaybolurdu.
  'neighbor',
  -- Günde bir kez ziyaret puanı: beyan bedeli değil gelme bedelidir, ayrı durur ki aday panosunda ürün sinyali sanılmasın.
  -- Oy puanı yine ürün başına tektir, yoksa bastırılmak istenen davranış satın alınırdı.
  'visit',
  -- Kupona çevirme — NEGATİF satır.
  'redemption',
  -- Personelin elle düzeltmesi (jest ya da hata telafisi); sebebi `note`'ta yazılı.
  'manual'
);

create table public.points_entry (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.user_profiles (id) on delete cascade,

  -- Delta: + kazanım, − harcama. Sıfır yazılamaz — hareketi olmayan bir hareket kaydı, defteri
  -- okunmaz yapar.
  points int not null check (points <> 0),
  reason points_reason not null,

  -- İlgili kayıt: `product_feedback.id`, `order.id`, `discount.id`… FK YOK ve olamaz: tek kolon
  -- birden çok tabloyu işaret ediyor. Bütünlüğü yazan kapı korur; buradaki değer bir İZDİR,
  -- üzerinden join yapılacak bir bağ değil.
  ref_id uuid,

  -- Serbest sebep — **yalnız `manual`'da** anlamlı: "gecikme telafisi — jest". `reason` neden
  -- verildiğinin SINIFI, `note` o tek olayın hikâyesi; ikisi ayrı sorular.
  note text,
  constraint points_manual_needs_note check (reason <> 'manual' or length(btrim(coalesce(note, ''))) > 0),

  -- Elle girişte personel; sistemin verdiği puanda boş.
  created_by uuid references public.user_profiles (id) on delete set null,
  constraint points_manual_needs_actor check (reason <> 'manual' or created_by is not null),

  created_at timestamptz not null default now()
);

alter table public.points_entry enable row level security;

-- Aynı kaynaktan iki kez puan yok; `ref_id` boş elle düzeltme kapsam dışıdır. İşarete göre iki indeks, çünkü ödül ile
-- geri alınması aynı üçlüyü paylaşır ve tek indeks iadede ters kaydı yazdırmazdı.
create unique index points_entry_source_key
  on public.points_entry (customer_id, reason, ref_id)
  where ref_id is not null and points > 0;

create unique index points_entry_reversal_key
  on public.points_entry (customer_id, reason, ref_id)
  where ref_id is not null and points < 0;

-- Günde bir ziyaret puanı, tekillik veride: iki eşzamanlı istek uygulama kontrolünü geçerdi, `ref_id`ye sentetik kimlik de
-- kolonun "kaynak satır" sözleşmesini bozardı. Gün işletmenin günüdür ve `at time zone` sabiti ifadeyi IMMUTABLE yapar.

-- `'Europe/Paris'` burada ve `PointsService.BUSINESS_TIME_ZONE`'da ayrı yazılı; biri değişirse tavan ile ziyaret günü ayrışır.
create unique index points_entry_visit_day
  on public.points_entry (customer_id, ((created_at at time zone 'Europe/Paris')::date))
  where reason = 'visit';

-- Bakiye ve geçmiş okuması.
create index points_entry_customer_idx on public.points_entry (customer_id, created_at desc);
-- Günlük tavan sayımı: müşterinin bugünkü kazanımları.
create index points_entry_daily_idx on public.points_entry (customer_id, created_at) where points > 0;

-- ── Bakiye ──────────────────────────────────────────────────────────────────
-- Türetilir. `earned`/`spent` ayrı gösterilir çünkü müşteri ekranı "topladın / harcadın" der;
-- tek bir net sayı, kazanımın büyüklüğünü görünmez kılardı.
create or replace view public.customer_points_balance as
-- **Üç toplam da `coalesce`'lu.** `filter` hiçbir satır tutmazsa `sum` NULL döner, sıfır değil:
-- yalnız harcaması olan bir müşteride (elle telafi kaydı gibi) `earned` NULL olur ve şema onu
-- zorunlu sayı beklediği için puan sayfası tek satır yüzünden çöker.
select p.customer_id,
       coalesce(sum(p.points), 0)                                   as balance,
       coalesce(sum(p.points) filter (where p.points > 0), 0)        as earned,
       -abs(coalesce(sum(p.points) filter (where p.points < 0), 0))  as spent,
       -- Kaç kez kupona çevirdi: ölçüt işaret değil sebep, çünkü negatif `manual` düzeltme ödül sayılmamalı.
       count(*) filter (where p.reason = 'redemption')::int          as redemption_count,
       max(p.created_at)                                            as last_activity_at
  from public.points_entry p
 group by p.customer_id;

comment on view public.customer_points_balance is
  'Puan bakiyesi — defterden TÜRETİLİR, saklanmaz (17.4).';

-- ── Ayarlar ─────────────────────────────────────────────────────────────────
-- Aksiyonların puanı dağıtım beklemeden değişebilen iş kararıdır; 1 puan = 1 cent, çünkü "500 puan = 5 €" anlatılabilir.
insert into public.settings (key, value, description) values
  ('points_review',             '20',  'Yazılı yorum/yıldız puanı — en değerli beyan.'),
  ('points_feedback_purchase',  '5',   'Alım-sonrası beğeni puanı (aldığı ürünü değerlendirme).'),
  ('points_feedback_candidate', '2',   'Keşifte aday ürün kaydırma puanı — en ucuz aksiyon.'),
  -- Kalıcı müşteri kazandırmak seferi doldurmaktan değerli, bu yüzden beş kat; 500 çevirme eşiğinin de tamıdır.
  ('points_referral',           '500', 'Getiren müşteriye puan (17.7 · 17.9) — YENİ müşteri kazandırmanın ödülü.'),
  ('points_neighbor',           '100', 'Komşu daveti puanı (17.10) — var olan bir SEFERE ikinci sipariş eklemenin ödülü.'),
  ('points_visit',              '10',  'Günde bir kez site/keşif ziyareti puanı (≈0,10 €) — geri getirme enstrümanı, veri bedeli değil.'),
  -- Tavan yalnız para ödenmeden yapılan eylemleri kapsar (`CAPPED_POINTS_REASONS`), parayla gelen ödüller dışındadır.
  -- 270 bugünkü azami bedava kazancın (18) çok üstündedir, kart ya da ziyaret puanı büyürse pay bırakır.
  ('points_daily_cap',          '270', 'Bir müşterinin GÜNDE kazanabileceği azami puan — YALNIZ bedava eylemler için (istismar freni).'),
  ('points_redeem_min',         '500', 'Kupona çevirmek için asgari puan (500 puan = 5 €).'),
  ('points_cent_value',         '1',   'Bir puanın kuruş değeri. 1 = puan başına 1 cent.')
-- Global satırın kısmi unique indeksi `scope_id is null` üzerindedir (0013).
on conflict (key) where scope_id is null do nothing;

-- ── Puan → kişisel kupon ────────────────────────────────────────────────────
-- Puan düşümü, kupon ve kodu tek işlemdir, yoksa puan gidip kupon doğmayabilirdi. Kod motordan gelir ve çakışmada çağıran
-- yeniden dener; "çevirebilir mi" kararı motorundur (`canRedeem`), fonksiyon bakiyeyi son kez doğrular.
create or replace function public.redeem_points(
  p_customer_id uuid,
  p_points int,
  p_value_cents int,
  p_minimum int,
  p_code text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_balance int;
  v_discount_id uuid;
begin
  if p_points <= 0 then
    raise exception 'redeem_points: çevrilecek puan pozitif olmalı';
  end if;

  -- Bakiye satır değil toplam olduğundan kilitlenecek satır yok; müşteri kimliğinde advisory kilit eşzamanlı iki çevirmeyi
  -- sıraya koyar, farklı müşteriler birbirini beklemez.
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));

  select coalesce(sum(points), 0) into v_balance
    from public.points_entry where customer_id = p_customer_id;

  if v_balance < p_points then
    return jsonb_build_object('ok', false, 'reason', 'insufficient_balance', 'balance_after', v_balance);
  end if;
  if p_points < p_minimum then
    return jsonb_build_object('ok', false, 'reason', 'below_minimum', 'balance_after', v_balance);
  end if;

  insert into public.discount (
    name, public_label, trigger, type, amount, scope, customer_id, max_uses, per_customer_limit, is_active
  ) values (
    'Puan çevrimi',
    -- Müşteriye görünen ad; `name` iç etikettir ve boş bırakılsa müşteri "Kampanya" görürdü.
    -- Sabit yazılı, çünkü bu satırı yalnız bu RPC yazar.
    '{"tr":"Puanlarınız","fr":"Vos points","de":"Ihre Punkte"}'::jsonb,
    'coupon',
    -- Sabit tutar: puanın karşılığı EURO'dur, yüzde değil. Yüzde olsaydı aynı puan farklı
    -- sepetlerde farklı değer ederdi ve "500 puan = 5 €" cümlesi yalan olurdu.
    'fixed',
    p_value_cents / 100.0,
    'cart',
    p_customer_id,
    -- Kişisel ve TEK kullanımlık: bir kez harcanan puan bir kez indirim doğurur.
    1,
    1,
    true
  ) returning id into v_discount_id;

  -- Kuponun tek kapısı. Tekillik indeksi burada: çakışan kod `unique_violation` fırlatır ve
  -- transaction'ın tamamı geri sarılır — puan da düşmemiş olur.
  insert into public.discount_code (discount_id, code, locale)
  values (v_discount_id, p_code, null);

  -- Harcama defterde NEGATİF satırdır; bakiye yine Σ ile türer.
  insert into public.points_entry (customer_id, points, reason, ref_id)
  values (p_customer_id, -p_points, 'redemption', v_discount_id);

  return jsonb_build_object(
    'ok', true,
    'discount_id', v_discount_id,
    'code', p_code,
    'value_cents', p_value_cents,
    'points_spent', p_points,
    'balance_after', v_balance - p_points
  );
end;
$$;

revoke all on function public.redeem_points(uuid, int, int, int, text) from anon;

-- ── Puan tablosu ─────────────────────────────────────────────────────────────
-- Fonksiyon, çünkü dönem parametresi gerekir ve defteri uygulamada toplamak veriyle yavaşlardı; dönemsiz hâl de
-- `p_since = null` ile aynı yoldan geçer. `balance` dönemde bir farktır, cüzdan bakiyesi değil.
create or replace function public.points_leaderboard(
  p_since timestamptz default null,
  p_limit int default 50
) returns table (
  customer_id uuid,
  balance int,
  earned int,
  spent int,
  redemption_count int,
  last_activity_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.customer_id,
         coalesce(sum(p.points), 0)::int                                  as balance,
         coalesce(sum(p.points) filter (where p.points > 0), 0)::int      as earned,
         -abs(coalesce(sum(p.points) filter (where p.points < 0), 0))::int as spent,
         count(*) filter (where p.reason = 'redemption')::int             as redemption_count,
         max(p.created_at)                                               as last_activity_at
    from public.points_entry p
   where p_since is null or p.created_at >= p_since
   group by p.customer_id
   -- Sıralama BAKİYEYE göre: "kim ne kadar biriktirmiş" genel resim çizer, son hareket tarihi
   -- bir istisna avı olurdu (tasarım §4). Eşitlikte `customer_id` belirleyici — yoksa aynı
   -- bakiyedeki iki müşterinin sırası koşudan koşuya değişir ve sayfa "oynar".
   order by balance desc, p.customer_id
   limit greatest(p_limit, 0);
$$;

comment on function public.points_leaderboard(timestamptz, int) is
  'Operasyon puan tablosu (17.4). `p_since` null ise tüm zamanlar; doluysa o dönemin DELTA''sı.';

revoke all on function public.points_leaderboard(timestamptz, int) from anon, authenticated;
grant execute on function public.points_leaderboard(timestamptz, int) to service_role;
