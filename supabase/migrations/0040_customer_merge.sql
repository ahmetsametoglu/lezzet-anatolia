-- Modül 09 — Müşteri birleştirme (09.10). DOMAIN §10, operasyon talebi 08.08.
--
-- ── NEDEN GEREKİYOR ─────────────────────────────────────────────────────────
-- Aynı insan sistemde iki kez var: WhatsApp/telefondan yazınca taslak açılıyor (elimizde yalnız
-- numara), sonra aynı kişi siteye girip e-postayla hesap kuruyor. `resolveIdentity` ikisini
-- birleştiremiyor çünkü ortak anahtar yok — birinde telefon var e-posta yok, ötekinde tersi.
-- Kopyayı ENGELLEMEK mümkün değil (iki farklı kanaldan iki farklı anahtarla geliyor); çözüm
-- admin'in birleştirmesi ve bu fonksiyon o eylemin kapısı.
--
-- ── TEK İŞLEM, YARIM BİRLEŞME YOK ───────────────────────────────────────────
-- Bir satır taşınamazsa hiçbiri taşınmamalı. Yarısı taşınmış iki kayıt, hiç birleştirilmemiş iki
-- kayıttan KÖTÜDÜR: artık hangisinin doğru olduğu belli değildir ve operatörün elinde onu
-- anlayacak bir iz yoktur. Fonksiyon gövdesi tek transaction'dır — herhangi bir adım fırlatırsa
-- tamamı geri alınır.
--
-- ── KİMLİK ANAHTARLARI HEDEFE GEÇER — BİRLEŞTİRMENİN ASIL SEBEBİ BU ─────────
-- Operasyonun listesinde yoktu ama işin kalbi burası: taslakta telefon, web kaydında e-posta var.
-- Birleşme sonunda hedef İKİSİNİ de taşımalı, yoksa aynı kişi yarın üçüncü kez taslak açar ve
-- birleştirme hiçbir şey çözmemiş olur. Boş olan alan doldurulur, DOLU olan EZİLMEZ (hedef
-- kazanır — `enrich` ile aynı kural).
--
-- ── ÜÇ ÇAKIŞMA VERİDEN GELİYOR ve sessizce çözülemez ────────────────────────
-- Tekillik indeksleri taşımayı reddedebilir. Üçü de ölçüldü, üçü de aynı ilkeyle çözülüyor —
-- **hedefinki kalır, kaynağınki düşer** (izinlerde ve ticari koşullarda operasyonun verdiği
-- kararın aynısı) — ve üçü de ÖN İZLEMEDE SAYILIYOR: operatör neyin düşeceğini onaydan önce görür.
--   1. `cart` birincil anahtarı `customer_id` — bir müşteri bir sepet. İkisinin de sepeti varsa
--      kaynağınki silinir. İki sepeti birleştirmek, müşterinin hiç kurmadığı bir sepeti uydurmaktır.
--   2. `product_feedback (customer_id, product_id, context)` — ikisi de aynı ürünü değerlendirmişse.
--   3. `points_entry (customer_id, gün) where reason='visit'` — ikisi de aynı gün ziyaret puanı
--      almışsa. Tekillik zaten "aynı gün iki kez sayılmasın" diyor; taşımak onu delerdi.
--
-- ── KAYNAK KAYIT SİLİNMEZ, KAPANIR ──────────────────────────────────────────
-- `order.customer_id` `restrict` — silme zaten reddedilirdi. Kapanış `merged_into_id` ile
-- işaretlenir ve ekran "bu kayıt X ile birleştirildi" diyebilir. `anonymized_at` deseninin ikizi:
-- orada da satır duruyor, kimliği boşalıyor.

alter table public.user_profiles
  -- **Kendine FK** — hedef kayıt gerçekten var olmalı. `restrict`: birleştirme HEDEFİ olan bir
  -- kaydı silmek, kaynağın izini kopuk bırakırdı ("X ile birleştirildi" ama X yok).
  add column merged_into_id uuid references public.user_profiles (id) on delete restrict,
  add column merged_at timestamptz,
  -- Birleştirmeyi YAPAN personel. `set null`: ayrılan personel izi götürür, kaydı değil
  -- (`settings.updated_by` ile aynı gerekçe).
  add column merged_by uuid references public.user_profiles (id) on delete set null,
  -- Damga ile bağ ayrışamaz: "ne zaman birleşti" sorusunun cevabı, birleşmemiş bir kayıtta olamaz.
  add constraint user_profiles_merge_stamp check ((merged_into_id is null) = (merged_at is null)),
  -- Kendine birleştirme veriden yasak: uygulama unutsa da satır girmez.
  add constraint user_profiles_merge_not_self check (merged_into_id is null or merged_into_id <> id);

