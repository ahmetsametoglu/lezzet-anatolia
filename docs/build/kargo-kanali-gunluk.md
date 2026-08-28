# Kargo kanalı — çalışma günlüğü

> Sade tutulur: ne yaptım, ne çalıştı, ne çalışmadı, ne kaldı.
> Tasarımın kendisi [kargo-kanali-tasarimi.md](kargo-kanali-tasarimi.md)'de.

## 28.08 gece — başlangıç

Top bırakıldı. Hedef: özelliği uçtan uca entegre etmek ve test etmek.

**Plan (tasarım §7'deki altı aşama):**

| Aşama | Ne | Durum |
| --- | --- | --- |
| A | Ambalajlı ürün ölçüsü — şema, form, MCP, besleme | ✅ |
| B | Kargo kutusu kataloğu + ölçü görünürlüğü | ⏳ |
| C | Koli planı (saf karar) | ⏳ |
| D | Sağlayıcı portu + `@lezzet/sendcloud` | ⏳ |
| E | Sepet & checkout canlı teklif | ⏳ |
| F | Gönderi + etiket + webhook + durum zinciri | ⏳ |

---

## A — Ambalajlı ürün ölçüsü ✅

**Ne yaptım:** varyanta dört alan ekledim (brüt ağırlık + üç ölçü), operatör formuna "Ambalaj"
satırı yazdım, asistanın ürün dilekçesine aynı alanları taşıdım, beslemeyi 175 varyanta ölçü
üretecek hâle getirdim.

**Ölçüldü (veritabanından):** 175 varyantın **154'ü ölçülü · 12'si tartılmış ama ölçülmemiş ·
9'u ölçüsüz**. Örnek: 2500 g net → 2687 g brüt, 235×165×155 mm.

**Testler:** 12 birim (ölçü üreteci) + 5 entegrasyon (yazma, yarım ölçü reddi, sıfır reddi,
porsiyon türü). Tam paket **3691/3691 yeşil**.

**Yol boyunca bulduğum iki şey:**

1. **Form ile veritabanı çelişiyordu.** Veritabanı yeni ürünü "kargoya verilemez" doğuruyor
   (bilinçli karar: unutulan alanın bedeli "satılamadı" olmalı), ama form "kargoya verilebilir"
   gönderiyordu — üstelik aynı formda "donuk" işaretliyordu. Yani **formdan açılan her yeni ürün
   "donuk ama kargolanabilir" doğuyordu.** Düzeltildi.
2. **Porsiyon türü ("12 dilim" mi "12 adet" mi) formda hiç yoktu** — yalnız besleme yazabiliyordu.
   Elle açılan her varyant bu bilgi olmadan doğuyordu. Aynı bölmeye eklendi.

**Bir tuzağa da düşmedim:** yeni test dosyasının vitest listesine eklenmesi gerekiyordu, yoksa
hata vermeden hiç koşmayacaktı. Eklendi ve koştuğunu ayrıca doğruladım (12 test).

