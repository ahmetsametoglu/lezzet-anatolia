/**
 * Test kilidini TUTAN sahibe göre ne yapılacağı: devral · katıl · bekle.
 *
 * Kilit dizini `with-test-lock.mjs` ile `shared-test-run.mjs` arasında ORTAKTIR ve onu üç tür iş
 * tutabilir: tam paket koşucusunun kendisi (`suite`), e2e/entegrasyon/ölçüm koşuları (`test` —
 * `with-test-lock`un varsayılanı) ve şema işleri (`ddl`). Katılınabilecek TEK sahip tam paket
 * koşucusudur, çünkü `.test-results/latest.json`a yalnız o yazar; başka bir işe "katılmak" bir
 * öncekinin sonucunu yeni sanmaktır.
 *
 * **Ölçülmüş arıza (10.09):** eskiden `test` türündeki her sahip "süren tam paket" sayılıyordu.
 * Denetmen e2e ya da entegrasyon koşarken tetiklenen `pnpm test` hiçbir test koşmadan bekliyor,
 * kilit kalkınca BİR ÖNCEKİ tam paketin sonucunu basıp onun çıkış koduyla bitiyordu — değişiklik
 * hiç test edilmeden "geçti". Aynı tuzak DDL için 03.08'de kapatılmıştı; bu modül kuralı tür
 * sayarak değil TERSİNDEN kuruyor: sahip tam paket değilse katılınmaz.
 *
 * Saf karar (süreç, dosya yok) — birim testi `test-lock-owner.test.ts`.
 */

/** Tam paket koşucusunun (`shared-test-run.mjs`) kilide yazdığı tür. */
export const SUITE_KIND = 'suite';

/**
 * @param {{ pid?: number, at?: number, kind?: string } | null} owner `owner.json` içeriği; okunamadıysa `null`
 * @param {{ now: number, staleMs: number, isAlive: (pid: number) => boolean }} env
 * @returns {'takeover' | 'join' | 'wait'}
 */
export function ownerAction(owner, { now, staleMs, isAlive }) {
  // Sahibi çökmüşse (Ctrl-C, kill -9) ya da kilit bayatlamışsa devralınır — ölü bir sürecin
  // kilidi ertesi gün de kimseyi bekletmemeli.
  const dead = owner?.pid ? !isAlive(owner.pid) : true;
  const stale = !owner || now - owner.at > staleMs;
  if (dead || stale) return 'takeover';
  // Türü yazılmamış sahip (eski sürümün kilidi) de katılınacak koşu sayılmaz: beklemek, yanlış
  // sonucu okumaktan ucuzdur.
  return owner.kind === SUITE_KIND ? 'join' : 'wait';
}
