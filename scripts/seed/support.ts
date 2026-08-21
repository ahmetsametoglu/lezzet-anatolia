import { ConversationService, MessageService, TicketService } from '@lezzet/database';
import { serviceWindowExpiry, statusAfterCustomerReply } from '@lezzet/domain-core';
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

// ── WhatsApp konuşma bağı: SABİT UUID'ler kaldırıldı (15.1, 08.08) ──────────────────────────────
// Burada iki uydurma kimlik duruyordu ve künyesinde "15.x'te gerçek konuşmaya işaret edecek"
// yazıyordu. O gün geldi: `ticket.conversation_id` artık gerçek bir FK (0039) ve uydurma kimlikler
// seed'i kırdı — FK'nin işi tam olarak bu, var olmayan bir bağı sessizce taşımaya izin vermemek.
//
// Konuşma artık ÜRETİMDEKİ kapıdan açılıyor (`open_conversation`, anahtar müşterinin telefonu) ve
// talebin yazışması konuşmaya da yansıtılıyor: mesajsız bir konuşma satırı, gelen kutusu ekranında
// (15.5) boş bir sohbet olarak görünürdü — içi boş kayıt üretmek seed'in işi değil.

interface Mesaj {
  sender: 'customer' | 'admin' | 'ai';
  body: string;
  /** Personelin bu cevapla talebi getirdiği durum; müşteri mesajında karar MOTORUNdur. */
  durum?: Exclude<TicketStatus, 'open'>;
  /**
   * Metnin GERÇEK dili (20.2) — serbest ISO 639 kodu, `preferred_language` enum'u DEĞİL: müşteri
   * sistemimizde olmayan bir dilde de yazabilir (aşağıda Boşnakça örnek var).
   */
  dil?: string;
  /**
   * Hazır çeviriler. **Seed'de duruyor çünkü çeviri işi API anahtarı ister** ve ön uç şeritleri
   * rozeti ("otomatik çevrildi") anahtar gelmeden çizebilmeli. Kaynak dil torbada YOKTUR —
   * `buildTranslationBag` de onu düşürür; orijinal `body`'de duruyor.
   */
  ceviri?: Record<string, string>;
}

