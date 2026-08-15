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
  -- Getiren müşteri (17.7 zemini · 17.9 bağlantı) — HESAPSIZ birini müşteri yapmanın ödülü.
  'referral',
  -- **Komşu daveti (17.10)** — `referral`dan AYRI ve ayrılması şart, çünkü ölçtükleri şey farklı:
  -- `referral` yeni bir MÜŞTERİ kazandırır, `neighbor` var olan bir SEFERE ikinci bir sipariş
  -- ekler (aynı bölge, aynı gün → durak başına maliyet düşer). Davet edilen kişi zaten müşterimiz
  -- de olabilir; o hâlde `referral` hiç doğmaz ama komşu ödülü doğar. Tek sebebe yığılsalardı
  -- "davet bize ne kazandırdı" sorusunun iki farklı cevabı tek sayının içinde kaybolurdu.
  'neighbor',
  -- **Günlük ziyaret** — günde bir kez, site/keşif ziyareti için. Öteki sebeplerden AYRI durur ve
  -- ayrılması şart: onlar "veri bedeli"dir (müşteri bir beyanda bulundu), bu "gelme bedeli"dir
  -- (müşteri geri döndü). Aynı sebebe yığılsalardı aday panosunu okuyan kişi, ziyaretle beslenen
  -- puanı bir ürün sinyali sanardı.
  --
  -- Oy puanının ürün başına TEK olması bu satırla değişmiyor: her ziyarette yeniden ödemek,
  -- `signal-quality`'nin bastırmak için var olduğu davranışı satın almak olurdu.
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

-- **Aynı kaynaktan iki kez puan yok.** `ref_id` boş olan satırlar (elle düzeltme) kapsam dışı:
-- patron aynı müşteriye iki kez jest yapabilmeli.
create unique index points_entry_source_key
  on public.points_entry (customer_id, reason, ref_id)
  where ref_id is not null;

-- **Günde bir ziyaret puanı** — ve tekilliğin BURADA durması şart.
--
-- Yukarıdaki `points_entry_source_key` bu işi göremez: `ref_id is not null` ile sınırlı ve
-- ziyaretin işaret edeceği bir kaynak satır yok. `ref_id`ye tarihten türetilmiş sentetik bir uuid
-- yazmayı bilerek elemedim — o kolonun sözleşmesi "kaynak satır"dır, içine gerçek olmayan bir
-- kimlik koymak onu okuyan herkesi yanıltırdı.
--
-- Güvence uygulamada DEĞİL veride: `awardPoints` "bugün yazılmış mı" diye baksa bile iki eşzamanlı
-- istek arasına giren üçüncü bir istek iki satır yazardı ve kimse fark etmezdi.
--
-- **Takvim günü, yuvarlanan 24 saat DEĞİL** (kullanıcıya iletildi): yuvarlanan pencere
-- indekslenemez. Fark, 23:50'de kazanıp 00:10'da yeniden kazanabilmek — 10 cent'lik bir sınır için
-- kabul edilebilir, ve garantinin indekste kalması kodda kalmasından değerli.
--
-- **Gün İŞLETMENİN günüdür (Europe/Paris), sunucunun değil** — `earnedToday`'in günlük tavanıyla
-- BİREBİR aynı tanım. İkisi ayrı olsaydı yazın Paris'te 00:00–02:00 arasında tavan sıfırlanmış ama
-- ziyaret puanı henüz açılmamış olurdu: müşteri "günlük hakkım doldu" da göremez, puanı da alamazdı.
--
-- İlk yazımda burada `created_at::date` vardı ve migration **`42P17` ile düştü**: `timestamptz`'den
-- `date`'e cast STABLE'dır (sonuç oturumun `TimeZone` ayarına bağlı), indeks ifadesi olamaz.
-- `at time zone <sabit>` ise IMMUTABLE — çünkü sabit bir dilime çevirmek oturumdan bağımsızdır.
-- Yani engel sandığım şey çözümün ta kendisiymiş; UTC'ye razı olmaya hiç gerek yokmuş.
--
-- ⚠ **`'Europe/Paris'` burada ve `PointsService.BUSINESS_TIME_ZONE`'da AYRI AYRI yazılı** —
-- biri SQL, öteki TypeScript; paylaşılamıyor. İşletme taşınır ya da ikinci şube açılırsa İKİSİ
-- birden değişmeli: yalnız biri değişirse tavan ile ziyaret günü ayrışır ve hiçbir yerde hata
-- vermez, yalnız müşteri gecenin bir saatinde puanını alamaz.
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
       -- **Kaç KEZ kupona çevirdi** (operasyon talebi 03.08). `spent` bir muhasebe kaydıdır
       -- ("240 puan gitti"), bu bir DAVRANIŞTIR ("iki kez ödül aldı") — ekran ikisini ayrı
       -- okuyor ve çizim bunu istiyor.
       --
       -- Ölçüt **sebep**, işaret DEĞİL: negatif satırların hepsi kupon değil, `manual` bir
       -- düzeltme de negatif olabilir. `points < 0` ile saymak, elle yapılan bir düşümü
       -- müşterinin kazandığı ödül gibi gösterirdi.
       count(*) filter (where p.reason = 'redemption')::int          as redemption_count,
       max(p.created_at)                                            as last_activity_at
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
  -- DEĞER MERDİVENİ (kullanıcı kararı 11.08) — oran bilinçli BEŞ KAT: kalıcı bir müşteri
  -- kazandırmak, bir seferi doldurmaktan değerli. 500 aynı zamanda çevirme eşiğinin tamıdır
  -- (`points_redeem_min`), yani hesap ekranının "size de 5 € kupon" sözünü gerçek yapar.
  ('points_referral',           '500', 'Getiren müşteriye puan (17.7 · 17.9) — YENİ müşteri kazandırmanın ödülü.'),
  ('points_neighbor',           '100', 'Komşu daveti puanı (17.10) — var olan bir SEFERE ikinci sipariş eklemenin ödülü.'),
  ('points_visit',              '10',  'Günde bir kez site/keşif ziyareti puanı (≈0,10 €) — geri getirme enstrümanı, veri bedeli değil.'),
  -- Tavan YALNIZ para ödenmeden yapılabilen eylemleri kapsar (kullanıcı onayı 11.08): giriş +
  -- keşif oyu, azami 18 puan. Parayla gelen ödüller (yorum, alım-sonrası beğeni, iki davet)
  -- tavanın DIŞINDADIR — kural motorda (`CAPPED_POINTS_REASONS`). Tavanı YÜKSELTMEK davet
  -- ödüllerini kurtarmazdı: 500'lük ödül kısmi uygulanmayan tavana yine takılırdı; kurtaran şey
  -- kapsamın daralmasıydı (kullanıcı onayı 11.08).
  -- **270 (kullanıcı kararı 15.08)** — tavana tabi azami kazanç bugün 18 puan (giriş 10 +
  -- 4 aday kart × 2), yani sayı bugünkü davranışı DEĞİŞTİRMİYOR; kart sayısı ya da ziyaret puanı
  -- büyüdüğünde nefes payı bırakıyor. Değer geçici: kullanıcı *"sonra bakalım gene"* dedi.
  ('points_daily_cap',          '270', 'Bir müşterinin GÜNDE kazanabileceği azami puan — YALNIZ bedava eylemler için (istismar freni).'),
  ('points_redeem_min',         '500', 'Kupona çevirmek için asgari puan (500 puan = 5 €).'),
  ('points_cent_value',         '1',   'Bir puanın kuruş değeri. 1 = puan başına 1 cent.')
