# CLAUDE.md — Lezzet Anatolia

> Bağlayıcı kurallar. Her oturum yüklenir, varsayılan davranışı ezer. Detay `docs/`'ta; bu dosya
> "her zaman aklımda olması gereken"ler + haritadır. **Kod ile doküman çelişirse KOD haklı.**

> **Proje evresi: greenfield.** Canlı yok, müşteri yok, veri yok. Migration dosyaları **doğrudan düzenlenir**
> (yama migration'ı yazılmaz), geriye uyum gözetilmez — temiz şema > legacy nezaketi.
> İlk üretim dağıtımında bu not silinir, `WORKFLOW §2` (ileri-doğru) yürürlüğe girer.
> **Ama `db:reset`/`db:refresh` yine de KULLANICININ kararıdır** — yereldeki elle girilmiş veriyi siler.
> Şema değişikliği reset istiyorsa söyle, o çalıştırsın. Yerel DB'ye **okumak için** bağlanmak serbest → `WORKFLOW §4b`.

## 0. Kırmızı çizgiler
- **Onaysız `git commit`/`push` YOK.** Onay her commit için ayrı; "commitle" bir sonrakini kapsamaz. → WORKFLOW §5
- **Çalışma ağacını topluca silen komut YOK** — `git checkout -- .`, `git restore .`, `git reset --hard`, `git clean`, yolsuz `git stash`. Bunlar KULLANICININ komutudur. Geri alma daima **yol adı vererek** ve önce doğrulanarak yapılır. → WORKFLOW §5
- Canlı DB'ye bağlanma / prod env dosyası okuma yok. → WORKFLOW §4
- Kanıtsız "oldu/geçti" deme; çıktıyı göster. → WORKFLOW §1

## 1. Mimari değişmezler
- **Hiçbir türde duplication yok** — kod/tip/komponent/sabit. Önce "var mı, türetebilir miyim?" diye bak. → STACK §10, WORKFLOW §6
- **Şema tek kaynak:** tüm tipler `packages/types` Zod şeması; `z.infer` + `.pick/.omit/.partial/.extend` ile türet, elle interface yazma. → STACK §5
- **View-model'i şemadan türet:** `View = Entity & { extra }`; DB alanlarını görünüm için elle yeniden yazma.
- **Proje-geneli tip sayfa altına konmaz** (dil/alerjen/domain enum → `packages/types`). Sayfaya-özel tip onu kullanan dosyada / `-types.ts`.
- **Tipler artımlı** yazılır, toptan değil.
- **Servis ham `this.supabase` yazmaz** — `BaseDbService` metodları; junction tablosu = kendi alt sınıfı. → STACK §6
- **domain-core = saf karar** (DB'siz, testli); **database = saf I/O** (satır getirir/yazar). Birbirlerini BİLMEZLER; ikisini birleştiren yer uygulama katmanıdır — ama uygulama iş kuralını kendi içinde hesaplayamaz, motora sorar. → STACK §4, §13
- **Bağımlılık tek yönlü.** → STACK §4
- **Sayfalama ölçütü liste olmak değil, SINIRSIZ büyümek.** Veriyle büyüyen küme (ürün, sipariş, müşteri, stok partisi, hareket) → keyset (cursor) + infinite scroll; **imleç URL'e yazılmaz** (süzgeç yazılır). Doğal tavanı olan, operatörün elle kurduğu küme (kategori, koleksiyon, alerjen, dil, rota, ayar) → **tek turda** çekilir. Editoryal seçki (vitrin şeridi, benzer ürünler) → sayfalama yok ama **sabit sınır** var; liste değil, tıklatma davetidir. Sayfalayan her okumanın tüketeni de olmalı: `nextCursor` üretip kullanmayan ekran, listenin kuyruğunu sessizce yutar.

## 2. Web & i18n (apps/web)
- **İki yüzey:** müşteri (i18n, `/…`) + operasyon (personel, Türkçe, `/operations`); girişte `staff_role`'e göre yönlenir (tek `/connexion`). → DOMAIN, build/04-auth-kimlik
- **Cihaz forku, responsive DEĞİL:** `page → *-client (useDevice) → *.desktop/*.mobile`. `md:` ile akışkan responsive YAPMA. → ADR Sapma 3
- **Dosya adları:** `page` · `<f>-client` · `<f>.desktop/.mobile` · `<f>-types.ts` (tip dosyası "view" değil).
- **Komponent yerleşimi:** paylaşılan → `components/{customer,operation}/` (`ui/`+`form/`); sayfaya-özel → `<sayfa>/components/`. Ham `<input>/<select>` son çare, form kitini kullan. → STACK §7,§9
- **URL:** iç yol İngilizce, dış URL dile göre (fr/de/tr); operasyon öneksiz ama segment yine İngilizce (`/operations/products`). Yeni müşteri rotası → `routing.ts` pathnames. → SEO_I18N
- **i18n:** global JSON yok; her sayfa kendi `messages.json`'u; metin tipi `LocalizedCopy`'den türer (elle interface değil). Operasyon yüzeyi yalnız Türkçe.
- **Server action'lar sayfa klasöründe kolokasyon;** `{ data, error }` döner (throw yok); guard (`requireStaff`) ilk. Paylaşılan yardımcı `lib/`.
- Kod İngilizce, yorum Türkçe. Props tipi her zaman fonksiyon üstünde adlı `interface`. Ayrı hook → `use-x.hook.ts`.
- Etkileşimli her öğe `cursor-pointer` + hover geri bildirimi. **Ölü kod yok — `knip`.**

## 3. Tasarım
- **Altın kural: sade & sezgisel;** sistemin karmaşıklığı arayüze yansımaz.
- `design/` per-sayfa markdown: *hangi bilgi, hangi amaçla* — **stil verme**, Claude Design'a bırak.
- **İmplement ederken improvise ETME:** görsel karar `.dc.html`'de verili (web/mobil ayrı bölüm); birebir uygula.
- **Statik ≠ işlevsiz:** öğenin içeriğinden işlevini çıkar; bağımlılığı olmayanı TAM yap (UI+backend); dış-modül bekleyende UI tam, arka uç stub.
- `.dc.html` dış çerçeve = canvas chrome (UI değil). İmplementten önce güncel tasarımı **claude_design MCP**'den çek (yerel kopya bayat olabilir).
- **Ham hex YASAK** — renk `globals.css` token'ından gelir (envanter §0). Token yoksa kodlama, envantere ekletme. Tailwind'in sabit renkleri (`bg-white`, `*-gray-500`) operasyonda kullanılmaz: karanlık modda dönmezler. → STACK §9

## 4. Çalışma disiplini & kullanıcı
- **Tek seferde tek kritik konu** çöz-geç; uzun liste dökme.
- **Parametrik değer** (eşik/oran/süre) **sorma** — makul varsayılan koy, parametrik yap, bildir. "Sistem + bize ne kazandırır" ekseninde konuş.
- **Sade ve açık yaz;** teknik terimin yanına düz Türkçe karşılığı.
- **Petit referans:** `~/dev/petitcigogne` kanonik; işe başlamadan karşılığına bak, saptığında (ne/neden) bildir.
- Her tasarım/modül implementinden sonra **kural-uygunluk kontrolü** yap.
- **Dev server'ı KULLANICI yönetir** (başlatır/durdurur). Dev çalışırken `next build` **çalıştırma** — aynı `.next`'i bozar (webpack "Cannot find module './vendor-chunks/…'" runtime hataları). Doğrulamayı dev'e dokunmayan `typecheck`/`lint`/`knip`/`boundaries` ile yap; gerçek build şartsa dev'i durdurmasını iste. Bozulursa çare: `rm -rf apps/web/.next` + kullanıcı dev'i yeniden başlatır.

## 4b. Test disiplini (paylaşılan veritabanı — her ajan için bağlayıcı)
> Üç ajan **tek çalışma ağacını ve tek yerel Supabase'i** paylaşıyor. Kural bundan doğdu: eşzamanlı iki
> entegrasyon koşusu birbirinin satırlarını ezer ve ortaya **tekrarlanmayan bir düşüş** çıkar. Yalancı
> düşüş yavaş koşudan pahalıdır — olmayan bir hatanın teşhisine harcanan zaman geri gelmez.

- **Çalışırken `pnpm test:unit` + dokunduğun dosyalar.** Birim projesi DB'siz ve paraleldir: 568 test ~1,3 sn. Kapsamlı koşu (`pnpm vitest run <yol>`) da serbesttir.
- **Tam paket YALNIZ commit öncesi, ve `pnpm test` ile** — o script kilitlidir (`scripts/with-test-lock.mjs`), ajanlar çakışmak yerine sıraya girer. Çıplak `vitest run` ile tam paket koşma; kilidi atlar.
- **Testler küresel tekil satırı kirletmez.** Damgayla (`Date.now()`) ayrılmış satırlar güvenlidir; `settings` gibi TÜM suite'in okuduğu satırlar değil. Değiştirmek şartsa **önce oku, sonra geri koy** (`afterAll`) — "boşa çek" de bir varsayımdır ve bir gün yanlış olur. Örnek desen: `lib/feedback/invite.test.ts` (`overrideSetting` + snapshot).
- **DB'ye vuran test entegrasyon köküne yazılır** (`apps/web/lib`, `packages/database`, `apps/backend`). Birim projesinde `.env` yüklenmez ve DB env'i silinir; yanlış yere düşen test sessizce değil, ilk satırında "Supabase env eksik" diye patlar.
- **Küresel sayıya bakan test yazma** (`toplam N rezervasyon süpürüldü` gibi): başka bir ajanın verisi o sayıyı oynatır. Kendi kurduğun satırları say.

## 5. Doküman senkronu (her ajan için bağlayıcı)
- **Durumun tek sahibi `docs/build/NN-*.md` görev satırıdır.** İş ilerlediyse aynı oturumda o satır `[x]`/`[~]` olur + altına **Durum** notu yazılır. `BACKLOG` kapsam tutar, ilerleme tutmaz; `build/README` özet tablosu **türetilir** (`pnpm docs:sync`), elle yazılmaz.
- **Kod ve doküman aynı commit'te gider.** Ayrı commit "sonra yazarım"dır, o da yazmamaktır.
- **Görev kimliği `(NN.k)`** — iş bu kimlikle üstlenilir. Paralel ajan varsa görev satırına `touches:` (dokunulacak yollar) yazılır; kesişen iki görev aynı anda başlamaz, her ajan kendi dalında çalışır (`WORKFLOW §7`).
- **Geride bırakılan boşluk `BEKLEYEN(<ref>): <ne>` ile işaretlenir** — `TODO`/`FIXME` YASAK (kimseye söz vermez, denetlenmez, çürür). İşaret envanter DEĞİL, envantere giden **doğrulanmış bağdır**: açığın kendisi gerekçesiyle `design/BACKLOG.md`'ye ya da görev satırına yazılır; `<ref>` ya görev kimliğidir (`08.5`) ya backlog bölümüdür (`BACKLOG §1`). `docs:check` referansın gerçekten var olduğunu doğrular — kayıt düşülmeyen boşluk commit'ten geçmez.
- **Doğrulama:** `pnpm docs:check` — veri modeli ↔ migration ↔ Zod alan karşılaştırması, anılan paketlerin varlığı, görev kimlikleri, özet tazeliği. `pnpm hooks:install` ile commit öncesi otomatik koşar.
- Veri modeli konu dosyalarına bölüktür (`docs/architecture/data-model/`): **alan** oraya, **karar** ana `DATA_MODEL.md`'ye yazılır.

## 6. docs haritası
Kurallar + kod dizilimi → `STACK` · Disiplin (migration/deploy/git/ajan) → `WORKFLOW` · İş kuralları → `DOMAIN` ·
Veri: ortak ilke + kalıcı kararlar → `DATA_MODEL`, varlık tabloları → `data-model/{katalog,stok-tedarik,musteri-siparis,para,iletisim-geribildirim}.md` ·
Sipariş durum makinesi → `ORDER_LIFECYCLE` · i18n/SEO → `SEO_I18N` ·
Log / hata izleme / sistem sağlığı → `OBSERVABILITY` (iş kaydı DEĞİL — ayrım §1'de) ·
Faz 2 niyeti: MCP ile sınırlı AI yönetici asistanı → `AI_ADMIN_ASSISTANT` (karar değil; bugünkü kararlar bu hedefin önünü kapatmasın) ·
Blueprint'ten sapmalar → `ARCHITECTURE_DECISIONS` · Modül planı + durum → `docs/build/NN-*.md` · Kapsam listesi → `BACKLOG` ·
Tasarım ↔ kod açığı (çizili ama kodlanamayan, bilinçli sapmalar) → `design/BACKLOG.md`.
Tam navigasyon: `docs/architecture/README.md`.
