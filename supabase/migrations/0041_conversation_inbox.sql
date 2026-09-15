-- Modül 15 — Gelen kutusu okuması (15.5). Operasyon talebi 08.08.
--
-- ── NEDEN GÖRÜNÜM, NEDEN EKRANDA BİRLEŞTİRME DEĞİL ──────────────────────────
-- Liste satırı beş şey ister: konuşma + müşteri adı + son mesajın metni/yönü/anı + mesaj sayısı +
-- "top kimde". 30 satırlık bir kuyruk bunları ayrı ayrı çekseydi 90 tur olurdu.
--
-- Ekran şeridi bir kestirme denemiş ve haklı olarak vazgeçmiş: son mesajı `conversation.
-- last_message_at` ile `message.created_at`'i eşleştirerek çekmek mümkün görünüyor ama **aynı ana
-- düşen iki mesajda sessizce yanlış satırı gösterir.** Görünüm `array_agg(... order by created_at
-- desc)` ile tek ve tam anlamlı bir cevap veriyor.
--
-- `ticket_queue` (0026) ile aynı desen ve aynı gerekçe: alanlar KOPYA DEĞİL, görünüm her okumada
-- kaynaktan üretir — bayatlayacak bir kopya kalmaz.
--
-- ── BURADA OLMAYAN BİR ŞEY, BİLEREK ─────────────────────────────────────────
-- **Okunmamış sayacı yok:** "okundu" bilgisini yazan bir yüzey yok, yani sayaç ilk günden yalan
-- söylerdi. `awaiting_reply` aynı soruyu yazma yükü olmadan cevaplıyor — son sözü müşteri
-- söylediyse top bizdedir.
-- (Devralma alanı ilk yazımda yoktu; 16.08'de `conversation.handled_by` geldi ve `c.*` ile buraya
-- kendiliğinden akıyor — üç mod: human · hybrid · ai.)

