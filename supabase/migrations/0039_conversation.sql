-- Konuşma bizde yaşar: yapay zekânın bağlamı, servis penceresi ve izin kararı bizimdir, sağlayıcı değişse de geçmiş bizde kalır.

-- `messenger` ile `instagram` ayrı değerler: aynı kişinin Facebook ve Instagram kimlikleri farklı dizelerdir, tek "meta" kovası
-- iki uzayı karıştırırdı.
create type conversation_source as enum ('whatsapp', 'messenger', 'instagram');
-- Yön gönderenden ayrı eksendir: bizim adımıza yapay zekâ da personel de aynı numaradan yazar, taşıma açısından tek yöndür.
create type message_direction as enum ('inbound', 'outbound');
-- `template` bir ücret sınıfıdır: 24 saatlik pencere dışında yalnız Meta onaylı kalıp gönderilebilir.
create type message_kind as enum ('text', 'interactive', 'template', 'media');
-- Fiyatı belirleyen alan, adlar Meta'nındır. Mesajda saklanır, şablon tablosunda değil: kategori Meta'da sonradan değişebilir
-- ve geçmiş fatura bugünün sınıflandırmasıyla yeniden yazılırdı.
create type template_category as enum ('marketing', 'utility', 'authentication');

create table public.conversation (
  id uuid primary key default gen_random_uuid(),

  -- Nullable kalmalı: webhook mesajı önce yazar, kimliği sonra çözer. `cascade`: hesap silinince konuşma da gider (GDPR).
  customer_id uuid references public.user_profiles (id) on delete cascade,

  -- Varsayılan yok: sessiz bir 'whatsapp' varsayılanı, kaynağı unutan çağıranın Messenger mesajını WhatsApp konuşmasına dikerdi.
  source conversation_source not null,
  -- WhatsApp'ta E.164 telefon, Messenger'da PSID, Instagram'da IGSID. Normalize edilmemiş telefon aynı kişiye ikinci konuşma açar.
  external_ref text not null check (length(btrim(external_ref)) > 0),
  -- Cevabın gideceği işletme hesabı. Tekillik `(source, external_ref)`: ikinci işletme hesabı açılınca üçlüye genişletilir,
  -- PSID sayfa kapsamlıdır.
  provider_account_ref text,
  -- Görünen ad, kimlik değil: son görülen değer tutulur ve kimliksiz Messenger/Instagram sohbetinin başlığıdır.
  profile_name text,

  -- `ticket.handled_by` ile aynı enum: iki yüzeyde iki ayrı yürütücü kümesi bir gün ayrışırdı.
  handled_by ticket_handler not null default 'human',

  -- Taslak mesaj değil, satırda durur: `message` defteri gönderilmiş gerçeği yazar, onaylanmamış taslak oraya giremez.
  ai_draft_reply text,
  ai_draft_generated_at timestamptz,

  -- `opt_in_asked_at` sorulduğu an, ret de iz bıraksın diye; `opt_in_at` iznin verildiği an. İzin geri alınsa da `opt_in_at`
  -- silinmez: ispat yükü bizde (GDPR madde 7/1).
  opt_in boolean not null default false,
  opt_in_at timestamptz,
  opt_in_asked_at timestamptz,

  -- Yanlış bağ ajanın araçlarını da yanlış müşteriye açar, bu yüzden bağ geri izlenebilmeli. Üçü de boş = bağı sistem kurdu
  -- (WhatsApp'ta numaradan).
  linked_by uuid references public.user_profiles (id) on delete set null,
  linked_at timestamptz,
  -- Kanıtın değeri değil türü: değeri saklamak kişisel veriyi ikinci bir yere kopyalamak olurdu. Enum değil `text`+check,
  -- yeni değer tip değişimi gerektirmesin.
  link_proof text check (link_proof in ('order_ref', 'email', 'phone', 'cart_link', 'chat_code')),

  -- Biz ona hangi dilde yazarız: küme konuştuğumuz üç dildir, Boşnakça yazana Boşnakça cevap üretemeyiz. Gelen mesajdan öğrenilir
  -- ve son gelen kazanır.
  language preferred_language,

  -- Ajan sepete yer bilmeden yazamaz: o adrese gidip gitmediğimiz ve hangi ürünün gidebildiği ancak kodla bilinir. Sohbette bir
  -- kez söylenir, sonraki turlar yeniden sormaz.
  postal_code text check (postal_code ~ '^[0-9]{5}$'),
  -- Bazı kodlar iki hizmet ülkesinde birden geçerli ve ülke bilinmeden depo seçilemez: ajan sorar, cevap buraya yazılır.
  postal_country country_code,

  -- Kararı motor verir (`serviceWindowExpiry`): süre SQL'e de yazılsaydı aynı kural iki dilde iki kopya olurdu.
  window_expires_at timestamptz,
  last_message_at timestamptz,
  -- Kuyruğun ekseni, yalnız gelen mesajla ilerler: kendi cevabımız sohbeti tepeye taşısaydı bekleyen müşteri aşağıda kalırdı.
  -- `null` = müşteri hiç yazmadı.
  last_inbound_at timestamptz,

  created_at timestamptz not null default now(),

  -- İzin bir kanıttır: ne zaman verildiği yazılmadan "izin var" demek GDPR'da bir şey ifade etmez.
  constraint conversation_opt_in_stamp check (opt_in = false or opt_in_at is not null),
  -- İzin damgası varken "hiç sorulmadı" diyen satır, ajanın "reddedene tekrar sorma" kararını bozardı.
  constraint conversation_opt_in_asked check (opt_in_at is null or opt_in_asked_at is not null),
  constraint conversation_ai_draft_stamp check ((ai_draft_reply is null) = (ai_draft_generated_at is null)),
  -- Damga ile kanıt birlikte doğar; `linked_by` dahil değil, çünkü personel silinince `set null` üçlü kısıtı kırardı.
  constraint conversation_link_proof check ((linked_at is null) = (link_proof is null)),
  -- Müşterisi olmayan konuşmanın "kim bağladı"sı olmaz.
  constraint conversation_link_customer check (linked_at is null or customer_id is not null),
  -- Ülke kodun ülkesidir, tek başına bir yer söylemez.
  constraint conversation_postal_country check (postal_country is null or postal_code is not null)
);

alter table public.conversation enable row level security;

-- Kanal başına bir kişi, bir konuşma: ikinci satır ajanın geçmişin yarısını okuması demekti. `source` anahtarın parçası, çünkü
-- PSID ile IGSID ayrı uzaylardır.
create unique index conversation_external_ref_key on public.conversation (source, external_ref);
create index conversation_customer_idx on public.conversation (customer_id, last_message_at desc) where customer_id is not null;

create table public.message (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversation (id) on delete cascade,

  direction message_direction not null,
  -- Yön "hangi tarafa aktı", bu alan "bunu kim söyledi": müşteri farkı görmez ama iç izlenebilirlik görmeli. Varsayılan yok:
  -- unutulursa `record_message` yönden türetir, kısıt yanlışı keser.
  author ticket_sender not null,
  kind message_kind not null default 'text',

  -- jsonb, çünkü `text` dışındaki türlerin şekli sağlayıcıya bağlı; uydurulmuş kolon kümesi yarın bırakılacak bir küme olurdu.
  body jsonb not null,

  template_name text,
  -- Defterle birlikte doğar: yazılırken atlanan ücret sınıfı geriye dönük doldurulamaz.
  template_category template_category,
  provider_message_id text,

  -- Kendi private R2 anahtarımız: Meta'nın adresi dakikalarda ölür, medya ~30 günde silinir ve şikâyetin tek kanıtı talep
  -- sonuçlanmadan yok olurdu. `body`de değil kolonda: bizim kaydımızdır ve yetim nesne taramasını mümkün kılar.
  media_key text,
  -- `kind` bütün medyaya `media` der; sağlayıcı gövdesinin şekli kanala göre değiştiği için ekran onu okumaz.
  media_mime text,
  -- Makinenin duyduğu, müşterinin yazdığı alt yazı (`body->>'text'`) değil: aynı alanda operatör insan cümlesini ayırt edemez,
  -- ajan makine çıktısını müşterinin kesin sözü sanardı.
  media_transcript text,

  -- Kanaldan geçen metnin dili: gelen mesajda müşterinin yazdığı, giden mesajda gönderilen; operatörün Türkçesi torbada.
  -- `translated_at` başarısızlıkta da dolar ki bozuk tek satır kuyruğu tıkamasın.
  language text check (language ~ '^[a-z]{2,3}$'),
  translations jsonb,
  translated_at timestamptz,

  created_at timestamptz not null default now(),

  -- Metinsiz metin mesajı ekranda boş balon olurdu; kural veride, yazan yüzey unutsa da satır girmez.
  constraint message_text_body check (
    kind <> 'text' or (body ? 'text' and length(btrim(body ->> 'text')) > 0)
  ),
  -- Adsız kalıp gönderilemez, adlı serbest metin de ücretlendirmede kalıp sanılırdı.
  constraint message_template_name check ((kind = 'template') = (template_name is not null)),
  -- Kategorisiz kalıp kaydı faturası okunamayan bir gönderimdir.
  constraint message_template_category check ((kind = 'template') = (template_category is not null)),
  -- Kalıp işletme başlatandır: gelen kalıp pencere hesabında "biz gönderdik" gibi okunurdu.
  constraint message_inbound_kind check (direction = 'outbound' or kind <> 'template'),
  -- Kısıt olmasaydı yanlış eşleşme sessizce geçer ve "AI mı cevapladı" sorusu yalan okurdu.
  constraint message_author_direction check ((direction = 'inbound') = (author = 'customer')),
  -- Tek yönlü, bilerek: indirme düşse de mesaj satırı yazılmalı; çift yönlü kısıt geçici bir sağlayıcı arızasında müşterinin
  -- mesajını kaybettirirdi.
  constraint message_media_kind check (
    (media_key is null and media_mime is null and media_transcript is null) or kind = 'media'
  )
);

alter table public.message enable row level security;

create index message_conversation_idx on public.message (conversation_id, created_at);
-- Kısmi: kuyruk küçüktür, tablo büyür; tam indeks çevrilmiş milyonu taşırdı.
create index message_untranslated_idx on public.message (created_at) where translated_at is null;
-- Mesaj düzeyinde son savunma: Meta teslimatı 7 gün tekrarlar ve `webhook_event` claim'inin atlandığı bir yolda aynı mesaj
-- deftere iki kez yazılmamalı.
create unique index message_provider_message_key on public.message (provider_message_id) where provider_message_id is not null;

-- `message`a yazılmadı: o defteri okuyan her yüzey (pencere damgaları, "cevap bekliyor", çeviri kuyruğu, native mesaj türü) notu
-- gönderilmiş mesaj sayardı.
create table public.conversation_note (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversation (id) on delete cascade,
  -- Müşteri iç not yazamaz: müşterinin sözü mesajdır.
  author ticket_sender not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint conversation_note_author check (author <> 'customer'),
  -- Boş not ekranda olmayan bir kaydı gösterirdi.
  constraint conversation_note_body check (length(btrim(body)) > 0)
);

alter table public.conversation_note enable row level security;

create index conversation_note_conversation_idx on public.conversation_note (conversation_id, created_at);

-- `set null` değil: "kaynağı whatsapp olan talep konuşmasız olamaz" kısıtına, silinen satırda değil adı geçmeyen bir talepte
-- çarpardı. `restrict` değil `no action`: hesap silinirken iki cascade zinciri koşar ve denetim zincir sırasından bağımsız, deyimin sonunda yapılmalı.
alter table public.ticket
  add constraint ticket_conversation_fk foreign key (conversation_id)
  references public.conversation (id);

-- Tek deyimlik upsert: oku-sonra-yaz, arka arkaya gelen iki mesajda tekillik indeksine çarpar ve mesaj kaybolurdu. Müşteri ve
-- işletme hesabı yalnız boşsa dolar (birleştirme insanın kararı, hesap değişimi yeni uzay demek); profil adında yenisi kazanır.
create or replace function public.open_conversation(
  p_source conversation_source,
  p_external_ref text,
  p_customer_id uuid default null,
  p_provider_account_ref text default null,
  p_profile_name text default null,
  -- Yalnız satır doğarken yazılır: açık sohbetin modu operatörün kararıdır, genel ayar onu sessizce ezmemeli.
  p_handled_by ticket_handler default null
) returns public.conversation
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_conversation public.conversation;
begin
  insert into public.conversation (source, external_ref, customer_id, provider_account_ref, profile_name, handled_by)
  values (p_source, p_external_ref, p_customer_id, p_provider_account_ref, p_profile_name, coalesce(p_handled_by, 'human'::ticket_handler))
  on conflict (source, external_ref) do update
     set customer_id = coalesce(conversation.customer_id, excluded.customer_id),
         provider_account_ref = coalesce(conversation.provider_account_ref, excluded.provider_account_ref),
         profile_name = coalesce(excluded.profile_name, conversation.profile_name)
  returning * into v_conversation;

  return v_conversation;
end;
$$;

-- İki tabloya birden dokunur, tek RPC: ikinci yazım düşerse gelen kutusu sıralaması sessizce bayatlardı. Pencere `greatest` ile
-- yazılır ve geri gitmez: yeniden denenen eski mesaj pencereyi kısaltıp hâlâ ücretsiz aralıkta kalıp ücreti ödetirdi.
create or replace function public.record_message(
  p_conversation_id uuid,
  p_direction message_direction,
  p_kind message_kind,
  p_body jsonb,
  p_template_name text default null,
  p_template_category template_category default null,
  p_provider_message_id text default null,
  p_window_expires_at timestamptz default null,
  -- `null` = yönden türet; yanlış eşleşmeyi tablo kısıtı keser.
  p_author ticket_sender default null,
  -- İndirme düşse de satır yazılır; RPC karar vermez, yalnız taşır.
  p_media_key text default null,
  p_media_mime text default null,
  p_media_transcript text default null,
  -- Giden mesaj gönderimden önce çevrilir ve tek turda yazılır: ayrı güncelleme "gitti ama çevirisi yazılamadı" yarım hâlini doğururdu.
  p_language text default null,
  p_translations jsonb default null,
  p_translated_at timestamptz default null
) returns public.message
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_message public.message;
begin
  -- Kalıp yalnız WhatsApp kavramıdır ve `message` kısıtları kaynağı göremez: yanlış kanala yazılan kalıp maliyet raporunu ve
  -- pencere mantığını kirletirdi.
  if p_kind = 'template' and (select source from public.conversation where id = p_conversation_id) <> 'whatsapp' then
    raise exception 'template mesaji yalniz whatsapp konusmasina yazilabilir (conversation %)', p_conversation_id;
  end if;

  insert into public.message (conversation_id, direction, author, kind, body, template_name, template_category, provider_message_id, media_key, media_mime, media_transcript, language, translations, translated_at)
  values (
    p_conversation_id,
    p_direction,
    coalesce(p_author, case when p_direction = 'inbound' then 'customer'::ticket_sender else 'admin'::ticket_sender end),
    p_kind,
    p_body,
    p_template_name,
    p_template_category,
    p_provider_message_id,
    p_media_key,
    p_media_mime,
    p_media_transcript,
    p_language,
    p_translations,
    p_translated_at
  )
  returning * into v_message;

  update public.conversation
     set last_message_at = v_message.created_at,
         -- Kural burada, çağıranda değil: iki yazma yolu aynı kuralı iki kez yazmasın.
         last_inbound_at = case when p_direction = 'inbound' then v_message.created_at else last_inbound_at end,
         window_expires_at = greatest(window_expires_at, p_window_expires_at)
   where id = p_conversation_id;

  return v_message;
end;
$$;

revoke all on function public.open_conversation(conversation_source, text, uuid, text, text, ticket_handler) from anon;
revoke all on function public.record_message(uuid, message_direction, message_kind, jsonb, text, template_category, text, timestamptz, ticket_sender, text, text, text, text, jsonb, timestamptz) from anon;

comment on table public.conversation is
  'Mesajlaşma konuşması: kaynak (whatsapp/messenger/instagram), kimlik bağı, izin, 24 saatlik servis penceresi, son hareket.';
comment on table public.message is
  'Konuşmanın mesajları: yön, tür, gövde. Defterdir; yazılır, güncellenmez.';
