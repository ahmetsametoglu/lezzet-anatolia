import { ConversationService, MessageService } from '@lezzet/database';
import { serviceWindowExpiry } from '@lezzet/domain-core';
import { an, tabloDolu, type Db } from './shared';

/*
  ── KONUŞMA + MESAJ (modül 15) ─────────────────────────────────────────────────────────────────

  ── NİÇİN AYRI DOSYA (kullanıcı bulgusu 01.09) ─────────────────────────────────────────────────
  Bu seed eskiden `seed/support.ts`in içindeydi: WhatsApp konuşması TALEBİN arkasında açılıyor,
  mesajlar talebin yazışmasından türetiliyordu. Talep siparişe bağlı olduğu için o dosya, besleme
  siparişleri bıraktığında bütün olarak silindi — ve konuşmalar da onunla gitti.

  **Bu bir aşırı sökmeydi.** Konuşma bir SİPARİŞ KAYDI DEĞİLDİR: müşteri WhatsApp'tan yazar, henüz
  hiçbir şey sipariş etmemiş olabilir; gelen kutusu ekranı da siparişten değil KONUŞMADAN doğar.
  Kapsam denetimi bunu dört boş kovayla söyledi (`giden mesaj` · `gelen mesaj` · `cevap bekleyen` ·
  `mesajları ayrık damgalı`) ve haklıydı.

  Konuşmalar artık KENDİ fikstürlerinden doğuyor, bir talebin yan ürünü olarak değil.

  ── ÜRETİMDEKİ KAPIDAN ─────────────────────────────────────────────────────────────────────────
  Anahtar müşterinin telefonudur (`open_conversation`, tekillik `(source, external_ref)`) çünkü
  üretimde de öyle: gelen mesaj numaradan tanınır. Mesajlar `record_message` ile yazılır — tabloya
  doğrudan yazmak, üretimde imkânsız olan hâlleri seed'de mümkün kılardı.

  ── "TOP KİMDE" KUYRUĞU ────────────────────────────────────────────────────────────────────────
  Gelen kutusunun okuduğu şey `awaiting_reply`: son sözü müşteri söylediyse cevap bekliyoruz.
  Fikstürler bu yüzden sonunda KİMİN yazdığına göre kurulu — hepsini personel cevabıyla bitirmek
  kuyruğu her koşuda boş gösterirdi.

  ── PENCERE GEÇMİŞE GÖRE ───────────────────────────────────────────────────────────────────────
  `serviceWindowExpiry(alindi)` sohbetin KENDİ yaşından hesaplanır. "Şimdi"den hesaplayıp her
  konuşmayı açık göstermek, ekranı gerçekte olmayan bir ücretsiz aralıkla kandırırdı.
*/

interface Sohbet {
  /** Kaç gün önce başladı — damgalar ve servis penceresi buradan türer. */
  yas: number;
  /** Sırayla akan yazışma; `gelen` müşteriden, değilse işletmeden. */
  akis: Array<{ gelen: boolean; metin: string; yazan?: 'customer' | 'admin' | 'ai' }>;
}

/*
  Üçü de ayrı bir ekran hâli:
  · SON SÖZ MÜŞTERİDE → gelen kutusunda "cevap bekliyor" (kuyruğun kırmızı satırı)
  · SON SÖZ İŞLETMEDE → cevaplanmış sohbet; kuyrukta görünmez ama geçmişte durur
  · AI cevaplı → baloncuk ayrı tonda çizilir (`author` alanı), pencere yine müşteriden açılır
*/
const SOHBETLER: readonly Sohbet[] = [
  {
    yas: 1,
    akis: [
      { gelen: true, metin: 'Merhaba, sipariş verebilir miyim? Perşembe teslim olur mu?' },
      { gelen: false, metin: 'Merhaba! Perşembe rotamız var, akşam 18:00 gibi kapınızdayız.', yazan: 'admin' },
      { gelen: true, metin: 'Süper, akşam yazarım listeyi.' },
    ],
  },
  {
    yas: 3,
    akis: [
      { gelen: true, metin: 'Baklava kaç kişilik geliyor?' },
      { gelen: false, metin: '1 kg tepsi yaklaşık 8-10 kişiliktir.', yazan: 'ai' },
      { gelen: false, metin: 'Dilerseniz yarım tepsi de hazırlayabiliriz.', yazan: 'admin' },
    ],
  },
];

