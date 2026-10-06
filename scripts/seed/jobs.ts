import { JobRunService, WebhookEventService } from '@lezzet/database';
import { an, tabloDolu, type Db } from './shared';

// İş başına tek satır; biri başarısız ki "koştu ama hata verdi" ile "hiç koşmadı" karışmasın. Adlar cron kabuğunun yazdığıyla
// aynı olmalı, yoksa ekranda hiç tazelenmeyen hayalet satır kalır.

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

// Sağlayıcı olayları üç hâlde kurulur (işlenmiş, bekleyen, düşmüş), çünkü hata kuyruğu ve "tekrar dene" ancak düşmüş olayla
// denenebilir.

async function seedWebhookEvents(db: Db): Promise<void> {
  if (await tabloDolu(db, 'webhook_event')) {
    console.log('▸ webhook olayları zaten dolu — atlandı');
    return;
  }
  console.log('▸ WEBHOOK OLAYI seed');
  const events = new WebhookEventService(db);

  // Olaylar gerçek siparişlere bağlanır; uydurma bir kimlik izlemeyi ekranda kopuk gösterirdi.
  const { data: siparisData } = await db
    .from('order')
    .select('id')
    .not('reference_no', 'is', null)
    .order('created_at', { ascending: false })
    .limit(4);
  const siparisler = (siparisData ?? []) as Array<{ id: string }>;

  const olaylar: Array<{
    eventId: string;
    type: string;
    payload: Record<string, unknown>;
    islendi?: number; // kaç gün önce işlendi
    hata?: string;
    etiket: string;
  }> = [
    // 1) Mutlu yol: ödeme tamamlandı, işlendi. Olay anahtarı olay adı + sağlayıcı siparişidir, çünkü Revolut olay kimliği göndermez.
    ...(siparisler[0]
      ? [
          {
            eventId: 'ORDER_COMPLETED:seed-rv-01',
            type: 'payment_completed',
            payload: { event: 'ORDER_COMPLETED', order_id: 'seed-rv-01', merchant_order_ext_ref: siparisler[0].id },
            islendi: 2,
            etiket: 'İŞLENDİ · ödeme tamamlandı',
          },
        ]
      : []),
    // 2) Aynı ödemenin ikinci olayı: Revolut tek ödeme için birden çok olay yollar (yetki, tamamlanma); anahtarları farklıdır.
    ...(siparisler[0]
      ? [
          {
            eventId: 'ORDER_AUTHORISED:seed-rv-01',
            type: 'ignored',
            payload: { event: 'ORDER_AUTHORISED', order_id: 'seed-rv-01', merchant_order_ext_ref: siparisler[0].id },
            islendi: 2,
            etiket: 'İŞLENDİ · yetki olayı (aynı ödeme, dinlenmeyen adım)',
          },
        ]
      : []),
    // 3) DÜŞMÜŞ olay: geldi, işlenemedi, hata metni duruyor. Kuyruğun kırmızı satırı.
    ...(siparisler[1]
      ? [
          {
            eventId: 'ORDER_COMPLETED:seed-rv-02',
            type: 'payment_completed',
            payload: { event: 'ORDER_COMPLETED', order_id: 'seed-rv-02', merchant_order_ext_ref: siparisler[1].id },
            hata: 'Sipariş kilitli: aynı anda başka bir geçiş işleniyordu (deadlock) — olay yeniden denenmeli.',
            etiket: 'DÜŞTÜ · işlenemedi (yeniden denenecek)',
          },
        ]
      : []),
    // 4) HENÜZ İŞLENMEMİŞ: az önce geldi, kuyrukta. Ne yeşil ne kırmızı — üçüncü hâl.
    {
      eventId: 'ORDER_COMPLETED:seed-rv-iade-03',
      type: 'refund_completed',
      payload: { event: 'ORDER_COMPLETED', order_id: 'seed-rv-iade-03' },
      etiket: 'BEKLİYOR · henüz işlenmedi',
    },
    // 5) Dinlenmeyen olay: sağlayıcının yolladığı ama bizim işlemediğimiz tür. Sessizce geçilir ama iz kalır.
    {
      eventId: 'DISPUTE_UNDER_REVIEW:seed-dp-01',
      type: 'ignored',
      payload: { event: 'DISPUTE_UNDER_REVIEW', dispute_id: 'seed-dp-01' },
      islendi: 1,
      etiket: 'İŞLENDİ · dinlenmeyen tür (sessizce geçildi)',
    },
  ];

  for (const o of olaylar) {
    // `claim` üretim yoludur: aynı olay ikinci kez gelirse `fresh:false` döner ve YENİ satır açılmaz.
    // Seed onu kullanır — mükerrer koruması seed'de de aynı kapıdan geçsin.
    const { event, fresh } = await events.claim({ provider: 'revolut', eventId: o.eventId, type: o.type, payload: o.payload });
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
