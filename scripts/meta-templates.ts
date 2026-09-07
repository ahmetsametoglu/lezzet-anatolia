/**
 * WhatsApp ŞABLON aracı (15.11) — `pnpm meta:templates <list|plan|submit> [--only=<ad>]`
 *
 * Onaylı kalıp (template) mesajlarını Meta'ya API'den gönderir ve durumlarını okur; panele
 * girilmez.
 *
 * ── NEDEN VAR: METİN PANELDE DEĞİL REPODA YAŞAMALI ──────────────────────────
 * Şablon metni panele elle girildiğinde tek kopyası Meta'da kalır: sürüm geçmişi yok, gözden
 * geçirme yok, "bu cümle neden böyle yazılmış" sorusunun cevabı yok. Dört şablonun üç dil sürümü
 * on iki form demek ve her form bir yazım hatası fırsatı. Burada metin kodun yanında duruyor,
 * `git log` onu taşıyor ve gönderim tek komut.
 *
 * Kazanç HIZDA DEĞİL: API gönderimi de aynı Meta incelemesine giriyor, aynı süre. Kazanç kayıtta
 * ve tekrarlanabilirlikte — reddedilen bir metni düzeltip yeniden göndermek tek komut.
 *
 * ── DEĞİŞKENDE CÜMLE TAŞINMAZ, DEĞER TAŞINIR (kullanıcı tespiti 07.09) ──────
 * Şablonun kendisi zaten DİL BAŞINA bir sürüm. Bir değişkene cümle konursa o cümlenin dili
 * şablonun dilinden bağımsız kalır — Fransızca bir şablonun içine Türkçe bir ifade düşer ve hata
 * hiçbir yerde uyarı vermez (Meta için değişken yalnız bir metindir). İlk taslakta "yola çıktı"
 * tek şablondu ve üçüncü değişkeni *"bugün 14:00–17:00 arası"* ya da *"Suivi : XYZ"* taşıyordu;
 * kullanıcı yakaladı. Şimdi ikiye ayrıldı ve değişkenlerde yalnız DEĞER var:
 *   • `order_out_for_delivery` → `14:00–17:00`      (yalnız saat, dil taşımaz)
 *   • `order_shipped`          → `3SABCD1234567`    (takip numarası, dil taşımaz)
 * "bugün" ve "Takip numarası" gibi her kelime şablonun kendi metninde, dolayısıyla her dilde doğru.
 *
 * ── AD = OLAY ADI, ARADA EŞLEŞTİRME TABLOSU YOK ─────────────────────────────
 * Şablon adları `packages/notify`'daki olay adlarının aynısı (`order_confirmed`,
 * `order_out_for_delivery`, `order_delivered`). Tablo tutulsaydı biri şablonu panelden yeniden
 * adlandırdığında kod SESSİZCE olmayan bir şablonu çağırırdı ve arıza "müşteriye mesaj gitmedi"
 * diye görünürdü. Tek istisna `order_shipped`: kargonun ayrı bir olayı yok, o da
 * `order_out_for_delivery`'den doğuyor — bir olayın değil bir HÂLİN adı, sürücü takip numarası
 * olup olmadığına bakarak seçecek.
 *
 * ── `allow_category_change` GÖNDERİLMİYOR — BİLEREK ─────────────────────────
 * Meta kategoriyi kendi değiştirebiliyor. İzin verilseydi UTILITY diye gönderdiğimiz bir şablon
 * sessizce MARKETING olurdu: pencere içinde bile ücretlenir ve ayrıca açık izin ister — yani
 * arıza faturada görünürdü, ekranda değil. İzin vermeyince Meta reddediyor ve red GÖRÜNÜR bir
 * olaydır. `list` her koşuda gerçek kategoriyi basıyor, çünkü gönderdiğimiz kategori ile onaylanan
 * kategori aynı olmayabilir.
 *
 * ── VAR OLANI YENİDEN GÖNDERMEZ ─────────────────────────────────────────────
 * `submit` önce listeyi okuyup hangi (ad, dil) çiftinin eksik olduğunu hesaplıyor. Sebep tek
 * çağrıdan tasarruf değil: aynı adı ikinci kez göndermek Meta'da hata üretir ve çıktının içinde
 * gerçek arızalar bu gürültüye karışırdı. REDDEDİLEN bir şablon da "var" sayılır ve atlanır —
 * metni düzeltip yeniden göndermek için önce panelden silmek gerekiyor; script silme YAPMAZ,
 * çünkü onaylı bir şablonu yanlışlıkla silmenin bedeli geri alınamaz.
 *
 * ── ÇAĞRI HIZI (kullanıcı talimatı 06.09) ───────────────────────────────────
 * Gönderim arka arkaya on iki çağrı demek. Aralarında bekleme var (`BEKLEME_MS`) — hesabın robot
 * faaliyeti olarak işaretlenmesi, kazanılan birkaç saniyeden pahalıdır.
 */
