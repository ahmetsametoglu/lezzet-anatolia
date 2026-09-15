-- Görünüm, çünkü 30 satırlık kuyruk müşteri adını, son mesajı ve mesaj sayısını ayrı çekseydi 90 tur olurdu; son mesajı damga
-- eşleştirmesiyle çekmek aynı ana düşen iki mesajda sessizce yanlış satırı gösterirdi.

-- Okunmamış sayacı yok: "okundu" bilgisini yazan yüzey olmadığı için sayaç ilk günden yalan söylerdi; `awaiting_reply` aynı soruyu
-- yazma yükü olmadan cevaplar.
create or replace view public.conversation_inbox as
select c.*,
       -- Kimliksiz konuşmada null: bir hâl, eksik değil.
       u.name                                        as customer_name,
       coalesce(m.message_count, 0)                  as message_count,
       -- Konuşmanın durumu yok: kuyruğun tek amacı cevap bekleyeni bekletmemek ve bu son mesajın yönünden türer.
       coalesce(m.last_direction = 'inbound', false) as awaiting_reply,
       -- Tam metin: önizleme kırpması sunum kararıdır.
       m.last_text                                   as last_message_text,
       m.last_direction                              as last_message_direction,
       m.last_kind                                   as last_message_kind,
       -- Detay çevrilip kuyruk çevrilmezse operatör sohbeti ancak açarak tarayabilir; sesli mesajın önizlemesi de transkripttir.
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
  'Konuşma gelen kutusu: müşteri adı, son mesajın metni/yönü/türü, mesaj sayısı ve '
  '"cevap bekliyor"; hepsi türetilir, kopya tutulmaz.';

-- Konuşma kümesi sınırsız büyür ve keyset sayfalama sıralı indeks ister. İfade görünümün `inbox_at`ıyla aynı olmalı, yoksa
-- sıralama indeksi kullanamaz.
create index conversation_inbox_at_idx on public.conversation ((coalesce(last_inbound_at, '-infinity'::timestamptz)) desc, id desc);

-- Kişi başına tek satır: sohbet başına satır aynı kişiyi üç ayrı kişi gibi gösterirdi. Kimliksiz sohbet kendi başına bir kişidir,
-- onu başka satırla birleştirmek tahmin olurdu.

-- Gruplama ekranda değil burada: sayfayı gruplamak sonraki sayfaya düşen ikinci sohbeti iki kez gösterir ve sayılar sohbet
-- sayardı. `person_key` dışarı açık, çünkü süzgeci toplamanın altına iner ve tek kişiyi okumak bütün kutuyu hesaplatmaz.
create or replace view public.customer_inbox as
select (p.head).*,
       p.person_key,
       p.threads,
       p.sources,
       p.awaiting_any
  from (
    select coalesce(t.customer_id, t.id) as person_key,
           -- Baş sohbetin satırı toplamın içinden seçilir, görünüm ikinci kez okunmaz.
           (array_agg(t order by t.last_inbound_at desc nulls last, t.last_message_at desc nulls last, t.id))[1] as head,
           -- Başla aynı sırada: kanal noktası, sekme ve "hangisi bekliyor" buradan okunur.
           jsonb_agg(
             jsonb_build_object('id', t.id, 'source', t.source, 'messageCount', t.message_count, 'awaitingReply', t.awaiting_reply)
             order by t.last_inbound_at desc nulls last, t.last_message_at desc nulls last, t.id
           ) as threads,
           -- Yalnız mesajı olan kanallar: boş kanal görünmez.
           coalesce(array_agg(distinct t.source) filter (where t.message_count > 0), '{}'::conversation_source[]) as sources,
           -- Herhangi bir kanalında son sözü müşteri söylediyse top bizde.
           bool_or(t.awaiting_reply) as awaiting_any
      from public.conversation_inbox t
     group by coalesce(t.customer_id, t.id)
  ) p;

comment on view public.customer_inbox is
  'Müşteri bazlı gelen kutusu: kişi başına tek satır; yüzü en son yazdığı sohbet, kanalları '
  'threads/sources, cevap bekleyişi awaiting_any. Hepsi conversation_inbox''tan türer, kopya tutulmaz.';
