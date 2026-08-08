#!/usr/bin/env node
// Tasarım aracının ürettiği .dc.html dosyasını EKRAN BAŞINA parçalara böler.
//
// Neden: tek dosyada 2000+ satır tasarım var; bir ekranı bulmak için dosyanın
// tamamını taramak gerekiyor. Bu script her ekranı kendi dosyasına çıkarır ve
// her parçanın başına KAYNAK SATIR ARALIĞINI yazar — kod künyelerimiz "v3:238"
// biçiminde satır referansı kullandığı için aralıklar olmadan çıktı işe yaramaz.
//
// Kaynak dosya SALT OKUNURDUR: tasarım aracının senkron çıktısıdır ve her
// senkronda ezilir. Bu yüzden bölme elle değil, bu deterministik script ile
// yapılır — her senkrondan sonra `pnpm design:split` yeniden koşulur.
//
// Kullanım: node scripts/design-split.mjs 'design/project/Mobil - Musteri v3.dc.html'

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ROOT = join(REPO_ROOT, 'design', 'derived');

// Ekran koşulu: <sc-if value="{{ vEkranAdi }}"> — "v" + büyük harf ile başlayanlar ekrandır.
// (İç koşullar `pd.so`, `cv.empty`, `tabsVisible` gibi adlar taşır, bu kalıba uymaz.)
const SCREEN_OPEN = /^\s*<sc-if\s+value="\{\{\s*(v[A-Z][A-Za-z0-9_]*)\s*\}\}"/;
// Görünüm-modeli kurucusu: `if(V.vEkranAdi){ … }` — betiğin içinde, satır başında.
const CTOR_OPEN = /^\s*if\s*\(\s*V\.(v[A-Z][A-Za-z0-9_]*)\s*\)\s*\{/;
const SCREEN_LABEL = /data-screen-label="([^"]*)"/;
const FULL_LINE_COMMENT = /^\s*<!--.*-->\s*$/;
const DC_SCRIPT_OPEN = /^<script\b[^>]*\bdata-dc-script\b/;

// ————————————————————————————————————————————————————————————— yardımcılar

const TR_MAP = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
  â: 'a',
  Â: 'a',
  î: 'i',
  Î: 'i',
  û: 'u',
  Û: 'u',
};

/** Dosya/etiket adını ASCII slug'a çevirir (Türkçe harfler önce çevrilir). */
function slugify(text) {
  const mapped = [...text].map((ch) => TR_MAP[ch] ?? ch).join('');
  const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');
  return mapped
    .normalize('NFD')
    .replace(COMBINING, '') // birleşen aksanlar
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Etiket metnindeki temel HTML varlıklarını çözer (dizin tablosu için). */
function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Satırdaki `<sc-if` / `</sc-if>` sayısının farkı — blok derinliği için. */
function scIfDelta(line) {
  const open = line.match(/<sc-if\b/g)?.length ?? 0;
  const close = line.match(/<\/sc-if>/g)?.length ?? 0;
  return open - close;
}

/**
 * JS satırındaki süslü parantez derinliğini ilerletir.
 * Dize ('…' "…" `…`), satır yorumu (//) ve blok yorumu içindeki parantezler sayılmaz.
 * Düzenli ifade sabitleri ayrıştırılmaz — içlerindeki `{n}` nicelikleri zaten dengelidir.
 */
function advanceBraceDepth(line, state) {
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (state.inBlockComment) {
      if (ch === '*' && line[i + 1] === '/') {
        state.inBlockComment = false;
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }
    if (state.stringChar) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === state.stringChar) state.stringChar = null;
      i += 1;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') return; // satır sonuna kadar yorum
    if (ch === '/' && line[i + 1] === '*') {
      state.inBlockComment = true;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      state.stringChar = ch;
      i += 1;
      continue;
    }
    if (ch === '{') state.depth += 1;
    else if (ch === '}') state.depth -= 1;
    i += 1;
  }
}

// ————————————————————————————————————————————————————————— blok bulucular

/**
 * Ekran `sc-if` bloklarını bulur. Dönen aralıklar 1 tabanlı ve kapsayıcıdır.
 * İç içe geçmeyi önlemek için bulunan bloğun sonundan devam edilir.
 */