interface Talep {
  kisi: string;
  source: 'order' | 'form' | 'whatsapp' | 'admin';
  type: 'damaged' | 'missing' | 'question' | 'other';
  subject: string;
  ilkMesaj: string;
  /** İlk mesajın dili ve çevirisi — `Mesaj.dil`/`Mesaj.ceviri` ile aynı anlam. */
  ilkMesajDil?: string;
  ilkMesajCeviri?: Record<string, string>;
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
  /** AI başlamış, insan DEVRALMIŞ (16.5). */
  devralindi?: boolean;
  /**
   * HİBRİT mod (16.08): AI'ın bekleyen taslağı — `handled_by='hybrid'` + `ai_draft_reply`.
   * Motor (16.5) yok; ekranın "Cevaba çevir / Düzenleyerek gönder" deseni ancak taslaklı bir
   * satırla görülebilir, o satırı bugün seed üretir.
   */
  hibritTaslak?: string;
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
    yazisma: [
      { sender: 'ai', body: 'Merhaba! 67000 posta kodu salı ve cuma rotasında. Sipariş vermek ister misiniz?' },
      // **SON SÖZ MÜŞTERİDE** ve bu bilinçli (kapsam denetimi 09.08): gelen kutusunun ana sinyali
      // `awaiting_reply` ve başlığı *"N cevap bekliyor"* — ikisi de "son mesajı müşteri yazdı"
      // hâlinden doğuyor. Seed'de her konuşma bizim mesajımızla bitiyordu, yani o sinyal HİÇ
      // doğmuyordu ve sayaç her zaman 0 okuyordu. Aşağıdaki konuşma (6) bizim sözümüzle bitiyor;
      // ikisi birlikte iki hâli de örnekliyor.
      { sender: 'customer', body: 'Salı için sipariş vermek istiyorum, akşam 18:00 sonrası uygun mu?' },
    ],
    ai: true,
    yas: 2,
    etiket: 'AÇIK · WhatsApp · müşteri CEVAP BEKLİYOR',
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
  // 9) HİBRİT MOD (16.08): AI taslak yazdı, operatör henüz bakmadı. Ekran taslağı kesikli çerçeveli
  //    baloncukta gösterir; "Cevaba çevir" olduğu gibi gönderir (gönderen `admin` olur, `ai` değil),
  //    "Düzenleyerek gönder" metni cevap kutusuna taşır. Son söz MÜŞTERİDE → cevap bekliyor.
  {
    kisi: 'b2cAlman',
    source: 'form',
    type: 'question',
    subject: 'Teslimat ertelemesi · Perşembe',
    ilkMesaj: 'Guten Tag, kann ich meine Lieferung von Dienstag auf Donnerstag verschieben? Ich bin dienstags nicht zu Hause.',
    hibritTaslak:
      'Merhaba! Teslimatınızı perşembe gününe alabiliriz — perşembe rotamız Neudorf tarafından geçiyor ve adresiniz güzergâhta. Saat 14:00–18:00 aralığı uygun mudur? Onaylarsanız kurye listesini güncelliyorum.',
    yas: 1,
    etiket: 'AÇIK · HİBRİT — AI taslağı onay bekliyor',
  },
  // 10) **SİSTEMDE OLMAYAN DİL, İKİ YÖNLÜ ÇEVİRİ** (20.2 · kullanıcı kararı 03.08).
  //
  //    Yazışmanın iki yönü de burada görülür ve ölçüt tam olarak budur: müşteri Boşnakça yazar,
  //    PERSONEL Türkçe okur; personel Türkçe yazar, MÜŞTERİ kendi dilinde okur. Tek yön çevirmek
  //    yazışmanın yarısını anlaşılmaz bırakırdı — sorusu okunan ama cevabı okunamayan bir talep.
  //
  //    Orijinaller `body`'de olduğu gibi durur; çeviri yanına yazılır, yerine GEÇMEZ.
  {
    kisi: 'b2cKapaliKapida',
    source: 'form',
    type: 'damaged',
    subject: 'Hasarlı geldi · Künefe',
    ilkMesaj: 'Poštovani, kutija je stigla oštećena, dva komada su se razlila. Šaljem fotografiju.',
    ilkMesajDil: 'bs',
    ilkMesajCeviri: {
      tr: 'Merhaba, kutu hasarlı geldi, iki parça dağılmış. Fotoğraf gönderiyorum.',
      fr: "Bonjour, le colis est arrivé endommagé, deux pièces se sont renversées. Je vous envoie une photo.",
      de: 'Guten Tag, die Schachtel kam beschädigt an, zwei Stücke sind ausgelaufen. Ich schicke ein Foto.',
    },
    yazisma: [
      {
        sender: 'admin',
        body: 'Merhaba, çok üzgünüm. Hasarı depo kaydıyla karşılaştırdım — haklısınız. Telafisini bir sonraki teslimatınıza ekliyorum.',
        dil: 'tr',
        // Kaynak dil (`tr`) torbada YOK: orijinal zaten Türkçe. Boşnakça da yok ve olmayacak —
        // müşteri o dilde YAZABİLİR ama site o dilde konuşmaz; okuma orijinale düşer.
        ceviri: {
          fr: "Bonjour, je suis vraiment désolé. J'ai comparé les dégâts avec le registre de l'entrepôt — vous avez raison. J'ajoute le remplacement à votre prochaine livraison.",
          de: 'Guten Tag, das tut mir sehr leid. Ich habe den Schaden mit dem Lagerbestand abgeglichen — Sie haben recht. Den Ersatz lege ich Ihrer nächsten Lieferung bei.',
        },
        durum: 'in_progress',
      },
    ],
    yas: 2,
    etiket: 'İŞLEMDE · BOŞNAKÇA müşteri + TÜRKÇE personel · İKİ YÖN ÇEVRİLİ',
  },
];

/**
 * Hazır çevirileri mesaj satırlarına damgalar (20.2).
 *
 * **Neden seed'de:** çeviri işi API anahtarı ister; anahtarsız bir kurulumda hiçbir satırda çeviri
 * olmaz ve ön uç şeritleri rozeti ("otomatik çevrildi") ile "orijinali göster" bağını ÇİZEMEZ.
 * Ürün yorumlarında da aynı sebeple aynı şey yapıldı.
 *
 * Eşleşme METİNLE yapılır, sırayla değil: fotoğraf mesajı araya girdiğinde indis kayardı ve kayma
 * hiçbir yerde hata vermez — yalnız yanlış mesaj yanlış dille işaretlenirdi.
 */
async function ceviriDamgala(db: Db, ticketId: string, t: Talep): Promise<void> {
  const damgalar = [
    { body: t.ilkMesaj, dil: t.ilkMesajDil, ceviri: t.ilkMesajCeviri },
    ...(t.yazisma ?? []).map((m) => ({ body: m.body, dil: m.dil, ceviri: m.ceviri })),
  ].filter((d) => d.dil);

  for (const d of damgalar) {
    const { error } = await db
      .from('ticket_message')
      .update({ language: d.dil, translations: d.ceviri ?? null, translated_at: an(0) })
      .eq('ticket_id', ticketId)
      .eq('body', d.body);
    if (error) throw error;
  }
}

