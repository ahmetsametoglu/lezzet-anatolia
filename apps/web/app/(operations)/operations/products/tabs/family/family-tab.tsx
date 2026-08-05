'use client';

import { useState } from 'react';
import { LOCALES } from '@lezzet/i18n';
import { Badge } from '@/components/operation/ui/badge';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { num } from '@/components/operation/ui/format';
import { Table, type Column } from '@/components/operation/ui/table';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import type { OpsTone } from '@/components/operation/ui/tone';
import { FamilyDialog } from './family-dialog';
import type { FamilyView } from '../../products-types';

// **Aileler sekmesi** (05.15) — çeşit ekseninin yönetildiği yer.
//
// Aile, ürünlerin üstünde ince bir gruplamadır; yeni bir varlık türü DEĞİL. Üye = bugünkü ürün ve
// kendi sayfası, beyanı, fiyatı vardır. Bu sekme yalnız üç soruyu cevaplıyor: hangi ailelerimiz
// var · içinde kim var · hangi sırayla.
//
// **`CatalogTab`'e katılmadı ve sebebi dört fark:** ailenin adı TEK dilli (müşteriye görünmez),
// görseli yok, üyelik çoktan-çoğa değil (bir ürün en çok bir ailede) ve sıra ailenin kendinde değil
// ÜYEDE duruyor (`family_position`). Dördünü tek `kind` bayrağına sıkıştırmak, o bileşenin içinde
// ikinci bir düzen dalı açmak olurdu.

/** Şeritte gösterilen üye görseli sayısı — dördüncüden sonrası "+N"e iniyor, satır yükselmesin. */
const THUMB_LIMIT = 4;

/**
 * Ailenin durumu — TÜRETİLİR, `isActive` bayrağından ibaret değil (katalog tablosunun `catalogStatus`
 * deseni).
 *
 * Üç hâl gerçek bir iş kuyruğu:
 * · **tek üye** — müşteriye çeşit kartları HİÇ görünmez (tek kart bir seçim sunmaz). Aile kurulmuş
 *   ama işini görmüyor; satırda görünmezse operatör bunu ancak müşteri şikâyetiyle öğrenir.
 * · **etiket eksik** — bir üyenin aile içi etiketi bir dilde boş. Müşteri o dilde kartta ürün adını
 *   görür, yani ailenin bütün faydası (kısa, ayırt eden ad) o dilde kaybolur.
 * · **pasif** — aile kapalı.
 *
 * Etiket eksikliği `is_incomplete`'e KATILMIYOR (görev satırının kuralı: o kolon yasal beyanın
 * tamlığını ölçer, bu bir pazarlama açığı) — ama sahibi bu ekran, o yüzden burada görünüyor.
 */
function familyStatus(family: FamilyView): { label: string; tone: OpsTone } {
  if (!family.isActive) return { label: 'Pasif', tone: 'slate' };
  if (family.members.length === 0) return { label: 'Boş', tone: 'amber' };
  if (family.members.length === 1) return { label: 'Tek üye', tone: 'amber' };

  const missing = family.members.some((member) =>
    LOCALES.some((locale) => !member.label[locale]?.trim()),
  );
  if (missing) return { label: 'Etiket eksik', tone: 'amber' };

  return { label: 'Yayında', tone: 'olive' };
}