export async function seedConversations(db: Db): Promise<void> {
  if (await tabloDolu(db, 'conversation')) {
    console.log('▸ konuşmalar zaten dolu — atlandı');
    return;
  }
  console.log('▸ KONUŞMA seed');

  const conversations = new ConversationService(db);
  const messages = new MessageService(db);

  /* Telefonu OLAN müşteri şart: `open_conversation`ın anahtarı numaradır ve numarasız bir
     müşteride sohbet kurulamaz (üretimde de kurulamaz). */
  const { data, error } = await db.from('user_profiles').select('id,phone').not('phone', 'is', null).limit(SOHBETLER.length);
  if (error) throw error;
  const adaylar = (data ?? []) as Array<{ id: string; phone: string }>;
  if (adaylar.length === 0) {
    console.log('  ⚠ telefonu olan müşteri yok — konuşma kurulmadı');
    return;
  }

  let sayac = 0;
  for (const [i, sohbet] of SOHBETLER.entries()) {
    const musteri = adaylar[i % adaylar.length]!;
    const konusma = await conversations.open({ source: 'whatsapp', externalRef: musteri.phone, customerId: musteri.id });
    const alindi = an(-sohbet.yas);

    const kayitlar: string[] = [];
    for (const m of sohbet.akis) {
      const kayit = await messages.record({
        conversationId: konusma.id,
        direction: m.gelen ? 'inbound' : 'outbound',
        // Kim yazdı: AI da personel de aynı numaradan çıkar, defter farkı yazar — ekran AI
        // baloncuğunu bu alandan ayrı tonda gösterir.
        author: m.yazan ?? (m.gelen ? 'customer' : 'admin'),
        body: { text: m.metin },
        // Pencereyi yalnız GELEN mesaj açar; giden mesaj ona dokunmaz.
        windowExpiresAt: m.gelen ? serviceWindowExpiry(alindi) : null,
      });
      kayitlar.push(kayit.id);
    }

    /*
      ── YAŞLANDIRMA: her mesaja AYRI damga ────────────────────────────────────
      `record_message` damgayı `now()` atıyor (üretimde doğru). Seed'de sohbetin kendi yaşında
      görünmesi gerekiyor — yoksa gelen kutusu günler önceki bir konuşmayı en üste koyar.

      **Önce TEK `update` ile hepsine aynı damga yazılıyordu ve iki şeyi birden bozuyordu**
      (ölçüldü 09.08): *(1)* sohbet bir ZAMAN DİZİSİDİR, aynı anda gönderilmiş üç mesaj gerçekte
      olmaz — ekran "önce/sonra" ayrımını gösteremez; *(2)* `created_at` üzerindeki keyset
      sayfalama tam olarak eşit anahtarlarda sınanamaz hâle gelir, yani `listPage` ile
      `listRecent`in YÖN farkı veriyle doğrulanamaz (denendi: iki okuma da aynı satırları aynı
      sırada döndürdü — sıralama değil, verinin ayırt edilemezliği).

      Aralık dakikadır: bir konuşma dakikalar içinde akar. Son mesaj `alindi` anına denk gelir —
      gelen kutusu sıralaması değişmez.
    */
    for (const [n, id] of kayitlar.entries()) {
      const damga = new Date(new Date(alindi).getTime() - (kayitlar.length - 1 - n) * 60_000).toISOString();
      const { error: mErr } = await db.from('message').update({ created_at: damga }).eq('id', id);
      if (mErr) throw mErr;
    }
    const { error: cErr } = await db.from('conversation').update({ last_message_at: alindi }).eq('id', konusma.id);
    if (cErr) throw cErr;

    // İkinci sohbet AI cevaplı: mod defterde de yazılı olmalı, yoksa ekran onu insan sohbeti sanar.
    if (sohbet.akis.some((m) => m.yazan === 'ai')) await conversations.setMode(konusma.id, 'ai');
    sayac += 1;
  }

  console.log(`✓ konuşma: ${sayac} sohbet — biri CEVAP BEKLİYOR (son söz müşteride), biri AI cevaplı`);
}
