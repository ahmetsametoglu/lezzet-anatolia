# 22 — MCP Yönetici Asistanı

## Kapsam

Kurgu ve teknik sınırlar `docs/architecture/AI_ADMIN_ASSISTANT.md`'de (09.08 kararlarıyla) —
bu dosya İLERLEMEYİ tutar, kurguyu tekrarlamaz. **Modülün tam görev listesi Faz 1 bitince açılır**
(kullanıcı kararı: üretim implementasyonu — ikili anahtar paneli, onay kuyruğu + ekranı, OAuth,
araç fazları — Faz 1 sonrası). Bugün yalnız deneme dilimi var; erken açılışın gerekçesi görev
satırında.

## Okunacaklar

- `docs/architecture/AI_ADMIN_ASSISTANT.md` — kurgu, sınırlar, araç fazları, kararlar
- `docs/architecture/AI_CUSTOMER_AGENT.md` — iki AI yüzeyinin ayrımı (bu asistan müşteriye konuşmaz)
- Petit referansı: `~/dev/petitcigogne/apps/backend/src/routes/mcp/` (guard · server-factory · well-known)

## Görevler

- [x] (22.1) **Deneme dilimi — yerel salt-okuma asistan** *(kullanıcı kararı 09.08: "denemem
  lazım" — Faz-1 kuralının incelticisi; üretim implementasyonu yine Faz 1 sonrası)*: `apps/backend`e
  `/mcp` ucu (Hono `app.all` + `@modelcontextprotocol/sdk` streamable HTTP, istek-başına stateless
  `Server`) + `.env` Bearer kapısı (`MCP_CONNECTION_KEY`, fail-closed, sabit-zamanlı kıyas) + Faz
  A'dan ÜÇ salt-okuma araç: `morning_briefing` (bugünün teslimatları/ciro/kapıda + açık hata +
  sağlık + açık talep + depo başına eşik-altı tedarik önerisi + `attention` listesi) ·
  `sales_summary` (teslim gününe göre son N gün — sipariş-tarihi süzgeci kapıda yok, araç bunu
  saklamaz) · `system_errors` (açık sayı + seçilmiş alanlarla son satırlar). **Maskeleme koddan
  önce testte:** `lastPurchasePriceCents`/`supplierCode` çıktının serileşmiş hâlinde GEÇEMEZ
  (finans sınırı §6), `error_log.context` gövdesi dökülmez, müşteri kimliği hiçbir araçta yok.
  Yazma aracı YOK — istenirse asistan "onay kuyruğu fazı henüz yazılmadı" der (talimatta) —
  touches: `apps/backend/src/mcp/**`, `apps/backend/src/http/request-log.ts`,
  `apps/backend/src/index.ts`, `packages/observability/src/capture.ts` (SOURCES.mcp)
  - *Bitti:* backend tip denetimi + eslint temiz; 6/6 test yeşil (kapının üç hâli + üç aracın
    şekli/maskeleme sözleşmesi); canlı duman 09.08: `tools/list` üç aracı döndü, yanlış anahtar
    401, `morning_briefing` gerçek veriyle cevapladı (geçici port 8788, süreç temiz kapatıldı).
    Bağlanma: `claude mcp add lezzet-asistan --transport http http://localhost:8787/mcp --header
    "Authorization: Bearer <anahtar>"` — anahtar `MCP_CONNECTION_KEY` olarak
    **`apps/backend/.env.local`**'a yazılır (backend `src/env.ts` bu dosyayı okur; şablon
    `.env.example`, üretme `openssl rand -hex 32`), backend `pnpm --filter @lezzet/backend dev`
    ile ayakta olmalı.
  - **Yan bulgu — BACKEND PORTU rastgeleye düşüyordu (ölçüldü ve düzeltildi 09.08):** bağlanmayı
    denerken çıktı; `apps/backend/.env.local`'da `BACKEND_PORT=` **tanımlı ama boş**tu ve kod
    `Number(process.env.BACKEND_PORT ?? 8787)` yazıyordu. Boş dizgi nullish DEĞİL → `??` yakalamaz
    → `Number('')` = 0 → port 0 "işletim sistemi rastgele port versin" demek. Süreç sağlıklı
    kalkıyor, log'a doğru portu yazıyor, ama her başlatmada BAŞKA port (ölçülen: 60800) ve 8787'yi
    bekleyen hiçbir istemci bağlanamıyor — MCP'siz de var olan sessiz bir arıza. Düzeltme
    `|| 8787` (boş değer = tanımsız değer; ikisinde de varsayılan geçer), künye `index.ts`'te.
  - **Durum (09.08):** çağrı izi şimdilik `logger.info` (araç adı + süre; argüman yazılmaz) —
    `mcp_call_log` tablosu üretim turunun işi (§8). Brifing, canlı DB'de o an duran test-fikstürü
    depoyu da listeler (`T-…` kodlu); bu bir süzme eksiği DEĞİL, bilinçli: ekran/araç veriyi
    düzeltmez, gösterir — çöp `pnpm test:purge` ile temizlenir, araçtan gizlenmez.