create or replace view public.conversation_inbox as
select c.*,
       -- Müşteri adı satırda: 30 satırlık kuyruk için 30 ek tur olurdu. Kimliksiz konuşmada null —
       -- ve bu bir hâl, eksik değil (adım 2'de webhook mesajı önce yazar, kimliği sonra çözer).
       u.name                                        as customer_name,
       coalesce(m.message_count, 0)                  as message_count,
       -- **Son sözü müşteri söylediyse top bizde.** Durumdan çıkarılamaz: konuşmanın "durumu" yok;
       -- kuyruğun tek amacı cevap bekleyeni bekletmemek ve bu, son mesajın YÖNÜNDEN türer.
       coalesce(m.last_direction = 'inbound', false) as awaiting_reply,
       -- Son mesajın TAM metni; önizleme kırpması bir SUNUM kararıdır, veri kapısına ait değil.
       m.last_text                                   as last_message_text,
       m.last_direction                              as last_message_direction,
       m.last_kind                                   as last_message_kind,
       -- **Önizlemenin ÇEVİRİSİ de buradan** (15.28 · `ticket_queue`nun aynı kararı): detay
       -- çevrilip kuyruk çevrilmezse operatör sohbeti ancak AÇARAK tarayabilir. Sesli mesajın
       -- çözümü de burada — o satırın önizlemesi "[görsel / dosya]" değil, müşterinin dediğidir.
       m.last_language                               as last_message_language,
       m.last_translations                           as last_message_translations,
       m.last_transcript                             as last_message_transcript,
       -- Boş kalmayan sıralama ekseni: PostgREST'in azalan sırası boş değeri başa alır ve imleç ondan kurulamaz.
       coalesce(c.last_inbound_at, '-infinity'::timestamptz) as inbox_at
  from public.conversation c
  left join public.user_profiles u on u.id = c.customer_id
  left join lateral (
    select count(*)                                              as message_count,
           (array_agg(direction  order by created_at desc))[1]   as last_direction,
           (array_agg(body->>'text' order by created_at desc))[1] as last_text,
           (array_agg(kind       order by created_at desc))[1]   as last_kind,
           (array_agg(language     order by created_at desc))[1] as last_language,
           (array_agg(translations order by created_at desc))[1] as last_translations,
           (array_agg(media_transcript order by created_at desc))[1] as last_transcript
      from public.message
     where conversation_id = c.id
  ) m on true;

comment on view public.conversation_inbox is
  'Konuşma gelen kutusu (15.5): müşteri adı, son mesajın metni/yönü/türü, mesaj sayısı ve '
  '"cevap bekliyor" — hepsi türetilir, kopya tutulmaz.';

-- Kuyruğun sıralama ekseni. Konuşma kümesi veriyle SINIRSIZ büyür (canlı kanalda aylarca) →
-- keyset sayfalama şart, keyset de sıralı bir indeks ister.
--
-- Eksen son GELEN mesajdır, son hareket değil: kendi cevabımız bekleyen müşteriyi aşağı itmesin. İndeks
-- görünümün `inbox_at` ifadesinin aynısıdır; farklı olsaydı sıralama indeksi kullanamazdı.
create index conversation_inbox_at_idx on public.conversation ((coalesce(last_inbound_at, '-infinity'::timestamptz)) desc, id desc);

-- ── MÜŞTERİ BAZLI GELEN KUTUSU (15.38 · kullanıcı kararı 15.09) ─────────────
-- Aynı kişi bize üç kanaldan yazabilir ve sohbet başına satır onu üç ayrı kişi gibi gösteriyordu:
-- operatör öteki kanaldaki yazışmayı ancak tesadüfen fark ediyordu. Bu görünüm KİŞİ başına tek
-- satır verir; kişinin kanalları satırın içinde (`threads`), sohbet ekranında sekme.
--
-- **Kişi = müşteri kaydı; kimliksiz sohbet kendi başına bir kişidir.** Messenger/IG sohbeti bir
-- müşteriye bağlanana kadar kimin olduğunu bilmiyoruz — onu başka bir satırla birleştirmek tahmin
-- olurdu. Bağ kurulduğu an (müşterinin kendi açtığı hesap bağlantısı) satırlar kendiliğinden birleşir.
--
-- **Satırın yüzü BAŞ sohbettir** — kişinin en son yazdığı sohbet (`last_inbound_at`, kuyruğun ekseni
-- 21.289). Başlık, önizleme, pencere ve yürütücü ondan okunur: üst düzey alanlar `conversation_inbox`un
-- satırının aynısı, kural iki yerde yazılmasın diye oradan gelir.
--
-- **Neden ekranda gruplamak değil:** sohbet kuyruğunun sayfasını gruplamak, aynı kişinin ikinci sohbeti
-- sonraki sayfaya düştüğünde onu iki kez gösterir (ya da istemcinin ayıklamasını ister), sayılar sohbet
-- sayar ve kanalları okumak için her sayfaya ikinci bir sorgu gerekir. Kullanıcı kararı (15.09): bilgiyi
-- gereksiz sorgularla türetmek sonradan pahalı — gruplamayı veritabanı yapar.
--
-- **Tek geçiş:** `conversation_inbox` bir kez okunur (son mesajın hesabı sohbet başına bir kez), satırlar
-- kişi anahtarında toplanır; baş sohbetin satırı toplamın içinden seçilir, ikinci kez okunmaz.
--
-- **`person_key` dışarı açık:** sohbet başlığının sekmeleri tek kişinin satırını okur ve bu kolondaki
-- süzgeç toplamanın ALTINA iner (gruplama ifadesi) — tek kişiyi okumak bütün kutuyu hesaplatmaz.
--
create or replace view public.customer_inbox as
select (p.head).*,
       p.person_key,
       p.threads,
       p.sources,
       p.awaiting_any
  from (
    select coalesce(t.customer_id, t.id) as person_key,
           (array_agg(t order by t.last_inbound_at desc nulls last, t.last_message_at desc nulls last, t.id))[1] as head,
           -- Kişinin BÜTÜN sohbetleri, başla aynı sırada — kanal noktası, sekme ve "hangisi bekliyor".
           jsonb_agg(
             jsonb_build_object('id', t.id, 'source', t.source, 'messageCount', t.message_count, 'awaitingReply', t.awaiting_reply)
             order by t.last_inbound_at desc nulls last, t.last_message_at desc nulls last, t.id
           ) as threads,
           -- Süzgecin ve noktanın kanalları: YALNIZ mesajı olan (çizimin kuralı — boş kanal görünmez).
           coalesce(array_agg(distinct t.source) filter (where t.message_count > 0), '{}'::conversation_source[]) as sources,
           -- "Cevap bekliyor" KİŞİNİN hâli: herhangi bir kanalında son sözü müşteri söylediyse top bizde.
           bool_or(t.awaiting_reply) as awaiting_any
      from public.conversation_inbox t
     group by coalesce(t.customer_id, t.id)
  ) p;

comment on view public.customer_inbox is
  'Müşteri bazlı gelen kutusu (15.38): kişi başına tek satır — yüzü en son yazdığı sohbet, kanalları '
  'threads/sources, cevap bekleyişi awaiting_any. Hepsi conversation_inbox''tan türer, kopya tutulmaz.';
