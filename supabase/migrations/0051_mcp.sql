-- Modül 22 — MCP KAPISININ GÜVENLİK VE İZ KATMANI (22.4). Deneme dilimi (22.1) kapıyı tek bir
-- `.env` anahtarıyla açmıştı; bu migration o anahtarı VERİYE taşır ve yanına iki şey koyar:
-- iptal edilebilirlik ve iz.
--
-- ── NEDEN TABLO GEREKTİ ─────────────────────────────────────────────────────
-- Env anahtarının üç kusuru vardı ve üçü de ancak canlıda acıtırdı:
--   1) İPTAL EDİLEMEZ. Anahtar sızarsa tek çare süreci durdurup env'i değiştirmektir — yani
--      asistanı kullanan herkesin bağlantısını birlikte kesmek.
--   2) SÜRESİZ. Bir kez yazılan anahtar sonsuza kadar geçerlidir; "artık kullanmıyorum" diye bir
--      hâl yoktur.
--   3) KAPSAMSIZ. Anahtarı bilen 25 aracın hepsini çağırır — okuma da öneri de aynı kapıdan.
--      Oysa asistanın yazma yolu onay kuyruğuna düşse bile, kuyruğa çöp doldurmak bir zarardır.
--
-- ── ENV ANAHTARI ÖLMEDİ, ARTÇI OLDU ─────────────────────────────────────────
-- `MCP_CONNECTION_KEY` geçerli kalır ve tabloda eşleşme bulunamazsa devreye girer (`guard.ts`).
-- Gerekçe: bu tablo boş doğar, panelden ilk anahtar üretilene kadar kapı kapalı kalırdı ve
-- kullanıcının bugün çalışan bağlantısı sessizce ölürdü. Artçı anahtarın kapsamı en dar olan
-- (`read`) DEĞİL `propose`dur — bugünkü davranış budur ve bir güvenlik yükseltmesi, çalışan bir
-- kurulumu habersiz kısıtlayarak başlamamalıdır. Panelden anahtar üretildikten sonra env satırı
-- silinir; o gün bu artçı yol da tarihe karışır.
--
-- ── OTURUM ANAHTARI (İKİNCİ KATMAN) BİLİNÇLİ YAZILMADI ──────────────────────
-- `AI_ADMIN_ASSISTANT §4` ikili anahtar tarif ediyor: bağlantı + kısa ömürlü oturum. İkincisi
-- referans projede ŞABLONA bağlıydı — model hangi tasarımın üzerinde çalıştığını o anahtardan
-- öğreniyordu, yani anahtar bir BAĞLAM taşıyıcısıydı. Bizim asistanın böyle bir bağlamı yok:
-- araçlar depoyu, ürünü, tedarikçiyi argümanla alıyor. Geriye oturum anahtarının tek kazanımı
-- kalıyor — çalınan anahtarın ömrünü kısaltmak — ve §4'ün kendi cümlesi onu ikincil ilan ediyor:
-- *"asıl sınır süre değil KAPSAM + ONAY KUYRUĞU"*. Kapsam bu tabloda, kuyruk `assistant_proposal`da.
-- Ömür kısaltma işini `expires_at` + `revoked_at` görüyor. Sapma ve gerekçesi `22.4` satırında.
-- ============================================================================

-- Araç AİLESİ, kademeli: `propose` `read`i KAPSAR (öneri veren, okuyabilmelidir — öneri kör
-- kurulamaz). İki değer yeter çünkü araç takımının ikiye ayrılması adlandırmada zaten yazılı:
-- `propose_*` ile başlayan 11 araç kuyruğa yazar, kalan 14'ü yalnız okur. Eşleme koda gizli
-- kural olarak gömülmez — `guard.ts` bunu tek satırda yapar ve testi bu sözleşmeyi korur.
create type mcp_scope as enum ('read', 'propose');

