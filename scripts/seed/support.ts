import { TicketService } from '@lezzet/database';
import { statusAfterCustomerReply } from '@lezzet/domain-core';
import type { TicketStatus } from '@lezzet/types';
import { an, r2Keys, tabloDolu, uploadImage, type Db, type Kisiler } from './shared';

// ── Talep / şikâyet (0035 · modül 16) ────────────────────────────────────────────────────────────
// Kuyruk ekranının okuduğu şey durum DEĞİL, "top kimde"dir (`ticket_queue.awaiting_reply`): son sözü
// müşteri söylediyse cevap bekliyoruz. Bu yüzden seed talepleri sonunda KİMİN yazdığına göre kurar —
// hepsini personel cevabıyla bitirmek kuyruğu sürekli boş gösterirdi.
//
// Talep açılışı ve her cevap tek kapıdan geçer (`createWithMessage` / `reply` → RPC): talep ile ilk
// mesaj, cevap ile durum değişimi aynı turda doğar. Seed de o kapıyı kullanır — mesajı tabloya
// doğrudan yazmak, üretimde imkânsız olan yarım bir talebi seed'de mümkün kılardı.
//
// DURUM KARARI MOTORUNDUR: müşteri kapanmış talebe yazınca ne olacağını `statusAfterCustomerReply`
// söyler. Seed "burada yeniden açılsın" diye kendi kuralını yazmaz, sorar.

/** WhatsApp konuşma bağı — 15.x'te gerçek konuşmaya işaret edecek; zeminde sabit ve deterministik. */
const WA_CONVERSATION = {
  ai: '5eed0000-0000-4000-8000-000000000001',
  devralinan: '5eed0000-0000-4000-8000-000000000002',
} as const;

interface Mesaj {
  sender: 'customer' | 'admin' | 'ai';
  body: string;
  /** Personelin bu cevapla talebi getirdiği durum; müşteri mesajında karar MOTORUNdur. */
  durum?: Exclude<TicketStatus, 'open'>;
}

interface Talep {
  kisi: string;
  source: 'order' | 'form' | 'whatsapp' | 'admin';
  type: 'damaged' | 'missing' | 'question' | 'other';
  subject: string;
  ilkMesaj: string;
  /** Siparişe bağlansın mı — `order` kaynağı zorunlu kılar (DB kısıtı). */
  siparisli?: boolean;
  /** Kaç kalem işaretlensin (siparişli talepte). */
  kalemAdedi?: number;
  yazisma?: Mesaj[];
  /** Yazışmasız talebin varacağı durum. */
  hedefDurum?: Exclude<TicketStatus, 'open'>;
  /** Talep iade akışını başlattı mı (tutar buradan okunmaz — siparişten türer). */
  iadeTetiklendi?: boolean;
  /** AI ilgileniyor (`handled_by='ai'`); WhatsApp zemininde anlamlı. */
  ai?: boolean;
  /** AI başlamış, insan DEVRALMIŞ (16.5) — tek yönlü geçiş. */
  devralindi?: boolean;
  conversationId?: string;
  /** Müşteri fotoğraf ekledi mi — R2 ayarsızsa sessizce eksiz kalır. */
  fotograf?: string;
  yas: number;
  etiket: string;
}

