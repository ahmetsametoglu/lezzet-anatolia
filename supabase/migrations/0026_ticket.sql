-- Modül 16 — Müşteri talebi / şikâyeti (16.1). DOMAIN §15, `data-model/iletisim-geribildirim.md`.
--
-- **Karmaşık ticket sistemi DEĞİL.** Atama, öncelik matrisi, SLA sayacı yok; üç durumlu sade yaşam
-- döngüsü (`open → in_progress → resolved`, yeniden açılabilir). Ölçüt basit: müşteri sorununu
-- kolay iletsin, biz siparişe ve ürüne bağlı net veri görelim.
--
-- ── Bu tablonun YAZMADIĞI iki şey ────────────────────────────────────────────
--
--   • **İade.** Talep iadeyi TETİKLER, sonuçlandırmaz. Para ve stok gerçeği siparişte yaşar
--     (`adjust_fulfillment`, `record_order_movement`); burada yalnız tetiğin ANI durur
--     (`return_triggered_at`). Tutarı buraya da yazmak, aynı parayı iki defterde tutmak olurdu.
--   • **Kuyruk sırası.** "Son mesaj: bugün" `max(ticket_message.created_at)`'tir — tam ve
--     tek-anlamlı, yani türetilir (`ticket_queue` görünümü), kolona kopyalanmaz. Kopyalansaydı bir
--     gün mesaj eklenip damga güncellenmediğinde kuyruk yanlış sıralanır ve kimse fark etmezdi.
--
-- ── İç durum adları müşteriye GÖRÜNMEZ ───────────────────────────────────────
-- `open/in_progress/resolved` bizim dilimizdir; müşteri "Aldık, sıradayız / İlgileniyoruz /
-- Çözüldü" okur. Çeviri yüzeyin işidir, bu yüzden burada tek bir durum kümesi vardır — müşteri ve
-- personel için ayrı iki durum alanı, aynı gerçeğin iki kez yazılması olurdu.

create type ticket_type as enum ('damaged', 'missing', 'question', 'other');
create type ticket_status as enum ('open', 'in_progress', 'resolved');
-- Geliş yolu. `conversation_id`'den TÜRETİLEMEZ: konuşma bağı yalnız WhatsApp'ı ayırır — "sipariş
-- detayından geldi" ile "genel formdan gelip sipariş seçti" ikisi de `order_id` dolu bırakır, ama
-- admin için farklı şeylerdir (birincisinde müşteri neyden şikâyet ettiğini biliyordu).
create type ticket_source as enum ('order', 'form', 'whatsapp', 'admin');
-- Talebi kim yürütüyor. Faz 1'de hep `human`; alan yine de BAŞTAN var, çünkü sonradan eklenseydi o
-- güne kadarki her talebin geçmişi belirsiz kalırdı (16.5 AI işletme).
--
-- `hybrid` (kullanıcı kararı 16.08): AI cevap YAZMAZ, TASLAK yazar — operatör onaylamadan hiçbir
-- şey müşteriye gitmez (taslağın deposu `ai_draft_reply`). `ai` ise özerktir: cevap kendiliğinden
-- gider, operatör izler/devralır. İki hâli tek `ai` değerine sıkıştırmak, "AI ne yapabilir"
-- sorusunun cevabını satırdan silmek olurdu. Enum'u `conversation.handled_by` de kullanır (0039).
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

  -- ── AI taslağı (16.5'in deposu; UI 16.08'de öne çekildi) ───────────────────
  -- Hibrit modun bekleyen cevabı. SATIRDA durur, mesaj DEĞİL (20-yapay-zeka §75 kararı): yazışma
  -- müşteriye görünen defterdir, onaylanmamış taslak oraya giremez. Damga önbellek anahtarıdır —
  -- son mesajdan SONRA üretildiyse model yeniden çağrılmaz. Motor (16.5) yazar, bugün seed yazar;
  -- operatör tüketir (cevaba çevirir ya da düzenlemeye alır), tüketilince ikisi birden boşalır.
  ai_draft_reply text,
  ai_draft_generated_at timestamptz,

  -- Kuyrukta ve müşterinin listesinde okunan kısa başlık ("Eksik geldi · Gözleme").
  subject text,

  -- Admin bu talepten iade akışını başlattı. Tutar ve durum BURADAN okunmaz — siparişin iade
  -- hareketlerinden türetilir. Burada duran tek şey, iadeyi hangi talebin doğurduğudur; bir
  -- siparişe birden çok talep açılabildiği için o bağ yazılmazsa bilinemez.
  return_triggered_at timestamptz,

  -- OKUNMAMIŞ CEVAP DAMGASI (17.08) — mail gürültüsünü kesen tek veri.
  --
  -- Boşsa bekleyen yok; doluysa "şu andan beri müşterinin OKUMADIĞI bir karşı taraf cevabı var".
  -- Karşı taraf (personel ya da AI) cevap yazınca YALNIZ BOŞSA doldurulur: gecikme ilk okunmamış
  -- cevaptan sayılsın, her yeni satır saati sıfırlamasın — yoksa hızlı yazan operatör maili
  -- sonsuza dek erteler. Müşteri yazışmayı okuyunca boşalır (zilin tetiklediği tazeleme de bir
  -- okumadır), mail gidince de boşalır.
  --
  -- Ayrı bir "okundu" damgası AÇILMADI: bu kolon zaten "okunmamış cevap var mı" sorusunun cevabı,
  -- ikincisi aynı gerçeği iki yerde tutmak olurdu. Okunmamış SAYISI ya da rozet gerektiği gün
  -- ayrı bir alan tartışılır — bugün ihtiyaç yok.
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
-- Cevap maili kuyruğu: dakikada bir koşan süpürge YALNIZ bekleyenlere bakar (17.08). Kısmi indeks,
-- çünkü kümenin normal hâli BOŞ — talepleri baştan sona taramak, hiç bekleyen yokken bile her
-- dakika tam tarama demekti.
create index ticket_reply_pending_idx on public.ticket (reply_pending_since) where reply_pending_since is not null;

