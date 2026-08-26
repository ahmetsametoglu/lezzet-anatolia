-- Modül 08/09 — GDPR silme: hesabın anonimleştirilmesi (05.08, kullanıcı kararı 04.08).
--
-- ── NEDEN "SİLME" BİR `DELETE` DEĞİL ────────────────────────────────────────────────────────────
-- Gizlilik metni iki şeyi birden söz veriyor ve ikisi aynı satırda çelişiyor gibi görünür:
--   · "hesabınızı silebilirsiniz"
--   · "sipariş ve fatura kayıtları yasal süre boyunca saklanır"
-- Çelişki yok, çünkü silinen KİŞİ ile saklanan KAYIT ayrı şeyler. `order` bu profile `restrict` ile
-- bağlı; profili silen bir `delete` zaten veritabanı tarafından reddedilirdi. Yapılan şey kimliği
-- boşaltmak: sipariş satırı yerinde kalır, arkasındaki kişi kimliksizleşir.
--
-- **Fransız hukuku faturanın müşteri adını ve adresini İÇERMESİNİ zorunlu kılar** — bu yüzden
-- `order.address_snapshot` DOKUNULMADAN kalır. Metin bunu açıkça söylemek zorunda; söylemezse
-- "hesabımı sildim" diyen müşteri faturasında adını gördüğünde haklı olarak yanıltıldığını düşünür.
--
-- ── ÜÇ KOVA, TEK YERDE ──────────────────────────────────────────────────────────────────────────
-- Her tablo için karar burada verilir ve BAŞKA HİÇBİR YERDE tekrarlanmaz. Kararı uygulama katmanına
-- dağıtsaydık, yarın eklenen bir tablo birinde unutulur ve silme SESSİZCE yarım kalırdı — üstelik
-- hata vermeden, yani kimse fark etmeden.
--   1. SİLİNİR   — yalnız kişiye ait, yasal saklama gerekçesi yok (adres, talep, bildirim isteği).
--   2. KİMLİKSİZLEŞİR — kayıt başkaları için anlamlı, kişiye bağı gereksiz (ürün puanı).
--   3. KALIR     — yasal saklama (sipariş, para hareketi, muhasebe).
--
-- ── PERSONEL BU KAPIDAN GEÇMEZ ──────────────────────────────────────────────────────────────────
-- Personel kaydı bir istihdam kaydıdır ve müşteri talebiyle silinmez; ayrıca `order_event.actor`
-- gibi denetim izleri ona bağlı. Fonksiyon rolü kontrol eder ve personelde HATA FIRLATIR — sessizce
-- atlamaz: sessiz atlama, çağıranın "sildim" sanmasına yol açar.

