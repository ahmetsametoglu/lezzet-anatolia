import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SETTING_CATALOG, type SettingValue } from './settings-catalog';

/**
 * Nöbet: sözlükteki fabrika değeri migration'ın yazdığıyla aynı mı. Sözlük `fallback`ı bilerek kopyalar ve kopya sessizce ayrışabilir;
 * tip denetimi bunu göremediği için test SQL'i okur.
 */

const ROOT = new URL('../../../../../../', import.meta.url).pathname;
const MIGRATIONS = ['0013_settings.sql', '0018_money.sql', '0028_points.sql', '0029_feedback_request.sql'];

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
    if (def.fallback === undefined) {
      /**
       * Fabrika değeri olmayan ayar (ör. kart aktarım hesabı) migration'da da yazılmamalı; yoksa ekran "Varsayılana dön" sunmadığı bir
       * ayarın aslında varsayılanı olduğunu hiç öğrenmezdi.
       */
      it(`${def.key} — fabrika değeri YOK, migration da yazmamalı`, () => {
        expect(
          seeded.has(def.key),
          `${def.key} sözlükte fabrika değersiz ama migration onu yazıyor — ikisinden biri yanlış`,
        ).toBe(false);
      });
      continue;
    }

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
