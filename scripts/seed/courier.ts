import { CourierDayCloseService, CourierDayCollectionService } from '@lezzet/database';
import { fromCents } from '@lezzet/helper';
import { tabloDolu, type Db, type Kisiler } from './shared';

// ── Kurye gün kapanışı (0032 · 11.6) ─────────────────────────────────────────────────────────────
// Kapanış bir MUTABAKAT kaydıdır, para hareketi değil: para kapıda tahsil edilirken zaten yazıldı
// (12.2). Burada sistemin beklediği ile kuryenin saydığı yan yana durur.
//
// Beklenen tutar UYDURULMAZ: `courier_day_collection` görünümünden gelir ve kapanış RPC'si onu
// kendisi okur. Seed'in tek söylediği "kurye ne saydı"dır — mutabakatın anlamı da zaten budur.
//
// Üç hâl kurulur, çünkü ekran üçünü ayrı gösterir:
//   · MUTABIK gün      → sayılan = beklenen; yeşil satır
//   · FARKLI gün       → nakit eksik çıkmış + kuryenin açıklaması; fark gizlenmez, AÇIKLANIR
//   · KAPANMAMIŞ gün   → teslimatı olan ama kapanışı yapılmamış gün; "açık gün" uyarısı
// Hepsi mutabık olsaydı, fark satırının kırmızısı hiç görülmezdi.

export async function seedCourierDayCloses(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'courier_day_close')) {
    console.log('▸ kurye gün kapanışları zaten dolu — atlandı');
    return;
  }
  console.log('▸ KURYE GÜN KAPANIŞI seed');
  const closes = new CourierDayCloseService(db);
  const collections = new CourierDayCollectionService(db);
  const kurye = kisiler.get('kurye');
  const admin = kisiler.get('devAdmin') ?? null;
  if (!kurye) {
    console.log('  · kurye profili yok — atlandı');
    return;
  }

  // Kapıda ödeme BEKLENEN günler: görünüm zaten "hangi kurye, hangi gün, ne kadar" diyor. Günleri
  // buradan okumak, seed'in sipariş bölümüyle tarih üzerinden gizlice anlaşmasını da önler.
  const { data, error } = await db
    .from('courier_day_collection')
    .select('courier_id,date,expected_cash,expected_card,expected_cheque')
    .eq('courier_id', kurye)
    .order('date', { ascending: false });
  if (error) throw error;
  const gunler = (data ?? []) as Array<{ date: string; expected_cash: number; expected_card: number; expected_cheque: number }>;

  if (gunler.length === 0) {
    console.log('  · kuryenin kapıda tahsilatlı günü yok — kapanış kurulmadı');
    return;
  }

  // 1) EN SON GÜN: mutabık kapanış — sayılan tutar beklenenin aynısı.
  const mutabik = gunler[0];
  if (mutabik) {
    const beklenen = await collections.getByDay(kurye, mutabik.date);
    const sonuc = await closes.close({
      courierId: kurye,
      date: mutabik.date,
      countedCashCents: beklenen?.expectedCashCents ?? 0,
      countedCardCents: beklenen?.expectedCardCents ?? 0,
      countedChequeCents: beklenen?.expectedChequeCents ?? 0,
      actorId: admin,
    });
    console.log(
      sonuc.ok
        ? `  ✓ ${mutabik.date} · MUTABIK · teslim ${sonuc.deliveredCount} · devreden ${sonuc.pendingCount} · nakit ${fromCents(sonuc.countedCashCents ?? 0)} €`
        : `  · ${mutabik.date} atlandı (${sonuc.reason})`,
    );
  }

  // 2) BİR ÖNCEKİ GÜN: FARK VAR — kuryede 15 € eksik nakit. Not zorunlu değil ama farkın yanında
  // açıklama yoksa mutabakat bir sayıdan ibaret kalır; operatörün sorduğu soru "neden" olduğu için
  // seed de o cevabı kurar.
  const farkli = gunler[1];
  if (farkli) {
    const beklenen = await collections.getByDay(kurye, farkli.date);
    const sonuc = await closes.close({
      courierId: kurye,
      date: farkli.date,
      // 15 € eksik — hesap artık tamsayı cent üstünde, `euro()` yuvarlamasına gerek kalmadı.
      countedCashCents: Math.max(0, (beklenen?.expectedCashCents ?? 0) - 1500),
      countedCardCents: beklenen?.expectedCardCents ?? 0,
      countedChequeCents: beklenen?.expectedChequeCents ?? 0,
      note: 'Bir müşteri 15 € eksik ödedi, kalanı bir sonraki teslimatta verecek. Kendisiyle konuşuldu.',
      actorId: admin,
    });
    console.log(
      sonuc.ok
        ? `  ✓ ${farkli.date} · FARK VAR · nakit fark ${fromCents(sonuc.differenceCashCents ?? 0)} € · mutabık: ${sonuc.reconciled}`
        : `  · ${farkli.date} atlandı (${sonuc.reason})`,
    );
  }

  // 3) Kalan günler KAPATILMADAN bırakılır — "kapanışı bekleyen gün" uyarısının zemini. Her günü
  // kapatmak, o uyarının hiç görünmediği bir veri tabanı bırakırdı.
  const acikGun = gunler.length - Math.min(2, gunler.length);
  console.log(`✓ kurye kapanışı: ${Math.min(2, gunler.length)} gün kapandı (1 mutabık · 1 FARKLI) · ${acikGun} gün açık`);
}
