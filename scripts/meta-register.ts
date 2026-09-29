/**
 * Webhook adresini ve dinlenen alanları Meta'ya yazar (`pnpm meta:register <genel-url> [--only=whatsapp|page]`); kayıttan önce adresi
 * kendisi yoklar, çünkü ölü bir adres kayıtlıyken her şey kurulu görünür. Üç adım üç ayrı jeton ister (uygulama aboneliği: uygulama
 * jetonu · WABA: sistem jetonu · sayfa: sayfa jetonu) ve karıştırmak `#200` verir.
 */
const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
// SIRA ÖNEMLİ (öteki Meta betikleriyle aynı gerekçe): Node var olan değişkeni ezmez, ilk yükleyen
// kazanır. Sıranın başı backend'in dosyası — kaydettiğimiz ucu DOĞRULAYAN taraf orada koşuyor.
for (const dosya of ['apps/backend/.env.local', 'apps/web/.env.local', '.env']) {
  try {
    load?.(dosya);
  } catch {
    // Yoksa sorun değil — değişkenler ortamdan ya da sonraki dosyadan gelir.
  }
}

const GRAPH = 'https://graph.facebook.com/v21.0';

/*
  Yalnız işleyicinin (`handleMetaWebhook`) tanıdığı alanlar abone edilir; tanımadığı alan, anlamadığımız bir gövdeyi uca yollamaktır.
  Liste sabit ve açık, çünkü alansız abonelik panelde yeşil görünür ama hiçbir olay getirmez.
*/
const WHATSAPP_FIELDS = ['messages'];
const PAGE_FIELDS = ['messages', 'messaging_postbacks', 'message_echoes', 'message_reactions', 'message_edits'];
// Instagram'da alan adı tekil (`message_edit`) ve yankılar `messages` içinde gelir.
const INSTAGRAM_FIELDS = ['messages', 'messaging_postbacks', 'message_reactions', 'message_edit'];

const [, , urlArg] = process.argv;
const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];

if (!urlArg || urlArg.startsWith('--')) {
  console.error(
    'Kullanım: pnpm meta:register <genel-url> [--only=whatsapp|page]\n' +
      '  genel-url: tünelin kök adresi, ör. https://xxx.trycloudflare.com\n' +
      '             (yolu betik ekler: /webhooks/meta)\n' +
      '  --only   : yalnız tek kanalı kaydet; varsayılan ikisi birden',
  );
  process.exit(1);
}

/** Kök adres — sondaki `/` temizlenir, yoksa `//webhooks/meta` doğar ve tünel 404 verir. */
const base = urlArg.replace(/\/+$/, '');
const callbackUrl = `${base}/webhooks/meta`;

const appId = process.env.META_APP_ID;
const appSecret = process.env.META_APP_SECRET;
const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
const userToken = process.env.META_ACCESS_TOKEN;

const eksik = [
  ['META_APP_ID', appId],
  ['META_APP_SECRET', appSecret],
  ['META_WEBHOOK_VERIFY_TOKEN', verifyToken],
  ['META_ACCESS_TOKEN', userToken],
]
  .filter(([, v]) => !String(v ?? '').trim())
  .map(([k]) => k);

if (eksik.length > 0) {
  console.error(`Eksik anahtar: ${eksik.join(', ')}\n  apps/backend/.env.local (künye: .env.example)`);
  process.exit(1);
}

/** Uygulama jetonu — `/{app_id}/subscriptions` yalnız bunu kabul eder. */
const appToken = `${appId}|${appSecret}`;

type GraphYanit = { ok: boolean; body: Record<string, unknown> };

