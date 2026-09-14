import type { ReactNode } from 'react';

/*
  BİLGİ KUTUSU — native `Note`un (`apps/mobile/src/components/ui/note.tsx`) web telefon ikizi (14.09).

  Telefon görünümünde bugün yalnız `warm` tonu çiziliyor (bölge dışı bandı): `sand-150` zemin, saydam
  çerçeve (native kutunun ince çerçevesi ölçüyü tutsun), mürekkep metin. Öteki tonlar (zeytin · terracotta ·
  hata) ilk çağıranlarıyla gelir. Başlık `note` (13/700), açıklama `body-sm` (14, satır 1,6) — MB-46:
  müşterinin karar için okuduğu metin 14'ün altına inmez.

  İki yuva, ikisi de kutunun İÇİNDE (native 10.08 ölçümü: kutunun altına taşan eylemler kartları ekranın
  yarısına itiyordu): `header` başlıktan ÖNCE — cümlenin ön koşulu ("hangi yer için konuşuyoruz");
  `action` metnin ALTINDA.
*/

interface NoteProps {
  description: string;
  /** İsteğe bağlı kalın ilk satır. */
  title?: string;
  /** Üst yuva — başlığın üstünde (bölge dışı bandın posta kodu hapı). */
  header?: ReactNode;
  /** Eylem yuvası — metnin altında; genişliği içeriğin kendi kararı. */
  action?: ReactNode;
}

export function Note({ description, title, header, action }: NoteProps) {
  return (
    <div className="flex flex-col gap-3 rounded-control border border-transparent bg-sand-150 p-3.5 text-ink">
      {header !== undefined && <div className="flex items-start">{header}</div>}
      <div className="flex flex-col gap-1">
        {title !== undefined && <p className="font-sans text-note font-bold">{title}</p>}
        <p className="font-sans text-body-sm leading-[1.6]">{description}</p>
      </div>
      {action !== undefined && <div className="flex flex-col items-start gap-2.5">{action}</div>}
    </div>
  );
}
