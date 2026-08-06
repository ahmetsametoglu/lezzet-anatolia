'use client';

import { useState, useTransition } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { errorText } from '@/lib/customer-error-text';
import { deleteAccountAction } from '../actions';
import type { Messages } from '../account-types';

/**
 * **Hesabı silme** (08.21 · GDPR md. 17) — veri kartının içinde, en altta.
 *
 * ── NEDEN İKİ ADIM ───────────────────────────────────────────────────────────
 * İşlem geri alınamaz ve düğmenin kendisi bunu anlatamaz. Diyalog bir "emin misiniz?" değil,
 * **ne olacağını söyleyen** bir ekran: neyin gittiği ve neyin KALDIĞI ayrı ayrı yazılı.
 *
 * ── KALANI SÖYLEMEK, GİDENİ SÖYLEMEK KADAR ÖNEMLİ ────────────────────────────
 * Silme bir `DELETE` değil: sipariş ve fatura kayıtları yasal olarak duruyor — **faturadaki ad ve
 * adres dâhil** (Fransız hukuku faturanın bunları içermesini zorunlu kılıyor). Bunu yazmazsak
 * "hesabımı sildim" diyen müşteri bir gün faturasında adını gördüğünde haklı olarak yanıltıldığını
 * düşünür ve o an haklı olan o olur. Ürün puanı da kimliksiz kalır: silmek, başka müşterilerin
 * gördüğü ürün skorunu geriye dönük değiştirirdi.
 *
 * ── SİLDİKTEN SONRA ──────────────────────────────────────────────────────────
 * Oturum ölüyor (`auth.users` satırı gidiyor), yani hesap sayfası tazelenemez — anasayfaya
 * gidiliyor. `router.refresh()` de çağrılıyor: yönlendirme tek başına sunucu bileşenlerinin
 * önbelleğini düşürmüyor ve üst şeritte bir an "hesabım" yazan bir kabuk kalıyordu.
 */
interface DeleteAccountProps {
  t: Messages;
}

export function DeleteAccount({ t }: DeleteAccountProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const { errorKey } = await deleteAccountAction();
      if (errorKey) {
        setError(errorText(t.errors, errorKey));
        return;
      }
      setOpen(false);
      router.replace('/');
      router.refresh();
    });
  };

  return (
    <>
      {/* Ton terracotta, dolgulu DEĞİL: bu bir birincil eylem değil — hesap sayfasının işi hesabı
          yönetmek, silmek onun en uç ucu. Dolgulu kırmızı bir düğme, sayfanın en güçlü çağrısı
          olurdu ve müşteriyi silmeye davet ederdi. */}
      <Button variant="ghost" size="sm" className="!px-0 !text-terracotta-bright hover:!text-terracotta" onClick={() => setOpen(true)}>
        {t.deleteAccount.action}
      </Button>

      {open && (
        <Dialog title={t.deleteAccount.title} closeLabel={t.deleteAccount.cancel} onClose={() => setOpen(false)} maxWidth={460}>
          <div className="flex flex-col gap-3.5 pt-2">
            <p className="font-sans text-body-sm leading-relaxed text-body">{t.deleteAccount.body}</p>

            <div className="flex flex-col gap-1.5 rounded-soft bg-sand-50 px-4 py-3">
              <span className="font-sans text-note font-bold text-ink">{t.deleteAccount.goesTitle}</span>
              <span className="font-sans text-note leading-relaxed text-body">{t.deleteAccount.goes}</span>
            </div>

            {/* KALAN, gidenle aynı ağırlıkta çizilir — küçük bir dipnot olsaydı okunmazdı ve tam da
                okunmayan yer, sonradan "bana söylenmedi" denilecek yerdir. */}
            <div className="flex flex-col gap-1.5 rounded-soft border border-honey-line bg-honey-bg px-4 py-3">
              <span className="font-sans text-note font-bold text-honey">{t.deleteAccount.staysTitle}</span>
              <span className="font-sans text-note leading-relaxed text-body">{t.deleteAccount.stays}</span>
            </div>

            <p className="font-sans text-note font-semibold text-terracotta-bright">{t.deleteAccount.irreversible}</p>
            {error && <p className="font-sans text-note font-semibold text-terracotta-bright">{error}</p>}

            <div className="flex items-center justify-end gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
                {t.deleteAccount.cancel}
              </Button>
              <Button variant="outlineTerracotta" size="sm" onClick={confirm} disabled={pending}>
                {pending ? t.deleteAccount.deleting : t.deleteAccount.confirm}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