-- Global satırın kısmi unique indeksi `scope_id is null` üzerindedir (0013).
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
-- **Kod ayrı satırdır** (`discount_code`, 0031): bir kuponun birden çok kapısı olabilir. Puan
-- çevriminin tek kapısı var ve o kapı DİLSİZ (`locale = null`) — üretilen dize bir dile ait değil,
-- müşteriye özel bir anahtardır. Kod kuraldan SONRA yazılır: bağlanacağı satır olmadan yazılamaz,
-- ve ikisi aynı transaction'da olduğu için yarım bir kupon (kodsuz, dolayısıyla kullanılamaz) ortada
-- kalmaz.
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
    name, trigger, type, amount, scope, customer_id, max_uses, per_customer_limit, is_active
  ) values (
    'Puan çevrimi',
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

-- ── Puan tablosu (operasyon) — DÖNEMLİ ──────────────────────────────────────
-- Operasyon talebi (03.08): ekranın başlığında "Son 30 gün ▾" var ama hiçbir okuma dönem almıyordu,
-- o yüzden seçici hiç çizilmemişti — çalışmayan bir süzgeç, olmayandan kötüdür.
--
-- **Neden görünüm değil FONKSİYON:** `customer_points_balance` bir toplamdır ve toplamı dönemle
-- daraltmanın yolu parametredir; görünüm parametre alamaz. Aggregate'i uygulamada yapmak da
-- seçenek değildi: defterin tamamını çekip TS'te toplamak, defter büyüdükçe sessizce yavaşlar
-- (`CLAUDE §1` — veriyle büyüyen küme).
--
-- **Dönemsiz hâl de BURADAN geçer** (`p_since = null`): ekranın "tüm zamanlar" seçeneği ile
-- "son 30 gün" seçeneği aynı kod yolunu kullanır. İki ayrı uç olsaydı biri gün gelip ötekinden
-- farklı bir kural uygular ve fark hiçbir yerde hata vermezdi.
--
-- **`balance` dönem içinde bir DELTA'dır**, cüzdan bakiyesi değil — 30 günlük pencerede "bakiye"
-- diye okunacak bir sayı yok, o dönemde kazanılan eksi harcanan var. Kolon adı ortak kalıyor
-- (ekran aynı tabloyu çiziyor) ama anlamı `p_since` ile değişiyor; künye bunu söylüyor ve
-- ekranın başlığı da zaten dönemi yazıyor.
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
