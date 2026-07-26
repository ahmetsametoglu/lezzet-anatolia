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
- [ ] (04.4) **`Customer.auth_user_id` bağlama:** girişte Auth kullanıcısı e-postayla mevcut `Customer`'a bağlanır; yoksa yeni müşteri açılır (03'ün bul-veya-oluştur kararı + DB yazımı)
  - *Bitti:* aynı e-postayla önce müşteri kaydı sonra giriş → tek Customer, `auth_user_id` dolu
- [ ] (04.5) **Bul-veya-oluştur servisi (telefon + e-posta):** 03'teki saf eşleşme kararını çağırıp DB işini yapan servis; eşleşme yoksa `is_draft=true` taslak müşteri açar (WhatsApp/manuel girişlerin de kullanacağı tek kapı)
  - *Bitti:* telefon eşleşen / e-posta eşleşen / hiç eşleşmeyen üç senaryo doğru sonuçla testte
- [ ] (04.6) **Misafir hızlı doğrulama akışı (sunucu tarafı):** hesapsız başlayan müşteri son adımda e-posta OTP ile doğrulanır → bul-veya-oluştur'dan geçip `Customer`'a bağlanır ("hesapsız sipariş yok" kuralının altyapısı; ekranı 08'de)
  - *Bitti:* doğrulanan misafir mevcut müşteriyse ona bağlanıyor, değilse yeni Customer açılıyor (iki dal testli)
- [ ] (04.7) **Müşteri birleştirme RPC'si:** siparişler, adresler, puanlar, konuşmalar, ticket'lar hedef müşteriye taşınır; kaynak kayıt kapanır — tek transaction; admin action'ı (ekranı 09'da)
  - *Bitti:* taslak + gerçek kayıt birleştirme testinde tüm bağlı kayıtlar hedefte, kaynak pasif; yarıda kesilme durumunda hiçbir şey taşınmamış (atomiklik)
- [x] (04.8) **Rol atama zemini:** admin'in bir kullanıcıya rol verdiği/aldığı servis + action (ekranı 09'da); ilk admin'in seed/script ile atanması
  - *Bitti:* script ile atanan ilk admin `requireAdmin`'den geçiyor; rol alınan kullanıcı geçemiyor
  - **Durum:** servis (`StaffRoleService.assign/remove/getRoles/hasRole`) + seed script (`scripts/set-role.ts` → `pnpm set-role <email> <rol>`) yazıldı ve canlı doğrulandı (atanan admin guard'dan geçer, rol alınınca geçemez). **Admin assign/remove Server Action'ı, çağıranı olan ayar ekranıyla birlikte 09'da yazılır** (şimdi çağıransız yazılırsa ölü kod).

## Netleşecekler

- **Rolün saklandığı yer:** Auth `app_metadata` mı, kendi tablomuz mu — 02'de netleşen veri erişim modeliyle (RLS kapsamı) birlikte karara bağlanır; artı/eksi masaya konur, sonra kodlanır.
- **Google OAuth konsol kurulumu:** Google Cloud tarafındaki uygulama kaydı ve anahtarlar kullanıcıyla birlikte yapılır (dış hesap işlemi).

---

**Modül durumu (26.07.2026):** personel tarafı ayakta, müşteri tarafı açık.
- **Var:** e-posta OTP girişi (tek `/connexion`), send-email hook → `packages/email` (Resend), `lib/guard.ts` (`requireStaff`), `StaffRoleService` + `pnpm set-role`, `user_profiles` trigger'ı (0001–0003).
- **Kısmi:** guard seti — bugün `requireStaff` var; `requireAdmin/requireWarehouse/requireCourier` ayrımı rol modeli netleşince eklenir (`staff_role` enum'u tek kapı).
- **Yok:** `Customer` varlığının kendisi (tablo/şema) — dolayısıyla `auth_user_id` bağlama, bul-veya-oluştur, misafir hızlı doğrulama ve müşteri birleştirme görevleri sırada bekliyor. Google OAuth henüz açılmadı (OTP ile giriliyor).
