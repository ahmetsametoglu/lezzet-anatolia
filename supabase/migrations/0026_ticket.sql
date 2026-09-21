-- Müşteri talebi (DOMAIN §15): üç durumlu sade döngü, atama ve SLA yok. İade tetiklenir ama parası ve stoğu siparişte yaşar,
-- kuyruk sırası da son mesajdan türetilir (`ticket_queue`), kolona kopyalanmaz.

-- Durum adları iç dildir, müşteriye yüzey çevirir; iki ayrı durum alanı aynı gerçeği iki kez yazardı.

create type ticket_type as enum ('damaged', 'missing', 'question', 'other');
create type ticket_status as enum ('open', 'in_progress', 'resolved');
-- Geliş yolu. `conversation_id`'den TÜRETİLEMEZ: konuşma bağı yalnız WhatsApp'ı ayırır — "sipariş
-- detayından geldi" ile "genel formdan gelip sipariş seçti" ikisi de `order_id` dolu bırakır, ama
-- admin için farklı şeylerdir (birincisinde müşteri neyden şikâyet ettiğini biliyordu).
create type ticket_source as enum ('order', 'form', 'whatsapp', 'admin');
-- Talebi kim yürütüyor: `hybrid`te AI yalnız taslak yazar ve operatör onaylamadan hiçbir şey gitmez, `ai` özerktir.
-- İki hâli tek değere sıkıştırmak "AI ne yapabilir" sorusunu satırdan silerdi; enum'u `conversation.handled_by` de kullanır.
create type ticket_handler as enum ('human', 'hybrid', 'ai');
-- `ai` üçüncü bir göndericidir: "AI yazdı" bilgisini `admin` içine gömmek, sonradan "bunu kim
-- söyledi" sorusunu cevapsız bırakırdı. Müşteriye giden metin aynıdır; ayrım iç izlenebilirliktir.
create type ticket_sender as enum ('customer', 'admin', 'ai');

create table public.ticket (
  id uuid primary key default gen_random_uuid(),

  customer_id uuid not null references public.user_profiles (id) on delete cascade,

  -- Siparişsiz talep de geçerlidir (genel soru) — o zaman kalem ve iade bağlamı yoktur.
  order_id uuid references public.order (id) on delete set null,
  -- Müşterinin işaretlediği kalemler. Dizi, junction tablosu DEĞİL: bu küme talebin bir
  -- ÖZELLİĞİdir, kendi başına sorgulanan bir varlık değil — "hangi kalemler şikâyetli" sorusu
  -- daima bir talebin içinden sorulur.
  order_item_ids uuid[] not null default '{}',
  -- WhatsApp'tan açıldıysa konuşma bağı (15.x). Zeminde admin elle açar, canlı kanalda AI açar.
  conversation_id uuid,

  source ticket_source not null,
  type ticket_type not null,
  status ticket_status not null default 'open',
  handled_by ticket_handler not null default 'human',

  -- Hibrit modun bekleyen cevabı satırda durur, mesaj değil: yazışma müşteriye görünen defterdir. Damga önbellek anahtarıdır,
  -- son mesajdan sonra üretildiyse model yeniden çağrılmaz; tüketilince ikisi birden boşalır.
  ai_draft_reply text,
  ai_draft_generated_at timestamptz,

  -- Kuyrukta ve müşterinin listesinde okunan kısa başlık ("Eksik geldi · Gözleme").
  subject text,

  -- İadeyi hangi talebin doğurduğu; bir siparişe birden çok talep açılabildiği için bu bağ yazılmazsa bilinemez.
  -- Tutar ve durum siparişin iade hareketlerinden okunur.
  return_triggered_at timestamptz,

  -- Müşterinin okumadığı ilk karşı taraf cevabının anı: yalnız boşsa doldurulur ki her yeni satır mail saatini sıfırlamasın.
  -- Müşteri okuyunca ya da mail gidince boşalır; ayrı "okundu" damgası aynı gerçeği iki yerde tutardı.
  reply_pending_since timestamptz,

  created_at timestamptz not null default now(),
  -- `resolved` damgası. Yeniden açılınca null'a döner: "ne zaman çözüldü" sorusunun cevabı, hâlâ
  -- açık bir talepte olamaz.
  resolved_at timestamptz,

  -- Durum ile damga ayrışamaz.
  constraint ticket_resolved_stamp check (
    (status = 'resolved' and resolved_at is not null) or (status <> 'resolved' and resolved_at is null)
  ),
  -- Kalem işaretlemek sipariş seçmeyi gerektirir; siparişsiz talepte kalem kümesi anlamsızdır.
  constraint ticket_items_need_order check (order_id is not null or cardinality(order_item_ids) = 0),
  -- Geliş yolu kendi bağını ister: WhatsApp'tan gelen konuşmasız, siparişten gelen siparişsiz olamaz.
  constraint ticket_source_link check (
    (source <> 'whatsapp' or conversation_id is not null)
    and (source <> 'order' or order_id is not null)
  ),
  -- Taslak ile damgası ayrışamaz: damgasız taslak önbellek kararını (yeniden üret mi?) imkânsız
  -- kılar, taslaksız damga ise "tüketildi" ile "hiç üretilmedi"yi aynı gösterirdi.
  constraint ticket_ai_draft_stamp check ((ai_draft_reply is null) = (ai_draft_generated_at is null))
);