const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
// SIRA ÖNEMLİ (öteki Meta betikleriyle aynı gerekçe): Node var olan değişkeni ezmez, ilk yükleyen
// kazanır. Sıranın başı backend'in dosyası.
for (const dosya of ['apps/backend/.env.local', 'apps/web/.env.local', '.env']) {
  try {
    load?.(dosya);
  } catch {
    // Yoksa sorun değil — değişkenler ortamdan ya da sonraki dosyadan gelir.
  }
}

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Çağrılar arası bekleme. Okuma tek çağrı olduğu için yalnız gönderimde uygulanıyor. */
const BEKLEME_MS = 3_000;

type Dil = 'fr' | 'de' | 'tr';

interface SablonDili {
  dil: Dil;
  /** Meta'ya giden gövde. `*…*` WhatsApp'ın kalın işareti, `_…_` italik — panelin B/I düğmeleri de aynısını koyuyor. */
  govde: string;
  /** İnceleme için örnek değerler — sırası `{{1}}, {{2}}, …`. Müşteriye gitmez. */
  ornekler: string[];
}

interface Sablon {
  /** Meta'daki ad: yalnız küçük harf, rakam, alt çizgi. `packages/notify` olay adıyla aynı. */
  ad: string;
  /** Hepsi UTILITY: sipariş bildirimi, pazarlama değil. */
  kategori: 'UTILITY';
  /** İnsan için tek satır — hangi anda gider. */
  ne_zaman: string;
  diller: SablonDili[];
}