const TALEPLER: Talep[] = [
  // 1) Kuyruğun tepesi: MÜŞTERİ SON SÖZÜ SÖYLEDİ, fotoğraf ekli, henüz kimse dokunmadı.
  {
    kisi: 'b2cSadik',
    source: 'order',
    type: 'damaged',
    subject: 'Hasarlı geldi · Baklava',
    ilkMesaj:
      "Bonjour, la boîte de baklava est arrivée écrasée, une partie est en miettes. C'est la première fois que ça arrive, d'habitude tout est parfait.",
    siparisli: true,
    kalemAdedi: 1,
    fotograf: '2.jpeg',
    yas: 1,
    etiket: 'AÇIK · cevap bekliyor · FOTOĞRAFLI',
  },
  // 2) İşlemde + İADE TETİKLENMİŞ: talep iadeyi başlatır, sonuçlandırmaz — tutar siparişten türer.
  //    Son sözü personel söyledi → kuyrukta "cevap bekleyen" değil.
  {
    kisi: 'b2bOnayli',
    source: 'order',
    type: 'missing',
    subject: 'Eksik geldi · 2 kalem',
    ilkMesaj: 'Merhaba, bu haftaki sevkiyatta iki kalem eksik geldi. İrsaliyede yazıyor ama kutudan çıkmadı.',
    siparisli: true,
    kalemAdedi: 2,
    yazisma: [
      { sender: 'admin', body: 'Merhaba, kontrol ettik — depoda kalan iki kalem sizin siparişinizden. İade kaydını açtım, bir sonraki teslimatta telafi edeceğiz.', durum: 'in_progress' },
      { sender: 'customer', body: 'Teşekkürler, perşembe rotasında beklerim.' },
      { sender: 'admin', body: 'Not düştük, perşembe kuryesine ekledik.' },
    ],
    iadeTetiklendi: true,
    yas: 5,
    etiket: 'İŞLEMDE · iade tetiklendi',
  },
  // 3) ÇÖZÜLDÜ + SİPARİŞSİZ: genel soru. `resolved_at` damgası dolu (DB kısıtı ikisini bağlar).
  {
    kisi: 'b2cAlman',
    source: 'form',
    type: 'question',
    subject: 'Alerjen sorusu · fındık',
    ilkMesaj: 'Guten Tag, enthalten Ihre Böreks Haselnuss? Mein Sohn hat eine Allergie.',
    yazisma: [
      { sender: 'admin', body: 'Guten Tag, unsere Böreks enthalten keine Haselnuss. Die vollständige Zutatenliste finden Sie auf jeder Produktseite. Schöne Grüße!', durum: 'resolved' },
    ],
    yas: 20,
    etiket: 'ÇÖZÜLDÜ · siparişsiz (genel soru)',
  },
  // 4) YENİDEN AÇILMIŞ: çözülmüş talebe müşteri yazdı → motor kendiliğinden `open`'a döndürür ve
  //    `resolved_at` null'a döner. "Ne zaman çözüldü" sorusunun cevabı açık bir talepte olamaz.
  {
    kisi: 'b2cKapaliKapida',
    source: 'form',
    type: 'other',
    subject: 'Fatura talebi',
    ilkMesaj: "Bonjour, pourriez-vous m'envoyer la facture de ma dernière commande ?",
    yazisma: [
      { sender: 'admin', body: "Bonjour, la facture vous a été envoyée par e-mail à l'instant.", durum: 'resolved' },
      { sender: 'customer', body: "Je ne l'ai pas reçue, pouvez-vous vérifier l'adresse ? C'est peut-être l'ancienne." },
    ],
    yas: 8,
    etiket: 'YENİDEN AÇILDI · çözülmüşken müşteri yazdı',
  },
  // 5) WhatsApp + AI ilgileniyor: kaynak ekseni kanaldan bağımsızdır; `conversation_id` zorunludur.
  {
    kisi: 'b2bBekleyen',
    source: 'whatsapp',
    type: 'question',
    subject: 'Teslimat günü · Krutenau',
    ilkMesaj: 'Merhaba, Krutenau bölgesine hangi günler geliyorsunuz?',
    yazisma: [{ sender: 'ai', body: 'Merhaba! 67000 posta kodu salı ve cuma rotasında. Sipariş vermek ister misiniz?' }],
    ai: true,
    conversationId: WA_CONVERSATION.ai,
    yas: 2,
    etiket: 'AÇIK · WhatsApp · AI yanıtladı',
  },
  // 6) AI'DAN DEVRALINMIŞ (16.5): AI başladı, konu karışınca insan aldı. Geçiş TEK YÖNLÜ — geri
  //    vermek, müşterinin konuştuğu muhatabın habersiz değişmesi olurdu.
  {
    kisi: 'b2cSadik',
    source: 'whatsapp',
    type: 'missing',
    subject: 'WhatsApp · eksik kalem',
    ilkMesaj: 'Selam, dün gelen siparişte künefe yoktu ama faturada yazıyor.',
    yazisma: [
      { sender: 'ai', body: 'Merhaba, siparişinizi kontrol ediyorum…' },
      { sender: 'admin', body: 'Merhaba, ben Deniz — konuyu ben devraldım. Depo kaydına baktım, haklısınız. Telafisini bu haftaki teslimata ekliyorum.', durum: 'in_progress' },
    ],
    devralindi: true,
    conversationId: WA_CONVERSATION.devralinan,
    yas: 6,
    etiket: 'İŞLEMDE · WhatsApp · AI→insan DEVRALDI',
  },
  // 7) PERSONELİN ELLE AÇTIĞI talep: telefonda konuşulan şikâyet kayda geçer. İlk sözü personel
  //    söyler (`sender=admin`, `author_id` dolu) — müşteri değil.
  {
    kisi: 'b2bAlman',
    source: 'admin',
    type: 'damaged',
    subject: 'Telefonla bildirilen hasar',
    ilkMesaj: 'Müşteri telefonla aradı: kargo kutusunun köşesi ezilmiş, iki kutu künefe dökülmüş. Fotoğraf gönderecek.',
    siparisli: true,
    kalemAdedi: 1,
    hedefDurum: 'in_progress',
    yas: 3,
    etiket: 'İŞLEMDE · personel açtı (telefon)',
  },
  // 8) UZUN YAZIŞMA: kuyruk satırındaki mesaj sayacı ve önizleme ancak kalabalık bir talepte anlam
  //    kazanır. Sonu MÜŞTERİDE bitiyor → cevap bekleyenler listesinde görünür.
  {
    kisi: 'b2cSadik',
    source: 'form',
    type: 'other',
    subject: 'Teslimat saati değişikliği',
    ilkMesaj: 'Bonjour, je ne serai pas chez moi jeudi après-midi. Est-il possible de livrer le matin ?',
    yazisma: [
      { sender: 'admin', body: 'Bonjour, le matin la tournée est du côté de Schiltigheim. On peut essayer vers 11h.', durum: 'in_progress' },
      { sender: 'customer', body: '11h me convient parfaitement, merci !' },
      { sender: 'admin', body: "C'est noté pour le livreur." },
      { sender: 'customer', body: 'Petite question : puis-je ajouter un produit à cette commande ou faut-il en passer une nouvelle ?' },
    ],
    yas: 4,
    etiket: 'AÇIK · 5 mesajlık yazışma · cevap bekliyor',
  },
];