create table public.mcp_connection_key (
  id uuid primary key default gen_random_uuid(),

  -- Operatörün anahtarı tanıdığı ad ("Ahmet · Claude Desktop"). Anahtarın kendisi bir daha
  -- görünmeyeceği için listede ayırt edici olan tek şey budur.
  label text not null check (length(btrim(label)) > 0),

  -- DÜZ METİN SAKLANMAZ. Karşılaştırma SHA-256 üzerinden ve sabit zamanlı yapılır; sızan bir
  -- yedek dosyası çalışan anahtar vermez.
  token_hash text not null unique,

  scope mcp_scope not null default 'read',

  -- Anahtarı üreten personel. Silinse kayıt bozulmasın → set null ("kim ürettiği bilinmiyor",
  -- "sistem üretti" değil; ikisi farklı cümledir).
  created_by uuid references public.user_profiles (id) on delete set null,

  created_at timestamptz not null default now(),

  -- Süre ZORUNLU: "sonsuza kadar geçerli" seçeneği yoktur — env anahtarının kusuru buydu.
  -- Varsayılan 90 gün uygulama katmanında (`AI_ADMIN_ASSISTANT §4`), burada yalnız tutarlılık.
  expires_at timestamptz not null check (expires_at > created_at),

  -- Dolu = iptal edilmiş. Satır SİLİNMEZ: iptal edilmiş bir anahtarın çağrı geçmişi
  -- (`mcp_call_log`) sahipsiz kalmamalı, "bu çağrıları iptal ettiğim anahtar yapmıştı"
  -- cevaplanabilir olmalı.
  revoked_at timestamptz,

  -- Telemetri, best-effort. `null` = hiç kullanılmadı — sıfır değil, YOK (CLAUDE.md §1:
  -- ölçülemeyen değer sıfır değildir; panel "hiç kullanılmadı" yazar, "0 gün önce" değil).
  last_used_at timestamptz
);

-- Doğrulama yolu: hash ile tek satır. Unique indeks zaten var (token_hash), ayrıca indeks gereksiz.
-- Listeleme sırası panelin varsayılanı: en yeni üstte.
create index mcp_connection_key_created_idx on public.mcp_connection_key (created_at desc);

-- ─── ÇAĞRI İZİ (§8) ──────────────────────────────────────────────────────────
-- "Zincirleme kötüye kullanım tek tek görünsün." Bir araç çağrısı = bir satır; yazım
-- fire-and-forget (cevabı bekletmez, kendi hatası yutulmaz ama çağrıyı düşürmez).
create table public.mcp_call_log (
  id uuid primary key default gen_random_uuid(),

  -- Anahtar iptal edilse bile iz kalır (set null), ama normalde satır durduğu için bağ da durur.
  connection_key_id uuid references public.mcp_connection_key (id) on delete set null,

  tool text not null,
  ok boolean not null,
  duration_ms int not null check (duration_ms >= 0),

  -- **ARGÜMAN YAZILMAZ, HATA MESAJI `scrubMessage`DEN GEÇER** (OBSERVABILITY §5). Araç argümanı
  -- müşteri adı, adres, tutar taşıyabilir; teşhis için hangi aracın hangi hatayla düştüğü yeter.
  -- En tehlikeli sızıntı bizim yazdığımız bağlam değil, veritabanının kısıt ihlaline gömdüğü
  -- değerdir — o yüzden mesaj ham değil, süzülmüş yazılır.
  error text,

  created_at timestamptz not null default now()
);

-- Panelin tek sorusu "son ne oldu"; ikincisi "bu anahtar ne yaptı".
create index mcp_call_log_created_idx on public.mcp_call_log (created_at desc);
create index mcp_call_log_key_idx on public.mcp_call_log (connection_key_id, created_at desc);

-- Erişim SUNUCUDAN, service_role ile (RLS deny-by-default — `error_log`/`job_run` ile aynı desen;
-- politika bilinçli YOK, gerekçesi 0008'in künyesinde: RLS kapsamı 18.1'de karara bağlanacak ve
-- okuma `requireAdmin` kapısından geçen operasyon sayfasında yapılıyor).
alter table public.mcp_connection_key enable row level security;
alter table public.mcp_call_log enable row level security;
