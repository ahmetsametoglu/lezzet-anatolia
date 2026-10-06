/**
 * WhatsApp gönderim duman testi — `pnpm whatsapp:smoke <phone_number_id> <alıcı> [şablon] [dil]`. Kendi gönderim zincirimizden
 * gerçekten Meta'ya çıkar ve gerçek mesaj doğurur, bu yüzden elle koşulur; konuşma `SMOKE-SEND` adıyla açılır ve `--clean` siler.
 */
const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
// Node var olan değişkeni ezmez, ilk yükleyen kazanır; anahtarlar `apps/web/.env.local`'de, kök `.env` eksikleri tamamlar.
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