/*
  METİNLER. Biçimlendirme okumayı hızlandırdığı yerde var, süs olarak değil: kalın olan üç şey de
  müşterinin GÖZÜYLE ARADIĞI değer (referans, tutar, saat aralığı/takip numarası). Değerler ayrı
  satırda, çünkü telefonda paragrafın içindeki bir numara aranarak bulunur, satır başındaki
  görülerek. Mesaj başına tek emoji ve durumun işareti: ✅ alındı · 🚚 yolda · 📦 kargoda ·
  🍽️ afiyet olsun — müşteri bildirimi açmadan sohbet listesindeki simgeden aşamayı anlıyor.
*/
const SABLONLAR: Sablon[] = [
  {
    ad: 'order_confirmed',
    kategori: 'UTILITY',
    ne_zaman: 'Sipariş kalıcı hâle geldiğinde',
    diller: [
      {
        dil: 'fr',
        ornekler: ['Ahmet', 'LA-26-7K4M2P', '48,50 €'],
        govde: `Bonjour *{{1}}*, nous avons bien reçu votre commande ✅

Référence : *{{2}}*
Montant total : *{{3}}*

Nous vous préviendrons dès qu'elle part. Merci de votre confiance.`,
      },
      {
        dil: 'de',
        ornekler: ['Ahmet', 'LA-26-7K4M2P', '48,50 €'],
        govde: `Hallo *{{1}}*, wir haben Ihre Bestellung erhalten ✅

Referenz: *{{2}}*
Gesamtbetrag: *{{3}}*

Sobald sie unterwegs ist, melden wir uns. Vielen Dank für Ihr Vertrauen.`,
      },
      {
        dil: 'tr',
        ornekler: ['Ahmet', 'LA-26-7K4M2P', '48,50 €'],
        govde: `Merhaba *{{1}}*, siparişinizi aldık ✅

Referans: *{{2}}*
Toplam tutar: *{{3}}*

Siparişiniz yola çıktığında haber vereceğiz. Teşekkür ederiz.`,
      },
    ],
  },
  {
    ad: 'order_out_for_delivery',
    kategori: 'UTILITY',
    ne_zaman: 'Yerel teslimat — kurye o gün yola çıktığında',
    diller: [
      {
        dil: 'fr',
        ornekler: ['Ahmet', 'LA-26-7K4M2P', '14:00–17:00'],
        govde: `Bonjour *{{1}}*, votre commande part aujourd'hui 🚚

Référence : *{{2}}*
Créneau de livraison : *{{3}}*

Nous vous prévenons à l'arrivée.`,
      },
      {
        dil: 'de',
        ornekler: ['Ahmet', 'LA-26-7K4M2P', '14:00–17:00'],
        govde: `Hallo *{{1}}*, Ihre Bestellung ist heute unterwegs 🚚

Referenz: *{{2}}*
Lieferfenster: *{{3}}*

Bei der Ankunft melden wir uns.`,
      },
      {
        dil: 'tr',
        ornekler: ['Ahmet', 'LA-26-7K4M2P', '14:00–17:00'],
        govde: `Merhaba *{{1}}*, siparişiniz bugün yola çıkıyor 🚚

Referans: *{{2}}*
Teslimat aralığı: *{{3}}*

Kapıya geldiğimizde haber vereceğiz.`,
      },
    ],
  },
  {
    ad: 'order_shipped',
    kategori: 'UTILITY',
    ne_zaman: 'Avrupa kargosu — gönderi taşıyıcıya devredildiğinde',
    diller: [
      {
        dil: 'fr',
        ornekler: ['Ahmet', 'LA-26-7K4M2P', '3SABCD1234567'],
        govde: `Bonjour *{{1}}*, votre commande a été remise au transporteur 📦

Référence : *{{2}}*
Numéro de suivi : *{{3}}*

Le colis vous parviendra dans les prochains jours.`,
      },
      {
        dil: 'de',
        ornekler: ['Ahmet', 'LA-26-7K4M2P', '3SABCD1234567'],
        govde: `Hallo *{{1}}*, Ihre Bestellung wurde dem Versanddienstleister übergeben 📦

Referenz: *{{2}}*
Sendungsnummer: *{{3}}*

Das Paket erreicht Sie in den nächsten Tagen.`,
      },
      {
        dil: 'tr',
        ornekler: ['Ahmet', 'LA-26-7K4M2P', '3SABCD1234567'],
        govde: `Merhaba *{{1}}*, siparişiniz kargoya verildi 📦

Referans: *{{2}}*
Takip numarası: *{{3}}*

Paketiniz önümüzdeki günlerde elinizde olacak.`,
      },
    ],
  },
  {
    ad: 'order_delivered',
    kategori: 'UTILITY',
    ne_zaman: 'Teslimat kapandığında',
    diller: [
      {
        dil: 'fr',
        ornekler: ['Ahmet', 'LA-26-7K4M2P'],
        govde: `Bonjour *{{1}}*, votre commande *{{2}}* a bien été livrée.

Bon appétit ! 🍽️

_Si quelque chose ne va pas, répondez simplement à ce message._`,
      },
      {
        dil: 'de',
        ornekler: ['Ahmet', 'LA-26-7K4M2P'],
        govde: `Hallo *{{1}}*, Ihre Bestellung *{{2}}* wurde zugestellt.

Guten Appetit! 🍽️

_Falls etwas nicht stimmt, antworten Sie einfach auf diese Nachricht._`,
      },
      {
        dil: 'tr',
        ornekler: ['Ahmet', 'LA-26-7K4M2P'],
        govde: `Merhaba *{{1}}*, *{{2}}* numaralı siparişiniz teslim edildi.

Afiyet olsun! 🍽️

_Bir sorun varsa bu mesaja yanıt vermeniz yeterli._`,
      },
    ],
  },
];

