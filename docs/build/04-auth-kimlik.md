# 04 — Kimlik ve Yetki: Supabase Auth, Guard'lar, Müşteri Bağlama

## Kapsam

Kim kimdir ve kim neye dokunabilir: Supabase Auth kurulumu (**yalnız kimlik/oturum motoru** — mail göndermez), Google + e-posta OTP girişi, rol kapıları (`requireAuth/requireAdmin/requireWarehouse/requireCourier` tek yerden), Auth kullanıcısını `Customer`'a bağlama, misafir hızlı doğrulama akışının sunucu tarafı, telefon/e-posta ile **bul-veya-oluştur** servisinin DB'ye bağlanması ve **müşteri birleştirme** RPC'si. **UI yok** — giriş/hesap sayfaları `08`'de, admin ekranları `09`'da; burada servis, action ve altyapı katmanı yazılır. B2B başvuru **onay ekranı** da `09`'dadır (buradaki iş yalnız kimliğin kurulması).

## Okunacaklar

- `DOMAIN.md §2` (roller ve izin ilkesi), `§10` (kimlik, birleştirme, hesap ve doğrulama — tamamı)
- `CHANNELS.md §3` (telefon anahtardır)
- `STACK.md §7` (guard deseni), `§13` (veri erişim modeli — 02'de netleşen karar geçerli)
- `INTEGRATIONS.md` Bildirim bölümü ("Auth mailleri de buradan" notu)
- `data-model/musteri-siparis.md` (`Customer`, `Address`)

## Bağımlılık

`01-types` ve `02-database` bitmiş olmalı. Kimlik çözümü görevleri `03-domain-core`'un saf bul-veya-oluştur kararını kullanır (o fonksiyon bitmiş olmalı; 03'ün geri kalanı beklemez).

## Başlarken verilecek izah (örnek)

> "Giriş sistemini kuruyoruz: müşteri Google hesabıyla ya da e-postasına gelen tek kullanımlık kodla (OTP) girer — şifre yok. Kimliği Supabase'in hazır oturum motoru tutar, ama doğrulama maili dahil her e-postayı kendi mail paketimiz gönderir; böylece bütün mailler tek yerden, aynı görünümle çıkar. Ayrıca 'bu kullanıcı admin mi, depocu mu, kurye mi' kontrolünü tek dosyada topluyoruz — her korunan sayfa ve işlem aynı kapıdan geçer, izin kuralı iki yerde yaşamaz. Son parça: hangi yoldan girilirse girilsin (Google, e-posta, ileride WhatsApp) kişinin tek müşteri kaydında birleşmesi; yanlışlıkla kopya oluşursa admin'in tek aksiyonla birleştirebilmesi."

## Görevler

- [x] (04.1) **Supabase Auth kurulumu:** Google OAuth + e-posta OTP açık, şifreli giriş kapalı; sunucu tarafı oturum okuma yardımcıları (`lib/supabase`)
  - *Bitti:* test kullanıcısı iki yöntemle de giriş yapıp sunucuda oturumu okunabiliyor
- [x] (04.2) **Send-email hook → `packages/email`:** Auth'un mail gönderimi hook'a devredilir; OTP/doğrulama maili `packages/email` default şablonuyla çıkar, Supabase yerleşik şablonları devre dışı
  - *Bitti:* OTP maili bizim şablonla geliyor; Supabase'in kendi mailinden hiçbir şey gitmiyor
- [~] (04.3) **Rol saklama + guard katmanı (`lib/guard.ts`):** rolün tek kaynak yeri (aşağıda netleşecek) + `requireAuth/requireAdmin/requireWarehouse/requireCourier` tek dosyadan; korunan örnek bir Server Action
  - *Bitti:* rolsüz kullanıcı korumalı action'dan `{error}` alıyor; dört guard da aynı dosyadan export