alter table public.ticket enable row level security;

-- Müşterinin "Taleplerim" listesi — kendi talepleri, yeniden eskiye.
create index ticket_customer_idx on public.ticket (customer_id, created_at desc);
-- Sipariş detayındaki "bu siparişe bağlı talep" rozeti.
create index ticket_order_idx on public.ticket (order_id) where order_id is not null;
-- Kuyruğun varsayılan odağı: kapanmamış talepler.
create index ticket_open_idx on public.ticket (status, created_at desc) where status <> 'resolved';
create index ticket_conversation_idx on public.ticket (conversation_id) where conversation_id is not null;
-- Cevap maili süpürgesi yalnız bekleyenlere bakar; kümenin normal hâli boş olduğundan kısmi indeks tam taramayı önler.
create index ticket_reply_pending_idx on public.ticket (reply_pending_since) where reply_pending_since is not null;

-- ── Yazışma ──────────────────────────────────────────────────────────────────
-- Talebin ilk açıklaması da bir mesajdır, ayrı kolon ekranı ikisini birleştirmeye zorlardı. İç not yok, çünkü yanlış kutuya
-- yazılmış bir iç cümle müşteriye giderdi.
create table public.ticket_message (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.ticket (id) on delete cascade,

  sender ticket_sender not null,
  -- Yazan personel — yalnız `admin` mesajında. Müşteri zaten talebin sahibidir, AI'ın kimliği yok.
  author_id uuid references public.user_profiles (id) on delete set null,

  body text not null check (length(btrim(body)) > 0),

  -- Yazışma iki yönlü olduğu için çeviri de iki yönlüdür; `language` metnin gerçek dili, `translations` yalnız makine
  -- çevirisi ve `translated_at` başarısızlıkta da yazılır. Gönderilmiş mesaj değişmediği için çeviri düşüren tetikleyici yok.
  language text check (language ~ '^[a-z]{2,3}$'),
  translations jsonb,
  translated_at timestamptz,
  -- R2 anahtarları (`r2Keys.ticketAttachment`). Bozuk ürün fotoğrafı: isteğe bağlı ama çözümü
  -- hızlandırır — mobilde kameradan doğrudan çekilir.
  attachments text[] not null default '{}',

  created_at timestamptz not null default now(),

  constraint ticket_message_author check (
    (sender = 'admin' and author_id is not null) or (sender <> 'admin' and author_id is null)
  )
);

alter table public.ticket_message enable row level security;

-- Yazışmanın tek okuma deseni: bir talebin mesajları, zaman sırasıyla.
create index ticket_message_ticket_idx on public.ticket_message (ticket_id, created_at);

-- Çeviri kuyruğu (20.2) — çevrilmemiş mesajlar, en eski önce. Çevrildikçe indeksten düşer.
create index ticket_message_untranslated_idx on public.ticket_message (created_at) where translated_at is null;

