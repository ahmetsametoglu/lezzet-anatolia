import { afterAll, describe, expect, it } from 'vitest';
import { ErrorLogService, JobRunService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { runJob } from './runner';

/**
 * Cron kabuğu (18.11 · denetim T4). **İnce sarmalayıcılar yerine burası sınanıyor:**
 * `sweep-reservations`/`collect-health` yalnız bir servisi çağırıp sonucu döndürüyor — onların
 * testi servis testinin kopyası olurdu. Gerçek mantık kabukta: üst üste binme koruması, çifte iz
 * ve "hata yutulmaz ama süreç düşmez" garantisi.
 *
 * Sonuncusu neden önemli: kabuk hatayı yeniden fırlatsaydı, `node-cron` geri çağrısında doğan bu
 * hata hiçbir sarmala düşmez ve süreci öldürürdü — dört cron birden susardı.
 */
const db = serviceDb();
const jobRuns = new JobRunService(db);
const errors = new ErrorLogService(db);

const stamp = Date.now();
/** Damgalı ad ŞART: `job_run` iş adı başına tek satır tutar, gerçek adı kullanan test üretim izini ezer. */
const jobName = (suffix: string) => `test_runner_${suffix}_${stamp}`;
const kullanilanIsler: string[] = [];

function isAdi(suffix: string): string {
  const name = jobName(suffix);
  kullanilanIsler.push(name);
  return name;
}

afterAll(async () => {
  await purgeTestData(db, { jobNames: kullanilanIsler });
});

describe('cron kabuğu', () => {
  it('başarılı tur sonucu ize yazar', async () => {
    const name = isAdi('basari');
    await runJob(name, async () => ({ swept: 3 }));

    const iz = await jobRuns.findByName(name);
    expect(iz?.lastResult).toMatchObject({ swept: 3 });
    // Durum ayrı bir kolon DEĞİL, `lastError`'ın boşluğundan türer — başarı "hata yok" demektir.
    expect(iz?.lastError).toBeNull();
  });

  /**
   * "Koştu ama düştü" ile "hiç koşmadı" ayrımı bu testin konusu; gecikme alarmı (18.6) ve sağlık
   * görüntüsü tam da bu ayrımı okuyor.
   */
  it('düşen tur SÜRECİ ÖLDÜRMEZ — hata yukarı fırlamaz', async () => {
    const name = isAdi('dusen');
    // `runJob` fırlatsaydı bu satır patlardı. Beklenti "reddetmiyor"dan ibaret değil: cron geri
    // çağrısında doğan bir hatanın sarmalı yoktur, süreç ölür ve dört iş birden susar.
    await expect(runJob(name, async () => { throw new Error('kasıtlı tur hatası'); })).resolves.toBeUndefined();
  });

  it('düşen tur İKİ iz bırakır: job_run "koştu mu", error_log "neden koşamadı"', async () => {
    const name = isAdi('cifte_iz');
    await runJob(name, async () => { throw new Error('kasıtlı çifte iz hatası'); });

    const iz = await jobRuns.findByName(name);
    expect(iz?.lastError).toContain('kasıtlı çifte iz hatası');
    // `lastRunAt` DÜŞSE de yazılır: "koştu ama hata verdi" ile "hiç koşmadı" ayrımı gecikme
    // alarmının (18.6) tek dayanağı.
    expect(iz?.lastRunAt).toBeTruthy();

    // İkinci iz ayrı bir soruyu yanıtlıyor: `job_run` iş başına TEK satır tuttuğu için ikinci bir
    // düşüş birincinin mesajını ezer; "üç gündür her turda düşüyor" ancak hata kaydında görünür.
    const { rows } = await errors.listRecent({ limit: 50 });
    const kayit = rows.find((row) => (row.context as { job?: string }).job === name);
    expect(kayit?.source).toBe('backend-cron');
    expect(kayit?.message).toContain('kasıtlı çifte iz hatası');
  });

  /**
   * Üst üste binme: önceki tur bitmediyse yeni tik ATLANIR. Tek instance'ta bile yavaş bir tur
   * ikinci tikle çakışırsa aynı satırlar iki kez işlenir — taramalı işlerde bu, aynı rezervasyonu
   * iki kez süpürmek ya da aynı daveti iki kez göndermek demek.
   */
  it('önceki tur sürerken gelen tik ATLANIR', async () => {
    const name = isAdi('binme');
    let kacKezKostu = 0;
    let birakKossun: () => void = () => {};
    const bekleyen = new Promise<void>((resolve) => { birakKossun = resolve; });

    const ilk = runJob(name, async () => {
      kacKezKostu += 1;
      await bekleyen;
      return { tur: 1 };
    });

    // İlk tur HÂLÂ sürerken ikinci tik: gövdesi hiç çalışmamalı.
    await runJob(name, async () => {
      kacKezKostu += 1;
      return { tur: 2 };
    });
    expect(kacKezKostu).toBe(1);

    birakKossun();
    await ilk;

    // Kilit turun sonunda BIRAKILIR — aksi hâlde iş bir kez koşup bir daha hiç koşmazdı ve bu,
    // üst üste binmekten daha sessiz bir arıza olurdu.
    await runJob(name, async () => { kacKezKostu += 1; return { tur: 3 }; });
    expect(kacKezKostu).toBe(2);
  });
});
