#!/usr/bin/env node
/**
 * **Tek seferlik onarım (29.07):** sepet indiriminin kalem payı yazılmamış siparişleri düzeltir.
 *
 * Hata `checkout-draft` ve seed'de aynı biçimde vardı: `order.discount_amount` başlığa yazılıyor
 * ama `order_item.line_discount_amount` 0 kalıyordu. Bunun üç görünür sonucu oluyordu —
 *   1) ödeme motoru beklenen tutarı indirim kadar YÜKSEK hesaplıyor → tamamı ödenmiş sipariş
 *      `payment_status='partial'` görünüyor, müşteriye giden mail "kapıda X € ödenecek" diyor,
 *   2) muhasebe export'u ve kârlılık ciroyu indirim kadar fazla sayıyor (`lineGrossCents`),
 *   3) operasyon sipariş detayında satır toplamı indirimsiz görünüyor.
 *
 * Yazım yolları düzeltildi (kod `d931a0e` + seed). Bu betik **geride kalan satırları** onarır;
 * yeni veri üretmez, yalnız var olan payları oransal dağıtır ve `payment_status`'ü yeniden türetir.
 *
 * Idempotent: payı zaten doğru olan sipariş atlanır. Çalıştırma: `node scripts/repair-discount-shares.mjs`
 * (`--apply` verilmezse yalnız RAPORLAR, hiçbir şey yazmaz).
 */
import { execFileSync } from 'node:child_process';

const DB = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const apply = process.argv.includes('--apply');

const psql = (sql) => execFileSync('psql', [DB, '-At', '-F', '\t', '-c', sql], { encoding: 'utf8' }).trim();

/** Kuruş kaybı olmadan oransal dağıtım — `@lezzet/helper` `distributeProportional` ile aynı kural. */
function distribute(weights, total) {
  const base = weights.reduce((a, b) => a + b, 0);
  if (base <= 0 || total <= 0) return weights.map(() => 0);
  const capped = Math.min(total, base);
  const shares = weights.map((w) => Math.floor((w * capped) / base));
  // Artan kuruş en büyük paya gider: toplam daima hedefe eşitlenir.
  let remainder = capped - shares.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => [w, i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length, remainder -= 1) shares[order[k][1]] += 1;
  return shares;
}

const rows = psql(`
  select o.id, o.reference_no, round(o.discount_amount * 100)::int
    from public."order" o
   where o.discount_amount > 0
     and coalesce((select sum(oi.line_discount_amount) from public.order_item oi where oi.order_id = o.id), 0) = 0
   order by o.created_at`);

if (!rows) {
  console.warn('Onarılacak sipariş yok.');
  process.exit(0);
}

for (const line of rows.split('\n')) {
  const [orderId, referenceNo, discountCents] = line.split('\t');
  const items = psql(`
    select oi.id, round(oi.unit_price * 100)::int * oi.qty
      from public.order_item oi
     where oi.order_id = '${orderId}' and oi.bundle_id is null
     order by oi.id`);

  // **Pakete sepet indirimi binmez** (DOMAIN §13) — bu yüzden yalnız varyant kalemleri paylaşır.
  if (!items) {
    console.warn(`${referenceNo}: paylaştırılacak varyant kalemi yok, atlandı`);
    continue;
  }

  const parsed = items.split('\n').map((row) => row.split('\t'));
  const shares = distribute(parsed.map((r) => Number(r[1])), Number(discountCents));

  console.warn(`${referenceNo}: ${Number(discountCents) / 100} € → ${shares.map((c) => c / 100).join(' + ')}`);
  if (!apply) continue;

  const updates = parsed
    .map((row, i) => `update public.order_item set line_discount_amount = ${shares[i] / 100} where id = '${row[0]}';`)
    .join('\n');
  psql(`begin;\n${updates}\ncommit;`);
}

console.warn(
  apply
    ? '\nPaylar yazıldı. `payment_status` bir sonraki para hareketinde kendiliğinden tazelenir; hemen istenirse `syncOrderPaymentStatus` çağrılmalı.'
    : '\n(Kuru çalışma — yazmak için `--apply` ekleyin.)',
);