-- ── Kuyruk görünümü ──────────────────────────────────────────────────────────
-- Kuyruk tek sorgudur, yoksa 30 satır 90 sorgu olurdu. `awaiting_reply` son sözü müşteri söylediyse doğrudur;
-- durumdan çıkarılamaz, çünkü `in_progress` talepte müşteri yeni yazmış olabilir.
create or replace view public.ticket_queue as
select t.*,
       coalesce(m.last_message_at, t.created_at) as last_message_at,
       coalesce(m.message_count, 0)              as message_count,
       coalesce(m.last_sender = 'customer', false) as awaiting_reply,
       -- Sıra anahtarı: cevap bekleyenler üstte, kendi içinde en taze önce. Tek sütun, çünkü keyset imleci tek sıralama
       -- alanına dayanır; bekleyenler bir yüzyıl ileri alınır, bu yüzden sahte tarihtir ve ekrana çıkmaz.
       (case when coalesce(m.last_sender = 'customer', false)
             then coalesce(m.last_message_at, t.created_at) + interval '100 years'
             else coalesce(m.last_message_at, t.created_at)
        end)                                     as queue_sort_at,
       coalesce(m.has_attachment, false)         as has_attachment,
       (t.return_triggered_at is not null)       as return_triggered,
       -- Kuyrukta okunan önizleme; tam metin detayda. Satır sonu ekranda yer açmasın diye
       -- kırpma yapılmaz — kısaltma bir SUNUM kararıdır, veri kapısına ait değildir.
       m.last_body                               as last_message_body,
       -- **Önizlemenin ÇEVİRİSİ de buradan gelir** (20.2): detay çevrilip kuyruk çevrilmezse
       -- personel talebi ancak AÇARAK triyaj edebilir — kuyruğun tek işi ise açmadan sıralamaktır.
       -- Satır satır mesaj tablosuna gitmek 30 satırlık kuyrukta 30 ek tur olurdu; görünüm zaten o
       -- mesajı okuduğu için iki alan bedavaya geliyor.
       m.last_language                           as last_message_language,
       m.last_translations                       as last_message_translations,
       -- AI bu talepte hiç konuştu mu: operatör devralınca `handled_by` `human`'a döner ama AI'ın mesajı kalır,
       -- kalite kontrolü tam o kümeye bakar. Mesaj silinmediği için `true` bir daha `false` olmaz.
       coalesce(m.answered_by_ai, false)         as answered_by_ai,
       c.name                                    as customer_name,
       o.reference_no                            as order_reference_no
  from public.ticket t
  join public.user_profiles c on c.id = t.customer_id
  left join public.order o on o.id = t.order_id
  left join lateral (
    select max(created_at) as last_message_at,
           count(*)        as message_count,
           bool_or(cardinality(attachments) > 0) as has_attachment,
           bool_or(sender = 'ai')                as answered_by_ai,
           (array_agg(sender order by created_at desc))[1] as last_sender,
           (array_agg(body   order by created_at desc))[1] as last_body,
           (array_agg(language     order by created_at desc))[1] as last_language,
           (array_agg(translations order by created_at desc))[1] as last_translations
      from public.ticket_message
     where ticket_id = t.id
  ) m on true;

comment on view public.ticket_queue is
  'Talep kuyruğu: son mesaj zamanı, cevap bekliyor mu, fotoğraf var mı — hepsi türetilir (16.1).';

