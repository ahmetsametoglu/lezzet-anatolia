/**
 * Meta webhook duman testi — `pnpm meta:smoke [senaryo] [--clean]`. Echo, ses mesajı ve ikinci teslim gibi tuzaklı olaylar Meta'dan
 * istenince alınamadığı için kendi ucumuza imzalı ve gerçek biçimli olay gönderir; satırlar `SMOKE-*` taşır ve `--clean` siler.
 */
import { createHmac } from 'node:crypto';

const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
// Node var olan değişkeni ezmez, ilk yükleyen kazanır; imzayı doğrulayan uç backend'de olduğu için önce onun dosyası okunur.
try {
  load?.('apps/backend/.env.local');
} catch {
  // Yoksa sorun değil — web'inki ya da ortam devralır.
}
try {
  load?.('apps/web/.env.local');
} catch {
  // Yoksa sorun değil — değişkenler ortamdan gelmiş olabilir.
}
try {
  load?.('.env');
} catch {
  // aynı
}

const SECRET = process.env.META_APP_SECRET;
if (!SECRET) {
  console.error('META_APP_SECRET yok — imza üretilemez. apps/backend/.env.local kontrol edin.');
  process.exit(1);
}

// Tünel ya da sunucu denemek için konak `META_SMOKE_URL` ile ezilir; yol ayrı durur ki konak değişince yol kaybolmasın.
const BASE = process.env.META_SMOKE_URL ?? 'http://localhost:8787';
const ENDPOINT = `${BASE}/webhooks/meta`;

// ── İşaretli kimlikler ───────────────────────────────────────────────────────
// Telefon E.164 ve gerçek bir numaraya benzemiyor: `+33 6 00 00 00 01` Fransa'da dağıtılmıyor.
const WA_PERSON = '33600000001';
const WA_ACCOUNT = '1227633040438008'; // test numarasının phone_number_id'si (kimlik, sır değil)
const FB_PERSON = 'SMOKE-PSID-0001';
const IG_PERSON = 'SMOKE-IGSID-0001';
// Gerçek Sayfa kimliği; yapay zekâ ajanı sahte kişiye bir kez yazmayı dener, Meta kalıcı retle reddeder ve sohbet devre düşer.
const PAGE_ACCOUNT = '1214267358444912';
const IG_ACCOUNT = 'SMOKE-IGACCOUNT';

/** Damga: WhatsApp SANİYE ister, Messenger/IG MİLİSANİYE. Karıştırmak tarihi 1970'e ya da binlerce yıl ileriye atar. */
const nowSec = () => Math.floor(Date.now() / 1000);
const nowMs = () => Date.now();

/** Olay kimliği — her koşuda YENİ, yoksa ikinci koşu kendi ilk koşusunun tekrarı sayılırdı. */
const stamp = Date.now();
const wamid = (n: number) => `wamid.SMOKE${stamp}${n}`;
const mid = (n: number) => `m_SMOKE${stamp}${n}`;

// ── Gövde üreticileri ────────────────────────────────────────────────────────

function whatsappBody(message: Record<string, unknown>, profileName = 'Duman Testi') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'SMOKE-WABA',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '+1 555-201-5460', phone_number_id: WA_ACCOUNT },
              // `wa_id` '+'SIZ — normalize etmeyi unutan kod çift ülke kodu üretir ('+3333…').
              contacts: [{ profile: { name: profileName }, wa_id: WA_PERSON }],
              messages: [{ from: WA_PERSON, timestamp: String(nowSec()), ...message }],
            },
          },
        ],
      },
    ],
  };
}

function messengerBody(object: 'page' | 'instagram', event: Record<string, unknown>) {
  const account = object === 'page' ? PAGE_ACCOUNT : IG_ACCOUNT;
  return {
    object,
    entry: [{ id: account, time: nowMs(), messaging: [{ timestamp: nowMs(), ...event }] }],
  };
}

// ── Senaryolar ───────────────────────────────────────────────────────────────

const SCENARIOS: Record<string, { note: string; body: unknown; expect: string; badSignature?: boolean }> = {
  'whatsapp-text': {
    note: 'WhatsApp metin — kimlik çözümü + taslak müşteri + pencere (damga SANİYE)',
    body: whatsappBody({ id: wamid(1), type: 'text', text: { body: 'Merhaba, cuma için baklava var mı?' } }),
    expect: 'written 1',
  },
  'whatsapp-audio': {
    note: 'WhatsApp ses — metinsiz tür `media` kovasına düşer, kaybolmaz',
    body: whatsappBody({ id: wamid(2), type: 'audio', audio: { id: 'SMOKE-MEDIA-1', mime_type: 'audio/ogg' } }),
    expect: 'written 1',
  },
  messenger: {
    note: 'Messenger gelen — PSID kimlik taşımaz, konuşma KİMLİKSİZ doğar (damga MİLİSANİYE)',
    body: messengerBody('page', {
      sender: { id: FB_PERSON },
      recipient: { id: PAGE_ACCOUNT },
      message: { mid: mid(3), text: 'Cevizli baklava kaç para?' },
    }),
    expect: 'written 1',
  },
  'messenger-echo': {
    note: 'Messenger ECHO — sender/recipient TERS; kişi `recipient.id`de. Ters okuyan kod iki kişiyi tek sohbette birleştirir.',
    body: messengerBody('page', {
      sender: { id: PAGE_ACCOUNT },
      recipient: { id: FB_PERSON },
      message: { mid: mid(4), text: 'Merhaba, 1 kg 12,90 €.', is_echo: true },
    }),
    expect: 'written 1 · yön GİDEN olmalı, pencereye DOKUNMAMALI',
  },
  instagram: {
    note: 'Instagram DM — `object=instagram`, aynı kapı',
    body: messengerBody('instagram', {
      sender: { id: IG_PERSON },
      recipient: { id: IG_ACCOUNT },
      message: { mid: mid(5), text: 'Hikayedeki künefe hâlâ var mı?' },
    }),
    expect: 'written 1',
  },
  postback: {
    note: 'Messenger postback — kendi mid’i YOK, claim anahtarı değişmeyen alanlardan türetilir',
    body: messengerBody('page', {
      sender: { id: FB_PERSON },
      recipient: { id: PAGE_ACCOUNT },
      postback: { title: 'Ürüne git', payload: 'SMOKE_PAYLOAD' },
    }),
    expect: 'written 1',
  },
  'bad-signature': {
    note: 'İmzası bozuk gövde — uç nokta 401 vermeli. Gevşetilirse kimlik kurgusunun temeli düşer.',
    body: whatsappBody({ id: wamid(9), type: 'text', text: { body: 'bu geçmemeli' } }),
    expect: 'HTTP 401',
    badSignature: true,
  },
};