const COLUMNS: Column<FamilyView>[] = [
  {
    key: 'thumbs',
    header: '',
    // Ailenin KENDİ görseli yok (şemada da yok) — ama üyelerinki var ve asıl anlatan da o: operatör
    // "hangi çeşitler" sorusunu satırdan çıkarabilmeli. Kategori/koleksiyon tablosundaki tek görsel
    // sütununun buradaki karşılığı bir ŞERİT; aile zaten çoğul bir şey.
    width: '132px',
    cell: (row) => (
      <div className="flex items-center -space-x-1.5">
        {row.members.slice(0, THUMB_LIMIT).map((member) => (
          <span key={member.productId} className="rounded-[7px] ring-2 ring-ops-card">
            <Thumbnail src={member.imageUrl} alt={member.productName} size={28} />
          </span>
        ))}
        {row.members.length > THUMB_LIMIT ? (
          <span className="pl-3 font-ops-mono text-ops-micro text-ops-faint">+{row.members.length - THUMB_LIMIT}</span>
        ) : null}
        {row.members.length === 0 ? <span className="font-ops-body text-ops-xs text-ops-faint">—</span> : null}
      </div>
    ),
  },
  {
    key: 'name',
    header: 'Aile',
    width: 'minmax(200px,1fr)',
    // İkinci satır, katalog tablosundaki `slug:` satırının karşılığı: kaydın MAKİNE kimliği yerine
    // burada MÜŞTERİNİN GÖRDÜĞÜ kimlik duruyor — kartlarda okunan aile içi etiketler. Ürün adlarını
    // yazsaydık her satırda ortak kök tekrar ederdi ("Baklava with Pistachio · Baklava with
    // Walnut"), oysa ailenin anlamı tam olarak o kökten SONRASI.
    cell: (row) => (
      <div className="flex min-w-0 flex-col gap-px">
        <span className="truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.name}</span>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">
          {row.members.length === 0
            ? 'henüz üye yok'
            : row.members
                .map((member) => member.label.tr?.trim() || member.productName)
                .slice(0, 4)
                .join(' · ')}
        </span>
      </div>
    ),
  },
  {
    key: 'count',
    header: 'Üye',
    width: '78px',
    align: 'right',
    cell: (row) => <span className="font-ops-mono text-ops-sm text-ops-body">{num(row.memberCount)}</span>,
  },
  {
    key: 'status',
    header: 'Durum',
    width: '104px',
    align: 'right',
    cell: (row) => {
      const status = familyStatus(row);
      return <Badge tone={status.tone}>{status.label}</Badge>;
    },
  },
];

interface FamilyTabProps {
  rows: FamilyView[];
  filter: string;
  creating: boolean;
  onCreateClose: () => void;
}

export function FamilyTab({ rows, filter, creating, onCreateClose }: FamilyTabProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  // Süzme CLIENT'ta ve bu doğru: aileler bütün hâlinde geliyor (doğal tavanlı küme), yani sunucuya
  // gitmek boş bir tur olurdu — katalog sekmelerinin aynı gerekçesi.
  const term = filter.trim().toLocaleLowerCase('tr-TR');
  const visible = term
    ? rows.filter(
        (row) =>
          row.name.toLocaleLowerCase('tr-TR').includes(term) ||
          row.members.some((member) => member.productName.toLocaleLowerCase('tr-TR').includes(term)),
      )
    : rows;

  const open = rows.find((row) => row.id === openId) ?? null;

  return (
    <>
      {rows.length === 0 ? (
        <EmptyState
          title="Henüz aile yok"
          description="Aile, aynı ürünün çeşitlerini bir arada tutar — limonlu / mangolu gibi. Müşteri bir çeşidin sayfasındayken ötekileri kartlarla görür. “+ Aile” ile başlayın."
        />
      ) : visible.length === 0 ? (
        <EmptyState title="Eşleşen aile yok" description="Arama aile adında ve üye adlarında çalışıyor." />
      ) : (
        <>
          {/* Tablo kendi kuralını anlatıyor (katalog sekmelerinin deseni): sıra AİLENİN değil, aile
              İÇİNİN kararı — buradaki liste ada göre dizili ve sürüklenmiyor. Bunu yazmazsak
              operatör satırları sürüklemeyi dener ve neden olmadığını anlamaz. */}
          <p className="border-b border-ops-line-soft px-4 py-2 font-ops-body text-ops-xs text-ops-faint">
            Aynı ürünün çeşitleri · bir ürün en çok bir ailede · sıralama ailenin İÇİNDE, satıra tıklayıp düzenleyin
          </p>
          <Table columns={COLUMNS} rows={visible} rowKey={(row) => row.id} onRowClick={(row) => setOpenId(row.id)} />
        </>
      )}

      {creating ? <FamilyDialog family={null} onClose={onCreateClose} /> : null}
      {open ? <FamilyDialog family={open} onClose={() => setOpenId(null)} /> : null}
    </>
  );
}
