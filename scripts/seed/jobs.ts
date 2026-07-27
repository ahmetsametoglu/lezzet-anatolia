import { JobRunService } from '@lezzet/database';
import { an, tabloDolu, type Db } from './shared';

// ── Zamanlanmış iş izi (06) ──────────────────────────────────────────────────────────────────────
// İş başına TEK satır (tarihçe tutulmaz). Biri BAŞARISIZ: "koştu ama hata verdi" ile "hiç koşmadı"
// birbirine karışmasın — gecikme alarmı bu ayrımı okur.

export async function seedJobRuns(db: Db): Promise<void> {
  if (await tabloDolu(db, 'job_run')) {
    console.log('▸ iş izleri zaten dolu — atlandı');
    return;
  }
  const jobs = new JobRunService(db);
  await jobs.recordSuccess('reservation-sweep', { released: 3, scannedAt: an(0) });
  await jobs.recordSuccess('near-expiry-scan', { flagged: 4, discounted: 2 });
  await jobs.recordFailure('supplier-price-sync', 'Tedarikçi API zaman aşımı (10s) — 3 deneme sonrası bırakıldı.');
  console.log('✓ iş izi: 3 kayıt (2 başarılı · 1 HATALI)');
}