/**
 * WhatsApp kaynaklı talebin ARKASINDAKİ konuşma (15.1) — üretimdeki kapıdan.
 *
 * Anahtar müşterinin telefonudur (`open_conversation`, tekillik `(source, external_ref)`), çünkü
 * üretimde de öyle: gelen mesaj numaradan tanınır. Seed'in kendi kimliğini uydurması, tam da FK'nin
 * yasakladığı şeydi.
 *
 * **Yazışma konuşmaya da yansıtılıyor** ve yön çevirisi burada olur: talepte "kim yazdı"
 * (müşteri/personel/AI) sorulur, konuşmada "hangi tarafa aktı" — AI da personel de aynı numaradan
 * çıkar, yani ikisi de `outbound`'dur.
 *
 * **Pencere GEÇMİŞE göre hesaplanıyor** (`serviceWindowExpiry(alindi)`): talep 2 günlükse pencere
 * çoktan kapanmıştır ve seed bunu olduğu gibi göstermeli. "Şimdi"den hesaplayıp her seed konuşmasını
 * açık göstermek, ekranı gerçekte olmayan bir ücretsiz aralıkla kandırırdı.
 *
 * Telefonu olmayan müşteride konuşma kurulamaz ve `null` döner — talep de `whatsapp` kaynağını
 * taşıyamayacağı için (DB kısıtı) çağıran o talebi atlar.
 */
async function waKonusmaKur(db: Db, customerId: string, t: Talep): Promise<string | null> {
  const { data, error } = await db.from('user_profiles').select('phone').eq('id', customerId).single();
  if (error) throw error;
  const phone = (data as { phone: string | null } | null)?.phone;
  if (!phone) return null;

  const konusma = await new ConversationService(db).open({ source: 'whatsapp', externalRef: phone, customerId });
  const messages = new MessageService(db);
  const alindi = an(-t.yas);

  const kayitlar: string[] = [];
  kayitlar.push(
    (
      await messages.record({
        conversationId: konusma.id,
        direction: 'inbound',
        body: { text: t.ilkMesaj },
        windowExpiresAt: serviceWindowExpiry(alindi),
      })
    ).id,
  );
  for (const m of t.yazisma ?? []) {
    const gelen = m.sender === 'customer';
    kayitlar.push(
      (
        await messages.record({
          conversationId: konusma.id,
          direction: gelen ? 'inbound' : 'outbound',
          // Kim yazdı (16.08): AI da personel de aynı numaradan çıkar, defter farkı yazar —
          // ekran AI baloncuğunu bu alandan ayrı tonda gösterir.
          author: m.sender,
          body: { text: m.body },
          // Pencereyi yalnız gelen mesaj açar; giden mesaj ona dokunmaz.
          windowExpiresAt: gelen ? serviceWindowExpiry(alindi) : null,
        })
      ).id,
    );
  }

  // ── YAŞLANDIRMA: her mesaja AYRI damga ────────────────────────────────────────
  // `record_message` damgayı `now()` atıyor (üretimde doğru). Seed'de sohbetin talebiyle aynı yaşta
  // görünmesi gerekiyor — yoksa gelen kutusu, günler önceki bir konuşmayı en üste koyar.
  //
  // **Önce TEK `update` ile hepsine aynı damga yazılıyordu ve bu iki şeyi birden bozuyordu**
  // (ölçüldü 09.08, operasyon şeridinin sayfalama talebi üzerine): *(1)* sohbet bir ZAMAN DİZİSİDİR
  // ve aynı anda gönderilmiş beş mesaj gerçekte olmaz — ekran "önce/sonra" ayrımını gösteremez;
  // *(2)* `created_at` üzerinde keyset sayfalama tam olarak eşit anahtarlarda sınanamaz hâle gelir,
  // yani `listPage` ile `listRecent`'in YÖN farkı veriyle doğrulanamaz (denendi: iki okuma da aynı
  // satırları aynı sırada döndürdü — sıralama değil, verinin ayırt edilemezliği).
  //
  // Aralık dakikadır: bir konuşma dakikalar içinde akar, ve `an()` saniye taşıdığı için damgalar
  // ayrık kalır. Son mesaj `alindi` anına denk gelir — gelen kutusu sıralaması değişmez.
  const araliklar = kayitlar.length;
  for (const [n, id] of kayitlar.entries()) {
    const damga = new Date(new Date(alindi).getTime() - (araliklar - 1 - n) * 60_000).toISOString();
    const { error } = await db.from('message').update({ created_at: damga }).eq('id', id);
    if (error) throw error;
  }
  const { error: cErr } = await db.from('conversation').update({ last_message_at: alindi }).eq('id', konusma.id);
  if (cErr) throw cErr;

  return konusma.id;
}

