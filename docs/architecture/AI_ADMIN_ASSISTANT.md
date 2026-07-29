# AI Yönetici Asistanı (MCP) — niyet notu

> **STATÜ: NİYET, KARAR DEĞİL.** Bu dosya bir tasarım değil, **giriş noktasıdır**. Kullanıcının 30.07'de
> ilk kez ifade ettiği bir hedefi kayda geçirir ki ileride sıfırdan konuşulmasın ve bugün verilen
> kararlar farkında olmadan bu hedefin önünü kapatmasın.
>
> **Sırası: EN SON.** Faz 1'in tamamı (18 modül) bitmeden bu işe başlanmaz — kullanıcı kararı. Asistan
> var olmayan bir sistemi yönetemez; ayrıca güvenlik sınırı ancak yönetilecek yüzeyler kesinleştikten
> sonra doğru çizilebilir.
>
> Buradaki hiçbir madde bağlayıcı değildir. Kodlamaya gelindiğinde `build/README` çalışma kuralı 2
> işler: seçenekler artı/eksileriyle masaya konur, karar alınır, sonra yazılır.

---

## 1. Hedef

Bir yapay zekanın **MCP sunucusu** üzerinden yöneticinin işlerinin büyük kısmını yapabildiği, ama
bunu **sınırlı ve denetlenebilir** bir çerçevede yaptığı bir asistan katmanı.

İki cümleyle sınır: asistan **öneri üretir ve hazırlık yapar**; **uygulamayı yönetici onaylar.** Yani
yetki devri değil, **iş yükü devri**.

Kullanıcının saydığı işler (30.07):

- Sistem hatalarını inceleyip **rapor** sunmak (→ `OBSERVABILITY.md`, `error_log`)
- **Dönemsel paketler** hazırlamak (bayram sofrası, mevsim seçkisi → `Bundle`)
- Sosyal medya paylaşımı için **görsellere erişip** içerik hazırlamak
- **Pazarlama stratejisini** nispeten yönetmek (kampanya/indirim önerileri, koleksiyon kurgusu)
- **Finansal analiz** raporları (→ modül 12, `order_sale`, kârlılık)
- Genel asistanlık: "şu ürünün beyanı eksik", "şu tedarikçiye sipariş zamanı"

---

## 2. Güvenlik kurgusu — kullanıcının çizdiği hatlar

### 2.1 İki anahtar

- **Bağlantı anahtarı** — uzun ömürlü, istemci yapılandırmasına bir kez yazılır. **Tek başına
  hiçbir şey yapamaz**: yalnız kapıyı açar (araç listesini görme + çağrı yapabilme).
- **Oturum anahtarı** — kısa ömürlü, her araç çağrısında taşınır, **kapsamı kendi içinde taşır**.
  Kullanıcının önerdiği süre **10 dakika**.

### 2.2 Onay kuyruğu

Asistanın yapmak istediği yazma işlemleri **hemen uygulanmaz**: JSON olarak bir kuyrukta birikir.
Yönetici tek tek ("bu uygulansın, bu uygulanmasın") onaylar; onaylanan komut o zaman hayata geçer.

Bu, en önemli maddedir ve tasarımın kalbi burada: **asistanın gücü ne yazabildiğinde değil, neyi
uygulatabildiğinde.** Kuyruk varken bir "kaçak" asistanın yapabileceği en kötü şey, yöneticinin
reddedeceği bir öneri listesi üretmektir.

### 2.3 Erişemeyeceği veri

- **Son kullanıcı bilgileri YOK** — ad, e-posta, telefon, adres, sipariş sahibinin kimliği. Asistan
  "23 sipariş" görür, "Élodie Martin'in siparişi" görmez.
- **Şirket için hassas sayılan bilgiler YOK** — kapsamı kodlama zamanında netleşecek; bugünden
  bilinen adaylar: tedarikçi alış fiyatları ve sözleşme koşulları, personel bilgileri, banka/kasa
  hareketlerinin ham dökümü, vergi kimlikleri.

Finansal analizin bu iki yasakla nasıl birlikte yaşayacağı **çözülmesi gereken ilk çelişki**:
kârlılık raporu maliyet ister, maliyet ise tedarikçi alışıdır. Muhtemel yön — asistan **ham satır**
değil **toplanmış görünüm** okur (kategori bazında marj, dönem cirosu); tek tek alış fiyatına hiç
erişmez. Karar bugün verilmiyor, ama çelişki kayda geçiyor.

---

## 3. Referans projede karşılığı — hazır olan ve olmayan

`~/dev/petitcigogne`'da MCP sunucusu **çalışıyor** (tasarım editörü için) ve kurgunun yarısı orada
zaten çözülmüş. Kodlamaya gelindiğinde oradan okunacak yerler:

