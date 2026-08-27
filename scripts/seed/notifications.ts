import { STAFF_NOTIFICATION_KINDS, type AppNotificationKind } from '@lezzet/types';
import { tabloDolu, type Db, type Kisiler } from './shared';

/*
  BİLDİRİM SEED'İ (kullanıcı kararı 26.08) — "her bildirim çeşidinden en az bir örnek olmalı."

  Ölçülen boşluk: seed siparişleri/talepleri SERVİS katmanından yazıyor, bildirim tek kapısından
  (dispatch) GEÇMİYOR — tabloda yalnız canlı akışın düşürdüğü personel satırları birikmişti
  (120 × document_undeliverable) ve müşteri akışları bomboştu. Ekranlar ancak veriyle denenebilir.

  ── SATIRLAR GERÇEKTEN TÜRETİLİR, UYDURULMAZ ────────────────────────────────
  Sipariş bildirimi sipariş DURUM GEÇMİŞİNDEN (order_status_log — created_at damgası da oradan:
  bildirim, olayın ânını taşır), davet feedback_request'ten, bölge zone_notice'tan, talep gerçek
  ticket'tan doğar. Hedefsiz/dayanaksız demo satırı yazılmaz: "tıklayınca gitmeyen bildirim"
  tam da bu turun şikâyetiydi.

  ── DEDUPE FORMÜLLERİ ÜRETİCİLERLE BİREBİR ──────────────────────────────────
  `order:<id>:<event>` (durum olayları) · `feedback-invite:<id>` · `zone:<id>` ·
  `undeliverable:<...>` — canlı akış aynı olayı bir daha üretmeye kalkarsa kısmi unique yutar;
  seed ile üretim çakışmaz. İstisna olayları (iptal/iade) formül gereği DEDUPESİZ.

  ── OKUNMUŞLUK GERÇEKÇİ ─────────────────────────────────────────────────────
  İki günden eski satır okunmuş yazılır (rozet "her şey yeni" yalanı söylemesin); taze satırlar
  okunmamış kalır — rozetler ve "tümünü okundu say" davranışı gerçek dağılımla denenir.
*/

interface SatirTaslak {
  profile_id: string;
  kind: AppNotificationKind;
  target_type: 'order' | 'ticket' | 'feedback_request' | 'zone_notice' | 'customer' | 'variant' | null;
  target_id: string | null;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  created_at: string;
}

const IKI_GUN_MS = 2 * 86_400_000;

