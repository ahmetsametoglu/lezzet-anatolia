import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * **KURAL TAŞIYAN ŞEMA TESTSİZ KALAMAZ** (01.13 · denetim ölçümü 26.08).
 *
 * `layering.test.ts`in kardeşi: o yapıyı zorlar, bu KAPSAMI. İkisinin de yaptığı iş aynı —
 * derleyicinin göremediği bir proje kararını makineye bağlamak.
 *
 * Nereden çıktı: modül 01 "tamam" sayılırken ölçüldü ki 81 şemanın yalnız 5'inin testi var ve
 * kural TAŞIYAN dokuz dosyanın hiçbirinde test yok — üstelik modülün kendi bitiş kriteri
 * *"örnek geçerli/geçersiz kayıtlarla parse birim testleri geçiyor"* diyordu. Borç kimsenin işi
 * olmadığı için birikmişti; birikmesin diye kural buraya kondu.
 *
 * ── ÖLÇÜT NEDEN `refine|superRefine|transform|coerce` ──────────────────────────
 * Testi hak eden şey, geçerli GÖRÜNEN bir girdiyi REDDEDEN ya da onu DEĞİŞTİREN koddur: "en az bir
 * dil", "telefon ya da e-posta", "null sıfıra düşmez". Bunlar bizim kararlarımızdır ve sessizce
 * bozulurlar.
 *
 * `discriminatedUnion` bilerek DIŞARIDA: o bir şekil beyanıdır, red kuralı değil — ve uçlar zaten
 * `z.input<typeof …>` ile derleme kilidine bağlı (bir kol eksik alan taşırsa DERLENMEZ). Onu da
 * kapsama katmak, otuza yakın yanıt şeması için değeri düşük parse testi yazdırmak olurdu; kural
 * ancak hak edilmiş olduğu yerde saygı görür.
 *
 * Düz aynalar (`z.string()`, `z.number()`) hiç sayılmaz: onları sınamak Zod'u sınamaktır.
 */

const SRC = fileURLToPath(new URL('.', import.meta.url));
const LAYERS = ['primitives', 'entities', 'contracts'] as const;

/** Geçerli görünen girdiyi reddeden ya da değiştiren kod — testi hak eden şey budur. */
const RULE = /\.(refine|superRefine|transform)\(|z\.coerce/;

function schemaFiles(): string[] {
  return LAYERS.flatMap((layer) =>
    readdirSync(join(SRC, layer))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => `${layer}/${f}`),
  );
}

describe('kural taşıyan şemanın testi olmalı', () => {
  it('red/çevrim kuralı taşıyan her dosyanın komşusunda bir test dosyası var', () => {
    const testsiz = schemaFiles()
      .filter((rel) => RULE.test(readFileSync(join(SRC, rel), 'utf8')))
      .filter((rel) => {
        const [layer, file] = rel.split('/') as [string, string];
        const komsu = `${file.replace(/\.ts$/, '')}.test.ts`;
        return !readdirSync(join(SRC, layer)).includes(komsu);
      });

    // Hata mesajı LİSTEYİ taşır: "false olmalıydı" diyen bir düşüş, yazanı dosyaları elle
    // taramaya gönderir. Kural ancak nerede ihlal edildiğini söylediğinde uygulanabilir.
    expect(testsiz, `kural taşıyor ama testi yok:\n  ${testsiz.join('\n  ')}`).toEqual([]);
  });

  /**
   * Ölçütün KENDİSİ de bir varsayımdır: desen hiçbir şeyi yakalamaz hâle gelirse (şemalar
   * değişir, Zod sürümü kalıbı değiştirir) test yeşil kalır ve hiçbir şey korumaz — sessizce
   * ölmüş bir kural, hiç yazılmamış kuraldan kötüdür.
   */
  it('desen gerçekten bir şey yakalıyor — kural sessizce ölmesin', () => {
    const kurallilar = schemaFiles().filter((rel) => RULE.test(readFileSync(join(SRC, rel), 'utf8')));
    expect(kurallilar.length).toBeGreaterThan(0);
  });
});
