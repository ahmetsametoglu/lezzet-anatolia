/*
  Oturum açılışındaki okumalar (kimlik, adresler, sepet) tek seferliktir. Biri ağ ya da sunucu yüzünden düşerse, oturumla yapılan
  bir sonraki başarılı istek sunucunun ve oturumun sağlam olduğunun kanıtıdır ve düşen okumalar o an yeniden denenir; her depo
  yalnız kendisi hatadaysa ve okuması uçuşta değilse okur, sağlıklı durumda ek istek yoktur.
*/

const recoverers = new Set<() => void>();

/** Deponun "düştüysem yeniden oku" kapısı; sökmek için dönen işlev çağrılır. */
export function registerReadRecovery(recover: () => void): () => void {
  recoverers.add(recover);
  return () => {
    recoverers.delete(recover);
  };
}

export function recoverFailedReads(): void {
  for (const recover of recoverers) recover();
}
