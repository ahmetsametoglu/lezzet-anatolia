-- Modül 15 adım 1 — Konuşma zemini (15.1/15.2; üç kanala genişledi 21.08, ADR-006).
-- CHANNELS §7, `data-model/iletisim-geribildirim.md`.
--
-- ── KONUŞMA BİZİM VERİTABANIMIZDA YAŞAR ─────────────────────────────────────
-- Meta'nın kendi arşivi var; yine de konuşmayı biz tutuyoruz. Üç sebep:
--   • AI ajanının bağlamı bizde olmalı — "geçen sefer ne konuştuk" sorusu dış API'ye sorulamaz;
--   • servis penceresi ve opt-in bizim kararımızdır (hangi mesaj ücretsiz, hangisi template);
--   • sağlayıcı değişse de konuşma tarihi ve müşteri bağı bizde kalır (taşınırlık).
--
-- ── ADIM 1 YALNIZ ZEMİN ATAR ────────────────────────────────────────────────
-- Bugün satırları **elle** doğuyor: admin gelen DM'i işler (yalnız WhatsApp — Messenger/IG kişi
-- kimliği PSID/IGSID'dir ve operatörce bilinemez; o satırları webhook yazacak, 15.7). Adım 2'de
-- aynı satırları webhook yazar. Veri modeli değişmez — değişen tek şey satırı yazan yüzeydir
-- (CHANNELS §8). Bu yüzden alanların tamamı bugünden var: sonradan eklenen bir kolon, o güne
-- kadarki her konuşmanın geçmişini belirsiz bırakırdı (`ticket.handled_by` ile aynı gerekçe).

-- Üç Meta kanalı, tek tablo (ADR-006): kanal `source` ekseninde ayrışır. `external_ref`in uzayı
-- kaynağa bağlı — WhatsApp'ta E.164 telefon, Messenger'da PSID, Instagram'da IGSID. `messenger`
-- ile `instagram` AYRI değerler, tek "meta" kovası değil: aynı kişinin FB ve IG kimlikleri farklı
-- dizelerdir, tek kova iki uzayı karıştırırdı.
create type conversation_source as enum ('whatsapp', 'messenger', 'instagram');
-- Yön, gönderenden AYRI bir eksendir: `ticket_message.sender` "kim yazdı" (müşteri/personel/AI)
-- der, burada sorulan "hangi tarafa aktı". WhatsApp'ta bizim adımıza AI da personel de yazabilir;
-- ikisi de aynı numaradan çıkar ve müşteri farkı görmez — yani taşıma açısından tek yöndür.
create type message_direction as enum ('inbound', 'outbound');
-- Mesajın taşıdığı biçim. `template` bir ÜCRET sınıfıdır, süs değil: 24 saatlik servis penceresi
-- dışında yalnız Meta-onaylı template gönderilebilir.
create type message_kind as enum ('text', 'interactive', 'template', 'media');
-- Şablonun Meta kategorisi — **FİYATI BELİRLEYEN alan.** Adlar Meta'nındır, biz uydurmuyoruz.
--
--   · marketing      — kampanya/duyuru. Her hâlde ÜCRETLİ; ayrıca izin ister (DOMAIN §11).
--   · utility        — sipariş onayı, kargo bildirimi. Servis penceresi İÇİNDE ücretsizdir ve
--                      ADR-005 zaten "pencere içinde önceliklidir" diyor. Dayanağı izin değil,
--                      siparişin kendisidir (sözleşmenin ifası).
--   · authentication — güvenlik kodu.
--
-- **Neden mesajda saklanıyor, ayrı bir şablon tablosunda değil:** bu bir DEFTERDİR ve defter olanı
-- yazar. Kategori Meta tarafında sonradan değişebilir (yeniden sınıflandırma olağan); mesajı
-- değişebilen bir kayda bağlasaydık, geçmiş faturamız bugünün sınıflandırmasıyla yeniden yazılırdı.
create type template_category as enum ('marketing', 'utility', 'authentication');