create or replace function public.anonymize_customer(p_customer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_roles user_role[];
  v_anonymized timestamptz;
  v_email text;
  v_phone text;
begin
  select roles, anonymized_at, email, phone
    into v_roles, v_anonymized, v_email, v_phone
    from public.user_profiles
   where id = p_customer_id
     for update;

  if not found then
    raise exception 'anonymize_customer: profil bulunamadı (%)', p_customer_id;
  end if;

  -- Personel kaydı müşteri talebiyle silinmez (künyedeki gerekçe).
  if not ('customer' = any (v_roles)) then
    raise exception 'anonymize_customer: personel kaydı anonimleştirilemez (%)', p_customer_id;
  end if;

  -- **İdempotent**: ikinci çağrı sessizce çıkar. Yeniden çalıştırmak zarar vermemeli — silme
  -- talebi iki kez işlenirse (kuyruk tekrarı, elle tetikleme) ikinci koşu hata vermemeli.
  if v_anonymized is not null then
    return;
  end if;

  -- ── 1) SİLİNİR ────────────────────────────────────────────────────────────────────────────────
  -- Adres: teslimat için tutuluyordu, siparişin içindeki anlık görüntüsü zaten ayrı bir kayıt.
  delete from public.address where customer_id = p_customer_id;

  -- Talep yazışmaları: hem müşterinin kendi cümleleri hem personelin o kişi hakkında yazdıkları.
  -- `ticket_message` talebe `cascade` ile bağlı, tek silme yeter.
  delete from public.ticket where customer_id = p_customer_id;

  -- WhatsApp konuşması (15.1): müşterinin kendi cümleleri + `external_ref`'te duran telefon
  -- numarası — ikisi de kişisel verinin ta kendisi, yasal saklama gerekçesi yok. `message` konuşmaya
  -- `cascade` ile bağlı, tek silme yeter.
  --
  -- **Talepten SONRA, tesadüfen değil:** `ticket.conversation_id` FK'si `restrict` (0039) — konuşmayı
  -- önce silmeye çalışan bir sıra, o konuşmadan açılmış bir talep varsa hata verirdi.
  --
  -- Tablo bu dosyadan SONRAKİ bir migration'da (0039) doğuyor; plpgsql gövdesi tablo adlarını
  -- çalışma anında çözdüğü için sıra sorun değil — fonksiyon yine de bugün oluşturulabiliyor.
  delete from public.conversation where customer_id = p_customer_id;

  -- Bildirim istekleri: `email` bu tablolarda ZORUNLU kolon, yani satır kimliğin kendisidir.
  -- Kimlikle DE eşleştiriliyor çünkü ziyaretçiyken bırakılmış bir istek `customer_id` taşımaz —
  -- yalnız kimliğe baksaydık müşterinin en eski kaydı sistemde kalırdı.
  delete from public.zone_notice where customer_id = p_customer_id or (v_email is not null and lower(email) = lower(v_email));
  delete from public.variant_stock_notice where customer_id = p_customer_id or (v_email is not null and lower(email) = lower(v_email));

  -- Bildirim KAYDI (0049 · 14.12): kime, ne zaman, hangi siparişe/talebe dair haber verildiği —
  -- kişiye ait kayıt, yasal saklama gerekçesi yok. Teslim defteri (`notification_delivery`)
  -- cascade ile gider. FK'nin kendisi de `on delete cascade`, yani bu satır aslında emniyet
  -- kemeri değil BEYANDIR: silme kararı bu fonksiyonda görünür dursun (dosyanın kendi ilkesi —
  -- "karar BURADA verilir, başka yerde tekrarlanmaz"). Personel bildirimi bu kapıdan geçmez:
  -- fonksiyon personel kaydını zaten en başta reddediyor.
  delete from public.notification where profile_id = p_customer_id;

  -- Sadakat geçmişi: yasal saklama gerekçesi yok, kişiye bağlı olmadan da anlamsız.
  delete from public.points_entry where customer_id = p_customer_id;

  -- Müşteriye özel fiyat satırı ve kişiye özel kupon: kişi gidince dayanağı kalmıyor.
  --
  -- **KUPON SATIRI EKSİKTİ** (08.08 · müşteri şeridinin ölçümü): yorum iki şey söylüyor, kod
  -- birini yapıyordu. Kişisel kupon `price`'ta değil `discount`ta duruyor (`0024`) ve silinmiyordu
  -- — üstelik silme diyaloğunun üç dildeki metni onu ADIYLA sayıyor ("vos points et bons
  -- personnels"). Yani ekran, motorun yapmadığı bir şeyi vaat ediyordu.
  --
  -- Bu, bu dosyanın künyesindeki uyarının ta kendisi: kararı tek yerde tutmak yetmiyor, o tek yerin
  -- KENDİSİ eksik kalabiliyor ve hata vermediği için kimse fark etmiyor.
  delete from public.price where customer_id = p_customer_id;
  delete from public.discount where customer_id = p_customer_id;

  -- **Geri bildirim daveti — KİMLİK YERİNE GEÇEN ANAHTAR** (0029). Ötekilerden ayrı bir sınıf:
  -- burada mesele kimliksizleşmemiş bir satır değil, hesap kapandıktan sonra da ÇALIŞAN bir giriş
  -- yolu. Token oturum yerine geçiyor, ömrü 90 gün ve `/feedback/<token>` sayfası giriş sormadan
  -- açılıyor — silinen hesabın siparişindeki ürünler görünmeye devam ediyordu. Daha kötüsü: o
  -- sayfadan verilen bir yorum, silmenin az önce boşalttığı `product_feedback.comment` alanını
  -- yeniden dolduruyordu.
  delete from public.feedback_request where customer_id = p_customer_id;

  -- Sepet: kişinin ALMAK ÜZERE olduğu şeyler. Sipariş değil niyet; yasal saklama gerekçesi yok.
  delete from public.cart where customer_id = p_customer_id;

  -- ── 2) KİMLİKSİZLEŞİR ─────────────────────────────────────────────────────────────────────────
  -- Ürün geri bildirimi: **puan/oy KALIR, YAZI GİDER.**
  --
  -- Ayrımın gerekçesi: puan zaten ürünün toplam skoruna karışmış bir istatistiktir ve kimliğe
  -- bağlı olmadığı an kişisel veri olmaktan çıkar; satırı tümüyle silmek başka müşterilerin gördüğü
  -- ürün puanını GERİYE DÖNÜK değiştirirdi. Serbest metin ise kişisel olanın ta kendisi — kişi
  -- kendi adını da yazmış olabilir. `customer_id` zaten nullable (ziyaretçi geri bildirimi için),
  -- yani kolon kısıtını zorlamıyoruz.
  update public.product_feedback
     set customer_id = null,
         comment = null,
         translations = null,
         translated_at = null,
         language = null
   where customer_id = p_customer_id;

  -- **`discount_use` BİLEREK KALIR** (08.08, soruldu ve karara bağlandı). Satır "bu kampanyayı kaç
  -- kişi kullandı" sorusunun kaydıdır ve kampanya geçmişi bir işletme kaydıdır — silinseydi geçmiş
  -- bir kampanyanın sayısı geriye dönük düşerdi. Kimlik sorunu da doğurmuyor: profilin kendisi
  -- birazdan boşalıyor, yani `customer_id` artık kimseyi göstermiyor. `product_feedback` ile aynı
  -- ilke — istatistik kalır, kimlik gider; `0024`'ün `discount_code` için yazdığı gerekçenin ikizi.

  -- ── 3) KİMLİK BOŞALTILIR ──────────────────────────────────────────────────────────────────────
  -- `name` boş dizeye düşer (`not null default ''`), kimlik anahtarları null olur — kısmi unique
  -- indeksler `where ... is not null` olduğu için birden çok anonim satır çakışmaz.
  --
  -- `auth_user_id` KOPARILIR: `auth.users` satırının kendisini uygulama katmanı siler (admin API,
  -- ayrı yetki). Bağ burada koparılmazsa auth satırı silindiğinde `set null` zaten çalışırdı, ama
  -- o ana kadar giriş yapılabilir kalırdı — iki tarafı ayrı ayrı kapatmak, sırayı önemsizleştirir.
  update public.user_profiles
     set name = '',
         email = null,
         phone = null,
         auth_user_id = null,
         company_info = null,
         vat_number = null,
         vat_number_valid = null,
         referral_code = null,
         acquisition_source = null,
         marketing_consent = '{}'::jsonb,
         -- Bildirim tercihleri de kimliğin parçası: hangi türü reddettiği kişiye ait bir bilgidir.
         notification_consent = '{}'::jsonb,
         -- Jeton bir ANAHTARDIR ve silinen kimliğin anahtarı ayakta kalmamalı: eski bir mailin
         -- altbilgisinden gelen bağ, artık kimsenin olmayan bir tercih sayfasını açardı.
         notification_token = null,
         b2b_reject_reason = null,
         b2b_reject_reason_translations = null,
         b2b_rejected_at = null,
         -- Vade/kapıda ödeme yetkileri kapanır: kimliksiz bir kayda açık kredi bırakmak anlamsız.
         credit_enabled = false,
         credit_limit = null,
         cod_allowed = false,
         is_draft = false,
         anonymized_at = now()
   where id = p_customer_id;

  -- Telefon yalnız log'da işe yarardı; burada okunmasının tek sebebi künyeye yazılan kuralın
  -- kendisi: kişisel veri fonksiyondan DIŞARI çıkmaz, `raise notice` ile bile.
  perform v_phone;
end;
$$;

comment on function public.anonymize_customer(uuid) is
  'GDPR silme: kişisel alanları boşaltır, kişiye ait kayıtları siler, ürün puanını kimliksizleştirir. '
  'Sipariş/para kaydı KALIR (yasal saklama). İdempotent; personelde hata fırlatır.';
