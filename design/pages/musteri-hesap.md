# Müşteri — Hesap

## 1. Amaç ve kullanıcı

Müşterinin kendi bilgilerini, tercihlerini ve puanlarını yönettiği alan. Kullanıcı: giriş yapmış B2C veya B2B müşteri.

## 2. İçerik envanteri — ne var, neden

- **Profil** — ad, e-posta, telefon; telefon WhatsApp iletişiminin anahtarıdır, doğru olması müşterinin yararına
- **Şirket bilgisi (B2B)** — unvan/adres/vergi no görüntülenir; onaylı B2B olduğu belli olur. Değişiklik talebi işletmeye iletilir (kritik alanlar müşteri tarafından serbestçe değiştirilmez)
- **Adresler** — kayıtlı adresler; ekleme/düzenleme/silme, **teslimat adresi** seçimi (checkout'ta önceden seçilen adres; rolün adı işini söyler, "varsayılan" denmez — kullanıcı kararı 08.09). Checkout'u hızlandırır. **Kurumsal hesapta ayrıca fatura adresi seçimi** (08.09): "fatura nereye kesilecek" sorusu "malı nereye götürelim"den ayrı — aynı adres ikisi birden olabilir, biri ötekini düşürmez; kartta eylem olarak ve formda kutu olarak sorulur; bireysel hesapta bu rol hiç görünmez
- **Dil tercihi** — TR/FR/DE; bildirim ve e-postaların dili buna göre gider
- **Bağlı sohbetler** (15.16, kullanıcı tasarımı 08.09) — hangi Messenger / Instagram / WhatsApp sohbetinin bu hesaba bağlı olduğu, kanal ve tarihle; **salt okunur** (bağ sohbetten gönderilen bağlantıyla kurulur, çözülmesi bir birleştirme kararıdır). Bağlantıdan gelen müşteri girişten hemen sonra sonucu tek cümleyle okur: bağlandı · zaten bağlı · başka hesaba bağlı (bize yazın) · bağlantı geçersiz
- **Pazarlama izinleri** — kanal bazlı (e-posta / WhatsApp) açık-kapalı; müşteri her an değiştirebilir. Verdiği izni görmesi ve geri alabilmesi yasal gereklilik
- **Puan bakiyesi (yalnız B2C)** — biriken puan ve nasıl kazanıldığına dair sade döküm (yorum, geri bildirim, sipariş…). Puanlar süresiz birikir
- **Puanı kupona çevirme** — müşteri isteyince biriken puanını **kişisel indirim koduna** çevirir; eşik ve karşılık sade gösterilir ("X puan = Y € indirim"). Oluşan kupon burada görünür, sepette kullanılır
- **GDPR bilgisi** — verilerinin silinmesini e-posta ile talep edebileceği sade açıklama + gizlilik politikası bağlantısı; ayrıca kendi bilgilerini bu sayfada zaten görür
- **Hesap bağlantıları** — siparişlerim, taleplerim gibi diğer hesap alanlarına geçiş

## 3. Aksiyonlar

- Profil bilgisi düzenleme
- Adres ekleme / düzenleme / silme / teslimat adresi yapma / fatura adresi yapma (yalnız kurumsal hesap)
- Dil değiştirme
- Pazarlama iznini kanal bazında açma/kapama
- Puanı kupona çevirme (B2C)
- Çıkış yapma

## 4. Durumlar ve varyasyonlar

- **B2C / B2B** — B2B'de şirket bilgisi bölümü var, puan bölümü yok (puan yalnız B2C'de); B2B vade kullanıyorsa bunun görünümü sipariş tarafında yaşar, hesapta kural detayı gösterilmez
- **Puan: sıfır / birikmiş / çevirme eşiğinin altında** — eşik altındaysa çevirme yapılamaz, ne kadar kaldığı sade söylenir
- **İzinler: açık / kapalı** — kapalıyken hiçbir kampanya iletişimi gitmez
- Üç dil

## 5. Akış bağlantıları

Gelinen: site geneli hesap girişi, sipariş sonrası, geri bildirim akışı sonu (puan kazanımı yönlendirmesi).
Gidilen: siparişler, sipariş detay, talepler, katalog.

## 6. Yapmaması gerekenler

- Müşteriye tanınan iç değerlendirmeler görünmez: vade limiti/karnesi, özel fiyat oranı, kapıda ödeme izni durumu, müşteri birleştirme/taslak kavramları
- Puan sisteminin iç mekaniği (kalite ağırlığı, günlük tavan hesabı) anlatılmaz; kazanım/harcama sade dökümle yetinilir
- "Opt-in", "consent kaydı", "E.164" gibi sistem terimleri görünmez
- Fatura indirme alanı yoktur (resmî fatura muhasebeden gelir)

## 7. Web / mobil notları (yalnız işlevsel)

- Mobilde adres düzenleme ve izin anahtarları tek elle rahat kullanılmalı
- Dil değişikliği anında etkili olmalı (sayfa o dile döner)
