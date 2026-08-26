import { NotificationDeliveryService, PushDeviceService, serviceDb } from '@lezzet/database';
import { logger } from '@lezzet/observability';

/**
 * **Makbuz süpürme** (14.16'nın ikinci yarısı) — push'un "gerçekten ulaştı mı" turu.
 *
 * ── NEDEN VAR: BİLET ≠ MAKBUZ ───────────────────────────────────────────────
 * Expo'ya gönderim anında dönen şey BİLETTİR ("aldım, sıraya koydum") — teslim değil. Teslim
 * tutanağı (makbuz) ancak 15-30 dk sonra bilet numarasıyla SORULABİLİR ve kendiliğinden gelmez:
 * soran olmazsa çürük jetonlar sonsuza dek denenmeye devam eder. Bunun bedeli konfor değil hesap
 * sağlığıdır: `DeviceNotRegistered` alıp göndermeyi sürdüren gönderici, taşıyıcı tarafında spam
 * muamelesi görür ve Expo hesabı kısıtlanabilir.
 *
 * ── İKİNCİ KAZANÇ: HABER KAYBOLMAZ ──────────────────────────────────────────
 * Çürük jeton silinince kanal sırası kendi kendine düzelir: o müşterinin bir sonraki HABERİ maile
 * düşer (push sürücüsü jetonsuz alıcıda yeteneksiz). Yani bu tur, "push'u kaybetti" müşterisini
 * otomatik olarak mail müşterisine geri çevirir — kimse fark etmeden.
 *
 * ── TARAMALI VE İDEMPOTENT (runner sözleşmesi) ──────────────────────────────
 * Tur "sorulmamış push teslimleri"ni en eskiden tarar (kısmi indeks). Makbuzu henüz üretilmemiş
 * bilet İŞARETLENMEZ — sonraki tur yine sorar; 24 saati geçmişse `expired` yazılır (Expo makbuzu
 * ~24 saat tutar, artık gelmeyecek). Kaçan tur ertesi turda telafi olur.
 */

export const PUSH_RECEIPTS = 'push-receipts';

const EXPO_RECEIPT_URL = 'https://exp.host/--/api/v2/push/getReceipts';
/** Expo tek istekte en çok 300 makbuz kabul eder — öbekleme bu tavana göre. */
const RECEIPT_BATCH = 300;
/** Makbuz bu yaştan önce SORULMAZ: Expo taze bileti henüz işlememiştir, boş tur olur. */
const MIN_AGE_MS = 15 * 60 * 1000;
/** Makbuz penceresi: Expo ~24 saat tutar; sonrası `expired` — artık öğrenilemez. */
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

interface TicketPair {
  token: string;
  ticket: string;
}

interface ExpoReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

interface PushReceiptSummary extends Record<string, unknown> {
  /** Taranan teslim satırı. */
  scanned: number;
  /** Makbuzu "ulaştı" çıkanlar. */
  ok: number;
  /** Makbuzu hatalı çıkanlar (jeton budaması dahil). */
  errors: number;
  /** Budanan çürük jeton (`DeviceNotRegistered`). */
  pruned: number;
  /** Makbuzu henüz üretilmemiş — sonraki tur yine sorar. */
  pending: number;
  /** Penceresi kaçmış (`expired`) ya da ref'i çözülemeyen (`unparseable`) satır. */
  closed: number;
}

/** `ref`teki {token, ticket} çiftleri — çözülemeyen ref bir ARIZADIR, sessiz döngü değil. */
function pairsOf(ref: string | null): TicketPair[] | null {
  if (!ref) return null;
  try {
    const parsed = JSON.parse(ref) as unknown;
    if (!Array.isArray(parsed)) return null;
    const pairs = parsed.filter(
      (p): p is TicketPair => typeof p === 'object' && p !== null && typeof (p as TicketPair).token === 'string' && typeof (p as TicketPair).ticket === 'string',
    );
    return pairs.length > 0 ? pairs : null;
  } catch {
    return null;
  }
}

