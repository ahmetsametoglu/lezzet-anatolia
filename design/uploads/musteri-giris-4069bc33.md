# Müşteri — Giriş / Hızlı Doğrulama

## 1. Amaç ve kullanıcı

Müşterinin şifresiz, birkaç saniyede kimliğini doğrulayıp devam ettiği giriş yüzeyi. Kullanıcı: ilk kez gelen veya dönen B2C/B2B müşteri. Ayrı "kayıt ol" ve "giriş yap" ayrımı yoktur — aynı akış hem yeni hem dönen müşteriyi karşılar; his "hesap açıyorum" değil "hızla doğrulanıp geçiyorum" olmalıdır.

## 2. İçerik envanteri — ne var, neden

- **Google ile devam** — tek dokunuşta doğrulama; en hızlı yol
- **E-posta ile devam** — müşteri e-postasını girer, gelen tek kullanımlık kodu yazar; şifre yoktur, hiç olmamıştır. "Şifremi unuttum" diye bir kavram da yoktur
- **WhatsApp ile devam** — telefon numarası üzerinden doğrulama; WhatsApp'tan alışveriş yapan kitle için doğal yol
- **Neden doğrulama istendiği** — bağlama göre kısa gerekçe ("siparişini tamamlamak için", "taleplerini görmek için"); müşteri anlamsız bir duvarla karşılaşmamalı
- **Yöntemlerin eşdeğerliği** — hangi yolla girerse girsin müşteri aynı hesaba ulaşır (e-posta ve telefon aynı kişiye bağlıysa sistem birleştirir); arayüz yöntemleri rakip değil alternatif olarak sunar
- **Yasal bağlantılar** — gizlilik politikası bağlantısı; doğrulama kişisel veri işlemenin başladığı andır

## 3. Aksiyonlar

- Google ile doğrulanma
- E-posta girme → kodu alma → kodu girme
- WhatsApp/telefon ile doğrulanma
- Kod gelmediyse yeniden göndertme
- Vazgeçip alışverişe dönme (giriş zorunlu olduğu bağlama kadar ertelenebilir — katalog/sepet girişsiz gezilir)

## 4. Durumlar ve varyasyonlar

- **Yeni müşteri / dönen müşteri** — aynı akış; yeni müşteride hesap arka planda kendiliğinden oluşur, ek form sorulmaz
- **Kod bekleniyor / kod hatalı / kodun süresi doldu** — sade hata + yeniden gönderme
- **Bağlamdan gelme** — checkout ortasında doğrulanan müşteri kaldığı yere döner; akış koparılmaz (en kritik senaryo)
- **B2B adayı** — giriş sonrası onay durumu neyse fiyat görünümü ona göre (bu sayfanın işi değil, ama akış onu doğru sayfaya bırakmalı)
- Üç dil

## 5. Akış bağlantıları

Gelinen: checkout (misafir doğrulaması — birincil senaryo), hesap/siparişler/talepler gibi oturum isteyen sayfalar, professionnels kaydı, geri bildirim linki (gerekirse).
Gidilen: her zaman **gelinen yere geri** — doğrulama bir duraktır, varış yeri değil.

## 6. Yapmaması gerekenler

- Şifre alanı, "şifre belirle", "şifremi unuttum" — hiçbiri var olmaz
- Uzun kayıt formu (ad/adres/doğum tarihi vb.) sorulmaz — bilgiler yeri geldikçe (checkout'ta adres gibi) toplanır
- "OAuth", "OTP", "oturum", "hesap birleştirme" gibi teknik terimler görünmez ("tek kullanımlık kod" gibi sade dil kullanılır)
- Pazarlama izni bu akışa sıkıştırılmaz (yeri checkout/hesaptır)
- Doğrulama, alışverişin önüne gereksiz yere konmaz — yalnız gerçekten gereken anda istenir

## 7. Web / mobil notları (yalnız işlevsel)

- Mobilde e-posta kodu girme klavye geçişleriyle boğuşturmamalı; kod otomatik algılanabiliyorsa girilmiş sayılmalı
- Checkout ortasında araya girdiğinde bağlam kaybettirmemesi en önemli işlevsel gereklilik