export async function seedTickets(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'ticket')) {
    console.log('▸ talepler zaten dolu — atlandı');
    return;
  }
  console.log('▸ TALEP / ŞİKÂYET seed');
  const tickets = new TicketService(db);
  const admin = kisiler.get('devAdmin') ?? null;

  // Siparişe bağlanacak talepler için: müşterinin en yeni siparişi + kalemleri.
  const { data: siparisData, error } = await db
    .from('order')
    .select('id,customer_id,created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const siparisler = (siparisData ?? []) as Array<{ id: string; customer_id: string }>;

  let sayi = 0;
  for (const t of TALEPLER) {
    const customerId = kisiler.get(t.kisi);
    if (!customerId) continue;

    const siparis = t.siparisli ? siparisler.find((o) => o.customer_id === customerId) : undefined;
    if (t.siparisli && !siparis) {
      // Kaynak `order` sipariş ZORUNLU kılar (DB kısıtı); siparişsiz kurulamaz.
      console.log(`  · ${t.subject} atlandı (müşterinin siparişi yok)`);
      continue;
    }
    let kalemIdleri: string[] = [];
    if (siparis && t.kalemAdedi) {
      const { data: kalemler } = await db.from('order_item').select('id').eq('order_id', siparis.id).order('id');
      kalemIdleri = ((kalemler ?? []) as Array<{ id: string }>).slice(0, t.kalemAdedi).map((k) => k.id);
    }

    const ticket = await tickets.createWithMessage({
      customerId,
      source: t.source,
      type: t.type,
      body: t.ilkMesaj,
      subject: t.subject,
      orderId: siparis?.id ?? null,
      orderItemIds: kalemIdleri,
      conversationId: t.conversationId ?? null,
      sender: t.source === 'admin' ? 'admin' : 'customer',
      authorId: t.source === 'admin' ? admin : null,
    });

    let durum: TicketStatus = 'open';
    for (const m of t.yazisma ?? []) {
      // Müşteri cevabında kararı MOTOR verir (kapanmış talebi yeniden açar); personel cevabında
      // hedef tanımda yazılıdır. İkisi ayrı sorulardır, o yüzden ayrı kaynaklardan gelir.
      const yeniDurum: TicketStatus | null = m.sender === 'customer' ? statusAfterCustomerReply(durum) : (m.durum ?? null);
      await tickets.reply({
        ticketId: ticket.id,
        sender: m.sender,
        body: m.body,
        authorId: m.sender === 'admin' ? admin : null,
        newStatus: yeniDurum,
      });
      if (yeniDurum) durum = yeniDurum;
    }

    // Yazışmasız ama durumu ilerlemiş talep (personelin açtığı).
    if (durum === 'open' && t.hedefDurum) await tickets.setStatus(ticket.id, t.hedefDurum);

    // AI ilgileniyor → `handled_by='ai'`. Devralma AYRI bir olaydır ve kendi kapısı vardır
    // (`takeOver`, tek yönlü): önce AI'a verilir, sonra insan alır — sıra tersine çevrilemez.
    if (t.ai || t.devralindi) await tickets.update({ id: ticket.id, handledBy: 'ai' });
    if (t.devralindi) await tickets.takeOver(ticket.id);
    if (t.iadeTetiklendi) await tickets.markReturnTriggered(ticket.id);

    // Fotoğraf: GERÇEK dosya yüklenir (R2 varsa) — ek görüntüleyicisi ancak açılabilen bir anahtarla
    // denenebilir. R2 ayarsızsa `uploadImage` null döner ve talep eksiz kalır (graceful).
    if (t.fotograf) {
      const key = await uploadImage(t.fotograf, r2Keys.ticketAttachment(ticket.id, 'seed-photo', t.fotograf));
      if (key) {
        await tickets.reply({ ticketId: ticket.id, sender: 'customer', body: 'Photo du colis :', attachments: [key], newStatus: null });
      }
    }

    // Yaşlandırma: kuyruk sıralaması ("en eski bekleyen önce") ancak farklı tarihli taleplerle görünür.
    const { error: err } = await db.from('ticket').update({ created_at: an(-t.yas) }).eq('id', ticket.id);
    if (err) throw err;
    sayi += 1;
    console.log(`  ✓ ${t.subject} · ${t.etiket}`);
  }
  console.log(`✓ talep: ${sayi} kayıt (3 durum · 4 kaynak · AI + devralma · iade tetikli · fotoğraflı)`);
}
