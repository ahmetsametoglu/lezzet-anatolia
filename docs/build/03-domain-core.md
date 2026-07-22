# 03 — `packages/domain-core`: İş Kuralları Motoru

## Kapsam

Sistemin bütün ticari kuralları — **saf fonksiyonlar** olarak (veritabanı bilmez, yüzey bilmez; girdi alır, karar döner). Her satış yüzeyi (web, WhatsApp, kapı önü) aynı motoru çağırır; kural iki yerde yaşamaz. Birim test bu modülde **zorunludur** — kuralların doğruluğu ekran açmadan kanıtlanır.

## Okunacaklar

- `DOMAIN.md` — tamamı (kuralların kaynağı)
- `ORDER_LIFECYCLE.md` (durum makinesi)
- `CHANNELS.md §3` (telefon kimlik çözümü)
- `STACK.md §8` (motor deseni: `{data, error}`, fırlatma yok)

## Bağımlılık

`01-types` bitmiş olmalı. (`02-database`'e ihtiyaç yok — motor DB bilmez; paralel yürüyebilir.)

## Başlarken verilecek izah (örnek)

> "Sistemin beynini yazıyoruz: 'bu sipariş bu duruma geçebilir mi', 'bu müşteriye bu ürünün fiyatı ne', 'bu ödeme durumu ne' gibi soruların tek cevap yeri. Bunlar veritabanına dokunmayan saf hesap fonksiyonları — aynı soruyu web sitesi de WhatsApp robotu da kapı önü ekranı da buraya sorar, hepsi aynı cevabı alır. Her kuralı birim testle kanıtlıyoruz; ekran daha yokken kuralların doğru çalıştığından emin olacağız."

## Görevler

- [ ] **Durum makinesi:** izinli geçiş tablosu (`ORDER_LIFECYCLE.md` birebir: tam yol + hızlı satış + ek geçişler) + geçiş doğrulama fonksiyonu
  - *Bitti:* her izinli geçiş ve en az 5 yasak geçiş birim testli; `returned → completed` ve iptalde "karşılanan = 0" kuralları dahil
- [ ] **Kanal ve kaynak:** `company_info` → channel türetimi; order_source ekseninin bağımsızlığı
  - *Bitti:* şirketli müşteri → b2b, bireysel → b2c testleri
- [ ] **Fiyat çözümü:** özel fiyat → müşteri indirimi % → kanal fiyatı sırası; near-expiry teklif istisnası (tek fiyat + miktar tavanı); bundle açılımı (atanmış kalem fiyatları, hediye=0, genel indirim muafiyeti)
  - *Bitti:* çözüm sırasının her basamağı + bundle/teklif istisnaları birim testli
- [ ] **İndirim motoru:** kupon/otomatik, kapsamlar, **tek-en-büyük** kuralı, koşullar (min sepet, ilk sipariş, tarih, kullanım sınırı), sepet indirimini kalemlere **oransal dağıtma**
  - *Bitti:* iki uygun indirimde büyüğün seçildiği + dağıtım toplamının indirime eşit olduğu testler
- [ ] **Rezervasyon kararları:** kullanılabilir = fiili − aktif rezervasyon hesabı; TTL/geç-ödeme dallanması (yeniden ayır → olmazsa iade kararı); batch-pinned kural (FEFO önerisinden pinned düşülür)
  - *Bitti:* geç webhook senaryosu (stok var / yok) iki dalıyla test edilmiş
- [ ] **Ödeme türetimi:** karşılanan tutar (`fulfilled_qty × (unit_price − birim indirim payı)` + kargo ücreti kuralı) → `payment_status` (pending/paid/partial/refunded); kısmi karşılamada fark hesabı (peşin → iade; kapıda → düşür)
  - *Bitti:* kısmi + kuponlu + kargolu kombinasyon senaryosu doğru tutarı döndürüyor
- [ ] **Vade freni:** açık bakiye + limit + gecikme → "hesaba" seçeneği açık/kapalı kararı; limit aşımının admin onayına düşmesi
  - *Bitti:* limit içinde otomatik, aşımda `requires_approval` testleri
- [ ] **Kapıda ödeme kararları:** değer tavanı (engel) + nakit yasal sınırı (uyarı, engel değil) + `cod_allowed`
  - *Bitti:* üç kural ayrı ayrı ve birlikte test edilmiş
- [ ] **Kimlik çözümü:** telefon (E.164 normalize) + e-posta ile bul-veya-oluştur kararı (saf: eşleşme sonucu döner, DB işini çağıran yapar)
  - *Bitti:* telefon/e-posta eşleşme kombinasyon testleri
- [ ] **KDV işleme:** vat_treatment kararı (FR domestic / DE B2B geçerli vergi no → reverse charge / DE B2C domestic) 
  - *Bitti:* üç dal testli
- [ ] **Referans numarası:** marka+yıl+rastgele üretici + "ilk kalıcı durumda üret" kuralı
  - *Bitti:* biçim ve benzersizlik (çakışma yeniden deneme) testli

## Netleşecekler

- **TS ↔ SQL sınırı:** hangi kurallar burada (saf TS), hangileri atomiklik gereği Postgres fonksiyonunda (RPC) yaşar; ör. rezervasyon *kararı* burada, *atomik yazımı* RPC'de. Kısa bir sınır konuşması — 06/07 modüllerine girmeden netleşir.