async function graph(
  yol: string,
  yontem: 'GET' | 'POST',
  params: Record<string, string>,
): Promise<GraphYanit> {
  const qs = new URLSearchParams(params);
  const url = yontem === 'GET' ? `${GRAPH}${yol}?${qs}` : `${GRAPH}${yol}`;
  const res = await fetch(url, {
    method: yontem,
    ...(yontem === 'POST'
      ? { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: qs }
      : {}),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok && !body.error, body };
}

/** Graph hatasını tek satıra indirger — gövdenin tamamı ekranı doldurur, sebep kaybolur. */
function hataMetni(body: Record<string, unknown>): string {
  const e = body.error as { message?: string; code?: number } | undefined;
  return e ? `${e.message ?? 'bilinmeyen hata'} (kod ${e.code ?? '?'})` : JSON.stringify(body);
}

/**
 * ADRESİ YOKLA — Meta'nın atacağı el sıkışmasının aynısı.
 *
 * `hub.challenge` rastgele: sabit bir değer, adresi yankılayan herhangi bir sunucuyu "doğru" sayardı.
 */
async function adresYasiyorMu(): Promise<boolean> {
  const challenge = String(Math.floor(Math.random() * 1e9));
  const qs = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.verify_token': verifyToken!,
    'hub.challenge': challenge,
  });
  try {
    const res = await fetch(`${callbackUrl}?${qs}`, { signal: AbortSignal.timeout(15_000) });
    const govde = (await res.text()).trim();
    if (res.status !== 200) {
      console.error(`  ✗ adres HTTP ${res.status} döndü — kayıt YAPILMADI.`);
      if (res.status === 503) console.error('    503 = uçta anahtar eksik (META_APP_SECRET / VERIFY_TOKEN).');
      if (res.status === 403) console.error('    403 = verify token eşleşmedi: tünelin arkasındaki backend başka bir .env okuyor.');
      return false;
    }
    if (govde !== challenge) {
      console.error(`  ✗ adres 200 verdi ama challenge'ı yankılamadı (gelen: ${govde.slice(0, 60)}).`);
      console.error('    Tünel başka bir servise bakıyor olabilir.');
      return false;
    }
    return true;
  } catch (err) {
    console.error(`  ✗ adrese ulaşılamadı: ${(err as Error).message}`);
    console.error('    Tünel açık mı, backend 8787\'de koşuyor mu?');
    return false;
  }
}

/** WhatsApp: uygulamayı `whatsapp_business_account` objesine, WABA'yı uygulamaya abone eder. */
async function whatsappKaydet(): Promise<boolean> {
  console.log('\n── WhatsApp ─────────────────────────────────');

  const abone = await graph(`/${appId}/subscriptions`, 'POST', {
    object: 'whatsapp_business_account',
    callback_url: callbackUrl,
    verify_token: verifyToken!,
    fields: WHATSAPP_FIELDS.join(','),
    access_token: appToken,
  });
  if (!abone.ok) {
    console.error(`  ✗ uygulama aboneliği: ${hataMetni(abone.body)}`);
    return false;
  }
  console.log(`  ✓ uygulama aboneliği — alanlar: ${WHATSAPP_FIELDS.join(', ')}`);

  const wabaId = process.env.META_WABA_ID?.trim();
  if (!wabaId) {
    console.log('  · META_WABA_ID yok — WABA→uygulama adımı atlandı.');
    console.log('    (Gelen mesaj için ŞART; .env.local\'e ekleyin.)');
    return true;
  }

  // KULLANICI/sistem jetonu — burada uygulama jetonu `#200` verir.
  const wabaAbone = await graph(`/${wabaId}/subscribed_apps`, 'POST', { access_token: userToken! });
  if (!wabaAbone.ok) {
    console.error(`  ✗ WABA aboneliği: ${hataMetni(wabaAbone.body)}`);
    return false;
  }
  console.log(`  ✓ WABA ${wabaId} uygulamaya abone`);
  return true;
}

