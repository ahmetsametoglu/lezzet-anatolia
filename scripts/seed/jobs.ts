import { JobRunService, WebhookEventService } from '@lezzet/database';
import { an, tabloDolu, type Db } from './shared';

// ── Zamanlanmış iş izi (06) ──────────────────────────────────────────────────────────────────────
// İş başına TEK satır (tarihçe tutulmaz). Biri BAŞARISIZ: "koştu ama hata verdi" ile "hiç koşmadı"
// birbirine karışmasın — gecikme alarmı bu ayrımı okur.
//
// İSİMLER UYDURULMAZ: satırın anahtarı, cron kabuğunun (`runJob`) yazdığı adın AYNISI olmalı. Farklı
// bir ad yazmak, ekranda hiçbir zaman tazelenmeyen bir hayalet satır bırakır — üstelik gerçek iş
// tabloya kendi adıyla girince aynı iş iki kez listelenir.

/** Kayıtlı cron işleri — `apps/backend/src/jobs/*` içindeki sabitlerle birebir. */
const SWEEP_RESERVATIONS = 'sweep_reservations';
const CREATE_FEEDBACK_REQUESTS = 'create_feedback_requests';

export async function seedJobRuns(db: Db): Promise<void> {
  if (await tabloDolu(db, 'job_run')) {
    console.log('▸ iş izleri zaten dolu — atlandı');
    return;
  }
  const jobs = new JobRunService(db);
  // Rezervasyon süpürme dakikada bir koşar: taze ve başarılı bir iz (alarmın sessiz hâli).
  await jobs.recordSuccess(SWEEP_RESERVATIONS, { released: 3, scannedAt: an(0) });
  // Davet taraması BAŞARISIZ: "koştu ama düştü" hâli. Alarm ekranının kırmızı satırı burasıdır;
  // hata metni de gerçekçi olmalı — "bir şeyler ters gitti" bir operatöre hiçbir şey söylemez.
  await jobs.recordFailure(
    CREATE_FEEDBACK_REQUESTS,
    'E-posta sağlayıcısı 429 döndü (hız sınırı) — 12 davetin 5\'i gönderilemedi, kalanlar bir sonraki turda denenecek.',
  );
  console.log('✓ iş izi: 2 kayıt (1 başarılı · 1 HATALI) · kayıtsız iş = hiç koşmadı');

  await seedWebhookEvents(db);
}

// ── Dış sağlayıcı olayları (0028 · 07.5) ─────────────────────────────────────────────────────────
// Stripe aynı olayı birden çok kez gönderir; `(provider, event_id)` benzersizliği tek emniyettir.
// `processed_at` idempotensin KAYNAĞI değil izidir — bu yüzden seed üç hâli de kurar: işlenmiş,
// işlenmemiş (kuyrukta bekliyor) ve DÜŞMÜŞ (hata metni dolu, işlenmemiş).
//
// Ödeme kapısının hata kuyruğu ancak düşmüş bir olay varsa denenebilir; hepsi yeşil bir tablo,
// "tekrar dene" düğmesinin hiç çalışmadığı anlamına gelir.

