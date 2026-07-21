# BACKLOG — İş Kalemleri

Bu dosya **ne yapılacağını** tutar (WORKFLOW.md §8 rol ayrımı). Mimari/domain kararları buraya girmez — onlar `STACK.md`, `DOMAIN.md`, `ARCHITECTURE_DECISIONS.md`'de. Kalem tamamlandıkça işaretlenir; kapsam sınırları için `SCOPE.md`.

Sıralama kabaca bağımlılık sırasındadır: üstteki alttakine zemin olur.

---

## 0. Bekleyen kararlar (kod öncesi netleşmeli)

Bunlar arkadaşa sorulan sorulara bağlı (bkz. WhatsApp soru listesi). Cevaplar gelmeden ilgili kalem başlamaz.

- [ ] Marka adı yazımı: "Anatolia" mı "Anatolie" mi → `packages/brand`
- [ ] Ana logo seçimi + renk paleti → `packages/brand`, Tailwind token
- [ ] Satış birimi modeli: adet/tepsi/kilo/kutu → veri modeli (varyant kararı)
- [ ] Gramaj varyantı: aynı ürün farklı gramaj = varyant mı ayrı ürün mü
- [ ] Fiyat listesi (B2B/B2C) → seed verisi
- [ ] Nihai kategori ağacı
- [ ] Alerjen/içerik beyanı gerekli mi → veri modeline alan eklenmesi (FR/DE yasal)
- [ ] Ürün bazında KDV oranları
- [ ] Raf ömrü bilgisi (DLC uyarı eşiği için)

---

## 1. İskelet ve altyapı

- [ ] Monorepo kur: pnpm workspace + Turborepo + tsconfig (strict)
- [ ] Tailwind kurulumu + `packages/brand` (token kaynağı: renk, tipografi, spacing)
- [ ] Supabase projesi, `lib/supabase` (client/server)
- [ ] `packages/types` iskeleti + `LocalizedText`
- [ ] `packages/database`: `BaseDbService` + case-transformers (jsonb korumalı)
- [ ] `lib/guard.ts`: requireAuth + requireAdmin + requireWarehouse + requireCourier
- [ ] `lib/error.ts`
- [ ] i18n routing: `/tr` `/fr` `/de` + `packages/i18n` iskeleti + yedek zinciri çözücü (TR→FR→DE)
- [ ] `scripts/deploy.sh` + PM2 + Caddy

## 2. Kimlik ve roller

- [ ] Kullanıcı/oturum (Supabase Auth)
- [ ] `user_profiles` + rol alanı, çoklu rol desteği
- [ ] Rol bazlı yetki kapıları ve yönlendirme

## 3. Katalog (ürün/kategori)

- [ ] Category entity (çok dilli ad)
- [ ] Product entity (çok dilli ad/açıklama, görsel, KDV, aktif, sıra)
- [ ] Varyant/birim modeli (karar sonrası)
- [ ] Alerjen/içerik alanı (gerekliyse)
- [ ] Görsel yükleme (`packages/storage`, image_key deseni)
- [ ] AI çeviri önerisi: girilen dilden diğer ikisini üret, admin onayı
- [ ] Admin katalog ekranları (telefon öncelikli)
- [ ] Müşteri katalog + arama/filtre (server-rendered, çok dilli, cihaz çatallı)

## 4. Fiyat

- [ ] Price entity: kanal + müşteriye özel + B2C
- [ ] Fiyat çözümü (domain-core): müşteri/kanal → geçerli fiyat
- [ ] KDV ürün bazında

## 5. Stok

- [ ] Stock entity: fiili + ayrılmış + DLC + konum
- [ ] Kullanılabilir stok türetme
- [ ] Atomik rezervasyon/düşme (DB fonksiyonu + domain-core)
- [ ] FEFO hazırlık sırası
- [ ] DLC yaklaşma uyarısı (parametrik eşik)
- [ ] Depo ekranları (giriş, hazırlık listesi)

## 6. Sipariş

- [ ] Order + OrderItem entity (kanal otomatik, fiyat sabitleme)
- [ ] Sipariş durum makinesi (domain-core) + izinli geçişler + birim test
- [ ] Sepet ve sipariş oluşturma (müşteri)
- [ ] Hızlı satış yolu (kapı önü, tek adım)
- [ ] Tek tuşla tekrar sipariş
- [ ] Kanal otomatik belirleme
- [ ] Durum geçişlerinin loglanması

## 7. Ödeme

- [ ] Ödeme durumu ekseni (pending/paid/partial/refunded)
- [ ] Online ödeme sağlayıcı entegrasyonu (Stripe aday) — `apps/backend` webhook
- [ ] Kapıda ödeme kaydı (nakit/kart/çek)

## 8. Teslimat ve rota

- [ ] Adres + rota içi/dışı belirleme (posta kodu)
- [ ] delivery_type: route/shipping
- [ ] Dağıtım günü + rota listesi (Faz 1: liste, optimizasyon yok)
- [ ] Kurye teslimat ekranı
- [ ] Kurye gün kapanışı + kasa mutabakatı
- [ ] `wa.me` deep-link "yola çıktık" mesajı

## 9. İade/hasar

- [ ] İade/hasar bildirimi + durum (returned)
- [ ] Para iadesi / sonraki siparişe alacak
- [ ] Stoğa geri / imha işareti

## 10. Ön muhasebe

- [ ] Gelir/gider kaydı
- [ ] Kanal/ürün bazında kârlılık
- [ ] Muhasebe export (hedef Faz 2, iskelet Faz 1)
- [ ] Banka Excel import + eşleştirme (öneri + elle onay)
- [ ] reference_no üretimi, invoice_no eşleştirme alanı

## 11. Analitik (temel)

- [ ] Cookie'siz ziyaret ölçümü (kaynak, sayfa, dönüşüm)

## 12. Bildirim

- [ ] `packages/notify` soyut katman
- [ ] E-posta sürücüsü (işlem onayları)
- [ ] `wa.me` deep-link yardımcıları

## 13. Ayarlar

- [ ] Setting tablosu + önbellekli çözücü
- [ ] Parametreler: min sepet, kargo eşiği, DLC eşiği, KDV varsayılanı

---

## Faz 2+ (şimdilik başlamıyor, bkz. SCOPE.md)

Kargo entegrasyonu, banka eşleştirme derinliği, muhasebe export hedefi, teslimat penceresi/kapasite, reklam getirisi/UTM, akıllı bölge önerisi, AI şikâyet işletme, mobil uygulama + push, WhatsApp Business API.
