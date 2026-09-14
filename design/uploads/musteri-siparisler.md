# Müşteri — Siparişlerim

## 1. Amaç ve kullanıcı

Müşterinin geçmiş ve aktif siparişlerini görüp tek hareketle tekrar sipariş verdiği liste. Kullanıcı: giriş yapmış B2C veya B2B müşteri; tekrar sipariş özellikle B2B'nin ana alışkanlığıdır (aynı ürünleri düzenli aralıkla alır).

## 2. İçerik envanteri — ne var, neden

- **Sipariş listesi** — her satırda: tarih, sipariş referans numarası, durum (sade dille), toplam tutar, kalem sayısı veya kısa içerik özeti. Müşteri "hangi siparişim neydi"yi tek bakışta ayırt etmeli
- **Durum sade dille** — müşteri diline çevrilmiş haller: alındı / hazırlanıyor / yolda / teslim edildi / iptal / iade. Aktif sipariş listede kolay seçilmeli
- **Tek tuş tekrar sipariş** — listeden, detaya girmeden: siparişin kalemleri **güncel fiyatlarla** yeni sepete kopyalanır; müşteri sepette gözden geçirip onaylar. B2B için en değerli kısayol
- **Tekrar siparişte değişen gerçekler** — tükenen/satıştan kalkan kalem sepete eklenemez; hangi kalemlerin eklenemediği sade söylenir. Fiyat farkı sepette zaten görünür — ayrı uyarı gösterisi gerekmez
- **Boş durum** — hiç sipariş yoksa kataloğa davet

## 3. Aksiyonlar

- Sipariş detayına gitme
- **Tekrar sipariş** (kalemleri sepete kopyala → sepete git)
- Listede geriye doğru gezinme (eski siparişler)

## 4. Durumlar ve varyasyonlar

- **B2C / B2B** — aynı liste; B2B'de sipariş sayısı ve tutarlar büyüktür, tekrar sipariş kullanım sıklığı yüksektir
- **Aktif sipariş var / yalnız geçmiş / boş liste**
- **Tekrar sipariş: tümü eklenebildi / bazı kalemler eklenemedi**
- Üç dil

## 5. Akış bağlantıları

Gelinen: hesap, sipariş onayı sonrası, bildirim e-postasındaki bağlantı.
Gidilen: sipariş detay, sepet (tekrar sipariş sonrası), katalog (boş durumdan).

## 6. Yapmaması gerekenler

- İç durum adları (`confirmed`, `out_for_delivery` vb.) ve durum makinesinin ara halleri görünmez — müşteri dilinde az sayıda hal yeter
- Ödeme/mutabakat iç bilgileri, kâr, kaynak (web/WhatsApp) etiketi görünmez
- Tekrar sipariş **eski fiyatları taşımaz** — eski fiyatla yeni sipariş vaadi verilmez
- Fatura indirme yoktur; sipariş referansı fatura numarası gibi sunulmaz

## 7. Web / mobil notları (yalnız işlevsel)

- B2B müşteri bu sayfayı çoğunlukla mobilde, rutin olarak kullanır; tekrar sipariş tek elle ve az adımla tamamlanmalı
- Uzun listelerde eski siparişe ulaşmak zahmetsiz olmalı
