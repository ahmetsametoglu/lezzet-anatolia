import { describe, expect, it } from 'vitest';
import { IMAGE_ACCEPTED_TYPES, IMAGE_MAX_UPLOAD_BYTES } from '@lezzet/types';
import { readImageUpload } from './upload';

/**
 * **Yükleme kapısı** (05.7) — kuralın gerçekten ÇALIŞTIĞININ kanıtı.
 *
 * Bu testin var olma sebebi sıradan değil: kural zaten YAZILIYDI (`image.schema.ts`) ve görev
 * satırı `[x]` idi, ama **sıfır çağıranı vardı** — yani beş yükleme eylemi de biçim ve boyut
 * sormadan R2'ye yazıyordu. Yazılı bir kuralın çalıştığını gösteren tek şey onu ÇAĞIRAN yoldan
 * geçen bir testtir; şemadaki fonksiyonu tek başına sınamak aynı yanılgıyı bir kat aşağıda
 * tekrarlardı (fonksiyon yeşil, kapı açık).
 *
 * `File` ve `FormData` Node 18+ küresel tipleri — sahte kurmaya gerek yok, gerçek nesneler kurulur.
 */

/** İçeriği `bytes` uzunluğunda, verilen MIME türünde gerçek bir `File`. */
function dosya(name: string, type: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

/** Tek `file` alanı taşıyan form. */
function form(file: File | null): FormData {
  const fd = new FormData();
  if (file) fd.set('file', file);
  return fd;
}

describe('readImageUpload', () => {
  it('kabul edilen biçimlerin ÜÇÜNÜ de geçirir', () => {
    for (const type of IMAGE_ACCEPTED_TYPES) {
      const f = dosya('kapak.bin', type, 1024);
      expect(readImageUpload(form(f))).toBe(f);
    }
  });

  it('kabul listesinde olmayan biçimi REDDEDER — asıl açık buydu', () => {
    // Uzantı `.jpg` ama içerik PDF: istemcideki `accept` bunu engellemez (kullanıcı "tüm
    // dosyalar"a geçebilir, üstelik Server Action tarayıcısız da çağrılabilir).
    expect(() => readImageUpload(form(dosya('fatura.jpg', 'application/pdf', 1024)))).toThrow(
      'Yalnız JPEG, PNG veya WebP yüklenebilir.',
    );
  });

  it('biçimi BOŞ gelen dosyayı reddeder — eski kod onu "image/jpeg" sayıyordu', () => {
    // `file.type || 'image/jpeg'` yedeği tam olarak bunu yapıyordu: türü bilinmeyen dosyayı JPEG
    // diye etiketleyip depoya yazıyordu. Yedek kalktı; bilinmeyen biçim artık kapıda durur.
    expect(() => readImageUpload(form(dosya('kapak', '', 1024)))).toThrow('Yalnız JPEG, PNG veya WebP yüklenebilir.');
  });

  it('tavanı AŞAN dosyayı reddeder ve sınırı cümlede söyler', () => {
    const f = dosya('devasa.jpg', 'image/jpeg', IMAGE_MAX_UPLOAD_BYTES + 1);
    expect(() => readImageUpload(form(f))).toThrow(/en çok 8 MB/);
  });

  it('tavanın TAM ÜSTÜNDEKİ dosyayı geçirir — sınır dışlayıcı değil', () => {
    // `>` ile `>=` arasındaki fark sessizdir: tam tavandaki dosya reddedilseydi operatör "8 MB
    // olabilir" yazan bir kuralın 8 MB'lık dosyayı almadığını görürdü.
    const f = dosya('tam-tavan.jpg', 'image/jpeg', IMAGE_MAX_UPLOAD_BYTES);
    expect(readImageUpload(form(f))).toBe(f);
  });

  it('boş dosyayı "bulunamadı" der, boyut ihlali DEMEZ', () => {
    // Sıfır bayt bir boyut sorunu değil, seçimin hiç yapılmamış olmasıdır — mesaj da öyle olmalı.
    expect(() => readImageUpload(form(dosya('bos.jpg', 'image/jpeg', 0)))).toThrow('Görsel dosyası bulunamadı.');
  });

  it('alan hiç yoksa "bulunamadı" der', () => {
    expect(() => readImageUpload(form(null))).toThrow('Görsel dosyası bulunamadı.');
  });

  it('dosya olmayan (düz metin) alanı reddeder', () => {
    const fd = new FormData();
    fd.set('file', 'merhaba');
    expect(() => readImageUpload(fd)).toThrow('Görsel dosyası bulunamadı.');
  });

  it('alan adı verilebilir — kapı tek, alan adı çağıranın', () => {
    const fd = new FormData();
    const f = dosya('kapak.jpg', 'image/jpeg', 1024);
    fd.set('kapak', f);
    expect(readImageUpload(fd, 'kapak')).toBe(f);
    // Varsayılan alan adıyla arandığında bulunamaz — yani alan adı gerçekten okunuyor.
    expect(() => readImageUpload(fd)).toThrow('Görsel dosyası bulunamadı.');
  });

  it('TAVAN, Next\'in Server Action gövde sınırının ALTINDA kalmalı', () => {
    // Bu sınır aşılırsa kural okunur bir cümle üretemez: istek bizim kapımıza hiç ulaşmadan Next
    // tarafında kesilir ve operatör anlamsız bir ağ hatası görür. Bağıntı iki dosyanın künyesinde
    // yazılı; burada MAKİNEYLE tutuluyor, çünkü iki dosya birbirini import edemiyor.
    expect(IMAGE_MAX_UPLOAD_BYTES).toBeLessThan(10 * 1024 * 1024);
  });
});
