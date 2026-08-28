/**
 * WhatsApp GÖNDERİM duman testi (15.11) — `pnpm whatsapp:smoke <phone_number_id> <alıcı> [şablon] [dil]`
 *
 * Kendi gönderim zincirimizi uçtan uca koşturur: `sendOutboundMessage` (pencere/kanal kararı) →
 * `metaCloudSender` (kavram çevirisi) → `sendCloudApiMessage` (HTTP). **Bizim kodumuzdan çıkar**,
 * elle `curl` atmaz — sınanan şey sağlayıcının değil ZİNCİRİN doğruluğudur.
 *
 * ── NEDEN `meta:smoke`TAN AYRI ──────────────────────────────────────────────
 * `meta:smoke` GELEN tarafı sınar (kendi ucumuza imzalı olay atar; Meta'ya hiç çıkmaz). Bu script
 * GİDEN tarafı sınar ve gerçekten Meta'ya çıkar. İki ayrı soru: "gelen olayı doğru okuyor muyuz"
 * ile "giden mesajı doğru kurup gönderebiliyor muyuz". Birincisi jetonsuz koşar, ikincisi koşamaz.
 *
 * ── PENCERE VE ŞABLON ──────────────────────────────────────────────────────
 * Yeni konuşmada 24 saatlik servis penceresi KAPALIDIR; kapalı pencereden yalnız Meta-onaylı KALIP
 * mesaj geçer (`send.ts` bunu gönderimden ÖNCE reddeder — sağlayıcıya boşuna gitmek hem tur hem
 * para demektir). Bu yüzden varsayılan `hello_world`: Meta'nın her test numarasında hazır bulunan
 * şablonu. **Dili `en_US`** — şablon ad + dil ÇİFTİYLE aranır ve yanlış dil `132001` ("şablon
 * bulunamadı") diye döner, yani sebep bizdeyken sağlayıcı arızası gibi okunur.
 *
 * ── GERÇEK MESAJ GİDER ─────────────────────────────────────────────────────
 * Her koşu alıcının telefonunda gerçek bir WhatsApp mesajı doğurur ve (üretim numarasında) ücret
 * yazar. Otomatik test paketine BAĞLANMAZ; kurulumdan ve jeton değişiminden sonra ELLE koşulur —
 * `ai:smoke`/`stripe:smoke` ile aynı sınıf.
 *
 * ── BIRAKTIĞI İZ ───────────────────────────────────────────────────────────
 * Konuşma `SMOKE-SEND` profil adıyla açılır: gelen kutusunda gerçek müşteriyle karışmaz ve
 * `--clean` ile nokta atışı silinir. Varsayılan SİLMEZ — amacı ekranda görmek.
 */
const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
// SIRA ÖNEMLİ (öteki duman betikleriyle aynı gerekçe): Node var olan değişkeni ezmez, ilk yükleyen
// kazanır. Anahtarlar `apps/web/.env.local`'de; kök `.env` yalnız eksikleri tamamlar.
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

const [, , accountRefArg, recipientArg, templateArg, languageArg] = process.argv;
const temizle = process.argv.includes('--clean');

const accountRef = accountRefArg ?? process.env.META_TEST_PHONE_NUMBER_ID;
const recipient = recipientArg ?? process.env.META_TEST_RECIPIENT;
const templateName = templateArg && !templateArg.startsWith('--') ? templateArg : 'hello_world';
const templateLanguage = languageArg && !languageArg.startsWith('--') ? languageArg : 'en_US';

if (!accountRef || !recipient) {
  console.error(
    'Kullanım: pnpm whatsapp:smoke <phone_number_id> <alıcı E.164 (+ olmadan)> [şablon=hello_world] [dil=en_US]\n' +
      '  phone_number_id: Meta panelinde "Phone Number ID" (test numarasınınki olur)\n' +
      '  alıcı: onaylı alıcı listesindeki numara, ör. 33769331366',
  );
  process.exit(1);
}

const token = process.env.META_ACCESS_TOKEN;
if (!token?.trim()) {
  // Jeton yokluğu SESSİZ geçilmez: `messageSenderFor` bu hâlde `not_configured` döner ve script
  // "gönderilemedi" der — ama sebebi burada adıyla söylemek, panelde jeton aramaktan ucuzdur.
  console.error('META_ACCESS_TOKEN boş — gönderim yapılamaz.\n  apps/web/.env.local ya da .env içine ekleyin (künye: apps/web/.env.example).');
  process.exit(1);
}

const { serviceDb, ConversationService } = await import('@lezzet/database');
const { sendOutboundMessage, messageSenderFor } = await import('@lezzet/application');

const db = serviceDb();
const conversations = new ConversationService(db);

// Konuşmayı AÇ ya da BUL — `open_conversation` kapısı (kanal + kişi çiftinde tekil). İkinci koşu
// aynı sohbete yazar: her koşuda yeni sohbet açmak gelen kutusunu şişirirdi.
const conversation = await conversations.open({
  source: 'whatsapp',
  externalRef: recipient,
  providerAccountRef: accountRef,
  profileName: 'SMOKE-SEND',
});

if (temizle) {
  await db.from('message').delete().eq('conversation_id', conversation.id);
  await db.from('conversation').delete().eq('id', conversation.id);
  console.log(`✓ temizlendi — konuşma ${conversation.id} ve mesajları silindi`);
  process.exit(0);
}

console.log(`▸ konuşma ${conversation.id} · kanal whatsapp · hesap ${accountRef} · alıcı ${recipient}`);
console.log(`▸ şablon "${templateName}" (${templateLanguage}) — pencere kapalı olduğu için KALIP mesaj`);

const sonuc = await sendOutboundMessage(db, messageSenderFor(token), {
  conversationId: conversation.id,
  text: null,
  templateName,
  templateLanguage,
  templateCategory: 'utility',
  author: 'admin',
});

if (sonuc.status === 'sent') {
  console.log(`✓ GİTTİ — sağlayıcı mesaj kimliği: ${sonuc.providerMessageId}`);
  console.log('  Defterde: message satırı yazıldı (yön=giden). Alıcının telefonunda görünmeli.');
} else if (sonuc.status === 'refused') {
  console.log(`✗ REDDEDİLDİ (bizim kuralımız) — sebep: ${sonuc.reason}`);
  console.log('  Bu bir sağlayıcı hatası DEĞİL: gönderimden önce kendi kapımız durdurdu.');
} else {
  console.log(`✗ GÖNDERİLEMEDİ (sağlayıcı) — sebep: ${sonuc.reason} · yeniden denenebilir: ${sonuc.retryable}`);
  console.log('  Sık görülenler: 132001 şablon adı/dili eşleşmiyor · 131030 alıcı onaylı listede değil · 190 jeton geçersiz/süresi doldu.');
}

console.log(`\nSatır DURUYOR — gelen kutusunda görebilirsin. Silmek için: pnpm whatsapp:smoke ${accountRef} ${recipient} --clean`);