function findScreenBlocks(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(SCREEN_OPEN);
    if (!match) {
      i += 1;
      continue;
    }
    let depth = 0;
    let end = i;
    for (let j = i; j < lines.length; j += 1) {
      depth += scIfDelta(lines[j]);
      if (depth === 0) {
        end = j;
        break;
      }
      end = j;
    }
    // Hemen üstündeki tam satır HTML yorumu ekrana aittir (bölüm başlığı).
    let start = i;
    while (start > 0 && FULL_LINE_COMMENT.test(lines[start - 1]) && !isClaimed(blocks, start - 1)) {
      start -= 1;
    }
    const body = lines.slice(i, end + 1).join('\n');
    const labelMatch = body.match(SCREEN_LABEL);
    blocks.push({
      variable: match[1],
      startLine: start + 1,
      endLine: end + 1,
      label: labelMatch ? decodeEntities(labelMatch[1]) : null,
      kind: labelMatch ? 'görünüm bloğu' : 'ekran dışı blok',
    });
    i = end + 1;
  }
  return blocks;
}

function isClaimed(blocks, index) {
  const line = index + 1;
  return blocks.some((b) => line >= b.startLine && line <= b.endLine);
}

/** Sayfa sonundaki `data-dc-script` bloğunun sınırlarını (1 tabanlı) bulur. */
function findScriptRegion(lines) {
  const openIndex = lines.findIndex((line) => DC_SCRIPT_OPEN.test(line));
  if (openIndex === -1) return null;
  let closeIndex = -1;
  for (let i = openIndex + 1; i < lines.length; i += 1) {
    if (lines[i].includes('</script>')) {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) return null;
  return { openLine: openIndex + 1, closeLine: closeIndex + 1 };
}

/** Betik içindeki `if(V.vEkran){ … }` kurucu bloklarını bulur. */
function findCtorBlocks(lines, region) {
  if (!region) return [];
  const blocks = [];
  let i = region.openLine; // açılış etiketinden sonraki satır (0 tabanlı indeks)
  const limit = region.closeLine - 1; // kapanış etiketi hariç
  while (i < limit) {
    const match = lines[i].match(CTOR_OPEN);
    if (!match) {
      i += 1;
      continue;
    }
    const state = { depth: 0, stringChar: null, inBlockComment: false };
    let end = -1;
    for (let j = i; j < limit; j += 1) {
      advanceBraceDepth(lines[j], state);
      if (state.depth <= 0) {
        end = j;
        break;
      }
    }
    if (end === -1) {
      // Kapanış bulunamadı: yanlış kesip parça uydurmaktansa atlıyoruz.
      process.stderr.write(`  uyarı: ${match[1]} kurucusu (satır ${i + 1}) kapanmadı — kurucu parçası atlandı\n`);
      i += 1;
      continue;
    }
    blocks.push({
      variable: match[1],
      startLine: i + 1,
      endLine: end + 1,
      kind: 'görünüm-modeli kurucusu',
      isScript: true,
    });
    i = end + 1;
  }
  return blocks;
}

// —————————————————————————————————————————————————————————————— çıktı

function formatRanges(parts) {
  return parts.map((p) => `${p.startLine}-${p.endLine}`).join(', ');
}

function renderPart(part, lines) {
  const body = lines.slice(part.startLine - 1, part.endLine).join('\n');
  const header = `<!-- kaynak: satır ${part.startLine}-${part.endLine} · ${part.kind} -->`;
  if (!part.isScript) return `${header}\n${body}`;
  // Ham JS'yi HTML dosyasında taşımak için sarmalıyoruz (bu dosya render edilmez, okunur).
  return `${header}\n<script type="text/x-dc-fragment">\n${body}\n</script>`;
}

function renderScreenFile(screen, lines, sourceRel) {
  const head = [
    '<!-- TÜRETİLMİŞTİR — elle düzenlenmez. Yeniden üretim: pnpm design:split -->',
    `<!-- kaynak dosya: ${sourceRel} -->`,
    `<!-- ekran: ${screen.variable}${screen.label ? ` · ${screen.label}` : ''} -->`,
    `<!-- kaynak satırlar: ${formatRanges(screen.parts)} -->`,
    '',
  ].join('\n');
  return `${head}\n${screen.parts.map((p) => renderPart(p, lines)).join('\n\n')}\n`;
}

function renderCommonFile(parts, lines, sourceRel) {
  const head = [
    '<!-- TÜRETİLMİŞTİR — elle düzenlenmez. Yeniden üretim: pnpm design:split -->',
    `<!-- kaynak dosya: ${sourceRel} -->`,
    "<!-- ekrana bağlanamayan kalan parçalar: sayfa iskeleti, stil, sekme çubuğu, sheet'ler, betik kalanı -->",
    `<!-- parça sayısı: ${parts.length} -->`,
    '',
  ].join('\n');
  return `${head}\n${parts.map((p) => renderPart(p, lines)).join('\n\n')}\n`;
}

function renderReadme(sourceRel, bytes, lineCount, screenCount) {
  return [
    '# TÜRETİLMİŞTİR — elle düzenlenmez',
    '',
    `Bu klasördeki dosyalar \`${sourceRel}\` dosyasından üretilir. Kaynak, tasarım aracının`,
    'senkron çıktısıdır ve her senkronda EZİLİR; buradaki dosyalara yazılan düzenleme kaynağa',
    'geri gitmez ve ilk yeniden üretimde silinir.',
    '',
    `- Kaynak: \`${sourceRel}\``,
    `- Kaynak boyutu: ${bytes} bayt · ${lineCount} satır`,
    `- Ekran sayısı: ${screenCount}`,
    '- Yeniden üretim: `pnpm design:split` (her senkrondan sonra koşulur)',
    '- Dizin: [index.md](index.md)',
    '',
    'Her parçanın başındaki `<!-- kaynak: satır a-b -->` yorumu **kaynak dosyanın** satır',
    'numaralarıdır — kod künyelerindeki `v3:238` biçimli referanslar bunlarla eşleşir.',
    '',
  ].join('\n');
}

function renderIndex(sourceRel, lineCount, screens, commonParts, coverage) {
  const rows = screens.map((screen, i) => {
    const order = String(i + 1).padStart(2, '0');
    return `| ${order} | \`${screen.variable}\` | ${screen.label ?? '—'} | [${screen.file}](${encodeURI(screen.file)}) | ${formatRanges(screen.parts)} |`;
  });
  return [
    `# ${sourceRel.split('/').pop()} — ekran dizini`,
    '',
    `TÜRETİLMİŞTİR (\`pnpm design:split\`). Kaynak: \`${sourceRel}\` · ${lineCount} satır.`,
    '',
    '| # | Ekran (sc-if) | Etiket | Dosya | Kaynak satırlar |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    `| 00 | — | ortak (iskelet, stil, sekme çubuğu, sheet, betik kalanı) | [00-ortak.html](00-ortak.html) | ${formatRanges(commonParts)} |`,
    '',
    '## Kapsama',
    '',
    `- Kaynak satır: ${lineCount} · parçalarda geçen: ${coverage.covered}`,
    `- Boşluk (hiçbir parçada olmayan satır): ${coverage.gaps.length === 0 ? 'yok' : coverage.gaps.map((g) => `${g[0]}-${g[1]}`).join(', ')}`,
    `- Çakışma (birden çok parçada olan satır): ${coverage.overlaps.length === 0 ? 'yok' : coverage.overlaps.map((g) => `${g[0]}-${g[1]}`).join(', ')}`,
    '',
  ].join('\n');
}

/** Ardışık satır numaralarını aralıklara toplar. */
function toRanges(numbers) {
  const ranges = [];
  for (const n of numbers) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === n - 1) last[1] = n;
    else ranges.push([n, n]);
  }
  return ranges;
}