async function seedWebhookEvents(db: Db): Promise<void> {
  if (await tabloDolu(db, 'webhook_event')) {
    console.log('▸ webhook olayları zaten dolu — atlandı');
    return;
  }
  console.log('▸ WEBHOOK OLAYI seed');
  const events = new WebhookEventService(db);

  // Olayları gerçek siparişlere bağla: `metadata.order_id` ile gelen yük, ödeme kapısının
  // eşleştirdiği alandır — uydurma bir kimlik, izlemeyi ekranda kopuk gösterirdi.
  const { data: siparisData } = await db
    .from('order')
    .select('id,reference_no,ordered_total')
    .not('reference_no', 'is', null)
    .order('created_at', { ascending: false })
    .limit(4);
  const siparisler = (siparisData ?? []) as Array<{ id: string; reference_no: string; ordered_total: number }>;
  const cent = (v: number): number => Math.round(v * 100);

  const olaylar: Array<{
    eventId: string;
    type: string;
    payload: Record<string, unknown>;
    islendi?: number; // kaç gün önce işlendi
    hata?: string;
    etiket: string;
  }> = [
    // 1) Mutlu yol: checkout tamamlandı, işlendi.
    ...(siparisler[0]
      ? [
          {
            eventId: 'evt_seed_checkout_completed_01',
            type: 'checkout.session.completed',
            payload: {
              id: 'cs_test_seed01',
              object: 'checkout.session',
              amount_total: cent(siparisler[0].ordered_total),
              currency: 'eur',
              payment_status: 'paid',
              metadata: { order_id: siparisler[0].id, reference_no: siparisler[0].reference_no },
            },
            islendi: 2,
            etiket: 'İŞLENDİ · checkout tamamlandı',
          },
        ]
      : []),
    // 2) Ödeme onayı — aynı siparişin ikinci olayı. Stripe tek ödeme için birden çok olay yollar;
    //    ikisinin de tabloda durması normaldir, mükerrer DEĞİLDİR (event_id'leri farklı).
    ...(siparisler[0]
      ? [
          {
            eventId: 'evt_seed_pi_succeeded_01',
            type: 'payment_intent.succeeded',
            payload: {
              id: 'pi_test_seed01',
              object: 'payment_intent',
              amount: cent(siparisler[0].ordered_total),
              currency: 'eur',
              status: 'succeeded',
              metadata: { order_id: siparisler[0].id },
            },
            islendi: 2,
            etiket: 'İŞLENDİ · ödeme onayı (aynı sipariş)',
          },
        ]
      : []),
    // 3) DÜŞMÜŞ olay: geldi, işlenemedi, hata metni duruyor. Kuyruğun kırmızı satırı.
    ...(siparisler[1]
      ? [
          {
            eventId: 'evt_seed_pi_failed_01',
            type: 'payment_intent.succeeded',
            payload: {
              id: 'pi_test_seed02',
              object: 'payment_intent',
              amount: cent(siparisler[1].ordered_total),
              currency: 'eur',
              status: 'succeeded',
              metadata: { order_id: siparisler[1].id },
            },
            hata: 'Sipariş kilitli: aynı anda başka bir geçiş işleniyordu (deadlock) — olay yeniden denenmeli.',
            etiket: 'DÜŞTÜ · işlenemedi (yeniden denenecek)',
          },
        ]
      : []),
    // 4) HENÜZ İŞLENMEMİŞ: az önce geldi, kuyrukta. Ne yeşil ne kırmızı — üçüncü hâl.
    {
      eventId: 'evt_seed_charge_refunded_01',
      type: 'charge.refunded',
      payload: {
        id: 'ch_test_seed03',
        object: 'charge',
        amount_refunded: 1290,
        currency: 'eur',
        refunded: true,
      },
      etiket: 'BEKLİYOR · henüz işlenmedi',
    },
    // 5) TANINMAYAN tür: sağlayıcı bizim dinlemediğimiz bir olay yolladı. Kapı bunu sessizce
    //    geçmeli ama İZ bırakmalı — "neden hiçbir şey olmadı" sorusunun cevabı bu satırdır.
    {
      eventId: 'evt_seed_unknown_01',
      type: 'customer.subscription.created',
      payload: { id: 'sub_test_seed01', object: 'subscription' },
      islendi: 1,
      etiket: 'İŞLENDİ · dinlenmeyen tür (sessizce geçildi)',
    },
  ];

  for (const o of olaylar) {
    // `claim` üretim yoludur: aynı olay ikinci kez gelirse `fresh:false` döner ve YENİ satır açılmaz.
    // Seed onu kullanır — mükerrer koruması seed'de de aynı kapıdan geçsin.
    const { event, fresh } = await events.claim({ provider: 'stripe', eventId: o.eventId, type: o.type, payload: o.payload });
    if (!fresh) continue;
    if (o.hata) await events.markFailed(event.id, o.hata);
    else if (o.islendi != null) await events.markProcessed(event.id);
    const { error } = await db
      .from('webhook_event')
      .update({ created_at: an(-(o.islendi ?? 0) - 0.1), ...(o.islendi != null && !o.hata ? { processed_at: an(-o.islendi) } : {}) })
      .eq('id', event.id);
    if (error) throw error;
    console.log(`  ✓ ${o.type} · ${o.etiket}`);
  }
  console.log(`✓ webhook olayı: ${olaylar.length} kayıt (işlenmiş · düşmüş · bekleyen · dinlenmeyen tür)`);
}
