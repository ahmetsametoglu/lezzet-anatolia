# Lezzet Anatolia — Tasarım Dosyaları

Strasbourg merkezli donuk Türk gıdası satış sistemi. Bu depo **tasarım** dosyalarını içerir; çalışan uygulama kodu değildir. Her ekran tek başına tarayıcıda açılır.

**Giriş noktası:** `Harita.dc.html` — tüm ekranların dizini, tıklanabilir.

## Ürünün iki alanı

| Alan | Kimin | Nerede |
|---|---|---|
| **Müşteri** | B2C son tüketici + B2B restoran/market | `01-musteri/` |
| **Operasyon** | depo, kurye, yönetim, satın alma, para | `02-operasyon/` |

## Klasörler

```
Harita.dc.html          tüm ekranların dizini — buradan başla
01-musteri/             müşteri yüzeyi
  Musteri Mobil.dc.html   TEK KAYNAK: mobil uygulama VE mobil web aynı tasarımı kullanır
  Musteri Web.dc.html     masaüstü web
  ekranlar/               ekran bazlı referanslar (her dosyada web + mobil varyant)
02-operasyon/           operasyon yüzeyi
  AdminSidebar.dc.html    paylaşılan sol menü — tüm admin ekranları bunu import eder
  Operasyon - *.dc.html   masaüstü admin ekranları
  Operasyon Mobil.dc.html cihaz uygulaması (depo · kurye · yerinde satış · para · yönetim)
03-bildirim/            e-posta ve WhatsApp şablonları
04-belge/               yazdırılan belgeler (hazırlık kâğıdı, tedarik siparişi, teslimat özeti)
05-envanter/            komponent envanterleri, akış haritaları, token ve backend notları
06-marka/               marka kılavuzu
07-kesif/               keşif panoları — seçilmemiş tasarım yönleri, karar geçmişi
08-export/              tek dosyaya gömülü çıktılar (paylaşım/teslim için, kaynak değil)
09-arsiv/               eski sürümler — referans, geçerli değil
assets/                 logo ve görseller
uploads/                kullanıcı girdileri (ürün fotoğrafları, sayfa brief'leri) — dokunulmaz
screenshots/            alınmış ekran görüntüleri
```

## Adlandırma kuralı

`<Alan> - <Ekran>.dc.html` — alan adı her zaman başta, kelime sırası hiç değişmez.

- `Musteri - Sepet.dc.html`, `Operasyon - Stok.dc.html`, `Belge - Teslimat Ozeti.dc.html`
- **Geçerli sürümde versiyon numarası yoktur.** Kökte veya alan klasöründe gördüğün dosya güncel olandır.
- Versiyon numarası **yalnız** `09-arsiv/` içinde bulunur (`Operasyon Mobil v2.dc.html`).
- `08-export/` içindeki `.html` dosyaları kaynak değil, çıktıdır. Değişiklik kaynağa yapılır, çıktı yeniden üretilir.

## Dosya biçimi

Her `.dc.html` tek dosyalık, kendine yeterli bir tasarım komponentidir: HTML şablonu + aynı dosyanın içinde bir `Component` sınıfı. Yanındaki `support.js` çalışma zamanıdır (her klasörde bir kopyası vardır; elle düzenlenmez). Stil tamamen satır içidir — ayrı CSS dosyası yoktur.

Ekranlar arası bağlantılar göreli yollardır; dosyayı taşırsan bağlantılar ve `assets/` yolları güncellenmeli.

## Kararlar ve gerekçeler

Tasarım kararlarının yazılı gerekçesi `05-envanter/` altındadır:

- `Komponent Envanteri - Musteri.dc.html` — müşteri tarafının bileşen sözlüğü, bölüm bölüm (§7 teslimat bölgesi kısıtı, §7B çok depo / yer ekseni gibi)
- `Komponent Envanteri - Operasyon.dc.html` ve `... - Operasyon Mobil.dc.html`
- `Musteri Mobil - Token Kararlari.md` — renk/tipografi token mutabakatı
- `Musteri Mobil - Backend Notlari.md` — tasarımın backend'den beklediği veriler

## Bilinen açık iş

`01-musteri/Musteri Mobil.dc.html` iki web değişikliğinin öncesinde:

1. **Giriş + adres artık sepette şart** (ödeme adımında değil). Web'de `Musteri Web.dc.html` içinde işlendi: sepet sağ kolonunda giriş kapısı, adres seçimi ve "Devam etmek için hesabınıza girin" engeli.
2. **Ülke kavramı ve yeni adres ekleme akışı** — teslimat yeri artık ülke + posta kodu; adres ekleme arama + elle giriş + etiket adımlarından oluşan bir modal.

Ayrıca §7/§7B'nin bir kısmı (dört hâl işaret dili, kargo grubu ve ikinci checkout, sonraya kaydedilenler, yer değişim bildirimi) mobil kaynakta yok.