-- ── Açılış ve cevap: TEK turda ───────────────────────────────────────────────
-- Talep ile ilk mesajı iki ayrı yazımla atmak, ikincisi düştüğünde **anlatımsız bir talep**
-- bırakırdı: kuyrukta duran, açanın ne dediği bilinmeyen bir satır. İki tabloya birden dokunan
-- yazım tek RPC'dir (STACK §13 (b)).
create or replace function public.create_ticket(
  p_customer_id uuid,
  p_source ticket_source,
  p_type ticket_type,
  p_body text,
  p_order_id uuid default null,
  p_order_item_ids uuid[] default '{}',
  p_conversation_id uuid default null,
  p_subject text default null,
  p_attachments text[] default '{}',
  -- Personelin elle açtığı talepte ilk mesajın sahibi odur; müşteri kendi açtığında boş kalır.
  p_author_id uuid default null,
  p_sender ticket_sender default 'customer'
) returns public.ticket
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ticket public.ticket;
begin
  insert into public.ticket (customer_id, order_id, order_item_ids, conversation_id, source, type, subject)
  values (p_customer_id, p_order_id, coalesce(p_order_item_ids, '{}'), p_conversation_id, p_source, p_type, p_subject)
  returning * into v_ticket;

  -- İlk açıklama BİR MESAJDIR — ayrı bir `description` kolonu, müşterinin anlatımını sonraki
  -- cevaplarından koparırdı.
  insert into public.ticket_message (ticket_id, sender, author_id, body, attachments)
  values (v_ticket.id, p_sender, p_author_id, p_body, coalesce(p_attachments, '{}'));

  return v_ticket;
end;
$$;

-- `p_new_status` karar değil, taşınmasıdır: hangi cevabın durumu değiştirdiğine motor karar verir
-- (`statusAfterCustomerReply`), kuralın SQL kopyası olmasın.
create or replace function public.reply_ticket(
  p_ticket_id uuid,
  p_sender ticket_sender,
  p_body text,
  p_attachments text[] default '{}',
  p_author_id uuid default null,
  p_new_status ticket_status default null
) returns public.ticket_message
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_message public.ticket_message;
begin
  insert into public.ticket_message (ticket_id, sender, author_id, body, attachments)
  values (p_ticket_id, p_sender, p_author_id, p_body, coalesce(p_attachments, '{}'))
  returning * into v_message;

  if p_new_status is not null then
    update public.ticket
       set status = p_new_status,
           -- Damga ile durum ayrışamaz (tablo kısıtı da bunu zorlar).
           resolved_at = case when p_new_status = 'resolved' then now() else null end
     where id = p_ticket_id;
  end if;

  return v_message;
end;
$$;

revoke all on function public.create_ticket(uuid, ticket_source, ticket_type, text, uuid, uuid[], uuid, text, text[], uuid, ticket_sender) from anon;
revoke all on function public.reply_ticket(uuid, ticket_sender, text, text[], uuid, ticket_status) from anon;

-- ── Ürün başına şikâyet yoğunluğu ───────────────────────────────────────────────
-- Fonksiyon, çünkü dönem parametresi gerekir ve görünüm parametre almaz. `count(distinct t.id)` bir talebin üç kalemini
-- tek şikâyet sayar; yalnız `damaged` ve `missing` sayılır, çünkü soru bir kalite sinyalidir.
create or replace function public.product_complaint_signal(
  p_since timestamptz default null,
  p_product_ids uuid[] default null
) returns table (
  product_id uuid,
  complaint_count int,
  damaged_count int,
  missing_count int,
  last_complaint_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select pv.product_id,
         count(distinct t.id)::int                                          as complaint_count,
         count(distinct t.id) filter (where t.type = 'damaged')::int        as damaged_count,
         count(distinct t.id) filter (where t.type = 'missing')::int        as missing_count,
         max(t.created_at)                                                  as last_complaint_at
    from public.ticket t
    cross join lateral unnest(t.order_item_ids) as kalem(id)
    join public.order_item i on i.id = kalem.id
    join public.product_variant pv on pv.id = i.variant_id
   where t.type in ('damaged', 'missing')
     and (p_since is null or t.created_at >= p_since)
     and (p_product_ids is null or pv.product_id = any (p_product_ids))
   group by pv.product_id;
$$;

comment on function public.product_complaint_signal(timestamptz, uuid[]) is
  'Ürün başına şikâyet yoğunluğu (16.6). Talep başına TEK sayılır; yalnız damaged/missing.';

revoke all on function public.product_complaint_signal(timestamptz, uuid[]) from anon, authenticated;
grant execute on function public.product_complaint_signal(timestamptz, uuid[]) to service_role;
