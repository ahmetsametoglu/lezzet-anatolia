-- Modül 17 — Puan defteri ve sadakat (17.4). DOMAIN §14.
--
-- **Defter (ledger), sayaç değil.** Bakiye = Σ `points`; hiçbir yerde saklanmaz. Bir `balance`
-- kolonu tutulsaydı, iptal edilen bir kazanımdan sonra düzeltmeyi unutan tek bir yol müşterinin
-- bakiyesini kalıcı olarak yanlış gösterirdi — ve bu para gibi bir şeydir, müşteri fark eder.
-- Aynı desen: `MoneyMovement` ↔ hesap bakiyesi, `Reservation` ↔ ayrılmış stok.
--
-- ── İSTİSMAR TAVANI DEFTERİN KENDİSİNDE ─────────────────────────────────────
-- "Aynı ürüne bir kez puan" kuralı `(customer_id, reason, ref_id)` üzerinde kısmi UNIQUE indeksle
-- durur: uygulama katmanı unutsa bile ikinci puan yazılamaz. Kuralı yalnız koda yazmak, ikinci bir
-- yazma yolu açıldığı gün (WhatsApp ajanı, elle giriş, toplu tarama) sessizce delinmesi demekti.
-- Günlük tavan sayımla bakılır — sabit bir kural değil, ayarla değişen bir eşiktir.
--
-- ── PUAN YALNIZ B2C ─────────────────────────────────────────────────────────
-- B2B'nin zaten özel fiyatı var (DOMAIN §14); oyunlaştırma son kullanıcı içindir. Kural motorda
-- (`canEarnPoints`) çünkü müşteri tipini okumak gerekir — şema onu bilmez.

create type points_reason as enum (
  -- Yazılı yorum/yıldız — en değerli beyan, en yüksek puan.
  'review',
  -- Alım-sonrası ankette beğeni (`ProductFeedback.context='purchase'`).
  'feedback_purchase',
  -- Keşifte aday ürün kaydırması (`context='candidate'`) — en ucuz aksiyon.
  'feedback_candidate',
  -- Sipariş verme.
  'order',
  -- Getiren müşteri (17.7 zemini).
  'referral',
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

-- **Aynı kaynaktan iki kez puan yok.** `ref_id` boş olan satırlar (elle düzeltme) kapsam dışı:
-- patron aynı müşteriye iki kez jest yapabilmeli.
create unique index points_entry_source_key
  on public.points_entry (customer_id, reason, ref_id)
  where ref_id is not null;

-- Bakiye ve geçmiş okuması.
create index points_entry_customer_idx on public.points_entry (customer_id, created_at desc);
-- Günlük tavan sayımı: müşterinin bugünkü kazanımları.
create index points_entry_daily_idx on public.points_entry (customer_id, created_at) where points > 0;

-- ── Bakiye ──────────────────────────────────────────────────────────────────
-- Türetilir. `earned`/`spent` ayrı gösterilir çünkü müşteri ekranı "topladın / harcadın" der;
-- tek bir net sayı, kazanımın büyüklüğünü görünmez kılardı.
create or replace view public.customer_points_balance as
select p.customer_id,
       sum(p.points)                                   as balance,
       sum(p.points) filter (where p.points > 0)        as earned,
       -abs(coalesce(sum(p.points) filter (where p.points < 0), 0)) as spent,
       max(p.created_at)                               as last_activity_at
  from public.points_entry p
 group by p.customer_id;

comment on view public.customer_points_balance is
  'Puan bakiyesi — defterden TÜRETİLİR, saklanmaz (17.4).';

-- ── Ayarlar ─────────────────────────────────────────────────────────────────
-- Değerler **parametrik**: hangi aksiyonun kaç puan ettiği bir iş kararıdır ve dağıtım beklemeden
-- değişebilmelidir (STACK §10). Buradaki sayılar makul başlangıçlardır, kutsal değil.
--
-- Ölçek bilinçli: 1 puan = 1 cent. "500 puan = 5 €" müşteriye anlatılabilir bir cümledir; 1 puan =
-- 0,03 € gibi bir oran, kazanımı hesaplanamaz kılardı.
insert into public.settings (key, value, description) values
  ('points_review',             '20',  'Yazılı yorum/yıldız puanı — en değerli beyan.'),
  ('points_feedback_purchase',  '5',   'Alım-sonrası beğeni puanı (aldığı ürünü değerlendirme).'),
  ('points_feedback_candidate', '2',   'Keşifte aday ürün kaydırma puanı — en ucuz aksiyon.'),
  ('points_order',              '10',  'Sipariş başına puan.'),
  ('points_referral',           '50',  'Getiren müşteriye puan (17.7).'),
  ('points_daily_cap',          '100', 'Bir müşterinin GÜNDE kazanabileceği azami puan — istismar freni.'),
  ('points_redeem_min',         '500', 'Kupona çevirmek için asgari puan (500 puan = 5 €).'),
  ('points_cent_value',         '1',   'Bir puanın kuruş değeri. 1 = puan başına 1 cent.')
-- Global satırın kısmi unique indeksi `scope_id is null` üzerindedir (0016).
on conflict (key) where scope_id is null do nothing;

-- ── Puan → kişisel kupon (17.5) ─────────────────────────────────────────────
-- **Bölünemez:** puan düşümü ile kuponun doğuşu tek transaction'dır (STACK §13 (b)). Ayrı iki
-- yazım olsaydı, ikincisi düştüğünde müşterinin puanı gitmiş ama kuponu doğmamış olurdu — ve bunu
-- fark eden müşteri haklı olarak parasının kaybolduğunu söylerdi.
--
-- **Kod dışarıdan gelir** (`generateReferenceNo` ile aynı sözleşme): rastgelelik motorda, benzersizlik
-- veritabanında. Çakışmada fonksiyon `unique_violation` fırlatır ve çağıran yeni kodla yeniden dener —
-- SQL içinde kod üretmek, müşteriye okunacak alfabeyi ikinci bir yerde tanımlamak olurdu.
--
-- KARAR BURADA DEĞİL: "çevirebilir mi, karşılığı ne" sorusunu motor yanıtlar (`canRedeem`);
-- fonksiyon yalnız o kararı uygular ve son bir kez bakiyeyi doğrular — arada geçen sürede başka
-- bir çevirme olmuş olabilir.
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

  -- **Müşteri başına serileştirme.** İki eşzamanlı çevirme aynı puanı iki kez harcayamamalı; ama
  -- bakiye bir SATIR değil bir TOPLAM olduğu için kilitlenecek bir satır da yok (`for update`
  -- agregatla çalışmaz). Doğru araç advisory kilit: müşterinin kimliği üzerinde, transaction
  -- boyunca. Farklı müşterilerin çevirmeleri birbirini beklemez.
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
    name, trigger, code, type, value, scope, customer_id, max_uses, per_customer_limit, is_active
  ) values (
    'Puan çevrimi',
    'coupon',
    p_code,
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