// ── Gönderim ─────────────────────────────────────────────────────────────────

async function send(body: unknown, badSignature = false): Promise<{ status: number; text: string }> {
  // İmza HAM gövde üzerinden — uç nokta da `req.text()` okuyor. Yeniden serileştirmek imzayı bozar.
  const raw = JSON.stringify(body);
  const sig = createHmac('sha256', SECRET!).update(raw).digest('hex');
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${badSignature ? 'f'.repeat(64) : sig}`,
    },
    body: raw,
  });
  return { status: response.status, text: (await response.text()).slice(0, 160) };
}

async function run(name: string): Promise<boolean> {
  const s = SCENARIOS[name];
  if (!s) {
    console.error(`bilinmeyen senaryo: ${name}`);
    return false;
  }
  const r = await send(s.body, s.badSignature);
  const ok = s.badSignature ? r.status === 401 : r.status === 200 && r.text.includes('"written":1');
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(17)} HTTP ${r.status}  ${r.text}`);
  console.log(`   ${s.note}`);
  console.log(`   beklenen: ${s.expect}\n`);
  return ok;
}

/** Tekrar güvencesi: AYNI gövde iki kez → ikincisi yazmamalı, `duplicates` saymalı. */
async function runRetry(): Promise<boolean> {
  const body = whatsappBody({ id: wamid(8), type: 'text', text: { body: 'tekrar teslim sınaması' } });
  const first = await send(body);
  const second = await send(body);
  const ok = first.text.includes('"written":1') && second.text.includes('"duplicates":1');
  console.log(`${ok ? '✓' : '✗'} retry             1. ${first.text}`);
  console.log(`                     2. ${second.text}`);
  console.log('   Meta bir olayı 7 gün boyunca yeniden gönderir — ikinci teslim defteri ÇİFTLEMEMELİ.\n');
  return ok;
}

// ── Temizlik ─────────────────────────────────────────────────────────────────

async function clean(): Promise<void> {
  const { ConversationService, serviceDb } = await import('@lezzet/database');
  const { mustDelete } = await import('@lezzet/database/testing');
  const db = serviceDb();
  const service = new ConversationService(db);

  // Arama kanal ve kimlik çiftiyle yapılır, çünkü tekillik o çifttedir; tek anahtar üç kanalı karıştırırdı.
  const targets: [Parameters<typeof service.findByExternalRef>[0], string][] = [
    ['whatsapp', `+${WA_PERSON}`],
    ['messenger', FB_PERSON],
    ['instagram', IG_PERSON],
  ];
  let removed = 0;
  for (const [source, ref] of targets) {
    const row = await service.findByExternalRef(source, ref);
    if (!row) continue;
    // Silme SIRASI: mesajlar önce, konuşma sonra — FK `restrict` (cleanup.ts'in kuralı).
    await mustDelete(db, 'message', (q) => q.eq('conversation_id', row.id));
    await mustDelete(db, 'conversation', (q) => q.eq('id', row.id));
    removed += 1;
  }
  // Olay kayıtları: yalnız bu script'in ürettikleri (`SMOKE` damgalı kimlikler).
  await mustDelete(db, 'webhook_event', (q) => q.eq('provider', 'meta').like('event_id', '%SMOKE%'));

  // WhatsApp senaryosunun açtığı taslak müşteri de silinir; yalnız işaretli numara ve `is_draft`, ki gerçek müşteriye dokunulmasın.
  await mustDelete(db, 'user_profiles', (q) => q.eq('phone', `+${WA_PERSON}`).eq('is_draft', true));

  console.log(`temizlendi: ${removed} konuşma · damgalı webhook olayları · taslak müşteri`);
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const wantsClean = args.includes('--clean');
const target = args.find((a) => !a.startsWith('--')) ?? 'all';

console.log(`uç nokta: ${ENDPOINT}\n`);

if (wantsClean && target === 'clean') {
  await clean();
} else {
  const names = target === 'all' ? Object.keys(SCENARIOS) : [target];
  let allOk = true;
  for (const name of names) allOk = (await run(name)) && allOk;
  if (target === 'all') allOk = (await runRetry()) && allOk;

  if (wantsClean) await clean();
  else console.log('Satırlar DURUYOR — gelen kutusunda görebilirsin. Silmek için: pnpm meta:smoke clean --clean');

  if (!allOk) process.exit(1);
}
