# CLAUDE.md — Lezzet Anatolie

> Bağlayıcı kurallar; her oturum yüklenir, varsayılan davranışı ezer. **Kaynak KODDUR:** kod ile
> doküman çelişirse kod haklı. Proje olgun: tasarım `.dc.html`'de, akış kodda; doküman yalnız referans.

> **Evre: greenfield.** Canlı yok, müşteri yok. Migration dosyası doğrudan düzenlenir (yama migration'ı
> yok). `db:reset`/`db:refresh` KULLANICININ kararıdır; şema reset istiyorsa söyle, o çalıştırsın.
> Yerel DB'ye okumak için bağlanmak serbest. **Yerel veri sahtedir:** teşhis için okunur; ondan iş
> çıkarımı ("en çok satan", eşik seçimi) yapılmaz — gerçek veri kullanıcıdır, ona sor.

## 0. Kırmızı çizgiler
- **Onaysız `git commit`/`push` yok;** onay her commit için ayrı. Push kullanıcının işidir, konuşulmaz.
- **Çalışma ağacını topluca değiştiren git komutu yok:** `checkout -- .`, `restore .`, `reset --hard`,
  `clean`, yolsuz `stash`. Geri alma daima yol adıyla ve önce bakılarak.
- **Commit DAİMA `git commit -- <yollar>`;** yeni dosya için `git add -- <yol>` aynı komutta hemen önce;
  yolsuz commit yok. Üç şerit tek ağacı ve tek indeksi paylaşıyor: indekste bekleyen dosya başka
  şeridin commit'ine girer. Paylaşılan dosyada ayrıca `git diff` oku — pathspec dosyayı korur, içini korumaz.