export async function seedTickets(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'ticket')) {
    console.log('▸ talepler zaten dolu — atlandı');
    return;
  }
  console.log('▸ TALEP / ŞİKÂYET seed');
  const tickets = new TicketService(db);
  const admin = kisiler.get('yonetici') ?? null;

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

    // WhatsApp kaynağı KONUŞMA ZORUNLU kılar (DB kısıtı `ticket_source_link` + FK 0039).
    // Numarası olmayan müşteride konuşma kurulamaz; talep de kurulamaz — sessizce yanlış kaynakla
    // yazmak yerine atlanır, çünkü `form` yazmak talebin nereden geldiği hakkında yalan olurdu.
    let conversationId: string | null = null;
    if (t.source === 'whatsapp') {
      conversationId = await waKonusmaKur(db, customerId, t);
      if (!conversationId) {
        console.log(`  · ${t.subject} atlandı (müşterinin telefonu yok — WhatsApp konuşması kurulamaz)`);
        continue;
      }
    }

    const ticket = await tickets.createWithMessage({
      customerId,
      source: t.source,
      type: t.type,
      body: t.ilkMesaj,
      subject: t.subject,
      orderId: siparis?.id ?? null,
      orderItemIds: kalemIdleri,
      conversationId,
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
    // (`takeOver`): önce AI'a verilir, sonra insan alır.
    if (t.ai || t.devralindi) await tickets.update({ id: ticket.id, handledBy: 'ai' });
    if (t.devralindi) await tickets.takeOver(ticket.id);
    // AI özerk yürütüyorsa ARKASINDAKİ sohbet de AI'dadır — iki ekran aynı gerçeği okumalı.
    if (t.ai && !t.devralindi && conversationId) await new ConversationService(db).setMode(conversationId, 'ai');
    // Hibrit (16.08): taslak satırda bekler, damgası önbellek anahtarıdır (mesajdan sonra üretildi).
    if (t.hibritTaslak) {
      await tickets.update({ id: ticket.id, handledBy: 'hybrid', aiDraftReply: t.hibritTaslak, aiDraftGeneratedAt: an(0) });
    }
    if (t.iadeTetiklendi) await tickets.markReturnTriggered(ticket.id);

    await ceviriDamgala(db, ticket.id, t);

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
  // ── HİBRİT SOHBET (16.08): taslak deseni WhatsApp ekranında da görülsün ─────
  // Talepsiz bir konuşma — müşteri sipariş niyeti yazdı, AI taslak hazırladı, operatör henüz
  // bakmadı. Gönderim kanalı olmadığı için ekrandaki tek çıkış taslağı defter kutusuna taşımaktır;
  // o desen ancak taslaklı bir konuşma satırıyla denenebilir. Telefonu olmayan müşteride kurulamaz
  // ve atlanır (`waKonusmaKur` sözleşmesi).
  const hibritKisi = kisiler.get('b2bOnayli');
  if (hibritKisi) {
    const sohbet: Talep = {
      kisi: 'b2bOnayli',
      source: 'whatsapp',
      type: 'question',
      subject: 'WhatsApp · sipariş niyeti',
      ilkMesaj: 'Merhaba, cumartesi için 2 tepsi su böreği ve 1 kg fıstıklı baklava alabilir miyiz? Restorana teslim olacak.',
      yas: 0,
      etiket: 'HİBRİT sohbet · AI taslağı bekliyor',
    };
    const konusmaId = await waKonusmaKur(db, hibritKisi, sohbet);
    if (konusmaId) {
      await new ConversationService(db).update({
        id: konusmaId,
        handledBy: 'hybrid',
        aiDraftReply:
          'Merhaba! Cumartesi için 2 tepsi su böreği + 1 kg fıstıklı baklava ayırıyoruz. Restoran teslimatı 10:00–12:00 aralığında uygun mudur? Onaylarsanız siparişi kayda alıyorum.',
        aiDraftGeneratedAt: an(0),
      });
      console.log(`  ✓ ${sohbet.subject} · ${sohbet.etiket}`);
    } else {
      console.log(`  · ${sohbet.subject} atlandı (müşterinin telefonu yok)`);
    }
  }

  // ── SOSYAL KANALLAR (15.15): Messenger + Instagram konuşmaları ──────────────
  // Üretimde bu satırları YALNIZ webhook doğurur (PSID/IGSID operatörce bilinemez, elle işleme
  // kapısı whatsapp'a kilitli) — seed webhook'un yazacağı şekli yazar: kimliksiz konuşma
  // (customer_id NULL, Messenger/IG'de VARSAYILAN hâl), profil adı başlık olarak, dış anahtar opak.
  // İkisi bilinçli iki ayrı hâlde: Messenger sohbeti müşterinin sorusuyla bitiyor (cevap bekliyor
  // sayacı kanal süzgeciyle sınanabilsin), Instagram sohbeti bizim cevabımızla.
  await sosyalKonusmaKur(db, {
    source: 'messenger',
    externalRef: `24${String(Date.now()).slice(-13)}01`,
    profileName: 'Emre Yildirim',
    yas: 1,
    mesajlar: [
      { sender: 'customer', body: 'Selam, Facebook sayfanızdan gördüm — Strasbourg dışına da gönderiyor musunuz?' },
      { sender: 'admin', body: 'Merhaba! Evet, Fransa geneline kargoyla gönderiyoruz; soğuk zincir ürünlerde bölgeye göre değişiyor.' },
      { sender: 'customer', body: 'Süper. Fıstıklı baklava Lyon’a kaç günde gelir?' },
    ],
  });
  await sosyalKonusmaKur(db, {
    source: 'instagram',
    externalRef: `178414${String(Date.now()).slice(-11)}`,
    profileName: 'aylin.gurme',
    yas: 3,
    mesajlar: [
      { sender: 'customer', body: 'Merhaba, hikayedeki künefe tepsisi hâlâ var mı? 🙌' },
      { sender: 'admin', body: 'Merhaba! Var — bu hafta cuma fırınından çıkıyor; DM’den adres alırsak cuma teslim ederiz.' },
    ],
  });

  console.log(`✓ talep: ${sayi} kayıt (3 durum · 4 kaynak · AI + devralma + HİBRİT taslak · iade tetikli · fotoğraflı · iki yönlü çevrili · messenger + instagram sohbeti)`);
}

/**
 * Webhook'un yazacağı şekli yazan sosyal konuşma (15.15) — Messenger/Instagram.
 *
 * `waKonusmaKur`dan ayrı, çünkü sözleşmesi farklı: orada anahtar müşterinin TELEFONU ve konuşma
 * kimlikli doğar; burada anahtar opak PSID/IGSID ve konuşma KİMLİKSİZ doğar — Messenger/IG'de
 * kimlik ancak müşteri kendini tanıtınca kurulur (bağlama 15.16). Yaşlandırma deseni aynı
 * (mesajlara dakika arayla ayrı damga; gerekçe `waKonusmaKur`da).
 */
async function sosyalKonusmaKur(
  db: Db,
  k: {
    source: 'messenger' | 'instagram';
    externalRef: string;
    profileName: string;
    /** Son mesajın yaşı (gün) — kuyruk sıralaması ancak farklı tarihlerle görünür. */
    yas: number;
    mesajlar: { sender: 'customer' | 'admin'; body: string }[];
  },
): Promise<void> {
  const konusma = await new ConversationService(db).open({
    source: k.source,
    externalRef: k.externalRef,
    profileName: k.profileName,
  });
  const messages = new MessageService(db);
  const son = an(-k.yas);

  const kayitlar: string[] = [];
  for (const m of k.mesajlar) {
    const gelen = m.sender === 'customer';
    kayitlar.push(
      (
        await messages.record({
          conversationId: konusma.id,
          direction: gelen ? 'inbound' : 'outbound',
          author: m.sender,
          body: { text: m.body },
          // Pencereyi yalnız gelen mesaj açar — kural kanal-nötr (üç kanalda da 24 saat).
          windowExpiresAt: gelen ? serviceWindowExpiry(son) : null,
        })
      ).id,
    );
  }

  for (const [n, id] of kayitlar.entries()) {
    const damga = new Date(new Date(son).getTime() - (kayitlar.length - 1 - n) * 60_000).toISOString();
    const { error } = await db.from('message').update({ created_at: damga }).eq('id', id);
    if (error) throw error;
  }
  const { error: cErr } = await db.from('conversation').update({ last_message_at: son }).eq('id', konusma.id);
  if (cErr) throw cErr;

  console.log(`  ✓ ${k.source} sohbeti · ${k.profileName}`);
}
