import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SETTING_CATALOG, type SettingValue } from './settings-catalog';

/**
 * NÖBET — sözlükteki fabrika değeri migration'ın yazdığı değerle AYNI mı.
 *
 * Sözlük `fallback` alanını bilerek kopyalıyor (gerekçe `settings-catalog.ts` künyesinde: satır
 * düzenlenince fabrika değeri veride kalmaz, ama ekran "varsayılan 20,00 €" yazıp "Varsayılana dön"
 * sunuyor). Bilinçli kopyanın bedeli sessiz ayrışmadır: migration'daki sayı değişir, ekran eski
 * sayıyı "varsayılan" diye göstermeye devam eder ve kimse fark etmez.
 *
 * Test o yüzden SQL'i okuyor. Tip denetimi bunu göremez — iki taraf da geçerli birer sayı.
 */

const ROOT = new URL('../../../../../../', import.meta.url).pathname;
const MIGRATIONS = ['0016_settings.sql', '0037_points.sql', '0038_feedback_request.sql'];

/** `insert into public.settings … values (…);` bloğundaki anahtar → değer eşlemesi. */
function seededSettings(): Map<string, SettingValue> {
  const found = new Map<string, SettingValue>();
  for (const file of MIGRATIONS) {
    const sql = readFileSync(`${ROOT}supabase/migrations/${file}`, 'utf8');
    const start = sql.indexOf('insert into public.settings');
    if (start === -1) throw new Error(`${file}: settings insert'i bulunamadı — dosya taşındıysa bu test güncellenmeli`);
    // İfadenin sonu SATIRDAN bulunur, ilk `;`den DEĞİL: açıklama metinlerinde noktalı virgül var
    // ("…altına inilemez; ödeme penceresi…") ve ona göre kesmek bloğu ilk satırda bitiriyordu.
    const lines: string[] = [];
    for (const line of sql.slice(start).split('\n')) {
      lines.push(line);
      if (line.trimEnd().endsWith(');')) break;
    }
    const block = lines.join('\n');

    // ('anahtar', 'json değer', …) — SQL'de tek tırnak ikizlenerek kaçırılır ('' → ').
    for (const m of block.matchAll(/\(\s*'([a-z_]+)',\s*'((?:[^']|'')*)'/g)) {
      found.set(m[1]!, JSON.parse(m[2]!.replace(/''/g, "'")) as SettingValue);
    }
  }
  return found;
}

describe('ayar sözlüğü ↔ migration', () => {
  const seeded = seededSettings();

  it('migration gerçekten okunabildi (regex boşa düşmüş olmasın)', () => {
    // Kendi ölçüm aracının nöbeti: eşleme hiç çalışmasaydı aşağıdaki döngü de sessizce boş geçerdi.
    expect(seeded.size).toBeGreaterThanOrEqual(25);
  });

  for (const def of SETTING_CATALOG) {
    it(`${def.key} — fabrika değeri migration ile aynı`, () => {
      expect(seeded.has(def.key), `${def.key} hiçbir migration'da tanımlı değil`).toBe(true);
      expect(seeded.get(def.key)).toEqual(def.fallback);
    });
  }

  it('sözlük anahtarları tekil', () => {
    const keys = SETTING_CATALOG.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