- [x] (22.2) **Faz A tamamlandı — araç kataloğu üçten SEKİZE** *(kullanıcı isteği 09.08:
  "araçların geliştirilmesi gerekiyor")*: `catalog_health` (kaç ürün · aday · eksik beyanlı +
  hangi ürünün NEYİ eksik — ölçüt motorun `missingDeclarations` sözlüğünden, araç kendi ölçütünü
  uydurmaz + vitrin işaretleri) · `stock_watch` (N gün içinde ömrü dolan partiler, depo koduyla;
  DLC/DDM ayrımı korunur — geçen DLC imha, yaklaşan DDM teklif) · `sold_out_watch` (vitrinde
  duran ama hiçbir depoda kalmamış varyantlar) · `demand_signals` (**kullanıcının istediği iki
  gündem kaleminin ham verisi**: kapsanmayan posta kodu talebi → rota önerisi · sonuçsuz aramalar
  + ürün-ilgi → paket/ürün önerisi) · `customer_pulse` (talep + moderasyon + cevap bekleyen
  konuşma — YALNIZ SAYIM; MCP'nin mesajlaşmadaki rolü gözlemdir, kullanıcı kararı 09.08).
  Dağıtım zincirli koşuldan sözlüğe (`HANDLERS`) geçti; talimat gündem/gıda-güvenliği/rol
  sınırlarıyla genişledi — touches: `apps/backend/src/mcp/**`
  - *Bitti:* 13/13 test (yenileri: beyan ölçütü motordan mı · parti satırında alış fiyatı YOK ·
    nabız yalnız sayı mı · **araç tanımı ↔ uygulama eşliği**) · tsc + eslint temiz · canlı
    doğrulama: `tools/list` sekiz araç; katalog 129 ürün/25 eksik beyan; stok 2 geçmiş (biri DLC)
    + 5 yaklaşan; talep panosunda 67500 kodu 47 kez sorulmuş (kapsanmıyor) — asistan artık gerçek
    bir haftalık gündem kurabiliyor.

- [ ] (22.3) **Üretim turu — Faz 1 bitince AÇILIR:** ikili anahtar tablosu + Ayarlar paneli ·
  oran sınırı · `mcp_call_log` · OAuth (`well-known`, claude.ai connector — canlıya çıkış 18'e
  bağlı) · onay kuyruğu `assistant_proposal` + operasyon paneli (tasarım ısmarlaması burada) ·
  araç fazları B1/B2 · oturum anahtarı (1 saat + kapsam). Ayrıntı ve sıra `AI_ADMIN_ASSISTANT
  §4-7`; bu satır Faz 1 kapanışında gerçek görevlere bölünür.
