/**
 * Commit kapısının ve tam paket koşucusunun SAF kararları (kullanıcı kararı 15.09, CLAUDE §4b) —
 * `commit-tests.mjs` ile `shared-test-run.mjs` buradan okur; test `test-gate-rules.test.ts`.
 *
 * Tam paket artık her commit'in kapısı değil. Ölçüldü (15.09): tam paket 4 dk 39 sn ve neredeyse
 * tamamı SIRAYLA koşan 205 entegrasyon dosyası; 13.09'dan beri 83 commit'in en az 23'ü bu dosyaların
 * bağlı olduğu hiçbir koda dokunmamıştı. Commit'in entegrasyon testi yollardan seçilir (`vitest
 * related`); tam paket yalnız aşağıdaki tetiklerden birine dokunulunca koşar. Tetikler içe aktarma
 * zincirinde GÖRÜNMEYEN bağlardır — `related` bir migration'ın, seed'in ya da test kurulumunun hangi
 * testi etkilediğini bilemez.
 */

/** Tam paket isteyen yollar — desen ve sebep. Liste TEK yerde; kural metni (CLAUDE §4b) buraya bakar. */
export const FULL_TRIGGERS = [
  { pattern: /^supabase\//, why: 'şema, migration ya da yerel Supabase ayarı' },
  { pattern: /^scripts\/seed/, why: 'seed — yerel verinin kaynağı' },
  { pattern: /^packages\/database\/src\/testing\//, why: 'test fikstürü ve temizlik sırası' },
  { pattern: /^vitest\.(config|setup)[^/]*$/, why: 'test yapılandırması' },
  {
    pattern: /^scripts\/(shared-test-run|with-test-lock|test-lock-owner|test-gate-rules|commit-tests)\.mjs$/,
    why: 'test koşucusu ve kilidi',
  },
  { pattern: /^pnpm-lock\.yaml$/, why: 'bağımlılık sürümü' },
  { pattern: /^package\.json$/, why: 'kök betikler ve bağımlılıklar' },
];

/**
 * Depo köküne göre yol: `./` öneki ve ters ayraç düşer — desenler bu biçimi bekler.
 * @param {string} path
 * @returns {string}
 */
export const normalizePath = (path) => path.replace(/\\/g, '/').replace(/^\.\//, '');

/**
 * İlk tetikleyen yol ve sebebi; tetik yoksa `null`.
 * @param {readonly string[]} paths
 * @returns {{ path: string, why: string } | null}
 */
export function fullTriggerOf(paths) {
  for (const raw of paths) {
    const path = normalizePath(raw);
    const hit = FULL_TRIGGERS.find((trigger) => trigger.pattern.test(path));
    if (hit) return { path, why: hit.why };
  }
  return null;
}

/**
 * Tam paketin gerekçesi: `--reason=health` ya da `--reason=commit:<yol>`. Başka her şey `null` —
 * koşucu gerekçesiz koşmaz (kullanıcı kararı 15.09).
 * @param {readonly string[]} argv
 * @returns {{ kind: 'health' | 'commit', text: string } | null}
 */
export function parseReason(argv) {
  const arg = argv.find((a) => a.startsWith('--reason='));
  if (!arg) return null;
  const text = arg.slice('--reason='.length);
  if (text === 'health') return { kind: 'health', text };
  if (/^commit:.+/.test(text)) return { kind: 'commit', text };
  return null;
}

/**
 * `history.jsonl` → kayıtlar. Bozuk satır ATLANIR: koşucu satırı yazarken ölmüş olabilir ve tek yarım
 * satır geçmişin tamamını okunmaz kılmamalı.
 * @param {string} text
 * @returns {Array<{ startedAt?: string, status?: string, reason?: string, head?: string | null }>}
 */
export function parseHistory(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Yarım satır — künyedeki gerekçeyle atlanır.
    }
  }
  return entries;
}

/**
 * Sağlık koşusu kararı. HEAD, GEÇEN son sağlık koşusundan beri değişmediyse koşu yeni bilgi üretmez →
 * koşulmaz. Son sağlık koşusu düştüyse aynı HEAD'de yeniden serbest (düşüşün kalıcı olup olmadığı yeni
 * bilgidir). HEAD okunamadıysa engellenmez: ölçülemeyen değer "aynı" sayılmaz.
 * @param {ReturnType<typeof parseHistory>} history
 * @param {string | null} head
 * @returns {{ run: true } | { run: false, since: string | undefined }}
 */
export function healthVerdict(history, head) {
  if (!head) return { run: true };
  const last = history.findLast((entry) => entry.reason === 'health');
  if (last && last.status === 'passed' && last.head === head) return { run: false, since: last.startedAt };
  return { run: true };
}
