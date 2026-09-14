# Müşteri — Professionnels (B2B Tanıtım + Kayıt)

## 1. Amaç ve kullanıcı

Restoran/market gibi profesyonel alıcıya toptan çalışmayı tanıtan ve self-servis kayıt aldıran sayfa. Kullanıcı: B2B adayı (Fransız veya Alman şirket); çoğu ilk kez geliyor, güven ve ciddiyet arıyor.

## 2. İçerik envanteri — ne var, neden

### Tanıtım

- **Değer önerisi** — toptan fiyat, düzenli bölge içi teslimat, hacimli sipariş kolaylığı, tek tuşla tekrar sipariş; profesyonel alıcının kararını etkileyen somut faydalar
- **Nasıl çalışır** — kısa: kaydol → onay → toptan fiyatlarla sipariş. Onay adımının varlığı saklanmaz; "başvurun, hızla dönüş yapıyoruz" güveni verilir
- **İletişim yolu** — soru sormak isteyen adaya WhatsApp/telefon köprüsü; B2B ilişkisi çoğu zaman konuşmayla başlar

### Kayıt formu

- **SIRET ile otomatik dolum (Fransız şirket)** — aday SIRET numarasını girer; unvan, adres, faaliyet bilgisi resmî kayıttan otomatik dolar. Aday yalnız doğrular ve iletişim bilgilerini (ad, e-posta, telefon) ekler. Amaç: kayıt bir dakikada bitmeli
- **Alman şirketi yolu** — SIRET'i olmayan Alman şirketi bilgilerini elle doldurur + AB vergi numarasını (USt-IdNr) girer; numara otomatik doğrulanır. Geçersizse sade hata, düzeltme imkânı
- **Kimlik doğrulama** — kayıt hesap oluşturur; e-posta/Google ile hızlı doğrulama buradan geçer (şifre yok)
- **Onay bekliyor durumu** — kayıt biter bitmez net beklenti: başvuru alındı, inceleniyor, sonuç e-posta ile. **Toptan fiyatlar onaya kadar görünmez** — bu sade biçimde söylenir ("fiyat listeniz onayla birlikte açılır"); bu sırada katalog perakende fiyatla gezilebilir

## 3. Aksiyonlar

- SIRET girme → otomatik dolumu doğrulama → başvuruyu gönderme
- (Alman şirketi) elle doldurma + vergi no doğrulatma → gönderme
- Soru için WhatsApp/iletişime geçme
- Onay bekleyen kullanıcı: durumunu görme (giriş yaptığında)

## 4. Durumlar ve varyasyonlar

- **Fransız (SIRET) / Alman (elle + USt-IdNr) yolu**
- **SIRET bulunamadı / geçersiz** — sade hata + elle devam veya iletişim yolu
- **Başvuru gönderildi / onay bekliyor / onaylandı / reddedildi** — onaylı kullanıcı artık toptan fiyat görür; reddedilen hesap normal (perakende) müşteri olarak kalabilir, sade dille bildirilir
- **Zaten B2C hesabı olan aday** — mevcut hesabıyla başvurabilmeli (yeni hesap zorunlu değil)
- Üç dil — Alman adaylar için DE kritik

## 5. Akış bağlantıları

Gelinen: ana sayfadaki B2B çağrısı, doğrudan bağlantı/tanıtım, WhatsApp yönlendirmesi.
Gidilen: kayıt sonrası katalog (perakende fiyatla) veya hesap; onay sonrası normal alışveriş akışı (toptan fiyatla).

## 6. Yapmaması gerekenler

- Onay sürecinin iç kriterleri (faaliyet kodu kontrolü, rota uyumu, risk özeti) görünmez — yalnız "inceleniyor"
- Toptan fiyat listesi veya fiyat aralığı onaysız hiçbir yerde sızmaz (tanıtımda da "X€'dan başlayan" gibi ifadeler yok)
- Vade/limit kavramları kayıtta hiç geçmez — vade sonradan, işletmenin kararıyla açılan ayrı bir imkândır
- "B2B onay kartı", "VIES", "Sirene" gibi iç/teknik adlar görünmez; doğrulamalar sonuçlarıyla konuşur
- Perakende ve toptan fiyat aynı anda gösterilmez

## 7. Web / mobil notları (yalnız işlevsel)

- Kayıt mobilde de tam yapılabilmeli; SIRET/vergi no girişi mobil klavyede rahat olmalı
- Otomatik dolum sonucu doğrulama adımı her iki biçimde de tek bakışta kontrol edilebilmeli
