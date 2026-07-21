# Proje Dokümantasyonu — Index

Bu klasör, projenin **ne yapacağını**, **nasıl kod dizileceğini** ve **bu domain'in kurallarını** anlatır. `STACK.md` (kod dizilimi) ve `WORKFLOW.md` (çalışma disiplini) genel bir blueprint'ten alınıp bu projeye uyarlanmıştır; artık projenin kendi dosyalarıdır.

## Okuma sırası (yeni giren ajan/geliştirici)

1. `STACK.md` — bu projeye uyarlanmış kod dizilimi (önce bu)
2. `WORKFLOW.md` — çalışma disiplini (migration, deploy, git)
3. `PRODUCT.md` — ürün bir sayfada
4. `DOMAIN.md` — terimler, roller, iş kuralları (asıl kalp)
5. `DATA_MODEL.md` — veri varlıkları ve alanlar
6. `ORDER_LIFECYCLE.md` — sipariş durum makinesi
7. Görev neyse ilgili dosya (aşağıdaki tablo)

> `STACK.md` ve `WORKFLOW.md`, genel bir blueprint'ten uyarlanmıştır. `STACK.md` bu projeye özgü kararları içerir; `WORKFLOW.md` teknolojiden bağımsız çalışma disiplinidir. Kod ile doküman çelişirse kod haklıdır.

## Dosya haritası

| Dosya | Ne anlatır | Ne zaman okunur |
| --- | --- | --- |
| `STACK.md` | Bu projeye uyarlanmış mimari reçete, kod dizilimi | Kod yazmadan önce, her zaman |
| `WORKFLOW.md` | Çalışma disiplini: migration, deploy, git, üretim güvenliği | Kod/migration/deploy işine girerken |
| `PRODUCT.md` | Ürün, pazar, kanallar, iş modeli — bir sayfa | Her zaman, ilk |
| `SCOPE.md` | Fazlandırma: neyin ne zaman yapılacağı | Kapsam/öncelik kararı verirken |
| `DOMAIN.md` | Terimler, roller/izinler, iş kuralları | İş mantığına dokunan her görevde |
| `DATA_MODEL.md` | Varlıklar, alanlar, çok dilli alanlar, enum'lar | Şema/migration/servis yazarken |
| `ORDER_LIFECYCLE.md` | Sipariş durumları ve izinli geçişler | Sipariş, stok, ödeme akışında |
| `FEATURES.md` | Modül modül fonksiyonel gereksinimler | Bir ekran/modül yaparken |
| `ARCHITECTURE_DECISIONS.md` | Blueprint'ten sapmalar ve gerekçeleri | Stack/yapı kararı sorgulanınca |
| `INTEGRATIONS.md` | Dış servisler, agnostik arayüzler, fazları | Ödeme/kargo/muhasebe/bildirim işinde |
| `SEO_I18N.md` | Çok dillilik, URL yapısı, çeviri akışı, SEO | i18n, rota, içerik gösterimi işinde |
| `BACKLOG.md` | Açık iş kalemleri, yapılacaklar | Ne yapılacağına bakarken |

## Rol ayrımı (WORKFLOW §8 ile uyumlu)

- **`STACK.md` + domain dosyaları** — nasıl kod dizilir + domain kuralları + kalıcı "neden"ler
- **`WORKFLOW.md`** — nasıl çalışılır (migration, deploy, git)
- **`BACKLOG.md`** — açık iş kalemleri, yapılacaklar listesi

Bu üçü karışırsa dokümantasyon haftalar içinde yanlış bilgi vermeye başlar. Kod ile doküman çeliştiğinde **kod haklıdır**; dokümanı düzelt.

## Bu dokümanların statüsü

Bu belgeler bir **spesifikasyondur** — kod aracının başlangıç noktası. Kod yazıldıkça bazı kararlar netleşecek veya değişecektir. Kalıcı hale gelen kararlar `ARCHITECTURE_DECISIONS.md`'ye taşınır; geçici olanlar burada güncellenir.