create table public.conversation (
  id uuid primary key default gen_random_uuid(),

  -- Telefonla çözülür (DOMAIN §10). **Nullable ve öyle kalmalı:** adım 2'de webhook mesajı önce
  -- yazar, kimliği sonra çözer — kimlik çözülemediği için mesajın kaybolduğu bir yol olamaz.
  -- `cascade`: hesap silinince konuşma da gider (GDPR kovası 1, `anonymize_customer`).
  customer_id uuid references public.user_profiles (id) on delete cascade,

  -- Varsayılan YOK (21.08): üç kanal dünyasında sessiz bir 'whatsapp' varsayılanı, kaynağı geçmeyi
  -- unutan tek çağıranın Messenger mesajını WhatsApp konuşmasına dikmesi demekti.
  source conversation_source not null,
  -- Sağlayıcıdaki kişi/thread anahtarı — uzayı kaynağa bağlı: WhatsApp'ta **E.164 normalize
  -- telefon** (`wa_id` numarayı `+` olmadan verir, biz `+33…` tutarız), Messenger'da **PSID**,
  -- Instagram'da **IGSID**. Normalize etmeyen bir telefon yazımı aynı kişiye ikinci bir konuşma
  -- açar ve geçmiş ikiye bölünür; PSID/IGSID opak dizedir, normalize edilmez.
  external_ref text not null check (length(btrim(external_ref)) > 0),
  -- Konuşmanın aktığı İŞLETME hesabı (21.08): WhatsApp'ta phone_number_id, Messenger'da sayfa
  -- kimliği, Instagram'da IG hesap kimliği. Zeminde (elle işleme) boş — webhook yazmaya
  -- başladığında dolar ve cevabın hangi hesaptan gönderileceğini söyler. Tekillik bugün
  -- `(source, external_ref)` — ikinci bir işletme hesabı açıldığı gün üçlüye genişletilir
  -- (PSID sayfa-kapsamlıdır; bugün genişletmek elle işlenen geçmişi webhook geçmişinden bölerdi).
  provider_account_ref text,
  -- Sağlayıcı profil adı (21.08): WhatsApp push name, Messenger ad-soyad, Instagram kullanıcı adı.
  -- GÖRÜNEN addır, kimlik değil — kullanıcı istediği an değiştirir, son görülen değer tutulur.
  -- Messenger/IG'de kimlik otomatik çözülemez (PSID/IGSID telefon taşımaz); kimliksiz sohbetin
  -- başlığı buradan okunur — WhatsApp'ta okunaklı telefon zaten vardı.
  profile_name text,

  -- Sohbeti kim yürütüyor (15.13/16.5 · kullanıcı kararı 16.08). `ticket.handled_by` ile aynı
  -- gerekçe ve AYNI enum: iki yüzeyde iki ayrı "yürütücü" kümesi, bir gün ayrışan iki gerçek
  -- olurdu. `hybrid` = AI taslak yazar, operatör onaylamadan gitmez; `ai` = özerk.
  handled_by ticket_handler not null default 'human',

  -- ── AI taslağı — `ticket.ai_draft_reply` ile aynı sözleşme (0026'daki künye) ─
  -- Satırda durur, mesaj değil: `message` defteri gönderilmiş gerçeği yazar, onaylanmamış taslak
  -- oraya giremez. Damga önbellek anahtarı; tüketilince ikisi birden boşalır.
  ai_draft_reply text,
  ai_draft_generated_at timestamptz,

  -- Ticari mesaj izni (DOMAIN §11). Faz 2 broadcast'inin dayanağı; bugün yalnız kaydedilir.
  opt_in boolean not null default false,
  opt_in_at timestamptz,

  -- ── BAĞIN KÜNYESİ (15.19) — kimliği KİM kurdu, NE ZAMAN, HANGİ KANITLA ─────
  -- Messenger/IG'de kimliğin tek yolu operatörün elle kurduğu bağdır (PSID/IGSID telefon
  -- taşımaz). O bağ yanlış kurulursa yalnız ekran değil, AJANIN ARAÇLARI da yanlış müşteriye
  -- açılır (`support-tools.ts` kimliğe kapatılmıştır) — yani hata tek bir alanı değil, o
  -- müşterinin verisinin TAMAMINI açar. Üç kolon o kararı geri izlenebilir kılıyor.
  --
  -- **Üçü de boş = bağı SİSTEM kurdu:** WhatsApp'ta kimlik numaradan çözülür ve ortada bir
  -- operatör kararı yoktur. Boşluk burada "bilgi eksik" değil, okunur bir CEVAPTIR.
  linked_by uuid references public.user_profiles (id) on delete set null,
  linked_at timestamptz,
  -- Kanıtın TÜRÜ — değeri DEĞİL (`CLAUDE §1`: kimlik yazılır, içerik yazılmaz). Sorulacak soru
  -- "hangi kanıtla bağlandı"dır; "e-postası neydi" değil, ve değeri saklamak gereksiz bir
  -- kişisel veriyi ikinci bir yere kopyalamak olurdu. Enum DEĞİL `text`+check: dördüncü değer
  -- (04.10'un e-posta kodu) geldiğinde tip değişimi gerektirmesin.
  link_proof text check (link_proof in ('order_ref', 'email', 'phone')),

  -- 24 saatlik servis penceresinin bitişi. Kararı motor verir (`serviceWindowExpiry`), burası
  -- yalnız saklar — süreyi SQL'e de yazsaydık aynı kural iki dilde iki kopya olurdu.
  window_expires_at timestamptz,
  -- Son hareketin anı; gelen kutusunun sıralama alanı. `record_message` yazar.
  last_message_at timestamptz,

  created_at timestamptz not null default now(),

  -- İzin bir KANITTIR: ne zaman verildiği yazılmadan "izin var" demek GDPR'da bir şey ifade etmez.
  constraint conversation_opt_in_stamp check (opt_in = false or opt_in_at is not null),
  -- Taslak ile damgası ayrışamaz (`ticket_ai_draft_stamp` ile aynı gerekçe).
  constraint conversation_ai_draft_stamp check ((ai_draft_reply is null) = (ai_draft_generated_at is null)),
  -- Bağın künyesi: damga ile kanıt BİRLİKTE doğar; kanıtsız damga "bağladım ama neye dayanarak
  -- bilmiyorum" demekti. **`linked_by` bu çifte DAHİL DEĞİL** ve bu bilinçli: FK'si `set null`,
  -- yani personel kaydı silindiğinde kolon boşalır — üçlü bir kısıt tam o gün, hiç kimsenin
  -- beklemediği bir yerde kırılırdı. Kimin bağladığı kaybolabilir, neye dayanarak bağladığı hayır.
  constraint conversation_link_proof check ((linked_at is null) = (link_proof is null)),
  -- Bağ künyesi ancak BAĞ VARKEN yazılabilir: müşterisi olmayan bir konuşmanın "kim bağladı"sı olmaz.
  constraint conversation_link_customer check (linked_at is null or customer_id is not null)
);

alter table public.conversation enable row level security;

-- **Bir kişi, bir konuşma — kanal başına.** Üç kanalda da thread kavramı yoktur: aynı kişiden gelen
-- her mesaj aynı sohbetin devamıdır. Tekillik olmasaydı ikinci mesaj yeni bir satır açar, admin aynı
-- müşteriyi gelen kutusunda iki kez görür ve AI ajanı geçmişin yarısını okurdu. `source` anahtarın
-- parçası: PSID ile IGSID ayrı uzaylardır, aynı dize iki kanalda iki farklı kişiyi gösterebilir.
create unique index conversation_external_ref_key on public.conversation (source, external_ref);
-- Müşteri kartından konuşmasına geçiş (15.5) — yeniden eskiye.
create index conversation_customer_idx on public.conversation (customer_id, last_message_at desc) where customer_id is not null;

create table public.message (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversation (id) on delete cascade,

  direction message_direction not null,
  -- Kim yazdı (16.08) — yön "hangi tarafa aktı" der, bu alan "bunu kim söyledi" der. Bizim
  -- adımıza AI da personel de yazar ve müşteri farkı görmez; iç izlenebilirlik görsün diye alan
  -- BAŞTAN var (`ticket_message.sender` ile aynı gerekçe: sonradan eklenen kolon, o güne kadarki
  -- her mesajın yazarını belirsiz bırakırdı). Enum ortak: `ticket_sender`. Varsayılan YOK —
  -- yazan taraf söyler; unutursa `record_message` yönden türetir, alttaki kısıt da yanlışı keser.
  author ticket_sender not null,
  kind message_kind not null default 'text',

  -- Metin ya da kart/interaktif yapı. jsonb, çünkü `text` dışındaki türlerin şekli sağlayıcıya
  -- bağlı ve adım 2'de (15.9) netleşecek; bugün uydurulmuş bir kolon kümesi, yarın bırakılacak
  -- bir kolon kümesi olurdu.
  body jsonb not null,

  -- Meta-onaylı şablonun adı — yalnız `template` mesajında.
  template_name text,
  -- Şablonun kategorisi = ücret sınıfı. **Defterle birlikte doğuyor, sonradan eklenmiyor:** yazılırken
  -- atlanan bir boyut geriye dönük doldurulamaz — bugün kategorisiz yazılan mesajlar için "geçen ay
  -- ne ödedik" sorusu hiçbir zaman cevaplanamazdı. (`ticket.handled_by` ile aynı gerekçe.)
  template_category template_category,
  -- 360dialog/Cloud API mesaj kimliği. Adım 1'de boş (elle kayıt), adım 2'de dolar.
  provider_message_id text,

  created_at timestamptz not null default now(),

  -- Metin mesajı metinsiz olamaz: `body->>'text'` boşsa ortada bir mesaj yoktur ve ekranda boş bir
  -- balon olarak görünür. Kontrol veride durur — yazan yüzey unutsa bile satır girmez.
  constraint message_text_body check (
    kind <> 'text' or (body ? 'text' and length(btrim(body ->> 'text')) > 0)
  ),
  -- Şablon adı ile tür AYRIŞAMAZ: adsız bir template gönderilemez, adlı bir serbest metin de
  -- ücretlendirme tarafında template sanılırdı.
  constraint message_template_name check ((kind = 'template') = (template_name is not null)),
  -- Kategori de aynı kapıdan geçer ve ŞART: kategorisiz bir şablon kaydı, faturası okunamayan bir
  -- gönderimdir. Kolonu nullable bırakıp "sonra doldururuz" demek, tam da doldurulamayacak olan
  -- boyutu boş bırakmaktı.
  constraint message_template_category check ((kind = 'template') = (template_category is not null)),
  -- Template İŞLETME-BAŞLATANDIR; gelen mesaj template olamaz. Tersi mümkün olsaydı, gelen bir
  -- mesaj pencere hesabında "biz gönderdik" gibi okunurdu.
  constraint message_inbound_kind check (direction = 'outbound' or kind <> 'template'),
  -- Yazar yönle ÇELİŞEMEZ: gelen mesajın yazarı daima müşteridir, giden mesajı müşteri yazamaz.
  -- Kısıt olmasaydı yanlış eşleşme sessizce geçer ve "AI mı cevapladı" sorusu yalan okurdu.
  constraint message_author_direction check ((direction = 'inbound') = (author = 'customer'))
);

alter table public.message enable row level security;

-- Tek okuma deseni: bir konuşmanın mesajları, eskiden yeniye.
create index message_conversation_idx on public.message (conversation_id, created_at);
-- Mesaj-düzeyi idempotency'nin SON savunma hattı (15.7): Meta teslimatı 7 gün boyunca tekrarlar;
-- birincil koruma `webhook_event` claim'idir (provider+event_id = mesaj kimliği), bu indeks ise
-- claim'in atlandığı bir yolda aynı sağlayıcı mesajının deftere iki kez yazılmasını VERİDE keser.
-- Kısmi: elle işlenen satırlar kimliksizdir ve null tekilliğe girmez.
create unique index message_provider_message_key on public.message (provider_message_id) where provider_message_id is not null;

-- ── Talebin konuşma bağı ─────────────────────────────────────────────────────
-- `ticket.conversation_id` 0026'da FK'siz kondu — işaret ettiği tablo henüz yoktu. Şimdi var.
--
-- **`set null` DEĞİL:** `ticket_source_link` kısıtı "kaynağı whatsapp olan talep konuşmasız olamaz"
-- diyor. `set null` bir konuşmayı silerken talebin kolonunu boşaltmaya çalışır ve o kısıta çarpardı —
-- hata SİLİNEN satırda değil, adı hiç geçmeyen bir talepte görünürdü.
--
-- **`restrict` de DEĞİL, `no action` (varsayılan):** ikisi aynı şeyi yasaklar ama farklı ANDA
-- bakarlar. Hesap silindiğinde iki zincir birden koşuyor — talep `cascade` ile, konuşma `cascade`
-- ile. `restrict` anında bakar, yani konuşma zinciri talepten önce koştuğunda henüz silinmemiş bir
-- talebi görüp hata verir; hangisinin önce koştuğu ise kısıtların OLUŞTURULMA SIRASINA bağlıdır —
-- yani bugün çalışan bir silme, yarın eklenen bir FK yüzünden bozulabilirdi. `no action` deyimin
-- SONUNDA bakar: iki zincir de bittiğinde ortada yetim talep yoksa geçer. Aynı korumayı sıradan
-- bağımsız verir.
alter table public.ticket
  add constraint ticket_conversation_fk foreign key (conversation_id)
  references public.conversation (id);

-- ── Konuşmayı aç ya da bul ───────────────────────────────────────────────────
-- Oku-sonra-yaz YARIŞIR: aynı numaradan iki mesaj arka arkaya gelirse (adım 2'de olağan) ikisi de
-- "konuşma yok" görür ve ikisi de açmaya çalışır. Tekillik indeksi ikincisini reddeder, yani mesaj
-- kaybolur. Tek deyimlik upsert bunu imkânsız kılar.
--
-- **`coalesce(conversation.customer_id, excluded.customer_id)`** — mevcut bağ EZİLMEZ. Bir konuşma
-- bir müşteriye bağlandıktan sonra başka bir müşteriye kaydırmak bir BİRLEŞTİRME kararıdır ve
-- insana aittir (DOMAIN §10); sessizce yapılırsa geçmiş yanlış hesapta görünür.
--
-- Üç alanın üç ayrı birleşme kuralı var ve fark bilinçli (21.08):
--   · customer_id          → yalnız BOŞSA dolar (birleştirme insana ait);
--   · provider_account_ref → yalnız BOŞSA dolar (konuşma hesabını değiştirmez — değişen hesap
--     yeni bir external_ref uzayı demektir, aynı satırda sessizce el değiştiremez);
--   · profile_name         → YENİSİ kazanır (görünen ad kimlik değil; kullanıcı adını değiştirir
--     ve son görülen ad, aylar önceki addan değerlidir).
create or replace function public.open_conversation(
  p_source conversation_source,
  p_external_ref text,
  p_customer_id uuid default null,
  p_provider_account_ref text default null,
  p_profile_name text default null
) returns public.conversation
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_conversation public.conversation;
begin
  insert into public.conversation (source, external_ref, customer_id, provider_account_ref, profile_name)
  values (p_source, p_external_ref, p_customer_id, p_provider_account_ref, p_profile_name)
  on conflict (source, external_ref) do update
     set customer_id = coalesce(conversation.customer_id, excluded.customer_id),
         provider_account_ref = coalesce(conversation.provider_account_ref, excluded.provider_account_ref),
         profile_name = coalesce(excluded.profile_name, conversation.profile_name)
  returning * into v_conversation;

  return v_conversation;
end;
$$;

-- ── Mesaj kaydı ──────────────────────────────────────────────────────────────
-- İki tabloya birden dokunur (mesaj + konuşmanın damgaları) → tek RPC (STACK §13 (b)). Ayrı iki
-- yazım olsaydı, ikincisi düştüğünde gelen kutusu sıralaması sessizce bayatlardı: yeni mesaj gelmiş
-- ama konuşma listenin dibinde kalmış olurdu.
--
-- `p_window_expires_at` KARAR DEĞİL, kararın taşınmasıdır: 24 saati motor hesaplar
-- (`serviceWindowExpiry`). `null` = pencereye DOKUNMA — giden mesaj pencereyi açmaz. Açsaydı
-- ücretsiz mesajlaşma süresini kendi kendimize uzatmış olurduk; Meta'nın kuralı bizim tarafımızda
-- yanlış yazılır ve fatura sürpriz olurdu.
--
-- **`greatest`, `coalesce` DEĞİL — pencere GERİ GİTMEZ.** İlk yazımda `coalesce` vardı ve sessiz bir
-- para kaybıydı: sağlayıcı webhook'ları ne sıralı gelir ne de tek kez denenir. Yeniden denenen ya da
-- geç düşen ESKİ bir mesaj, kendi anına göre hesaplanmış daha erken bir bitişi yazar ve pencereyi
-- KISALTIRDI. Sonuç hiçbir yerde hata vermez; yalnız hâlâ ücretsiz olan bir aralıkta "pencere
-- kapandı" der ve şablon ücreti ödetir. `greatest` null'ları yok sayar (`greatest(null, x) = x`),
-- yani "dokunma" davranışı da korunur.
create or replace function public.record_message(
  p_conversation_id uuid,
  p_direction message_direction,
  p_kind message_kind,
  p_body jsonb,
  p_template_name text default null,
  p_template_category template_category default null,
  p_provider_message_id text default null,
  p_window_expires_at timestamptz default null,
  -- Kim yazdı (16.08). `null` = yönden türet: gelen daima müşteri, giden personel varsayılır —
  -- AI kendi gönderdiğinde 'ai' der. Yanlış eşleşmeyi tablo kısıtı keser.
  p_author ticket_sender default null
) returns public.message
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_message public.message;
begin
  -- Kalıp mesaj (template) bir WhatsApp kavramıdır — Meta-onaylı şablon + ücret sınıfı. Messenger/
  -- Instagram'da karşılığı yok (ücretsiz kanallar; pencere-dışı kuralları etikettir, şablon değil).
  -- `message` tablosunun kendi kısıtları kaynağı GÖREMEZ (source `conversation`'da durur), kural
  -- bu yüzden burada: yanlış kanala yazılan şablon, maliyet raporunu ve pencere mantığını sessizce
  -- kirletirdi (21.08).
  if p_kind = 'template' and (select source from public.conversation where id = p_conversation_id) <> 'whatsapp' then
    raise exception 'template mesaji yalniz whatsapp konusmasina yazilabilir (conversation %)', p_conversation_id;
  end if;

  insert into public.message (conversation_id, direction, author, kind, body, template_name, template_category, provider_message_id)
  values (
    p_conversation_id,
    p_direction,
    coalesce(p_author, case when p_direction = 'inbound' then 'customer'::ticket_sender else 'admin'::ticket_sender end),
    p_kind,
    p_body,
    p_template_name,
    p_template_category,
    p_provider_message_id
  )
  returning * into v_message;

  update public.conversation
     set last_message_at = v_message.created_at,
         window_expires_at = greatest(window_expires_at, p_window_expires_at)
   where id = p_conversation_id;

  return v_message;
end;
$$;

revoke all on function public.open_conversation(conversation_source, text, uuid, text, text) from anon;
revoke all on function public.record_message(uuid, message_direction, message_kind, jsonb, text, template_category, text, timestamptz, ticket_sender) from anon;

comment on table public.conversation is
  'Mesajlaşma konuşması (15.1 · üç kanal 21.08): kaynak (whatsapp/messenger/instagram), kimlik bağı, opt-in, 24s servis penceresi, son hareket.';
comment on table public.message is
  'Konuşmanın mesajları (15.1): yön + tür + gövde. Defterdir — yazılır, güncellenmez.';