// ———————————————————————————————————————————————————————————————— akış

function split(inputArg) {
  const candidates = [resolve(process.cwd(), inputArg), resolve(REPO_ROOT, inputArg)];
  const sourcePath = candidates.find((p) => existsSync(p));
  if (!sourcePath) {
    process.stderr.write(`design-split: kaynak bulunamadı: ${inputArg}\n`);
    process.exit(1);
  }
  const sourceRel = sourcePath.startsWith(`${REPO_ROOT}/`) ? sourcePath.slice(REPO_ROOT.length + 1) : sourcePath;

  const raw = readFileSync(sourcePath);
  const text = raw.toString('utf8');
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // sondaki yeni satır hayalet satır üretmesin
  const lineCount = lines.length;

  const baseName = sourceRel
    .split('/')
    .pop()
    .replace(/\.dc\.html$|\.html$/, '');
  const outDir = join(OUT_ROOT, slugify(baseName));

  const screenBlocks = findScreenBlocks(lines);
  const region = findScriptRegion(lines);
  const ctorBlocks = findCtorBlocks(lines, region);

  // Ekranları değişken adına göre topla, ilk görülme sırasına göre sırala.
  const byVariable = new Map();
  for (const block of [...screenBlocks, ...ctorBlocks]) {
    if (!byVariable.has(block.variable)) byVariable.set(block.variable, []);
    byVariable.get(block.variable).push(block);
  }
  const screens = [...byVariable.entries()]
    .map(([variable, parts]) => {
      parts.sort((a, b) => a.startLine - b.startLine);
      const labelled = parts.find((p) => p.label);
      return { variable, parts, label: labelled?.label ?? null };
    })
    .sort((a, b) => a.parts[0].startLine - b.parts[0].startLine);

  screens.forEach((screen, i) => {
    const order = String(i + 1).padStart(2, '0');
    const labelSlug = slugify(screen.label ?? screen.variable);
    screen.file = `${order}-${screen.variable}-${labelSlug}.html`;
  });

  // Kalan satırlar (00-ortak): ekran parçalarının tümleyeni.
  const claimed = new Uint8Array(lineCount + 1);
  for (const screen of screens) {
    for (const part of screen.parts) {
      for (let n = part.startLine; n <= part.endLine; n += 1) claimed[n] += 1;
    }
  }
  const scriptBody = region ? { from: region.openLine + 1, to: region.closeLine - 1 } : null;
  const commonParts = [];
  let cursor = 1;
  while (cursor <= lineCount) {
    if (claimed[cursor]) {
      cursor += 1;
      continue;
    }
    let end = cursor;
    while (end + 1 <= lineCount && !claimed[end + 1]) end += 1;
    // Parçalar HTML ↔ betik sınırında bölünür; betik gövdesi <script> ile sarılacak.
    let segStart = cursor;
    while (segStart <= end) {
      const inScript = scriptBody && segStart >= scriptBody.from && segStart <= scriptBody.to;
      let segEnd = end;
      if (scriptBody) {
        if (inScript) segEnd = Math.min(end, scriptBody.to);
        else if (segStart < scriptBody.from) segEnd = Math.min(end, scriptBody.from - 1);
        else segEnd = end;
      }
      commonParts.push({
        startLine: segStart,
        endLine: segEnd,
        kind: inScript ? 'betik kalanı' : 'ortak',
        isScript: Boolean(inScript),
      });
      segStart = segEnd + 1;
    }
    cursor = end + 1;
  }
  for (const part of commonParts) {
    for (let n = part.startLine; n <= part.endLine; n += 1) claimed[n] += 1;
  }

  const gapLines = [];
  const overlapLines = [];
  for (let n = 1; n <= lineCount; n += 1) {
    if (claimed[n] === 0) gapLines.push(n);
    else if (claimed[n] > 1) overlapLines.push(n);
  }
  const coverage = {
    covered: lineCount - gapLines.length,
    gaps: toRanges(gapLines),
    overlaps: toRanges(overlapLines),
  };

  // Idempotent: hedef klasör her koşuda silinip baştan üretilir.
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'README.md'), renderReadme(sourceRel, raw.length, lineCount, screens.length));
  writeFileSync(join(outDir, 'index.md'), renderIndex(sourceRel, lineCount, screens, commonParts, coverage));
  writeFileSync(join(outDir, '00-ortak.html'), renderCommonFile(commonParts, lines, sourceRel));
  for (const screen of screens) {
    writeFileSync(join(outDir, screen.file), renderScreenFile(screen, lines, sourceRel));
  }

  const outRel = outDir.slice(REPO_ROOT.length + 1);
  const ctorCount = ctorBlocks.length;
  const viewCount = screenBlocks.length;
  process.stdout.write(
    `design-split: ${sourceRel} → ${outRel}\n` +
      `  ${lineCount} satır · ${raw.length} bayt\n` +
      `  ${screens.length} ekran · ${viewCount} sc-if bloğu · ${ctorCount} kurucu bloğu · ${commonParts.length} ortak parça\n` +
      `  kapsama: ${coverage.covered}/${lineCount} satır · boşluk: ${coverage.gaps.length === 0 ? 'yok' : coverage.gaps.map((g) => `${g[0]}-${g[1]}`).join(', ')}` +
      ` · çakışma: ${coverage.overlaps.length === 0 ? 'yok' : coverage.overlaps.map((g) => `${g[0]}-${g[1]}`).join(', ')}\n`,
  );
  return coverage.gaps.length === 0 && coverage.overlaps.length === 0;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  process.stderr.write("kullanım: node scripts/design-split.mjs '<yol/dosya.dc.html>'\n");
  process.exit(1);
}
let ok = true;
for (const arg of args) ok = split(arg) && ok;
process.exit(ok ? 0 : 1);
