import { render, screen } from '@testing-library/react-native';
import fs from 'node:fs';
import path from 'node:path';
import { Text, View } from 'react-native';

import { operationsTheme } from '@/theme/unistyles';
import { OperationsHeadBleed } from './head-bleed';

/*
  İKİ AYRI İDDİA, İKİSİ DE AYNI ARIZANIN BEKÇİSİ.

  1) Komponentin KENDİSİ: verilen dolguyu ters işaretle geri alıyor mu.
  2) YERLEŞTİRME: kaydırıcının dolgulu gövdesine konan her yığın başlığı sarılmış mı.

  İkincisi neden makineyle aranıyor: bu arıza 08.09'da elle süpürüldü ve süpürme YARIM KALDI —
  11 ekran düzeltilirken 12'si atlandı, kullanıcı bunu cihazda buldu. Kusur bir dosyanın içinde
  değil, dosyaların ARASINDA duruyor; `typecheck` göremez (sarmalamamak tip hatası değil),
  `lint` de göremez (proje disiplini, dil kuralı değil). Görebilen tek şey kaynağı tarayan bir
  iddiadır — `docs:check`in doküman için yaptığının aynısı.
*/

describe('OperationsHeadBleed', () => {
  const styleOf = (testID: string) => {
    const flat = ([] as unknown[]).concat(screen.getByTestId(testID).parent?.props.style ?? []);
    return Object.assign({}, ...flat.filter((entry) => entry !== null && entry !== undefined));
  };

  it('gövdenin YATAY dolgusunu ters işaretle geri alır', async () => {
    await render(
      <OperationsHeadBleed pad="6xl">
        <Text testID="cocuk">başlık</Text>
      </OperationsHeadBleed>,
    );

    expect(styleOf('cocuk').marginHorizontal).toBe(-operationsTheme.space['6xl']);
  });

  /* `padTop` VERİLMEZSE ÜST BOŞLUK HİÇ YAZILMAZ: sıfır yazmak da bir değerdir ve gövdenin kendi
     üst dolgusu olmayan ekranlarda başlığı yukarı çekerdi. */
  it('padTop verilmezse marginTop YAZILMAZ', async () => {
    await render(
      <OperationsHeadBleed pad="5xl">
        <Text testID="cocuk">başlık</Text>
      </OperationsHeadBleed>,
    );

    expect(styleOf('cocuk').marginTop).toBeUndefined();
  });

  it('padTop verilirse ÜST dolgu da geri alınır — dikey kayma bundan doğuyordu', async () => {
    await render(
      <OperationsHeadBleed pad="5xl" padTop="sm">
        <View testID="cocuk" />
      </OperationsHeadBleed>,
    );

    const style = styleOf('cocuk');
    expect(style.marginHorizontal).toBe(-operationsTheme.space['5xl']);
    expect(style.marginTop).toBe(-operationsTheme.space.sm);
  });
});

/*
  ── YERLEŞTİRME BEKÇİSİ ─────────────────────────────────────────────────────

  Kural: bir yığın başlığı kaydırıcının `contentContainerStyle`lı gövdesinin İÇİNDE çiziliyorsa
  `OperationsHeadBleed` ile sarılmış olmalı. Dışarıda çizilen dallar kapsam dışı — orada başlık
  zaten kendi ölçüsünde.

  Dal sınırı: geriye tararken `return (` / `if (` gibi bir dal başlangıcına çarparsak o kaydırıcı
  BAŞKA bir dala aittir ve başlığı kapsamaz. Bu sınır olmadan tarama, aynı dosyanın önceki
  dalındaki kaydırıcıyı yanlışlıkla kap sanıyor (ölçüldü: `stock-count` ve `write-off`in sonuç
  dallarında başlık `styles.screen`in doğrudan çocuğu, `FormScroll` bir ALT satırda başlıyor).
*/
describe('yığın başlığının yerleştirmesi', () => {
  const SCREENS = path.join(__dirname, '..', '..', 'screens');

  const tsxFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return tsxFiles(full);
      return entry.isFile() && entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx') ? [full] : [];
    });

  it('kaydırıcının içindeki HER başlık `OperationsHeadBleed` ile sarılı', () => {
    const sarilmamis: string[] = [];
    let sarili = 0;

    for (const file of tsxFiles(SCREENS)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      if (!lines.some((line) => line.includes('OperationsStackHeader'))) continue;

      lines.forEach((line, i) => {
        const cizim = /\{header\}/.test(line) || /^\s*<OperationsStackHeader\b/.test(line);
        if (!cizim) return;
        // Başlığı ÜRETEN satır (`const header = <OperationsStackHeader`) bir çizim değil.
        if (/(?:const|let)\s+\w+\s*=/.test(line)) return;

        let kap: string | null = null;
        for (let j = i - 1; j >= 0 && j > i - 60; j -= 1) {
          if (/^\s*(return \(|if \()/.test(lines[j])) break;
          if (/contentContainerStyle=\{\[?styles\./.test(lines[j])) {
            kap = lines[j];
            break;
          }
        }
        if (kap === null) return;

        const pencere = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
        if (pencere.includes('OperationsHeadBleed')) sarili += 1;
        else sarilmamis.push(`${path.relative(SCREENS, file)}:${i + 1}`);
      });
    }

    expect(sarilmamis).toEqual([]);
    // Bekçinin GERÇEKTEN baktığını da doğrular: kural bir gün hiçbir şey eşleştirmezse yeşil
    // kalırdı ve kimse fark etmezdi (boş bir tarama da "sıfır hata" der).
    expect(sarili).toBeGreaterThan(15);
  });
});