- [x] (04.4) **`Customer.auth_user_id` bağlama:** girişte Auth kullanıcısı e-postayla mevcut `Customer`'a bağlanır; yoksa yeni müşteri açılır (03'ün bul-veya-oluştur kararı + DB yazımı)
  - *Bitti:* aynı e-postayla önce müşteri kaydı sonra giriş → tek Customer, `auth_user_id` dolu
  - **Durum (27.07):** `0013_customer_fields.sql` — müşterinin ticari alanları (`company_info`, vergi no + VIES, vade üçlüsü, `discount_percent`, `cod_allowed`, pazarlama izni, edinim kaynağı, `referred_by`) **`user_profiles`'a eklendi**; `address` tablosu açıldı; `price.customer_id` FK'si bağlandı. `AddressService` + `UserProfileService`'e kimlik/liste/B2B uçları.
  - **AYRI MÜŞTERİ TABLOSU YOK — düzeltme (27.07):** ilk denemede `customer` diye ikinci bir tablo açılmıştı. `0001` zaten "müşteri bir ROLDÜR, ayrı tablo yok; ticari alanlar ilgili modülün migration'ında eklenir" diyordu; `UserProfileService.findOrCreate` de aynı işi yapıyordu. Yani tablo, servis ve kapı ikinci kez yazılmıştı — geri alındı, tek kimlik tablosunda birleştirildi. **Ders:** `DATA_MODEL`'deki varlık başlığından yürümeden önce o varlığın kodda karşılığı var mı diye bakılır (CLAUDE.md §1 + "kod ile doküman çelişirse kod haklı").
  - **1:1 uzantı tablosu da açılmadı** (kullanıcı kararı 27.07): alanların hepsi küçük skaler, satır dar; güvenlik sınırı bizde tabloda değil (her okuma sunucudan `service_role` + guard'dan geçer). Bölmek her sepet/checkout okumasına join, kimlik kurulumuna ikinci satır yazımı, birleştirmeye ikinci taşıma ekler.
  - **Tekillik DB'de:** telefon, e-posta (küçük harfe indirgenmiş) ve `auth_user_id` kısmi unique indeksli (`0001`). Kopya kayıt birleştirme gerektiren bir istisnadır.
  - **Kanal kolonu YOK:** b2b/b2c `company_info` varlığından türetilir; `in_route` de adreste saklanmaz.
- [x] (04.5) **Bul-veya-oluştur servisi (telefon + e-posta):** 03'teki saf eşleşme kararını çağırıp DB işini yapan servis; eşleşme yoksa `is_draft=true` taslak müşteri açar (WhatsApp/manuel girişlerin de kullanacağı tek kapı)
  - *Bitti:* telefon eşleşen / e-posta eşleşen / hiç eşleşmeyen üç senaryo doğru sonuçla testte
  - **Durum (27.07):** `apps/web/lib/identity/find-or-create.ts` — kimliğin tek kapısı, `user_profiles` üzerinde. Telefon E.164 normalize edilip aranır (yoksa "+33 6.." ile "0033 6.." ayrı kişi olur). Dört sonuç: `attached` · `created` · `conflict` (anahtarlar birden çok profile çıktı → sessizce seçilmez, admin birleştirir) · `insufficient` (anahtarsız kimlik kurulamaz — "hesapsız sipariş yok" burada başlar). 10 test.
  - **Kural servisten motora taşındı:** `UserProfileService.findOrCreate` çakışmada "telefon birincildir" diye kendi içinde karar veriyordu — iş kuralı servis katmanında yaşayamaz (STACK §4). Servis artık yalnız aday getirir (`findIdentityCandidates`), kararı `resolveIdentity` verir.
  - **Üçüncü kimlik anahtarı eklendi (03.9 genişletildi):** `auth_user_id`. Sebep somut: `0002` trigger'ı giriş anında profili zaten açıyor/bağlıyor; kapı bundan habersiz davranınca aynı Auth kullanıcısını ikinci profile yazmaya çalışıp tekillik kısıtına çarpıyordu. Çakışma sonucu da `customerIds: string[]` oldu — üç anahtar üç ayrı kayda düşebilir, iki adlı alan bunu ifade edemiyordu.
  - **Trigger ile iş bölümü:** trigger yalnız **e-postayla** eşleştirir (Google OAuth'ta sunucu kodumuz devrede olmayabilir, bağlama atomik olmalı). Sadece telefonu olan WhatsApp taslağı girişte eşleşmez ve ikinci profil doğar — bu gerçek bir kopya durumudur, kapı onu `conflict` olarak görünür kılar (testli), birleştirme 04.7'de.
  - **Eksik anahtar tamamlanır, dolu olan EZİLMEZ:** telefonla tanınan müşteri web'den e-postayla gelince o anahtar da karta yazılır (sonraki gelişte tek sorguda bulunur); ama adı gibi kullanıcının kendi düzelttiği veriyi otomatik akış üzerine yazmaz.
  - **Konum gerekçesi:** servis değil, **uygulama katmanı orkestrasyonu** — karar motorun (`resolveIdentity`), satır servisin, ikisi birbirini bilmez (STACK §4). Bugünkü tek tüketici web; WhatsApp (modül 15) da aynı kapıyı isteyince paylaşılan yere taşınır. İki tüketicisi olmadan paket açmak erken soyutlama olurdu. `touches: apps/web/lib/identity/**`
- [x] (04.6) **Misafir hızlı doğrulama akışı (sunucu tarafı):** hesapsız başlayan müşteri son adımda e-posta OTP ile doğrulanır → bul-veya-oluştur'dan geçip `Customer`'a bağlanır ("hesapsız sipariş yok" kuralının altyapısı; ekranı 08'de)
  - *Bitti:* doğrulanan misafir mevcut müşteriyse ona bağlanıyor, değilse yeni Customer açılıyor (iki dal testli)
  - **Durum (27.07):** `apps/web/lib/identity/verify-guest.ts` — OTP doğrulaması BAŞARILIYSA bul-veya-oluştur kapısından geçilir. Yanlış/süresi geçmiş kodda profil **açılmaz** (doğrulanmamış kimlik kayıt yaratmaz — testli). Checkout formundaki telefon aynı turda ikinci anahtar olarak karta yazılır. 5 test. Ekranı 08'de.
- [ ] (04.7) **Müşteri birleştirme RPC'si:** siparişler, adresler, puanlar, konuşmalar, ticket'lar hedef müşteriye taşınır; kaynak kayıt kapanır — tek transaction; admin action'ı (ekranı 09'da)
  - *Bitti:* taslak + gerçek kayıt birleştirme testinde tüm bağlı kayıtlar hedefte, kaynak pasif; yarıda kesilme durumunda hiçbir şey taşınmamış (atomiklik)
  - **Neden bekliyor (27.07):** taşınacak beş tablodan bugün yalnız ikisi var (`address`, müşteriye özel `price`). Sipariş 07'de, puan 17'de, konuşma 15'te, ticket 16'da açılıyor. Şimdi yazılan RPC, tablolar geldikçe sessizce eksik kalır — birleştirmede "unutulan tablo" veri kaybıdır. Bağlı tabloların çoğu ayağa kalkınca yazılacak. `conflict` sonucu üreten kapı (04.5) hazır: çakışma bugün de görünür kılınıyor.
- [x] (04.8) **Rol atama zemini:** admin'in bir kullanıcıya rol verdiği/aldığı servis + action (ekranı 09'da); ilk admin'in seed/script ile atanması
  - *Bitti:* script ile atanan ilk admin `requireAdmin`'den geçiyor; rol alınan kullanıcı geçemiyor
  - **Durum:** servis (`StaffRoleService.assign/remove/getRoles/hasRole`) + seed script (`scripts/set-role.ts` → `pnpm set-role <email> <rol>`) yazıldı ve canlı doğrulandı (atanan admin guard'dan geçer, rol alınınca geçemez). **Admin assign/remove Server Action'ı, çağıranı olan ayar ekranıyla birlikte 09'da yazılır** (şimdi çağıransız yazılırsa ölü kod).

## Netleşecekler

- **Rolün saklandığı yer:** Auth `app_metadata` mı, kendi tablomuz mu — 02'de netleşen veri erişim modeliyle (RLS kapsamı) birlikte karara bağlanır; artı/eksi masaya konur, sonra kodlanır.
- **Tek rol mü, çok rol mü (açık):** `DOMAIN §2` "bir kullanıcının birden fazla rolü olabilir" diyor; kodda tek `user_profiles.role` kolonu var ve `0001` "çok-rol YOK" diye yazıyor. `BACKLOG` da "çoklu rol desteği" listeliyor. Çelişki 27.07'de görünür kılındı, karara bağlanmadı — 04.3 ile birlikte çözülür. Bugünkü akışları (guard, yönlendirme) bloke etmiyor.
- **Google OAuth konsol kurulumu:** Google Cloud tarafındaki uygulama kaydı ve anahtarlar kullanıcıyla birlikte yapılır (dış hesap işlemi).

---

**Modül durumu (27.07.2026):** personel tarafı ayakta, müşteri kimliği kuruldu.
- **Var:** e-posta OTP girişi (tek `/connexion`), send-email hook → `packages/email` (Resend), `lib/guard.ts` (`requireStaff`), `StaffRoleService` + `pnpm set-role`, `user_profiles` trigger'ı (0001–0003); **müşterinin ticari alanları + `address` tablosu, bul-veya-oluştur kapısı ve misafir doğrulaması (0013, 04.4–04.6)**.
- **Kısmi:** guard seti — bugün `requireStaff` var; `requireAdmin/requireWarehouse/requireCourier` ayrımı rol modeli netleşince eklenir (`staff_role` enum'u tek kapı).
- **Yok:** müşteri birleştirme RPC'si (bağlı tabloların çoğu henüz açılmadı — 04.7 notu). Google OAuth henüz açılmadı (OTP ile giriliyor).
- **Açılan yol:** `Order.customer_id` artık bağlanabilir → modül 07 önkoşulu karşılandı.