const komut = process.argv[2];
const onlyArg = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];

if (!komut || !['list', 'plan', 'submit'].includes(komut)) {
  console.error(
    'Kullanım: pnpm meta:templates <list|plan|submit> [--only=<ad>]\n' +
      '  list   : Meta\'daki şablonları ve DURUMLARINI oku (tek çağrı, hiçbir şey göndermez)\n' +
      '  plan   : ne gönderileceğini bas — ağa hiç çıkmaz\n' +
      '  submit : eksik olanları onaya gönder (var olanı atlar, aralıklı çağrı)\n' +
      `  --only : tek şablon; ${SABLONLAR.map((s) => s.ad).join(' | ')}`,
  );
  process.exit(1);
}

const wabaId = process.env.META_WABA_ID;
const token = process.env.META_ACCESS_TOKEN;

if (komut !== 'plan') {
  const eksik = [
    ['META_WABA_ID', wabaId],
    ['META_ACCESS_TOKEN', token],
  ]
    .filter(([, v]) => !String(v ?? '').trim())
    .map(([k]) => k);
  if (eksik.length > 0) {
    console.error(`Eksik anahtar: ${eksik.join(', ')}\n  apps/backend/.env.local (künye: .env.example)`);
    process.exit(1);
  }
}

const secilenler = onlyArg ? SABLONLAR.filter((s) => s.ad === onlyArg) : SABLONLAR;
if (secilenler.length === 0) {
  console.error(`Bilinmeyen şablon: ${onlyArg}\n  Geçerli: ${SABLONLAR.map((s) => s.ad).join(', ')}`);
  process.exit(1);
}

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
  const e = body.error as { message?: string; code?: number; error_user_msg?: string } | undefined;
  if (!e) return JSON.stringify(body);
  return `${e.error_user_msg ?? e.message ?? 'bilinmeyen hata'} (kod ${e.code ?? '?'})`;
}

const bekle = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface MevcutSablon {
  name: string;
  language: string;
  status: string;
  category: string;
}

/**
 * Meta'daki şablonları okur. **Tek çağrı ve hiçbir şey yazmaz** — jetonun
 * `whatsapp_business_management` izni ve WABA kimliğinin doğruluğu da bu çağrıda anlaşılır.
 */
async function mevcutlariOku(): Promise<MevcutSablon[] | null> {
  const yanit = await graph(`/${wabaId}/message_templates`, 'GET', {
    fields: 'name,language,status,category',
    limit: '100',
    access_token: token!,
  });
  if (!yanit.ok) {
    console.error(`  ✗ okunamadı: ${hataMetni(yanit.body)}`);
    const kod = (yanit.body.error as { code?: number } | undefined)?.code;
    if (kod === 100) console.error('    kod 100 = WABA kimliği yanlış ya da jeton bu hesabı görmüyor.');
    if (kod === 200 || kod === 10) console.error('    izin hatası = jetonda `whatsapp_business_management` yok.');
    return null;
  }
  return (yanit.body.data as MevcutSablon[] | undefined) ?? [];
}

function durumIsareti(status: string): string {
  if (status === 'APPROVED') return '✓';
  if (status === 'REJECTED') return '✗';
  return '·';
}