export async function sweepPushReceipts(
  opts: { fetcher?: typeof fetch; minAgeMs?: number; receiptTtlMs?: number; limit?: number } = {},
): Promise<PushReceiptSummary> {
  const db = serviceDb();
  const deliveries = new NotificationDeliveryService(db);
  const devices = new PushDeviceService(db);
  const f = opts.fetcher ?? fetch;
  const minAge = opts.minAgeMs ?? MIN_AGE_MS;
  const ttl = opts.receiptTtlMs ?? RECEIPT_TTL_MS;

  const rows = await deliveries.listUncheckedPush(new Date(Date.now() - minAge).toISOString(), opts.limit ?? 200);
  const summary: PushReceiptSummary = { scanned: rows.length, ok: 0, errors: 0, pruned: 0, pending: 0, closed: 0 };
  if (rows.length === 0) return summary;

  // Satır → çiftler; çözülemeyen ref kapatılır (yoksa her turda yeniden denenir — sessiz döngü).
  const parsed = new Map<string, TicketPair[]>();
  for (const row of rows) {
    const pairs = pairsOf(row.ref);
    if (!pairs) {
      await deliveries.markReceipt(row.id, 'unparseable');
      summary.closed += 1;
      continue;
    }
    parsed.set(row.id, pairs);
  }

  // Tüm biletler tek havuzda, Expo tavanına göre öbeklenmiş tek tur sorgu.
  const allTickets = [...parsed.values()].flat().map((pair) => pair.ticket);
  const receipts = new Map<string, ExpoReceipt>();
  for (let i = 0; i < allTickets.length; i += RECEIPT_BATCH) {
    const ids = allTickets.slice(i, i + RECEIPT_BATCH);
    const res = await f(EXPO_RECEIPT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify({ ids }),
    });
    // Expo'ya ulaşılamayan tur hiçbir şeyi İŞARETLEMEZ: sonraki tur aynı biletleri yine sorar.
    // Yarım işaretlenmiş bir tur, ulaşılamayan makbuzu "soruldu" gösterirdi.
    if (!res.ok) throw new Error(`Expo makbuz ucu ${res.status} döndü`);
    const json = (await res.json()) as { data?: Record<string, ExpoReceipt> };
    for (const [id, receipt] of Object.entries(json.data ?? {})) receipts.set(id, receipt);
  }

  for (const row of rows) {
    const pairs = parsed.get(row.id);
    if (!pairs) continue; // unparseable — yukarıda kapatıldı

    const cevaplar = pairs.map((pair) => ({ pair, receipt: receipts.get(pair.ticket) ?? null }));
    const bekleyen = cevaplar.some((c) => c.receipt === null);

    // Çürük jetonlar makbuz GELEN kısımdan hemen budanır — satır bekliyor olsa bile: taşıyıcının
    // beyanı geldi, bir sonraki gönderimi beklemesi için sebep yok.
    for (const { pair, receipt } of cevaplar) {
      if (receipt?.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
        const budandi = await devices.pruneByToken(pair.token);
        if (budandi) {
          summary.pruned += 1;
          // Jeton YAZILMAZ (yetki, OBSERVABILITY §5 ruhu) — kayıt teslim satırıyla bulunur.
          logger.info({ job: PUSH_RECEIPTS, deliveryId: row.id }, 'çürük jeton budandı — sonraki haber maile düşer');
        }
      }
    }

    if (bekleyen) {
      // Pencere içindeyse sonraki tura kalır; kaçtıysa kapanır — sonsuza dek sorulmaz.
      if (Date.now() - new Date(row.createdAt).getTime() > ttl) {
        await deliveries.markReceipt(row.id, 'expired');
        summary.closed += 1;
      } else {
        summary.pending += 1;
      }
      continue;
    }

    const hatali = cevaplar.filter((c) => c.receipt!.status === 'error');
    await deliveries.markReceipt(row.id, hatali.length === 0 ? 'ok' : (hatali[0]!.receipt!.details?.error ?? 'error'));
    if (hatali.length === 0) summary.ok += 1;
    else summary.errors += 1;
  }

  return summary;
}

/** Runner'ın çağırdığı sarmalayıcı — özet `job_run` izine iner. */
export async function pushReceiptsJob(): Promise<Record<string, unknown>> {
  return sweepPushReceipts();
}
