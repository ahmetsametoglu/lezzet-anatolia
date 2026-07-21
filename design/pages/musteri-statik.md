# Müşteri — Statik / Yasal Sayfa Şablonu

## 1. Amaç ve kullanıcı

Yasal ve bilgilendirici statik içerik için ortak sayfa şablonu: *mentions légales*, satış koşulları (CGV), gizlilik politikası, teslimat/iade bilgisi, SSS. Kullanıcı: her tip ziyaretçi/müşteri; çoğu buraya belirli bir soruyla gelir (nasıl teslim ediliyor, iade nasıl, verilerim ne oluyor).

## 2. İçerik envanteri — ne var, neden

- **Sayfa başlığı + metin gövdesi** — uzun biçimli, bölümlü metin; hukuki metinlerde bölüm başlıkları gezinmeyi mümkün kılmalı (uzun metinde kaybolmamak işlevsel bir ihtiyaç)
- **Beş içerik türü, tek şablon:**
  - *Mentions légales* — işletme kimliği (yasal zorunluluk)
  - *CGV* — satış koşulları; sipariş verenin onayladığı çerçeve
  - *Gizlilik politikası* — hangi veri, neden, ne kadar; silme talebinin e-posta ile yapılabildiği bilgisi (GDPR)
  - *Teslimat / iade bilgisi* — bölge içi teslim + kargo, soğuk zincir, iade koşulları; satın alma öncesi en çok merak edilen içerik
  - *SSS* — kısa soru-cevap seti; sorular tek tek bulunabilir olmalı
- **Güncellenme tarihi** — yasal metinlerde hangi sürümün geçerli olduğu belli olmalı
- **İlgili sayfalara köprüler** — teslimat sayfasından kataloğa, gizlilikten hesaba, SSS'den talebe/iletişime gibi doğal geçişler; statik sayfa çıkmaz sokak olmamalı
- **Çok dilli statik içerik** — her sayfa üç dilde de vardır, her an tek dilde gösterilir; hukuki metinlerde dil kalitesi güven meselesidir

## 3. Aksiyonlar

- Metin içinde gezinme (bölümler arası)
- SSS'de soruya ulaşma
- Dil değiştirme (aynı sayfanın diğer dildeki karşılığına)
- İlgili sayfalara geçme; SSS'den cevap bulunamazsa "bize yaz" girişine geçme

## 4. Durumlar ve varyasyonlar

- **İçerik türü** — düz hukuki metin (mentions/CGV/gizlilik), yapılandırılmış bilgi (teslimat/iade), soru-cevap (SSS); tek şablon bu üç dokuya da dayanmalı
- **Metin uzunluğu** — CGV çok uzun, mentions kısa olabilir
- Üç dil — Almanca hukuki metin belirgin uzundur

## 5. Akış bağlantıları

Gelinen: site geneli alt bağlantılar, checkout (koşullar/gizlilik bağlantısı), arama motoru.
Gidilen: katalog, hesap, talep/"bize yaz", ana sayfa.

## 6. Yapmaması gerekenler

- Sistem/iç işleyiş detayı içermez — bu sayfalar müşteriye dönük düz içeriktir
- SSS, destek talebinin yerine geçirilmez; cevaplanamayan soru için yol gösterilir ama SSS içine form gömülmez
- Yasal metinler özetlenerek "yorumlanmış" ikinci bir sürümle çelişki yaratılmaz — metin tektir
- Fatura indirme/fatura talebi burada da vaat edilmez

## 7. Web / mobil notları (yalnız işlevsel)

- Uzun metin mobilde de okunabilir ve içinde gezinilebilir olmalı
- Bu sayfalar arama motorundan doğrudan giriş alır; içerik her iki biçimde de tam olmalı (kırpılmaz)
