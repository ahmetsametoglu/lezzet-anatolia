# Admin — Müşteriler

## 1. Amaç ve kullanıcı

Müşteri kayıtlarının izlendiği ve müşteriye bağlı kararların (vade/limit, kapıda ödeme, birleştirme, GDPR silme) verildiği ekran: liste + müşteri detayı. Kullanıcı: yalnız admin rolü.

## 2. İçerik envanteri — ne var, neden

### Liste

- **Müşteri satırı** — ad, tip (bireysel/şirket), telefon/e-posta, ülke; arama telefon ve ada göre (telefon kimlik anahtarıdır — WhatsApp'tan gelen müşteri telefonla bulunur)
- **Daraltma** — B2B/B2C, vadeli müşteriler, taslak kayıtlar (WhatsApp'tan otomatik açılmış, birleştirme adayı), onay bekleyen B2B

### Detay

- **Kimlik ve iletişim** — ad, telefon, e-posta, tercih dili, ülke, adresler (rota-içi mi türetilmiş haliyle); şirketse şirket bilgisi, vergi no ve VIES doğrulama sonucu, B2B onay durumu
- **Siparişleri** — müşterinin sipariş geçmişi (tutar, durum, ödeme durumu); sipariş detayına köprü. "Bu müşteri ne kadar, ne sıklıkla alıyor" ilk bakışta sezilmeli
- **Vade / limit yönetimi** — vade yetkisi (varsayılan kapalı, elle açılır), limit (€, müşteri bazında), vade süresi (gün; boşsa varsayılan 30). **Açık bakiye ve gecikme türetilir**: ödenmemiş vadeli siparişlerin toplamı ve vadesi geçenler burada görünür — saklanan bir sayı değil, güncel gerçek
- **Ödeme karnesi (türetilmiş)** — toplam ciro, ortalama ödeme günü, gecikme sayısı. Limit kararının dayanağıdır: sistem karneyi gösterir, **kararı admin verir** — limit puana göre otomatik belirlenmez
- **Kapıda ödeme izni (cod_allowed)** — varsayılan açık; ödememe/ret geçmişi olan müşteride kapatılır. Neden kapalı olduğu anlaşılır olmalı
- **Fiyat ilişkisi** — müşteri indirim oranı (%) ve varsa müşteriye özel fiyatları; düzenleme fiyat ekranıyla aynı karara çıkar
- **Kişisel kuponlar** — bu müşteriye bağlı kuponlar (puan redemption'ından doğanlar dahil) ve puan bakiyesi (türetilmiş); elle kişisel kupon açılabilir
- **Pazarlama izinleri (görüntüleme)** — kanal bazlı (e-posta/WhatsApp) izin durumu + ne zaman, nereden verildiği (GDPR kanıtı). **Salt görüntülemedir** — izin müşterinin açık eylemiyle doğar, admin elle izin üretmez
- **Edinim bilgisi** — ilk siparişteki kaynak ve varsa getiren müşteri (arkadaşını getir); müşteri değerlendirmesine bağlam katar
- **Talepleri** — müşterinin açık/geçmiş talepleri (köprü)

## 3. Aksiyonlar

- Müşteri bilgisi düzenleme; adres ekleme/düzenleme
- Vade açma/kapama, limit ve vade süresi belirleme/değiştirme (her an)
- Kapıda ödeme iznini kapatma/açma
- İndirim oranı belirleme; kişisel kupon açma
- **Müşteri birleştirme** — kopya kayıt (taslak + web kaydı) tekleştirilir: siparişler, puanlar, konuşmalar hedefe taşınır, kaynak kapanır. Hangi kaydın hedef olduğu ve neyin taşınacağı onaydan önce net görünmeli — geri dönüşü olmayan işlemdir
- **GDPR silme** — müşterinin tüm verisini silme/anonimleştirme (e-posta talebi üzerine, elle yetki); geri dönüşsüzlüğü açık bir onay ister
- Sipariş geçmişinden sipariş detayına, taleplere geçme

## 4. Durumlar ve varyasyonlar

- **B2C / B2B** — vade, VIES, şirket bilgisi yalnız B2B'de anlamlı; B2C'de puan/kupon tarafı öne çıkar (puan yalnız B2C)
- **Taslak müşteri** — WhatsApp'tan otomatik açılmış, eksik bilgili; birleştirme adayı olduğu belli olmalı
- **Vadeli müşteri: temiz / limitte / gecikmiş** — gecikmiş müşteride vadeli seçeneğin checkout'ta otomatik kapandığı bilinmeli (sistem freni; admin ayrıca kapatmaz)
- **Yeni müşteri** (sipariş yok) — karne ve türetilmiş alanlar boş halleriyle anlamlı durmalı
- **Silinmiş/anonimleştirilmiş kayıt** — geçmiş siparişler muhasebe bütünlüğü için kalır, kişisel veri kalmaz

## 5. Akış bağlantıları

Gelinen: sipariş detay (müşteri köprüsü), B2B onay (onaylanan başvuru), dashboard (gecikmiş vade), talepler, WhatsApp izleme.
Gidilen: sipariş detay, fiyatlar (özel fiyat), talep detay, B2B onay kaydı.

## 6. Yapmaması gerekenler

- Bu ekran **yalnız admin rolüne** açılır; vade/limit/karne/izin bilgisi başka hiçbir role görünmez
- Karne ve açık bakiye **karar desteğidir, otomasyon değildir** — ekran "önerilen limit" dayatmaz; sayı gösterir, karar admin'in
- Pazarlama izni admin eliyle "verildi" yapılamaz — yalnız görüntülenir; aksi GDPR kanıtını bozar
- Puan bakiyesi ve açık bakiye gibi türetilmiş değerler elle düzeltilmez — kaynağı (hareketler/siparişler) düzeltilir
- Müşterinin şifre/oturum bilgisi ve kişisel analitik izleri burada gösterilmez — karar için gerekmez

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: en sık senaryolar telefonla müşteri bulma (WhatsApp yazışması sırasında), vadeli sipariş kararı öncesi karneye bakma ve limit değiştirme — hepsi telefonda hızla erişilmeli
- Birleştirme ve GDPR silme gibi geri dönüşsüz işlemler telefonda da güvenle (yanlışlıkla tetiklenmeden) yapılabilmeli
