# docs/uygulama — native mobil uygulama

Native mobil uygulama için etüt ve tasarım dokümanları. Kullanıcı kararı (05.08.2026): uygulama
yapılacak; önce teknoloji seçilir, sonra mimari/plan dokümanları buraya eklenir.

## Yüzey formülü (kullanıcı kararı 06.08.2026)

> **Web = operasyon MASAÜSTÜ (tam kontrol) + müşteri (masaüstü + mobil)**
> **Mobil uygulama = operasyon (birçok yönüyle) + müşteri**

- **Web kalıcıdır:** yönetici/operasyon tam kontrolü masaüstü web'de yaşamaya devam eder;
  müşteri web'i iki forkuyla (masaüstü + mobil) aynen korunur — uygulama indirmeyen mobil
  ziyaretçi gerçek ve çoğunluktur.
- **Operasyonun WEB-MOBİL forkuna artık ihtiyaç yok:** personelin mobil deneyimi native
  uygulamaya taşınır. Mevcut `*.mobile.tsx` operasyon forkları uygulama pariteye ulaşana dek
  yaşar, parite sonrası sökülür; **yeni operasyon ekranlarında web-mobil fork zorunlu değildir**
  (CLAUDE §2 cihaz-forku kuralının operasyon tarafı bu karara göre güncellenecek).
- **Tasarım yaklaşımı iki yüzeyde FARKLI (kullanıcı kararı 06.08, ikinci karar):**
  - **Müşteri tarafı ÖNCE ayağa kalkar ve mevcut müşteri tasarım deseninin ÇOK BENZERİ
    kurgulanır** — web müşteri yüzeyinin görsel dili/akış deseni mobil uygulamaya taşınır
    (mobil-uygulama diline uyarlanarak; birebir piksel kopya değil).
  - **Operasyon tarafı SONRA ve komple yeniden kurgulanır:** operasyonun web-mobil forkları
    kırpılmış/basitleştirilmiş tasarımlardı; uygulamada tamamen mobil-uygulama mantığıyla
    yeniden oturur ve kendi tasarım hattını (Claude Design) takip eder.

**İlişki:** `docs/feature/mobil-platform.md` (02.08) farklı bir soruyu cevapladı — "masadaki
özellikler bir uygulamayı *zorunlu* kılıyor mu?" (hayır, web-first). Bu bölümün sorusu ürün
kararından doğar: uygulama yapılacak — **hangi teknolojiyle ve nasıl?** İki doküman çelişmez;
soru değişti.

## Sahiplik (kullanıcı kararı 06.08.2026)

Bu projeyi **MOBİL ŞERİDİ kendisi yönetir**: mobil arayüz tasarımları + uygulama kodu +
uygulamanın arka uç geliştirmeleri (`/api/v1`) ondadır. **Kararlar ve geliştirme kullanıcı ile
mobil şeridi arasında verilir** — öteki şeritler ve denetim bilgilendirilir; ortak paketlere
dokunuş mevcut çakışma disiplinine (talep dosyası + `touches`) tabidir. Denetim, öteki şeritlere
uyguladığı denetimi bu şeride de uygular.

## Dosyalar

- `01-teknoloji-secimi.md` — teknoloji etüdü: React Native/Expo vs Capacitor vs Flutter,
  birincil ölçüt test edilebilirlik; karşılaştırma + depo-uyum analizi + doğrulama kaydı +
  öneri. **Statü: etüt/öneri — karar kullanıcının.**
- `02-mimari-ve-sinirlar.md` — **KARAR** (06.08): `/api/v1` ayrı serviste (`apps/mobile-api`,
  Hono); üç kişilik mobil şeridi (yönetici + Expo ajanı + mobil-backend ajanı) ve alan
  sınırları; **bağlayıcı duplikasyon tüzüğü** (terfi-kopya-değil, sözleşme tek kaynak); auth
  yönü; ilk iş birimleri (21.1–21.3).
- `03-tasarim-envanteri.md` — **ENVANTER** (07.08): `Mobil - Musteri v3.dc.html` analizi —
  21 ekran, ~35 tekrar kullanılabilir komponent adayı, token açıkları (renk/yazı/yarıçap),
  navigasyon modeli, eksik durumlar, API imaları ve **18 maddelik karar listesi** (§8 —
  kullanıcıyla konuşulacak; ekran işi bu kararlar verilmeden başlamaz).
- `BACKLOG-musteri.md` — **KAPSAM** (11.08): native MÜŞTERİ yüzeyinin açık işleri tek listede —
  fiziksel cihaz turunda ölçülen bulgular + kullanıcı yönergeleri + `design/BACKLOG.md`'nin
  müşteriyi ilgilendiren maddeleri. Kimlikler `MB-nn`; **ilerleme tutmaz**, durumun sahibi
  `docs/build/21-mobil-uygulama.md` görev satırıdır (CLAUDE §5).

## Planlanan (teknoloji kararı kesinleşince)

- Mimari: mobil ↔ backend API yüzeyi (`/api/v1` sözleşmesi), auth akışı, paket sınırları
- Test stratejisi: katmanlar, CI hattı, paylaşılan-DB disiplinine (CLAUDE.md §4b) uyum
- Ekran/kapsam planı: hangi müşteri akışları v1'e girer; push bildirim entegrasyonu
