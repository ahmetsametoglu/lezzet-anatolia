'use client';

import { Combobox } from '../form/combobox';
import { InfoIcon, WarehouseIcon } from './icons';

/**
 * O3C · Tablo depo süzgeci + "süzülüyor" ibaresi (19.5).
 *
 * İki parça, iki ayrı iş: ÇİP süzgeç şeridinde diğer süzgeçlerle aynı sırada durur (ayrı bir aile
 * değil), ŞERİT ise tablonun hemen üstünde ve yalnız süzgeç aktifken görünür.
 *
 * Şeridin varlık sebebi sözleşmenin 5. kuralı: sekme sayıları ve özet kartlar BAĞLAMIN gerçeğidir,
 * tablo ise süzülmüştür. İkisinin neden ayrıştığı hiçbir an belirsiz kalamaz — yoksa operatör ya
 * sayıya ya listeye güvenmeyi bırakır.
 *
 * Çip aranabilir (`Combobox`): bugün iki depo var ama seçenek kümesi tesis açıldıkça büyür ve
 * süzgeç şeridindeki tek aramasız kontrol olmak, orayı zamanla tutarsız kılardı.
 */
interface WarehouseFilterOption {
  id: string;
  code: string;
  name: string;
}

interface WarehouseFilterChipProps {
  /** Seçili depo kodu; boş = "tümü". */
  value: string;
  onChange: (code: string) => void;
  options: WarehouseFilterOption[];
}

export function WarehouseFilterChip({ value, onChange, options }: WarehouseFilterChipProps) {
  return (
    <Combobox
      variant="chip"
      label="Depo"
      tone="blue"
      value={value}
      onChange={onChange}
      placeholder="tümü"
      searchPlaceholder="Depo ara…"
      emptyText="Eşleşen depo yok"
      options={[
        // "tümü" bir seçenektir, seçimin yokluğu değil: süzgeci kaldırmanın yolu listede durmalı.
        { value: '', label: 'tümü', meta: 'süzgeç yok' },
        ...options.map((o) => ({ value: o.code, label: o.code, meta: o.name })),
      ]}
    />
  );
}

interface WarehouseFilterNoticeProps {
  /** Süzgeç uygulandıysa hangi depo. */
  active: WarehouseFilterOption | null;
  /** Bağlama uymadığı için düşen kod (kural 7). */
  dropped: string | null;
  /**
   * Süzgecin bu ekranda TAM OLARAK ne yaptığı — cümleyi ekran yazar, komponent değil.
   *
   * Çünkü aynı süzgeç her tabloda aynı şeyi yapmıyor: siparişte SATIRLARI eler (o deponun
   * siparişleri), stokta SAYILARI daraltır (satır listesi ürün sayfalamasıdır, satır düşürmek
   * keyset imlecini bozar). Tek bir kalıp yazsaydık ikisinden biri yalan söylerdi.
   */
  detail: string;
  onClear: () => void;
}

/**
 * Tablo üstündeki mavi şerit — iki ayrı haber taşır ve ikisi aynı anda doğru olabilir:
 * süzgeç aktif ("şunu görüyorsun") ve/veya bir süzgeç düştü ("şunu göremezsin").
 */
export function WarehouseFilterNotice({ active, dropped, detail, onClear }: WarehouseFilterNoticeProps) {
  if (!active && !dropped) return null;

  return (
    <div className="flex flex-col gap-1.5 border-b border-ops-blue-line bg-ops-blue-bg px-6 py-2.5">
      {active ? (
        <div className="flex items-center gap-2">
          <span className="flex-none text-ops-blue">
            <WarehouseIcon />
          </span>
          <span className="flex-1 font-ops-body text-ops-xs text-ops-blue-dark">
            <strong className="font-semibold">
              Süzülüyor: {active.name} ({active.code})
            </strong>
            {` — ${detail}`}
          </span>
          <button
            type="button"
            onClick={onClear}
            className="flex-none cursor-pointer rounded-ops-chip border border-ops-blue-line bg-ops-white px-2.5 py-[3px] font-ops-body text-ops-micro font-medium text-ops-blue-dark transition-colors hover:border-ops-blue"
          >
            Süzgeci kaldır
          </button>
        </div>
      ) : null}

      {dropped ? (
        // Sessiz düşme YOK (kural 7): paylaşılan bağlantı alıcının evreninin dışını gösteremez, ama
        // bunu söylemeden yapmak "bu link bende neden farklı" sorusunu cevapsız bırakırdı.
        <div className="flex items-center gap-2">
          <span className="flex-none text-ops-blue">
            <InfoIcon size={14} />
          </span>
          <span className="font-ops-body text-ops-xs text-ops-blue-dark">
            Paylaşılan bağlantı <strong className="font-ops-mono font-semibold">{dropped}</strong> deposuna süzülmüştü;
            bu depo bağlamınızda yok — süzgeç düştü, liste bağlamınızla açıldı.
          </span>
        </div>
      ) : null}
    </div>
  );
}
