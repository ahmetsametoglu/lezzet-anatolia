/**
 * Test artığı depoların süpürülmesi — `pnpm test:purge` (denetim R · depo ekseni talebi §6b).
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────────
 * Entegrasyon testleri kendi depolarını `createTestWarehouse` ile açar ve `afterAll`'da
 * `purgeTestData` ile toplar. Ama **düşen bir koşu `afterAll`'a hiç varamaz** (yaşandı: PostgREST
 * şema önbelleği kaçtı, 47 dosya yarıda öldü) ve satırlar kalır. Kalan depolar `warehouse`
 * tablosundadır — yani operasyon ekranının LİSTELEYECEĞİ yerde: depo seçicisi açıldığında
 * `T-MSAFW5VS1` gibi sekiz satır operatöre gösterilir.
 *
 * Ekranın bunları süzmesi ÇÖZÜM DEĞİL (operasyon şeridinin haklı itirazı): ekran veriyi düzeltmez,
 * gösterir. Süzen bir ekran, çöpü görünmez yapar ve çöp birikmeye devam eder.
 *
 * `db:reset` de çözüm değil: kullanıcının elle girdiği veriyi siler ve onun kararıdır.
 *
 * ── NEYİ HEDEFLER ────────────────────────────────────────────────────────────
 * YALNIZ `createTestWarehouse`'un ürettiği kod desenini: `T` + isteğe bağlı etiket + `-` + damga
 * (`T-MSAFW5VS1`, `TPRF-MSD284Z01`). Gerçek depolar (`STR`, `KEHL`) bu desene UYMAZ ve elle açılan
 * bir deponun bu deseni tutturması pratikte imkânsızdır — damga `Date.now()` tabanlı 10 karakter.
 *
 * ── VARSAYILAN KURU KOŞUDUR ──────────────────────────────────────────────────
 * Komut yalnız NE SİLECEĞİNİ yazar; silmek için `--apply` gerekir. Silme geri alınamaz ve bu script
 * paylaşılan yerel veritabanına vuruyor: "çalıştırdım, ne sildiğini görmedim" hâli, temizlemeye
 * çalıştığı sorundan kötüdür.
 */
// Script Next.js dışında koşar — `.env` elle yüklenir (Node 22 `process.loadEnvFile`), ve
// istemciyi kuran import'tan ÖNCE: `serviceDb()` modül yüklenirken anahtarları okuyor.
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // Yoksa sorun değil: değişkenler ortamdan gelmiş olabilir.
}

const { serviceDb } = await import('@lezzet/database');
const { purgeTestData } = await import('@lezzet/database/testing');

/** `createTestWarehouse` deseni: `T` + harf/rakam etiket + `-` + büyük harfli damga. */
const TEST_CODE = /^T[A-Z0-9]*-[A-Z0-9]{4,12}$/;

const apply = process.argv.includes('--apply');
const db = serviceDb();

const { data, error } = await db.from('warehouse').select('id,code,name,created_at').order('created_at');
if (error) throw error;

const hepsi = (data ?? []) as Array<{ id: string; code: string; name: string; created_at: string }>;
const artiklar = hepsi.filter((w) => TEST_CODE.test(w.code));

if (artiklar.length === 0) {
  console.log(`✓ test artığı depo yok (${hepsi.length} depo var, hepsi gerçek)`);
  process.exit(0);
}

console.log(`${artiklar.length} test artığı depo bulundu (toplam ${hepsi.length}):`);
for (const w of artiklar) console.log(`  · ${w.code} — ${w.name} (${w.created_at.slice(0, 10)})`);

if (!apply) {
  console.log('\nKuru koşu. Silmek için: pnpm test:purge --apply');
  process.exit(0);
}

// Silme SIRASI tek yerde (`cleanup.ts`) ve `mustDelete` üzerinden: bir FK engellerse hata kısıtın
// ADIYLA fırlar. Depoya bağlı bir sipariş/parti kalmışsa bu script onu silmez — silmemeli de:
// o satır bir testin değil, elle kurulmuş bir senaryonun parçası olabilir. Engeli görüp durur.
let silinen = 0;
for (const w of artiklar) {
  try {
    await purgeTestData(db, { warehouseIds: [w.id] });
    silinen += 1;
    console.log(`  ✓ ${w.code} silindi`);
  } catch (err) {
    console.log(`  ✗ ${w.code} SİLİNEMEDİ — ${err instanceof Error ? err.message : String(err)}`);
    console.log('    (depoya bağlı satır var; elle bakılmalı — script kör silme yapmaz)');
  }
}
console.log(`\n${silinen}/${artiklar.length} depo temizlendi.`);