async function listele(): Promise<number> {
  const mevcut = await mevcutlariOku();
  if (!mevcut) return 1;

  if (mevcut.length === 0) {
    console.log('Meta\'da hiç şablon yok.');
    return 0;
  }

  console.log(`Meta'daki şablonlar (${mevcut.length}):\n`);
  for (const s of mevcut) {
    // Kategori BİZİM gönderdiğimiz değil, Meta'nın onayladığı olabilir — o yüzden basılıyor.
    console.log(`  ${durumIsareti(s.status)} ${s.name.padEnd(24)} ${s.language.padEnd(4)} ${s.status.padEnd(10)} ${s.category}`);
  }

  const reddedilen = mevcut.filter((s) => s.status === 'REJECTED');
  if (reddedilen.length > 0) {
    console.log(
      `\n  ${reddedilen.length} şablon REDDEDİLDİ. Sebebi WhatsApp Manager'da yazıyor; metni` +
        '\n  düzeltip yeniden göndermek için önce panelden SİLİNMESİ gerekiyor (script silmez).',
    );
  }
  const yanlisKategori = mevcut.filter((s) => s.category !== 'UTILITY');
  if (yanlisKategori.length > 0) {
    console.log(
      `\n  ⚠ ${yanlisKategori.length} şablonun kategorisi UTILITY DEĞİL: ${yanlisKategori.map((s) => `${s.name}/${s.language}=${s.category}`).join(', ')}` +
        '\n  Meta yeniden sınıflandırmış olabilir — MARKETING pencere içinde bile ücretlenir.',
    );
  }
  return 0;
}

function planBas(): number {
  console.log(`Gönderilecek: ${secilenler.length} şablon × dil = ${secilenler.reduce((t, s) => t + s.diller.length, 0)} kayıt\n`);
  for (const s of secilenler) {
    console.log(`── ${s.ad}  [${s.kategori}]`);
    console.log(`   ${s.ne_zaman}`);
    for (const d of s.diller) {
      console.log(`\n   ${d.dil} · örnekler: ${d.ornekler.join(' | ')}`);
      for (const satir of d.govde.split('\n')) console.log(`     ${satir}`);
    }
    console.log('');
  }
  return 0;
}

async function gonder(): Promise<number> {
  const mevcut = await mevcutlariOku();
  if (!mevcut) return 1;

  const varOlan = new Set(mevcut.map((s) => `${s.name}|${s.language}`));
  const gorevler = secilenler.flatMap((s) => s.diller.map((d) => ({ sablon: s, dil: d })));
  const yapilacak = gorevler.filter((g) => !varOlan.has(`${g.sablon.ad}|${g.dil.dil}`));
  const atlanan = gorevler.length - yapilacak.length;

  if (atlanan > 0) console.log(`${atlanan} kayıt Meta'da zaten var, atlanıyor.`);
  if (yapilacak.length === 0) {
    console.log('Gönderilecek yeni şablon yok.');
    return 0;
  }

  console.log(`${yapilacak.length} kayıt gönderiliyor (aralarında ${BEKLEME_MS / 1000} sn bekleme)…\n`);

  let basarili = 0;
  let dusen = 0;

  for (const [sira, gorev] of yapilacak.entries()) {
    if (sira > 0) await bekle(BEKLEME_MS);

    const bilesenler = [
      {
        type: 'BODY',
        text: gorev.dil.govde,
        // `body_text` DİZİ İÇİNDE DİZİ: dış dizi örnek kümesi, iç dizi o kümenin değerleri.
        example: { body_text: [gorev.dil.ornekler] },
      },
    ];

    const yanit = await graph(`/${wabaId}/message_templates`, 'POST', {
      name: gorev.sablon.ad,
      language: gorev.dil.dil,
      category: gorev.sablon.kategori,
      components: JSON.stringify(bilesenler),
      access_token: token!,
    });

    const etiket = `${gorev.sablon.ad}/${gorev.dil.dil}`;
    if (yanit.ok) {
      const durum = (yanit.body.status as string | undefined) ?? 'PENDING';
      console.log(`  ✓ ${etiket.padEnd(28)} ${durum}`);
      basarili += 1;
    } else {
      console.error(`  ✗ ${etiket.padEnd(28)} ${hataMetni(yanit.body)}`);
      dusen += 1;
    }
  }

  console.log(`\nGönderildi: ${basarili} · düşen: ${dusen}`);
  console.log('Onay durumu için: pnpm meta:templates list');
  return dusen > 0 ? 1 : 0;
}

const cikis =
  komut === 'plan' ? planBas() : komut === 'list' ? await listele() : await gonder();

process.exit(cikis);