-- ── Yazışma ──────────────────────────────────────────────────────────────────
-- Basit bir mesaj dizisi (müşteri ↔ işletme). Talebin ilk açıklaması da BİR MESAJDIR: ayrı bir
-- `description` kolonu olsaydı "müşterinin anlatımı" ile "müşterinin ilk cevabı" iki ayrı yerde
-- durur, ekran ikisini birleştirmek zorunda kalırdı.
--
-- **İç not yok — bilerek.** Yazılan her şey müşteriye aynen görünür ve ekran bunu söyler. İç notu
-- aynı diziye koymak, bir gün yanlış kutuya yazılmış bir maliyet cümlesinin müşteriye gitmesidir.
create table public.ticket_message (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.ticket (id) on delete cascade,

  sender ticket_sender not null,
  -- Yazan personel — yalnız `admin` mesajında. Müşteri zaten talebin sahibidir, AI'ın kimliği yok.
  author_id uuid references public.user_profiles (id) on delete set null,

  body text not null check (length(btrim(body)) > 0),

  -- ── ÇEVİRİ (20.2) — burada YAZIŞMA İKİ YÖNLÜ, o yüzden çeviri de iki yönlü ─────
  --
  -- Yorumdan farkı bu: müşteri kendi dilinde yazar, personel Türkçe okur; personel Türkçe yazar,
  -- müşteri kendi dilinde okur. Yani her iki taraf da karşısındakinin cümlesini çeviriyle görür.
  -- Tek yön çevirmek, yazışmanın yarısını sessizce anlaşılmaz bırakırdı.
  --
  -- `language` metnin GERÇEK dili (ISO 639; müşteri Boşnakça yazabilir), `translations` yalnız
  -- makine çevirileri — kaynak dil torbaya girmez, orijinal `body`'de durur. `translated_at`
  -- başarısızlıkta da yazılır (sonsuz retry yok). Ayrıntılı gerekçe: `0027_product_feedback.sql`.
  --
  -- Öteki iki kaynaktaki "metin değişti, çeviriyi düşür" tetikleyicisi BURADA YOK ve gerekmiyor:
  -- gönderilmiş mesaj değişmez (güncelleyen bir yol yok — yazışma bir defterdir, bir form değil).
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

-- Yazışmanın tek okuma deseni: bir talebin mesajları, eskiden yeniye.
create index ticket_message_ticket_idx on public.ticket_message (ticket_id, created_at);

-- Çeviri kuyruğu (20.2) — çevrilmemiş mesajlar, en eski önce. Çevrildikçe indeksten düşer.
create index ticket_message_untranslated_idx on public.ticket_message (created_at) where translated_at is null;

-- ── Kuyruk görünümü ──────────────────────────────────────────────────────────
-- Kuyruğun tek amacı **cevap bekleyeni bekletmemek** — o yüzden sıralama alanı da bekleme alanı da
-- burada türetilir, tabloda saklanmaz.
--
-- `awaiting_reply`: son sözü müşteri söylediyse top bizdedir. Durumdan ÇIKARILAMAZ — `in_progress`
-- bir talepte müşteri yeni bir şey yazmış olabilir de olmayabilir de.
--
-- **Kuyruk TEK sorgudur.** Müşteri adı, sipariş numarası ve son mesajın metni de buradan gelir:
-- ekran onları ayrı ayrı çekseydi 30 satırlık bir kuyruk 90 sorguya çıkardı. Bu alanlar kopya
-- DEĞİL — görünüm her okumada kaynaktan üretir, bayatlayacak bir kopya kalmaz.
create or replace view public.ticket_queue as
select t.*,
       coalesce(m.last_message_at, t.created_at) as last_message_at,
       coalesce(m.message_count, 0)              as message_count,
       coalesce(m.last_sender = 'customer', false) as awaiting_reply,
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
       -- **AI bu talepte HİÇ konuştu mu** (16.5 · operasyon talebi 03.08) — `handled_by`'dan AYRI
       -- bir soru ve fark kalıcı: operatör devralınca `handled_by` `human`'a döner ama AI'ın yazdığı
       -- mesaj yerinde kalır. Kalite denetimi tam da o kümeye bakar; `handled_by` ile süzmek onu
       -- sessizce dışarıda bırakırdı. Bir kez `true` olduktan sonra `false`'a DÖNMEZ (mesaj silinmiyor).
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

-- Cevap + (gerekiyorsa) durum değişimi. `p_new_status` KARAR DEĞİL, kararın taşınmasıdır: hangi
-- cevabın durumu değiştirdiğini motor söyler (`domain-core/support.statusAfterCustomerReply`) —
-- kapanmış talebe yazan müşteri onu yeniden açar, açık talepte durum sabit kalır. Kuralı buraya da
-- yazmak, aynı kararın iki dilde iki kopyası olurdu.
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

-- ── Ürün başına ŞİKÂYET YOĞUNLUĞU (16.6 zemini · operasyon talebi 03.08) ─────
-- Geri Bildirim ekranının skor tablosu "şikâyet + düşük skor birleşiyor" diyor: kalite sorunuyla
-- beğeni verisinin yan yana okunduğu yer. Zincir kurulabiliyordu (`order_item_ids` → kalem →
-- varyant → ürün) ama okuma yoktu ve ekranda satır satır kurmak N+1 olurdu.
--
-- **Neden görünüm değil FONKSİYON:** dönem parametresi gerekiyor (ekranın "Son 30 gün" seçicisi) ve
-- görünüm parametre alamaz. `p_since` null ise tüm zamanlar — dönemli ve dönemsiz hâl aynı kod
-- yolundan geçer (`points_leaderboard` ile aynı gerekçe).
--
-- **`count(distinct t.id)` ve bu bir DOĞRULUK kararı:** bir talep aynı üründen üç kalem taşıyabilir;
-- düz `count(*)` onu üç şikâyet sayardı ve tek bir müşteri, tek bir olayla ürünü listenin başına
-- taşırdı. Sorulan şey "kaç şikâyet", "kaç kalem" değil.
--
-- **Yalnız `damaged` ve `missing`:** soru bir KALİTE sinyali. Bir ürün hakkındaki sorunun
-- (`question`) ya da genel bir konunun (`other`) o ürünün kalitesi hakkında söylediği bir şey yok;
-- hepsini saymak, en çok sorulan ürünü en bozuk ürün gibi gösterirdi.
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