| Parça | Referanstaki yeri | Durum |
| --- | --- | --- |
| İki anahtar modeli | `apps/backend/src/routes/mcp/guard.ts` | **Aynen var.** Bağlantı anahtarı (Bearer, 90 gün, ayarlardan yönetilir) tek başına hiçbir varlığa dokunamaz; kapsam her çağrıda oturum anahtarından çözülür |
| Anahtar saklama | `mcp_connection_keys` | Token **hash'i** saklanır (SHA-256), düz metin değil; `revoked_at` + `expires_at` + `last_used_at` |
| Oran sınırı | `routes/mcp/rate-limit.ts` | Anahtar başına kayan pencere (60 çağrı/dk). Kaçak döngü koruması. **Uyarı:** bellekte — tek PM2 fork varsayımı |
| Denetim izi | `mcp_call_log` | Her araç çağrısı bir satır: araç adı, başarı, süre, hata. "Zincirleme kötüye kullanım tek tek görünsün" |
| Oturum temizliği | `tasks/cleanup-mcp-sessions.ts` | Süresi dolan oturumlar cron'la süpürülür |
| OAuth ile bağlanma | `routes/mcp/well-known.ts` | Uygulama connector'ı için; terminal/CLI yolu header ile |
| **Onay kuyruğu** | — | **YOK.** Orada model doğrudan yazıyor, çünkü yazdığı şey bir tasarım taslağı (geri alınabilir, müşteriye gitmiyor). Bizde yazılan şey fiyat, paket, kampanya — kuyruk bu yüzden bize özgü ve **sıfırdan yazılacak** |
| **Veri maskeleme** | — | **YOK.** Orada MCP'nin gördüğü veri şablon/tasarım; müşteri verisi kapsamında değil. Bizim asistan sipariş ve para verisine bakacak, dolayısıyla maskeleme katmanı da bize özgü |

---

## 4. Bugünden görülen açık sorular

Karar zamanı geldiğinde bunlar masaya gelir. Cevaplar burada **yok**; soruların kaybolmaması için
yazılıyorlar.

1. **10 dakika gerçekten doğru sayı mı?** Asistan bir paketi hazırlarken on dakikada bitiremezse
   ortada kalır. Yenileme otomatikse süre bir şey satın almıyor (10 dakika × sonsuz yenileme = süresiz);
   yenileme yöneticiden geçiyorsa asistan kullanılamaz hâle gelir. **Asıl sınırın süre değil KAPSAM ve
   ONAY KUYRUĞU olduğu** ihtimali güçlü — süre yalnız çalınmış bir anahtarın ömrünü kısaltır. Referans
   1 saat + kapsam bağı kullanıyor ve orada işliyor.
2. **Okuma da onaya tabi mi?** Muhtemelen değil (rapor üretmek için okumak zorunda) — ama o zaman
   maskeleme katmanı **tek güvenlik hattı** olur ve sıkı yazılmalı.
3. **Kuyruk komutu nasıl saklanır?** Ham SQL asla; niyet + parametre (`{"tool":"create_bundle","args":{…}}`).
   Uygulama, onaydan sonra **normal servis/motor yolundan** geçmeli — kuyruk ayrı bir yazma yolu
   açmamalı, yoksa iş kuralları (DOMAIN) atlanabilir hâle gelir.
4. **Onaylanan komut ne kadar süre geçerli?** Dünkü stok durumuna göre üretilmiş bir paket önerisi,
   bugün onaylandığında hâlâ doğru mu? Kuyruk kaleminin bir **tazelik ölçütü** olması gerekebilir.
5. **Asistanın kendi hataları nereye yazılır?** `error_log`'a `source: 'mcp'` ile mi, ayrı bir yere mi.
   `OBSERVABILITY §2` zaten kaynak alanı taşıyor — büyük olasılıkla oraya.
6. **Görsellere erişim ne demek?** Okuma (var olan ürün fotoğrafını sosyal medya kartına almak) ile
   yazma (R2'ye yeni dosya yüklemek) çok farklı iki yetki; ikisi ayrı ele alınmalı (`packages/storage`
   iki kovalı model).
7. **Pazarlama "yönetmek" nereye kadar?** Kampanya **önerisi** kuyruğa girer, ama müşteriye giden
   toplu e-posta (14.8) onay gerektiren farklı bir sınıf: geri alınamaz, dışa dönük bir eylem.

---

## 5. Bugünden korunması gereken şeyler

Bu iş en sonda olsa da, bugünkü kararların onun önünü kapatmaması için iki not:

- **İş kuralı motorda kalmaya devam etmeli** (`STACK §4`). Asistan bir gün paket kuracaksa, paket
  kurmanın kuralı `domain-core`'da olduğu sürece asistan da o kuraldan geçer. Kural uygulama
  katmanına sızarsa asistan için ikinci bir yol açmak gerekir — ve ikinci yol denetlenmeyen yoldur.
- **Okuma yüzeyleri toplanmış görünümler üretmeye devam etmeli** (`order_sale`, `product_rating`
  gibi). Asistanın ham satır yerine görünüm okuyabilmesi, maskeleme işini yarı yarıya azaltır.

---

## 6. Nerede izlenir

- Kapsam kalemi: `architecture/BACKLOG.md` → Faz 2.
- Görev satırı **henüz yok** — Faz 1 bitmeden açılmaz (`build/` altında yeni bir modül dosyası
  gerekecek).
- Gözlemleme bağı: `OBSERVABILITY.md` (asistanın okuyacağı hata verisi + kendi çağrı izi).
