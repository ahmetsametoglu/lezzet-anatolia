'use client';

import { useState, useTransition } from 'react';
import { useLocale } from 'next-intl';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { errorText } from '@/lib/customer-error-text';
import { signOutAction } from '@/lib/auth/actions';
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
 * ── SİLDİKTEN SONRA: ÇIKIŞ DA YAPILIR ────────────────────────────────────────
 * `anonymize` `auth.users` satırını siliyor, ama tarayıcıdaki oturum ÇEREZİNE dokunmuyor — onu
 * ancak çerezi yazan taraf (Supabase istemcisi) silebilir. İlk sürüm bunu atlıyordu ve **ölçüldü** (08.08,
 * tarayıcıda koşuldu): silme bittikten sonra `sb-…-auth-token` çerezi yerinde duruyordu. Sunucu
 * onunla kimlik çözemediği için erişim açılmıyordu — yani sızıntı değil, ama ölü bir kimlik
 * artefaktı paylaşılan bir cihazda kalıyor ve her istek boşa bir auth turu ödüyordu.
 *
 * Projenin oturumu bitirme yolu ZATEN yazılı ve tek: `signOutAction()` + **TAM YENİLEME**
 * (`use-sign-out.hook.ts`). Gerekçesi orada anlatılıyor ve burada daha da güçlü: yumuşak
 * tazeleme, oturuma göre kurulmuş istemci durumunu ekranda bırakır. Hesabını silmiş birinin
 * ekranında kendi verisinin bir anı bile kalmamalı.
 *
 * Yerel yol ELDE TUTULUR (`useLocale`): çıplak `/`'a gitmek dili çereze/tarayıcıya sordurur ve
 * müşteri bir anda başka dilde bir anasayfada bulunabilirdi.
 */
interface DeleteAccountProps {
  t: Messages;
}

export function DeleteAccount({ t }: DeleteAccountProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locale = useLocale();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const { errorKey } = await deleteAccountAction();
      if (errorKey) {
        setError(errorText(t.errors, errorKey));
        return;
      }
      // Çerez SİLME BAŞARILI OLDUKTAN SONRA temizlenir: sıra tersine olsaydı silme düşen bir
      // koşuda müşteri hem hesabıyla hem oturumuyla kalır, ne olduğunu anlamazdı.
      await signOutAction();
      window.location.assign(`/${locale}`);
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
