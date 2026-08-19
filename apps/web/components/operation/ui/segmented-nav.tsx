'use client';

import { CONTROL_H } from './control';

/**
 * BAŞLIK BARININ İÇİNDEKİ görünüm hapı — `Tabs`'ın kardeşi; farkı işlevi değil YERİ.
 *
 * İkisi de "bir ekranın alt görünümleri arasında geçiş" yapar. Hangisinin kullanılacağını EKRANIN
 * ÇİZİMİ söyler, kit değil:
 *  · **`Tabs`** — başlığın ALTINDA kendi bandında, alt çizgi göstergeli (Ürünler · Para · Raporlar ·
 *    Siparişler; hepsinin çizimi böyle). Görünüm sayısı fazla ve sekmeler sayaç taşıyorsa oraya.
 *  · **`SegmentedNav`** (bu dosya) — başlık barının İÇİNDE, gri rayın üstünde kayan hap (Asistan
 *    Onay Kuyruğu; `Operasyon - Asistan Kuyrugu.dc.html`). Üç kısa görünüm ve dikey alanın değerli
 *    olduğu, iki sütunun ekranı doldurduğu ekranlar için: ayrı bir bant, karar çerçevesinden
 *    yükseklik çalardı.
 *
 * `form/multi-toggle` DEĞİLDİR ve olmamalı: o bir FORM kontrolü — bir alanın değerlerini seçer
 * ("Satışta / Pasif / Aday"), eşit genişlikte durur ve seçili değeri dolu renkle işaretler. Burada
 * seçilen bir değer değil, bakılan yer. Aynı kabuğa iki farklı soru sokmak, operatöre "bu bir ayar
 * mı, bir gezinme mi?" diye sordurur.
 */
interface SegmentedNavProps<K extends string> {
  items: Array<{ key: K; label: string }>;
  active: K;
  onSelect: (key: K) => void;
  /** Erişilebilirlik adı — grup neyin arasında geçiş yaptığını söyler. */
  label: string;
}

export function SegmentedNav<K extends string>({ items, active, onSelect, label }: SegmentedNavProps<K>) {
  return (
    <div
      role="group"
      aria-label={label}
      /**
       * **Yükseklik SÖZLÜKTEN, dolgudan değil** (kullanıcı bildirimi 19.08 · ölçüldü: grup 43px,
       * yanındaki depo seçici ve arama 36px — 7px fark).
       *
       * Bu komponent `control.ts` yazılırken ona bağlanmamıştı ve tam olarak o sözlüğün doğduğu
       * arızayı tekrarlıyordu: yükseklik iki kat dikey dolgudan doğuyordu (dış kap `p-0.5`, hap
       * `py-[7px]`) ve hiçbiri komşusunun ölçüsünü bilmiyordu. Bir barın içinde iki farklı
       * yükseklik, hizalanmamış bir satır demektir.
       *
       * `items-stretch`: haplar kabın yüksekliğini DOLDURUR. `items-center` olsaydı kap 36px'e
       * inerken haplar kendi dolgularıyla kalır ve bu kez rayın içinde ortalanmış küçük bir grup
       * çıkardı — hizalanan kap, hizalanmayan içerik.
       */
      className={`flex flex-none items-stretch gap-0.5 rounded-ops-btn border border-ops-gray-300 bg-ops-gray-100 p-0.5 ${CONTROL_H.md}`}
    >
      {items.map((item) => {
        const on = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key)}
            aria-current={on ? 'page' : undefined}
            className={[
              // Dikey dolgu YOK: yükseklik kaptan geliyor (künyesi yukarıda), hap onu dolduruyor.
              // `flex items-center` metni ortalıyor — dolgunun yaptığı işi artık hizalama yapıyor.
              'flex cursor-pointer items-center rounded-md px-3.5 font-ops-display text-ops-sm font-semibold outline-none transition-colors',
              // Seçili hap RAYDAN ayrışmak için hem zemin hem METİN değiştirir. Zemin tek başına
              // yetmiyor: koyu temada palet ters çevrildiği için hapın zemini rayın ALTINA düşüyor
              // (`ops-card` #23261f ↔ ray #31352c) ve "yükselmiş" değil "gömülmüş" okunuyor. Metnin
              // mürekkebe çıkması iki temada da aynı yönde çalışan işaret; kenarlık onu tamamlıyor.
              on
                ? 'border border-ops-line bg-ops-card text-ops-ink'
                : 'border border-transparent text-ops-body hover:text-ops-strong',
            ].join(' ')}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