/** Messenger: Sayfa jetonunu türetir, uygulamayı `page` objesine ve Sayfayı uygulamaya abone eder. */
async function messengerKaydet(): Promise<boolean> {
  console.log('\n── Messenger ────────────────────────────────');

  const pageId = process.env.META_PAGE_ID?.trim();
  if (!pageId) {
    console.log('  · META_PAGE_ID yok — Messenger atlandı (.env.local\'e ekleyin).');
    return true;
  }

  // 1) UYGULAMA aboneliği ÖNCE — yalnız uygulama jetonu ister (sıra gerekçesi dosya başında).
  const abone = await graph(`/${appId}/subscriptions`, 'POST', {
    object: 'page',
    callback_url: callbackUrl,
    verify_token: verifyToken!,
    fields: PAGE_FIELDS.join(','),
    access_token: appToken,
  });
  if (!abone.ok) {
    console.error(`  ✗ uygulama aboneliği: ${hataMetni(abone.body)}`);
    console.error('    (#1929002 gelirse: uygulamada Messenger ÜRÜNÜ ekli değil.)');
    return false;
  }
  console.log(`  ✓ uygulama aboneliği — alanlar: ${PAGE_FIELDS.join(', ')}`);

  const igAbone = await graph(`/${appId}/subscriptions`, 'POST', {
    object: 'instagram',
    callback_url: callbackUrl,
    verify_token: verifyToken!,
    fields: INSTAGRAM_FIELDS.join(','),
    access_token: appToken,
  });
  if (!igAbone.ok) {
    console.error(`  ✗ Instagram uygulama aboneliği: ${hataMetni(igAbone.body)}`);
    return false;
  }
  console.log(`  ✓ Instagram uygulama aboneliği — alanlar: ${INSTAGRAM_FIELDS.join(', ')}`);

  /* 2) SAYFA jetonu: env'de varsa gönderimin jetonu o (`META_PAGE_ACCESS_TOKEN`) — burada başka bir
     jeton kullanmak "kayıt geçti, gönderim düştü" diye ayrışan iki gerçek üretirdi. Yoksa sistem
     jetonundan türetilir: Sayfa sistem kullanıcısına atanmışsa Graph onu zaten veriyor. */
  let pageToken = process.env.META_PAGE_ACCESS_TOKEN?.trim() ?? '';
  if (pageToken) {
    console.log("  ✓ Sayfa jetonu env'den (META_PAGE_ACCESS_TOKEN)");
  } else {
    const sayfa = await graph(`/${pageId}`, 'GET', { fields: 'access_token,name', access_token: userToken! });
    if (!sayfa.ok) {
      console.error(`  ✗ Sayfa jetonu türetilemedi: ${hataMetni(sayfa.body)}`);
      console.error("    Beklenen sebep: META_ACCESS_TOKEN'da pages_* izni yok ya da Sayfa sistem");
      console.error('    kullanıcısına varlık olarak atanmamış. META_PAGE_ACCESS_TOKEN vermek de yeter.');
      console.error('    Uygulama aboneliği YAZILDI — adres güncel; eksik olan yalnız Sayfa→uygulama adımı.');
      return false;
    }
    pageToken = String(sayfa.body.access_token ?? '');
    console.log(`  ✓ Sayfa jetonu türetildi — "${String(sayfa.body.name ?? pageId)}"`);
  }

  // 3) Sayfa → uygulama aboneliği. SAYFA jetonu ister ve o jetonda `pages_manage_metadata` olmalı.
  const sayfaAbone = await graph(`/${pageId}/subscribed_apps`, 'POST', {
    subscribed_fields: PAGE_FIELDS.join(','),
    access_token: pageToken,
  });
  if (!sayfaAbone.ok) {
    console.error(`  ✗ Sayfa aboneliği: ${hataMetni(sayfaAbone.body)}`);
    console.error('    Uygulama aboneliği YAZILDI (adres güncel). Bu adım `pages_manage_metadata` ister; Sayfa daha');
    console.error('    önce abone edildiyse kayıt Meta tarafında DURUR — canlı bir mesajla doğrulanır.');
    return false;
  }
  console.log(`  ✓ Sayfa ${pageId} uygulamaya abone`);
  console.log('\n  Not: uygulama geliştirme modundaysa Messenger webhook\'u YALNIZ uygulamada rolü');
  console.log('  olan kişiler için düşer (ölçüldü 22.08). Test edecek hesap App Roles\'ta Tester olmalı.');
  return true;
}

/** Kaydın Meta'daki SONUÇ hâli — "yazdım" ile "yazılmış" ayrı iki iddia. */
async function durumBas(): Promise<void> {
  console.log('\n── Meta\'daki güncel kayıt ───────────────────');
  const d = await graph(`/${appId}/subscriptions`, 'GET', { access_token: appToken });
  if (!d.ok) {
    console.error(`  okunamadı: ${hataMetni(d.body)}`);
    return;
  }
  const kayitlar = (d.body.data ?? []) as { object?: string; callback_url?: string; active?: boolean; fields?: { name?: string }[] }[];
  if (kayitlar.length === 0) {
    console.log('  (hiç abonelik yok)');
    return;
  }
  for (const k of kayitlar) {
    const alanlar = (k.fields ?? []).map((f) => f.name).filter(Boolean).join(', ');
    console.log(`  ${k.object} · aktif=${k.active}`);
    console.log(`    adres : ${k.callback_url}`);
    // Alan listesinin BOŞ olması sessiz arızanın imzası — o yüzden ayrıca uyarılıyor.
    console.log(`    alanlar: ${alanlar || '⚠️  BOŞ — bu abonelik hiçbir olay göndermez'}`);
  }
}

console.log(`kaydedilecek adres: ${callbackUrl}`);
console.log('\n── Adres yoklaması ──────────────────────────');
if (!(await adresYasiyorMu())) {
  console.error('\nÖlü adres kaydedilmedi — Meta\'daki mevcut kayıt olduğu gibi duruyor.');
  process.exit(1);
}
console.log('  ✓ adres yaşıyor, el sıkışması geçti');

let basarili = true;
if (onlyArg !== 'page') basarili = (await whatsappKaydet()) && basarili;
if (onlyArg !== 'whatsapp') basarili = (await messengerKaydet()) && basarili;

await durumBas();

if (!basarili) {
  console.error('\nEn az bir adım başarısız — yukarıdaki sebeplere bakın.');
  process.exit(1);
}
console.log('\nKayıt tamam.');
