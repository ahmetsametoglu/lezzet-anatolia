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
       m.last_transcript                             as last_message_transcript
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
-- SIRALAMA `last_inbound_at` ÜZERİNDEN (21.289): kuyruk "karşıdan en son ne zaman yazıldı"ya göre
-- diziliyor, "konuşma en son ne zaman kımıldadı"ya göre değil — gerekçe kolonun künyesinde
-- (`0039`). İndeks bu yüzden o alanda; `last_message_at` üzerindeki indeks müşteri yazışma
-- geçmişinin (`conversation_customer_idx`) işine yaramaya devam ediyor.
--
-- `nulls last`: alan yalnız müşterinin HİÇ yazmadığı konuşmada boştur. O satır kuyruğun BAŞINA
-- değil sonuna düşmeli — henüz kimse bir şey söylememiş bir sohbet, cevap bekleyenlerin önüne
-- geçemez.
create index conversation_last_inbound_idx on public.conversation (last_inbound_at desc nulls last);