export async function seedNotifications(db: Db, kisiler: Kisiler): Promise<void> {
  if (await tabloDolu(db, 'notification')) {
    console.log('▸ bildirimler zaten dolu — atlandı');
    return;
  }
  console.log('▸ BİLDİRİM seed (gerçek kayıtlardan türetilir)');
  const satirlar: SatirTaslak[] = [];

  // ── Sipariş yaşam döngüsü: durum log'undan (confirmed · out_for_delivery · delivered) ────────
  const { data: loglar, error: logHata } = await db
    .from('order_status_log')
    .select('order_id, to_status, created_at, order:order_id(customer_id, reference_no, amount_refunded)')
    .in('to_status', ['confirmed', 'out_for_delivery', 'delivered', 'cancelled']);
  if (logHata) throw logHata;

  const OLAY: Record<string, AppNotificationKind> = {
    confirmed: 'order_confirmed',
    out_for_delivery: 'order_out_for_delivery',
    delivered: 'order_delivered',
    cancelled: 'order_cancelled',
  };
  type LogSatiri = {
    order_id: string;
    to_status: string;
    created_at: string;
    order: { customer_id: string | null; reference_no: string | null; amount_refunded: number | null } | null;
  };
  const iadeliler = new Set<string>();
  for (const log of (loglar ?? []) as unknown as LogSatiri[]) {
    const musteri = log.order?.customer_id;
    if (!musteri) continue; // müşterisiz sipariş (kapı önü misafiri) — zile düşecek kimse yok
    const kind = OLAY[log.to_status];
    if (!kind) continue;
    satirlar.push({
      profile_id: musteri,
      kind,
      target_type: 'order',
      target_id: log.order_id,
      payload: { referenceNo: log.order?.reference_no ?? '—' },
      // İptal İSTİSNADIR (her düzeltme ayrı haber) — formül gereği dedupesiz; durum olayları formüllü.
      dedupe_key: kind === 'order_cancelled' ? null : `order:${log.order_id}:${kind}`,
      created_at: log.created_at,
    });
    if ((log.order?.amount_refunded ?? 0) > 0) iadeliler.add(log.order_id);
  }

  // İade işlenmiş siparişler → order_refunded (istisna: dedupesiz); damga teslim log'undan sonra.
  for (const orderId of iadeliler) {
    const kaynak = satirlar.find((s) => s.target_id === orderId);
    if (!kaynak) continue;
    satirlar.push({
      ...kaynak,
      kind: 'order_refunded',
      dedupe_key: null,
      created_at: new Date(new Date(kaynak.created_at).getTime() + 3_600_000).toISOString(),
    });
  }

  // Kısmi karşılanmış kalemli teslim edilmiş siparişler → order_shortfall (istisna: dedupesiz).
  const { data: eksikler, error: eksikHata } = await db
    .from('order_item')
    .select('order_id, qty, fulfilled_qty, order:order_id(customer_id, reference_no, status)')
    .not('fulfilled_qty', 'is', null);
  if (eksikHata) throw eksikHata;
  type EksikSatiri = { order_id: string; qty: number; fulfilled_qty: number | null; order: { customer_id: string | null; reference_no: string | null; status: string } | null };
  const eksikSiparisler = new Map<string, EksikSatiri>();
  for (const kalem of (eksikler ?? []) as unknown as EksikSatiri[]) {
    if ((kalem.fulfilled_qty ?? kalem.qty) >= kalem.qty) continue;
    if (!kalem.order?.customer_id || !['delivered', 'completed'].includes(kalem.order.status)) continue;
    eksikSiparisler.set(kalem.order_id, kalem);
  }
  for (const [orderId, kalem] of eksikSiparisler) {
    satirlar.push({
      profile_id: kalem.order!.customer_id!,
      kind: 'order_shortfall',
      target_type: 'order',
      target_id: orderId,
      payload: { referenceNo: kalem.order!.reference_no ?? '—' },
      dedupe_key: null,
      created_at: new Date(Date.now() - IKI_GUN_MS / 2).toISOString(),
    });
  }

  // ── Değerlendirme davetleri: feedback_request'ten ────────────────────────────────────────────
  const { data: davetler, error: davetHata } = await db
    .from('feedback_request')
    .select('id, customer_id, created_at, order:order_id(reference_no)')
    .limit(10);
  if (davetHata) throw davetHata;
  type Davet = { id: string; customer_id: string | null; created_at: string; order: { reference_no: string | null } | null };
  for (const davet of ((davetler ?? []) as unknown as Davet[]).slice(0, 5)) {
    if (!davet.customer_id) continue;
    satirlar.push({
      profile_id: davet.customer_id,
      kind: 'feedback_invite',
      target_type: 'feedback_request',
      target_id: davet.id,
      payload: { orderReferenceNo: davet.order?.reference_no ?? '—' },
      dedupe_key: `feedback-invite:${davet.id}`,
      created_at: davet.created_at,
    });
  }

  // ── Bölge haberi: kayıtlı müşterili zone_notice'lardan ───────────────────────────────────────
  const { data: bolgeler, error: bolgeHata } = await db
    .from('zone_notice')
    .select('id, customer_id, postal_code, created_at')
    .not('customer_id', 'is', null)
    .limit(3);
  if (bolgeHata) throw bolgeHata;
  for (const notice of (bolgeler ?? []) as { id: string; customer_id: string; postal_code: string; created_at: string }[]) {
    satirlar.push({
      profile_id: notice.customer_id,
      kind: 'zone_available',
      target_type: 'zone_notice',
      target_id: notice.id,
      payload: { postalCode: notice.postal_code },
      dedupe_key: `zone:${notice.id}`,
      created_at: notice.created_at,
    });
  }

  // ── Talep akışı: personel/AI cevaplı gerçek ticket'lardan ────────────────────────────────────
  // Kolon `sender` (`ticket_sender`: customer · admin · ai) — 27.08'e kadar burada `author`
  // yazıyordu ve PostgREST hatası okunmadığı için `ticket_replied`/`ticket_status_changed`
  // SESSİZCE hiç doğmuyordu: seed yeşil bitiyor, iki tür yalnızca ⚠ satırında görünüyordu.
  const { data: cevaplar, error: cevapHata } = await db
    .from('ticket_message')
    .select('ticket_id, created_at, sender, ticket:ticket_id(customer_id)')
    .neq('sender', 'customer')
    .order('created_at', { ascending: false })
    .limit(20);
  if (cevapHata) throw cevapHata;
  type Cevap = { ticket_id: string; created_at: string; sender: string; ticket: { customer_id: string | null } | null };
  const talepGorulen = new Set<string>();
  for (const cevap of (cevaplar ?? []) as unknown as Cevap[]) {
    if (!cevap.ticket?.customer_id || talepGorulen.has(cevap.ticket_id)) continue;
    talepGorulen.add(cevap.ticket_id);
    satirlar.push({
      profile_id: cevap.ticket.customer_id,
      kind: 'ticket_replied',
      target_type: 'ticket',
      target_id: cevap.ticket_id,
      payload: {},
      dedupe_key: null, // üretici de dedupesiz: her cevap ayrı haber
      created_at: cevap.created_at,
    });
    if (talepGorulen.size >= 3) break;
  }
  // Durum değişikliği örneği: cevaplı taleplerin ilkine bir de durum haberi (kapanış anı gibi).
  const ilkTalep = satirlar.find((s) => s.kind === 'ticket_replied');
  if (ilkTalep) {
    satirlar.push({
      ...ilkTalep,
      kind: 'ticket_status_changed',
      created_at: new Date(new Date(ilkTalep.created_at).getTime() + 2 * 3_600_000).toISOString(),
    });
  }

  // ── Kurumsal sonuç: onaylı B2B müşterisine (gerçek başvurunun yankısı) ───────────────────────
  const b2b = kisiler.get('b2bOnayli');
  if (b2b) {
    satirlar.push({
      profile_id: b2b,
      kind: 'b2b_application_result',
      target_type: 'customer',
      target_id: b2b,
      payload: { approved: true },
      dedupe_key: `b2b-result:${b2b}`,
      created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    });
  }

  // ── Personel türleri (26.08 — "operasyon tarafında da her çeşitten örnek") ───────────────────
  // Fan-out'un tam taklidi değil, HEDEF KİTLENİN örneği: yönetici (cihaz/web dev hesabı) her
  // türü görür; canlı üreticiler (staff-events.ts) gerçek fan-out'u zaten rol×depo ile yazıyor.
  const yonetici = kisiler.get('yonetici');
  if (yonetici) {
    // Belge: e-postasız müşterinin sipariş onayı insana düştü.
    const belgeKaynagi = satirlar.find((s) => s.kind === 'order_confirmed');
    if (belgeKaynagi) {
      satirlar.push({
        profile_id: yonetici,
        kind: 'document_undeliverable',
        target_type: 'order',
        target_id: belgeKaynagi.target_id,
        payload: { event: 'order_confirmed', referenceNo: belgeKaynagi.payload.referenceNo },
        dedupe_key: `undeliverable:order:${belgeKaynagi.target_id}:order_confirmed`,
        created_at: belgeKaynagi.created_at,
      });
    }

    // Yeni şikâyet/talep: son mesajı müşteriden olan gerçek bir talep.
    const { data: acikTalepler, error: talepHata } = await db
      .from('ticket')
      .select('id, type, created_at, order:order_id(reference_no)')
      .order('created_at', { ascending: false })
      .limit(2);
    if (talepHata) throw talepHata;
    type AcikTalep = { id: string; type: string; created_at: string; order: { reference_no: string | null } | null };
    for (const talep of (acikTalepler ?? []) as unknown as AcikTalep[]) {
      satirlar.push({
        profile_id: yonetici,
        kind: 'ticket_opened',
        target_type: 'ticket',
        target_id: talep.id,
        payload: { ticketType: talep.type, ...(talep.order?.reference_no ? { referenceNo: talep.order.reference_no } : {}) },
        dedupe_key: `ticket-opened:${talep.id}`,
        created_at: talep.created_at,
      });
    }

    // Eşik altı: üreticinin sorduğu aynı soru, seed'in iki düz okumasıyla (varyant eşiği +
    // `available_stock` görünümü) — GERÇEK eşik-altı varyantlardan en fazla iki örnek.
    const { data: depo, error: depoHata } = await db.from('warehouse').select('id').eq('is_active', true).limit(1).maybeSingle();
    if (depoHata) throw depoHata;
    if (depo) {
      const { data: varyantlar, error: varyantHata } = await db
        .from('product_variant')
        .select('id, sku, min_stock_qty')
        .not('min_stock_qty', 'is', null)
        .eq('is_active', true)
        .limit(50);
      if (varyantHata) throw varyantHata;
      const { data: kullanilabilir, error: stokHata } = await db
        .from('available_stock')
        .select('variant_id, available_qty')
        .eq('warehouse_id', (depo as { id: string }).id);
      if (stokHata) throw stokHata;
      const mevcut = new Map(((kullanilabilir ?? []) as { variant_id: string; available_qty: number }[]).map((r) => [r.variant_id, r.available_qty]));
      const esikAlti = ((varyantlar ?? []) as { id: string; sku: string | null; min_stock_qty: number }[])
        .map((v) => ({ ...v, available: mevcut.get(v.id) ?? 0 }))
        .filter((v) => v.available < v.min_stock_qty)
        .slice(0, 2);
      for (const v of esikAlti) {
        satirlar.push({
          profile_id: yonetici,
          kind: 'stock_low',
          target_type: 'variant',
          target_id: v.id,
          payload: { ...(v.sku ? { sku: v.sku } : {}), availableQty: v.available, minStockQty: v.min_stock_qty },
          dedupe_key: `stock-low:${(depo as { id: string }).id}:${v.id}`,
          created_at: new Date(Date.now() - 6 * 3_600_000).toISOString(),
        });
      }
    }

    // Kapanış uyuşmazlığı: farkı sıfır olmayan gerçek kapanıştan.
    // Tablo FARKI TUTMAZ, beklenen ile sayılanı tutar (numeric, euro) — fark hesaplanır ve
    // sözlüğün beklediği KURUŞA çevrilir (üretici de kuruşla konuşur: `notifyRunCloseMismatch`).
    // 27.08'e kadar burada var olmayan `difference_*_cents` kolonları okunuyordu; hata yutulduğu
    // için tür sessizce hiç doğmuyordu — `throw` eklenince seed bu satırda durup kendini söyledi.
    const { data: kapanislar, error: kapanisHata } = await db
      .from('delivery_run_close')
      .select('id, closed_at, expected_cash, expected_card, expected_cheque, counted_cash, counted_card, counted_cheque, run:delivery_run_id(reference_no)')
      .limit(20);
    if (kapanisHata) throw kapanisHata;
    type Kapanis = {
      id: string;
      closed_at: string;
      expected_cash: number | null;
      expected_card: number | null;
      expected_cheque: number | null;
      counted_cash: number | null;
      counted_card: number | null;
      counted_cheque: number | null;
      run: { reference_no: string | null } | null;
    };
    const kurusFarki = (sayilan: number | null, beklenen: number | null) => Math.round((Number(sayilan ?? 0) - Number(beklenen ?? 0)) * 100);
    const farkli = ((kapanislar ?? []) as unknown as Kapanis[])
      .map((k) => ({
        ...k,
        nakitKurus: kurusFarki(k.counted_cash, k.expected_cash),
        kartKurus: kurusFarki(k.counted_card, k.expected_card),
        cekKurus: kurusFarki(k.counted_cheque, k.expected_cheque),
      }))
      .find((k) => k.nakitKurus !== 0 || k.kartKurus !== 0 || k.cekKurus !== 0);
    if (farkli) {
      satirlar.push({
        profile_id: yonetici,
        kind: 'run_close_mismatch',
        target_type: null,
        target_id: null,
        payload: {
          ...(farkli.run?.reference_no ? { referenceNo: farkli.run.reference_no } : {}),
          differenceCashCents: farkli.nakitKurus,
          differenceCardCents: farkli.kartKurus,
          differenceChequeCents: farkli.cekKurus,
        },
        dedupe_key: null,
        created_at: farkli.closed_at,
      });
    }

    // Kurumsal başvuru: onay kuyruğunda bekleyen gerçek profil.
    const { data: bekleyen, error: bekleyenHata } = await db
      .from('user_profiles')
      .select('id, created_at')
      .eq('b2b_approved', false)
      .not('company_info', 'is', null)
      .limit(1)
      .maybeSingle();
    if (bekleyenHata) throw bekleyenHata;
    if (bekleyen) {
      satirlar.push({
        profile_id: yonetici,
        kind: 'b2b_application_received',
        target_type: 'customer',
        target_id: (bekleyen as { id: string }).id,
        payload: {},
        dedupe_key: null,
        created_at: (bekleyen as { id: string; created_at: string }).created_at,
      });
    }
  }

  // ── Yaz: eski satırlar okunmuş (rozet gerçekçi), tazeler okunmamış ───────────────────────────
  const esik = Date.now() - IKI_GUN_MS;
  const kayitlar = satirlar.map((s) => ({
    ...s,
    read_at: new Date(s.created_at).getTime() < esik ? new Date(new Date(s.created_at).getTime() + 3_600_000).toISOString() : null,
  }));
  const { error: yazimHatasi } = await db.from('notification').insert(kayitlar);
  if (yazimHatasi) throw yazimHatasi;

  // Tür sayımı GÖRÜNÜR: "her çeşitten en az bir örnek" iddiası her seed'de bu satırdan okunur.
  const sayim = new Map<string, number>();
  for (const s of kayitlar) sayim.set(s.kind, (sayim.get(s.kind) ?? 0) + 1);
  const eksikTurler = [
    'order_confirmed', 'order_out_for_delivery', 'order_delivered', 'order_cancelled', 'order_shortfall',
    'order_refunded', 'ticket_replied', 'ticket_status_changed', 'feedback_invite', 'zone_available',
    'b2b_application_result', ...STAFF_NOTIFICATION_KINDS,
  ].filter((k) => !sayim.has(k));
  console.log(`✓ bildirim: ${kayitlar.length} satır (${[...sayim.entries()].map(([k, n]) => `${k}:${n}`).join(' · ')})`);
  if (eksikTurler.length > 0) console.log(`  ⚠ örneği DOĞMAYAN türler: ${eksikTurler.join(', ')} — kaynak veri yok (yukarıdaki türetim kuralları)`);
}
