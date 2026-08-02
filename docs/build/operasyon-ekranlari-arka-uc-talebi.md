# Operasyon Ekranları — Arka Uç Talebi (konu dosyası olmayanlar)

> **Ne bu:** operasyon yüzeyi şeridinin arka uç şeridinden beklediği, **kendi konu dosyası olmayan**
> maddeler. Konusu belli olanlar kendi dosyasında durur — tedarik → `tedarik-arka-uc-talebi.md`,
> depo ekseni → `depo-ekseni-operasyon-arka-uc-talebi.md`, yer ekseni → `yer-ekseni-arka-uc-talebi.md`.
> Buraya düşenler tek maddelik ya da tek ekranı ilgilendiren işler; her biri için ayrı dosya açmak
> talebi bulunmaz hâle getirirdi.
>
> **Kim yazdı:** operasyon yüzeyi ajanı · **Kime:** arka uç şeridi · **Tarih:** 02.08.2026
>
> **Karar değil, karar talebi.** Cevaplar geldikçe çıkan işler ilgili `NN-*.md` görev satırına
> yazılır — durumun tek sahibi orasıdır (`CLAUDE.md §5`), bu dosya değildir.
>
> **Cevap nasıl verilir:** her maddenin altındaki **Arka uç cevabı:** satırına. Katılmadığın yerde
> gerekçeni yaz; öneriler kod okumasına dayanıyor ama o dosyalar senin şeridinde.

---

## 1. `SettingsService` önbelleği — TTL mi, yayın mı? *(karar; Ayarlar ekranını BLOKLUYOR)*

### Sorun

`SettingsService` süreç içinde **statik bir önbellek** tutuyor ve dışarıdan yapılan değişiklikte
düşmüyor: `set()` yalnız kendi sürecinin kopyasını geçersizler. Tek süreçte sorun görünmüyor.

Çok süreçli dağıtımda (PM2 · web + backend ayrı işlemler, `18.7`/`18.9`) bunun karşılığı şu: operatör
Ayarlar ekranından bir değeri değiştiriyor, ekran "kaydedildi" diyor, **ve hiçbir şey değişmiyor** —
çünkü kararı veren öteki süreç hâlâ eski değeri okuyor. Sonraki dağıtıma kadar da böyle kalıyor.

Bu, ayarlar ekranının **var olma sebebini** ortadan kaldırıyor: bir ayar ekranı, yazdığı değerin
uygulandığını gösterebilmelidir. Gösteremiyorsa operatör ekrana değil kendi hafızasına güvenmeye
başlar — ve o noktada ekran zararlıdır, eksik değil.

### Sorular

1. **TTL mi, yayın (notify) mı?** TTL basit ama "ne kadar sürede yansır" sorusunu cevapsız bırakır
   (30 sn mi, 5 dk mı — ve o süre boyunca iki süreç farklı kural uygular). Postgres `LISTEN/NOTIFY`
   ya da satır damgası (`updated_at` yoklaması) anında yansıtır ama bir bağlantı/tur maliyeti var.
2. Hangisi seçilirse seçilsin, **ekran gecikmeyi söyleyebilmeli mi?** ("değişiklik en geç N sn içinde
   tüm süreçlerde geçerli olur"). Söyleyebiliyorsa süre bir sözleşmedir ve ekranda yazılabilir;
   söyleyemiyorsa ekran hiçbir şey vaat etmemeli — belirsiz bir vaat, yanlış bir vaatten kötüdür.

### Neden sizde

`packages/database` sizin şeridiniz ve bu bir **altyapı kararı**, ekran tercihi değil. Ekran tarafı
kararı bekliyor: `09.16` (Ayarlar) yazılmadan bu netleşmeli, yoksa yazdığım ekran çalışmayan bir söz
verir. Kayıt: `09-admin.md` (09.16) ve `09.13`'ün notu.

**Arka uç cevabı:** —

---

## 2. İmha/fire aramasının SUNUCU tarafı *(küçük, yapısal)*

### Sorun

Stok → Kayıplar sekmesinde arama **yalnız yüklenmiş satırlarda** çalışıyor. Terim lot numarasına ve
ürün adına bakıyor; ikisi de düzeltme satırının (`stock_adjustment`) kendisinde değil, gömülü
`stock` / `product` ilişkisinde duruyor. Sunucuda süzmek, ortak stok okumasına **inner-join'li bir
süzgeç** eklemeyi gerektiriyor — ve o okuma sizin şeridinizde.

Bugünkü sınır dar (liste zaten dönemle sınırlı) ve ekran kesmeyi **kendi cümlesiyle söylüyor**:
"Arama şu ana kadar yüklenmiş satırlarda yapılır" — yani sessiz bir kesme yok. Ama dönem büyüdükçe
bu cümle bir özürden ibaret kalır: operatörün elinde bir lot numarası varsa onu dönem seçmeden
bulabilmeli.

### Önerim

`StockAdjustmentService`'in (ya da hangi okuma kullanılıyorsa) liste süzgecine `query?: string`
eklensin ve gömülü ilişkilerde arasın: lot (`stock.lot`) + ürün adı. PostgREST'te gömülü sütuna
göre süzmek `!inner` ister — o da satır kümesini daraltır, yani sonuç doğru ama **join'in kendisi
zorunlu hâle gelir**; partisi silinmiş bir düzeltme satırı varsa listeden düşer. Bu bir karar:
düşmesi doğru mu, yoksa `or` ile mi kurulmalı, siz bilirsiniz.

Kayıt: `09-admin.md` görev **(09.18)**, kodda `BEKLEYEN(09.18)` (`stock/tabs/losses-tab.tsx`).

**Arka uç cevabı:** —

---

## 3. Tedarik siparişinde insan-okur referans numarası *(şema kararı, düşük öncelik)*

`purchase_order` yalnız `id · supplier_id · status · sent_at · note · created_at` taşıyor; okunur
bir numara yok. Sipariş listesi bu yüzden satırı **tedarikçi + tarih** ile tanıtıyor — uuid'i
"TS-118" gibi göstermek uydurma olurdu.

Bugün acil değil: telefonda "dünkü Metro siparişi" demek çalışıyor. Ama fatura eşleştirme geldiğinde
(tedarikçi faturasını siparişle karşılaştırmak) numarasız bir kayıt zorlaşır. Emsal var:
`Order.reference_no` (`LA-26-7K4M2P`). Aynı deseni buraya uygulamak sizin kararınız — ekran tarafı
alan gelirse sütunu ekler, gelmezse bugünkü tanıtımı sürdürür.

**Arka uç cevabı:** —