- Canlı DB'ye bağlanma, prod env dosyası okuma yok. Süreç listesinde yalnız PID ve ad basılır
  (`ps -o pid=,comm=`); komut satırı basılmaz (tünel jetonu argv'de).
- **Kanıtsız "geçti/oldu" yok;** çıktıyı göster. Ölçülmemiş bilgi verilmez, "olabilir" cümlesi kurulmaz.
- **Sebep ÖLÇÜLMEDEN müdahale yok;** belirtiyi susturan düzeltme çözüm değildir. Ölçemiyorsan
  "ölçemedim" de ve dur.
- Alt ajan / workflow yok; iş ana şeritte, kendin.
- **Görevin dışına çıkma:** bulduğun açığı bir satırla raporla, görev bitince yeni iş iste.

## 1. Mimari değişmezler
- **Hiçbir türde duplication yok** (kod/tip/komponent/sabit); önce "var mı, türetebilir miyim".
- **Şema tek kaynak:** tipler `packages/types` Zod şeması; `z.infer` + `.pick/.omit/.partial/.extend`,
  elle interface yok. View-model `Entity & { extra }`. Proje-geneli tip sayfaya konmaz. Tipler artımlı.
- Servis ham `this.supabase` yazmaz: `BaseDbService`; junction tablosu kendi alt sınıfı.
- **domain-core = saf karar** (DB'siz, testli); **database = saf I/O;** birbirini bilmez; uygulama
  katmanı birleştirir, iş kuralını kendisi hesaplamaz. Bağımlılık tek yönlü (`pnpm boundaries`).
- **`console` yasak, `logger` var:** `logger.info({bağlam}, 'mesaj')`; yakalanan hata
  `captureError(err, {source, context})`. **Sessiz `catch` yok:** ya iz bırak ya nedenini yaz.
- **Ölçülemeyen değer sıfır değildir:** `null` dön, okuyan taraf "bilinmiyor" göstersin.
- **Log'a kimlik yazılır, içerik yazılmaz;** kimliksiz yolda `maskEmail`/`maskPhone`
  (`@lezzet/observability/mask`). OTP kodu hiçbir hâlde, maskeli bile yazılmaz.
- **Depo bir DEĞİŞMEZDİR:** stok/rezervasyon/sipariş/kabul deposuz yazılmaz, okuma depo süzgeçsiz
  yapılmaz; varsayılan depo yok (adresin posta kodundan ya da personelin deposundan gelir).
  `available_stock_total` yalnız "hiç var mı" sorusunundur.
- **Sayfalama ölçütü sınırsız büyümektir:** veriyle büyüyen küme keyset + infinite scroll (imleç URL'e
  yazılmaz); operatörün kurduğu küme tek turda; editoryal seçki sabit sınır. `nextCursor` üreten her
  okumanın tüketeni olur.

## 2. Web & i18n (apps/web)
- **İki yüzey:** müşteri (i18n, `/…`) + operasyon (personel, Türkçe, `/operations`, **yalnız masaüstü**).
  Giriş tek `/connexion`, `staff_role`'e göre yönlenir.
- **Cihaz forku, responsive değil:** `page → *-client (useDevice) → *.desktop/*.mobile`; `md:` ile
  akışkan responsive yok. Operasyonda `*.mobile` yazılmaz.
- **İki "mobil" var:** müşteri web forku **"mobil web"** (`*.mobile.tsx`, Playwright `mobile-web`);
  `apps/mobile-*` **"native uygulama"**. Çıplak "mobil" yazılmaz.
- Dosya adları `page` · `<f>-client` · `<f>.desktop/.mobile` · `<f>-types.ts`. Paylaşılan komponent
  `components/{customer,operation}/` (`ui/`+`form/`); sayfaya özel `<sayfa>/components/`. Ham
  `<input>/<select>` son çare, form kiti var.
- **URL:** iç yol İngilizce, dış URL dile göre (fr/de/tr); yeni müşteri rotası
  `packages/i18n/src/paths.ts` (`PATHNAMES`) — native de okur.
- **i18n:** global JSON yok, her sayfa kendi `messages.json`; tip `LocalizedCopy`'den türer. Web + native
  ORTAK metin `packages/i18n/src/customer/<ekran>.json`. Operasyon yalnız Türkçe.
- **Server action sayfa klasöründe;** throw yok, sonuç döner: operasyon `{ data, error }` +
  `getErrorMessage`, müşteri `{ data, errorKey }` + `customerErrorKey` (`CustomerError('anahtar')`,
  cümle `messages.json`'da). İlk satırda en dar guard (`lib/guard.ts`).
- Kod İngilizce, yorum Türkçe. Props tipi fonksiyon üstünde adlı `interface`. Ayrı hook `use-x.hook.ts`.
  Etkileşimli öğe `cursor-pointer` + hover. Ölü kod yok (`knip`).

## 3. Tasarım
- **Sade ve sezgisel;** sistemin karmaşıklığı arayüze yansımaz.
- **Görsel karar `.dc.html`'de verili; birebir uygula, improvise etme.** Dış çerçeve canvas chrome'dur.
  Yerel `.dc.html` günceldir. Müşteri web telefon görünümü ile native müşteri uygulaması AYNI
  tasarımdır; sayfa sayfa, kullanıcı kontrolüyle ilerler.
- **Statik ≠ işlevsiz:** öğenin işlevini içeriğinden çıkar; bağımlılığı olmayanı tam yap; dış modül
  bekleyende UI tam, arka uç stub.
- **Ham hex yasak:** renk `globals.css` token'ından; token yoksa kodlama, ekletme. Operasyonda Tailwind
  sabit renkleri (`bg-white`, `*-gray-500`) yok (karanlık mod). Yazı boyu `--text-ops-*` merdiveninden.

## 4. Çalışma disiplini
- **Tek seferde tek konu.** Önce kısa cevap/izah, sonra iş. Soru iş emri değildir: önce cevapla,
  müdahale istenince.
- **İş birimi alandır:** dokunulmamış alan bütün alınır. Talepler işi bölmez, araya girer; aynı
  konudakiler kümelenir ve tek `db:refresh` penceresinde gider.
- **Parametrik değer sorma:** makul varsayılan koy, parametrik yap, bildir. Objektif doğrusu olan
  sorulmaz; yalnız gerçek ödünleşme sorulur, küçük karar şıklarla.
- **Sade Türkçe yaz;** teknik terimin yanına karşılığı. "İndi/inen/inecek" yasak → tamamlandı · teslim
  edildi · yayında. Rapor kısa maddelerle.
- Referans proje `~/dev/petitcigogne` (iç desenler); saptığında bildir.
- **Dev server (3000) kullanıcının;** çıplak `next build` yok (`.next`'i bozar). Doğrulama
  typecheck/lint/knip/boundaries/test ile. `dev:health` yalnız denetim şeridi çalıştırır.
- **3001 production kopyası commit kapısı DEĞİL;** yalnız kullanıcı "3001'i tazele" deyince tek ajan:
  `/tmp/lezzet-prod` worktree'sinde `git checkout --detach HEAD` → `pnpm install --offline
  --frozen-lockfile` → `pnpm --filter @lezzet/web run build:prod` → 3001'i dinleyen süreç durdurulur →
  `nohup pnpm --filter @lezzet/web run start:prod` (`.test-results/prod-server.log`). `/tmp` silinmişse
  `git worktree add --detach /tmp/lezzet-prod HEAD` + `.env` ve `apps/web/.env.local` kopyalanır.
- **Şeritler:** web (denetim; altında arka uç / operasyon / müşteri) ↔ native (mobil). **Şeritler arası
  iş `docs/KALAN.md` satırıdır:** `[hedef: mobil] ne — neden` biçiminde açan yazar, yapan siler; soru
  gerekiyorsa aynı satırın altına tek satır **Cevap**. Ayrı talep/not dosyası yok, sohbette laf iletme yok.
- **Ağır denetimler sırayla:** typecheck/lint/knip/test ve native derlemeler aynı anda koşmaz.

## 4b. Test disiplini (paylaşılan veritabanı)
- **Çalışırken `pnpm test:unit`** + dokunduğun dosyaların birim testleri (DB'siz, saniyeler).
- **DB'ye vuran koşu ve e2e yalnız denetmenin.** Şeridin tek DB kapısı commit öncesi
  `pnpm test:commit -- <commit'in yolları>`: yollar seçer (`scripts/test-gate-rules.mjs`) —
  migration / seed / fikstür / test yapılandırması / `pnpm-lock.yaml` / kök `package.json` → tam paket;
  değilse birim tamamı + `vitest related` entegrasyon. Yollar commit'in listesidir, ağacın farkı değil.
- **Tam paket elle çağrılmaz:** `test:commit` tetiği ya da denetimin `pnpm test:health`. Koşucu tek
  uçuşlu (`scripts/shared-test-run.mjs`); sonuç `.test-results/latest.json` + `run.log`
  (`pnpm test:status`). Katıldıysan `startedAt`e bak. DDL (`db:reset/refresh/migrate/seed`) aynı kuyrukta.
- DB'ye vuran test entegrasyon köküne (`apps/web/lib`, `packages/database`, `packages/application`,
  `apps/backend`, `apps/mobile-api`). Küresel tekil satır kirletilmez (önce oku, `afterAll` geri koy);
  küresel sayıya bakan test yok; teardown `purgeTestData` + `mustDelete` (`@lezzet/database/testing`),
  elle silme yok.
- **Hangi test yazılır:** test, adını verebildiğin bir arızayı yakalar. Yazmadan önce tek cümle:
  *"bu test şu hatada kırmızıya döner"*; cümle kurulamıyorsa test yazılmaz. **Yazılır:** dallanan karar
  (fiyat, stok, durum geçişi, izin), veri kısıtı ve RPC davranışı, iki yüzeyin ortak sözleşmesi,
  ölçülmüş bir arızanın tekrarı. **Yazılmaz:** sabit/sözlük/tip/ikon içeriğini yeniden yazan test,
  "render oluyor", mock'un kendisini doğrulayan test, sayı için test. Kanıt: bozmayı uygulayıp testin
  düştüğünü görmek.

## 5. Yorum, doküman, açık iş
- **Yorum yalnız koddan okunamayan NEDEN'i yazar,** en fazla iki cümle. Tarih, ajan/şerit adı,
  "yaşandı/ölçüldü" hikâyesi, süreç ve karar tarihçesi yorum değildir; commit mesajına gider.
  Dokunulan dosyanın yorumları aynı commit'te bu ölçüye çekilir. Blok yorumda `*/` yazılmaz.
- **Açık işin tek listesi `docs/KALAN.md`:** satır = kimlik + ne + neden; biten satır silinir,
  ilerleme notu yazılmaz. Koddaki boşluk `BEKLEYEN(<kimlik>): <ne>` ile KALAN'daki satıra bağlanır
  (`pnpm repo:check` doğrular); `TODO`/`FIXME` yok. Yeni kimlik `K.<sıradaki sayı>`.
- **`docs/architecture/*` referanstır:** kural değişirse aynı commit'te o cümle düzeltilir;
  durum/ilerleme/tarihçe yazılmaz. Veri modeli alan tabloları `pnpm docs:sync` ile migration'dan
  türetilir, elle yazılmaz.
- **Commit mesajı:** ne + neden, en fazla ~12 satır; doğrulama tek satır; hikâye yok.
- **Bellek (`memory/`):** yalnız koddan ve bu dosyadan türemeyen kısa olgu; kural olgunlaşınca
  buraya terfi eder.

## 6. Harita
Kod dizilimi → `docs/architecture/STACK.md` · migration/deploy/git → `WORKFLOW.md` · iş kuralları →
`DOMAIN.md` · veri → `DATA_MODEL.md` + `data-model/*.md` · sipariş makinesi → `ORDER_LIFECYCLE.md` ·
i18n/SEO → `SEO_I18N.md` · log/PII → `OBSERVABILITY.md` · analitik kapıları → `ANALYTICS.md` · kanal ve
sipariş kaynağı → `CHANNELS.md` · dış servisler → `INTEGRATIONS.md` · sapmalar →
`ARCHITECTURE_DECISIONS.md` · şirket künyesi → `BUSINESS_CATALOG.md` + `packages/brand` · sefer modeli →
`docs/feature/` · operasyon prosedürü → `docs/runbook/` · açık işler → `docs/KALAN.md` · tasarım →
`design/Harita.dc.html`.