-- Kapanmış kayıtları listeden düşürmek ve "X ile birleştirilenler" sorusunu cevaplamak için.
create index user_profiles_merged_into_idx on public.user_profiles (merged_into_id) where merged_into_id is not null;

comment on column public.user_profiles.merged_into_id is
  'Bu kayıt hangi müşteriye birleştirildi (09.10). null = birleştirilmedi. Kayıt silinmez, kapanır.';

-- ── Ön izleme: onaydan ÖNCE ne olacağını söyler ──────────────────────────────
-- Görev satırının bitti-kriteri "taşınacaklar onaydan önce net" diyor. Sayıları ekranda tek tek
-- saymak beş ayrı okuma olurdu; daha kötüsü, taşımanın kendisiyle AYRI bir listeden türerdi ve iki
-- liste bir gün ayrışınca operatör onayladığından farklı bir şey taşınmış olurdu.
--
-- **Düşecekler de sayılıyor** ve bu bir dürüstlük kararı: yalnız kazanımı gösteren bir onay
-- ekranı, kaybı gizler. Operatör "3 değerlendirme taşınacak, 1'i düşecek" cümlesini görmeli.
create or replace function public.preview_customer_merge(
  p_target_id uuid,
  p_source_id uuid
) returns table (
  orders int,
  addresses int,
  tickets int,
  conversations int,
  feedback int,
  feedback_dropped int,
  points int,
  points_delta int,
  points_dropped int,
  cart_dropped boolean,
  gains_phone boolean,
  gains_email boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with hedef as (select phone, email from public.user_profiles where id = p_target_id),
       kaynak as (select phone, email from public.user_profiles where id = p_source_id),
       -- Çakışan değerlendirme: kaynağın satırı, hedefte AYNI (ürün, bağlam) ikilisiyle zaten var.
       fb_cakisan as (
         select f.id from public.product_feedback f
          where f.customer_id = p_source_id
            and exists (
              select 1 from public.product_feedback t
               where t.customer_id = p_target_id and t.product_id = f.product_id and t.context = f.context
            )
       ),
       -- Çakışan ziyaret puanı: aynı GÜN (Paris saatiyle — indeks de öyle tanımlı).
       pt_cakisan as (
         select p.id, p.points from public.points_entry p
          where p.customer_id = p_source_id and p.reason = 'visit'
            and exists (
              select 1 from public.points_entry t
               where t.customer_id = p_target_id and t.reason = 'visit'
                 and (t.created_at at time zone 'Europe/Paris')::date = (p.created_at at time zone 'Europe/Paris')::date
            )
       )
  select
    (select count(*)::int from public.order where customer_id = p_source_id),
    (select count(*)::int from public.address where customer_id = p_source_id),
    (select count(*)::int from public.ticket where customer_id = p_source_id),
    (select count(*)::int from public.conversation where customer_id = p_source_id),
    (select count(*)::int from public.product_feedback where customer_id = p_source_id),
    (select count(*)::int from fb_cakisan),
    (select count(*)::int from public.points_entry where customer_id = p_source_id),
    -- Bakiyeye eklenecek NET puan: düşecek satırlar hariç. Sayı ile tutar ayrı iki sorudur —
    -- "12 hareket taşınacak" operatöre bakiyenin ne olacağını söylemez.
    (select coalesce(sum(points), 0)::int from public.points_entry where customer_id = p_source_id)
      - (select coalesce(sum(points), 0)::int from pt_cakisan),
    (select count(*)::int from pt_cakisan),
    (select exists (select 1 from public.cart where customer_id = p_source_id)
        and exists (select 1 from public.cart where customer_id = p_target_id)),
    (select (select phone from hedef) is null and (select phone from kaynak) is not null),
    (select (select email from hedef) is null and (select email from kaynak) is not null);
$$;

comment on function public.preview_customer_merge(uuid, uuid) is
  'Birleştirme ön izlemesi (09.10): ne taşınacak, ne düşecek, hedef hangi kimlik anahtarını kazanacak.';

-- ── Birleştirme ─────────────────────────────────────────────────────────────
create or replace function public.merge_customers(
  p_target_id uuid,
  p_source_id uuid,
  p_actor_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.user_profiles;
  v_source public.user_profiles;
begin
  if p_target_id = p_source_id then
    raise exception 'merge_customers: kayıt kendisiyle birleştirilemez (%)', p_target_id;
  end if;

  -- **Kilit SIRASI kimliğe göre** — iki operatör aynı iki kaydı ters yönde birleştirmeye kalkarsa
  -- kilitlenme (deadlock) doğardı. Sıralı kilit onu imkânsız kılar.
  perform 1 from public.user_profiles
   where id in (p_target_id, p_source_id)
   order by id
     for update;

  select * into v_target from public.user_profiles where id = p_target_id;
  if not found then raise exception 'merge_customers: hedef bulunamadı (%)', p_target_id; end if;
  select * into v_source from public.user_profiles where id = p_source_id;
  if not found then raise exception 'merge_customers: kaynak bulunamadı (%)', p_source_id; end if;

  -- Personel kaydı birleştirilmez: istihdam kaydıdır ve denetim izleri (`actor_id`) ona bağlı.
  -- `anonymize_customer` ile aynı sınır.
  if not ('customer' = any (v_target.roles)) or not ('customer' = any (v_source.roles)) then
    raise exception 'merge_customers: yalnız müşteri kayıtları birleştirilebilir';
  end if;

  -- **Zincirleme birleşme YASAK** (A→B→C): izi takip edilemez kılar ve "bu kayıt nereye gitti"
  -- sorusunun cevabı bir zincire dönüşür. Kapanmış bir kayıt ne hedef ne kaynak olabilir.
  if v_source.merged_into_id is not null then
    raise exception 'merge_customers: kaynak zaten birleştirilmiş (%)', p_source_id;
  end if;
  if v_target.merged_into_id is not null then
    raise exception 'merge_customers: hedef zaten birleştirilmiş (%)', p_target_id;
  end if;
  -- Anonimleştirilmiş kayda taşımak, GDPR ile silinmiş bir kimliği geri doldurmak olurdu.
  if v_target.anonymized_at is not null or v_source.anonymized_at is not null then
    raise exception 'merge_customers: anonimleştirilmiş kayıt birleştirilemez';
  end if;

  -- ── 1) ÇAKIŞANLAR DÜŞER (hedefinki kalır) ────────────────────────────────
  delete from public.product_feedback f
   where f.customer_id = p_source_id
     and exists (
       select 1 from public.product_feedback t
        where t.customer_id = p_target_id and t.product_id = f.product_id and t.context = f.context
     );

  delete from public.points_entry p
   where p.customer_id = p_source_id and p.reason = 'visit'
     and exists (
       select 1 from public.points_entry t
        where t.customer_id = p_target_id and t.reason = 'visit'
          and (t.created_at at time zone 'Europe/Paris')::date = (p.created_at at time zone 'Europe/Paris')::date
     );

  -- Sepet: hedefinki varsa kaynağınki silinir; yoksa taşınır (aşağıda). İki sepeti birleştirmek,
  -- müşterinin hiç kurmadığı bir sepeti uydurmak olurdu.
  if exists (select 1 from public.cart where customer_id = p_target_id) then
    delete from public.cart where customer_id = p_source_id;
  end if;

  -- ── 2) TAŞINANLAR ────────────────────────────────────────────────────────
  -- Sipariş: referans numaraları DEĞİŞMEZ — dışarı gitmiş bir numaradır (fatura, e-posta, kargo).
  update public.order            set customer_id = p_target_id where customer_id = p_source_id;
  -- Adres: kaynağın varsayılanı varsayılan OLMAZ — hedefinki kalır (`is_default` sıfırlanır),
  -- yoksa birleşme sonrası teslimat adresi habersiz değişirdi.
  update public.address          set customer_id = p_target_id,
                                     is_default = case when exists (select 1 from public.address
                                                                     where customer_id = p_target_id and is_default)
                                                       then false else is_default end
                                 where customer_id = p_source_id;
  update public.cart             set customer_id = p_target_id where customer_id = p_source_id;
  update public.ticket           set customer_id = p_target_id where customer_id = p_source_id;
  update public.conversation     set customer_id = p_target_id where customer_id = p_source_id;
  update public.product_feedback set customer_id = p_target_id where customer_id = p_source_id;
  update public.points_entry     set customer_id = p_target_id where customer_id = p_source_id;
  update public.feedback_request set customer_id = p_target_id where customer_id = p_source_id;
  -- Müşteriye özel fiyat ve kişisel kupon: pazarlık kişiyle yapıldı, kişi hedefte devam ediyor.
  -- Çakışma riski yok — ikisinde de tekillik `customer_id` taşımıyor; birden çok satır zaten
  -- olağan ve çözücü `valid_from`a göre seçiyor.
  update public.price            set customer_id = p_target_id where customer_id = p_source_id;
  update public.discount         set customer_id = p_target_id where customer_id = p_source_id;
  update public.discount_use     set customer_id = p_target_id where customer_id = p_source_id;
  update public.zone_notice      set customer_id = p_target_id where customer_id = p_source_id;
  update public.variant_stock_notice set customer_id = p_target_id where customer_id = p_source_id;
  -- Getirdiği kişiler: bağ hedefe geçer, yoksa kaynak kapandığında getiren izi kopuk kalır.
  update public.user_profiles    set referred_by = p_target_id where referred_by = p_source_id;

  -- ── 3) ÖNCE KAYNAK KAPANIR — SIRA ZORUNLU ────────────────────────────────
  -- Anahtarlar boşaltılır; değerleri `v_source`da zaten duruyor. **Sıra ters olamaz:** hedefe önce
  -- yazsaydık, kaynak numarayı hâlâ tutuyorken iki satırda aynı telefon bulunur ve
  -- `user_profiles_phone_key` kısmi unique indeksi yazımı REDDEDERDİ. Testle ölçüldü — ilk yazımda
  -- sıra tersti ve birleştirmenin ASIL işlevi (anahtarın hedefe geçmesi) hiç çalışmıyordu.
  --
  -- `referral_code` da düşer: kapanmış bir kaydın davet bağlantısı çalışmamalı.
  update public.user_profiles
     set phone          = null,
         email          = null,
         auth_user_id   = null,
         referral_code  = null,
         merged_into_id = p_target_id,
         merged_at      = now(),
         merged_by      = p_actor_id
   where id = p_source_id;

  -- ── 4) KİMLİK ANAHTARLARI HEDEFE (boş olan dolar, dolu olan EZİLMEZ) ─────
  -- Birleştirmenin asıl sebebi: taslakta telefon, web kaydında e-posta. Hedef ikisini de taşımazsa
  -- aynı kişi yarın üçüncü kez taslak açar ve birleştirme hiçbir şey çözmemiş olur.
  update public.user_profiles
     set phone        = coalesce(v_target.phone, v_source.phone),
         email        = coalesce(v_target.email, v_source.email),
         auth_user_id = coalesce(v_target.auth_user_id, v_source.auth_user_id),
         referred_by  = coalesce(v_target.referred_by, v_source.referred_by),
         -- Auth bağı geldiyse taslaklık düşer: doğrulanmış bir giriş var artık.
         is_draft     = case when coalesce(v_target.auth_user_id, v_source.auth_user_id) is not null
                             then false else v_target.is_draft end
   where id = p_target_id;
end;
$$;

comment on function public.merge_customers(uuid, uuid, uuid) is
  'Müşteri birleştirme (09.10): kaynağın kayıtları hedefe taşınır, kimlik anahtarları hedefe geçer, '
  'kaynak KAPANIR (silinmez). Tek işlem; çakışanlarda hedefinki kalır. Personel/anonim/zincir reddedilir.';

revoke all on function public.merge_customers(uuid, uuid, uuid) from anon, authenticated;
revoke all on function public.preview_customer_merge(uuid, uuid) from anon;
