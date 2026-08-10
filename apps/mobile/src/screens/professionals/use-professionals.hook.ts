import { useCallback, useEffect, useRef, useState } from 'react';
import { splitVatNumber, type B2bApplicationField, type B2bApplicationInput, type B2bCompanyFacts } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';

import { CLIENT_ERROR } from '@/lib/api/client';
import {
  checkB2bVatNumber,
  fetchB2bApplicant,
  lookupB2bCompany,
  submitB2bApplicationRequest,
  type B2bApplicant,
  type B2bCompanyLookup,
} from '@/lib/api/b2b';

/*
  B2B BAŞVURUSUNUN VERİSİ (21.31) — üç kapı: durumu oku · resmî kaydı getir · vergi numarasını
  doğrula; artı yazma. `use-ticket.hook`un okuma+yazma deseni.

  ── DURUM OKUMASI MİSAFİRDE HATA DEĞİL ──────────────────────────────────────
  `guest` ayrı bir hâl: form ziyaretçiye açık ve kimlik ancak GÖNDERİRKEN isteniyor. 401'i `error`
  saysaydık ekran, hiçbir şey bozulmamışken "bir şeyler ters gitti" derdi.

  ── VERGİ NUMARASI: BİÇİM TAMAMLANINCA BİR KEZ SORULUR ──────────────────────
  Yazarken sürekli sormak (gecikmeli arama deseni) burada yanlış olurdu: VIES üye ülkelerin
  sunucularına gidiyor, altı saniyeye kadar bekleyebiliyor ve numara TEK bir anda tamamlanıyor —
  "yazmayı bıraktı mı" sorusunun cevabı zaten "biçim tuttu mu". Bu yüzden zamanlayıcı yok: değer
  motorun kabul ettiği bir biçime ULAŞTIĞI anda tek istek atılır (`splitVatNumber` — ikinci bir
  düzenli ifade yazılmadı). Yarış koruması yine de var: hızlı düzeltmede geç dönen cevap yenisini
  ezmemeli.

  ── ÜÇ DEĞER KORUNUR ────────────────────────────────────────────────────────
  `valid: true` geçerli · `false` geçersiz · `null` SORULAMADI · `undefined` HİÇ SORULMADI.
  Dördüncüsü ekranın işine yarıyor: işaret hiç çizilmez. `null`u "geçersiz" diye göstermek,
  sunucusu bakımda olan meşru bir şirketi suçlamak olurdu (kapının künyesi).
*/

/** Başvuru durumunun okunma hâli — `guest` bir arıza değil, formun normal açılışı. */
type ApplicantStatus = 'loading' | 'guest' | 'ready' | 'error';

/** Yazmanın sonucu — `unauthorized` ekranın kimlik adımını açması için ayrı bir hâl. */
type SubmitOutcome =
  | { kind: 'ok'; applicant: B2bApplicant }
  | { kind: 'issues'; issues: B2bApplicationField[] }
  | { kind: 'unauthorized' }
  | { kind: 'failed'; errorKey: string };

/** Kayıt okumasının ekrana dönen hâli — taşıma arızası dördüncü bir sonuç. */
type LookupOutcome = B2bCompanyLookup | { status: 'transport' };

interface UseProfessionalsResult {
  status: ApplicantStatus;
  applicant: B2bApplicant | null;
  reload: () => void;
  looking: boolean;
  lookup: (siret: string) => Promise<LookupOutcome>;
  /** `undefined` = hiç sorulmadı; `null` = sorulamadı (üç değerli sonucun dördüncü hâli). */
  vatValid: boolean | null | undefined;
  vatChecking: boolean;
  submitting: boolean;
  submit: (input: B2bApplicationInput, facts: B2bCompanyFacts) => Promise<SubmitOutcome>;
}

export function useProfessionals(locale: Locale, vatNumber: string): UseProfessionalsResult {
  const [status, setStatus] = useState<ApplicantStatus>('loading');
  const [applicant, setApplicant] = useState<B2bApplicant | null>(null);
  const [looking, setLooking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [vatValid, setVatValid] = useState<boolean | null | undefined>(undefined);
  const [vatChecking, setVatChecking] = useState(false);
  const readRun = useRef(0);
  const vatRun = useRef(0);

  const reload = useCallback(() => {
    const run = (readRun.current += 1);
    setStatus('loading');
    void fetchB2bApplicant(locale).then((result) => {
      if (run !== readRun.current) return;
      if (result.error !== null) {
        setStatus(result.status === 401 ? 'guest' : 'error');
        return;
      }
      setApplicant(result.data);
      setStatus('ready');
    });
  }, [locale]);

  useEffect(() => {
    reload();
  }, [reload]);

  /* Vergi numarası: biçim tuttuğu anda TEK istek (künye). Biçim bozulunca işaret düşer — eski
     cevabı yeni numaranın yanında bırakmak, doğrulanmamış bir numarayı doğrulanmış göstermekti. */
  useEffect(() => {
    const parsed = splitVatNumber(vatNumber);
    const run = (vatRun.current += 1);
    if (!parsed) {
      setVatValid(undefined);
      setVatChecking(false);
      return;
    }
    setVatChecking(true);
    void checkB2bVatNumber(`${parsed.country}${parsed.number}`).then((result) => {
      if (run !== vatRun.current) return;
      setVatChecking(false);
      // Taşıma arızası da "sorulamadı"dır: cevabı olmayan bir soruyu "geçersiz" diye okumak yalan.
      setVatValid(result.error !== null ? null : result.data.valid);
    });
  }, [vatNumber]);

  const lookup = useCallback(async (siret: string): Promise<LookupOutcome> => {
    setLooking(true);
    const result = await lookupB2bCompany(siret);
    setLooking(false);
    return result.error !== null ? { status: 'transport' } : result.data;
  }, []);

  const submit = useCallback(
    async (input: B2bApplicationInput, facts: B2bCompanyFacts): Promise<SubmitOutcome> => {
      if (submitting) return { kind: 'failed', errorKey: CLIENT_ERROR.network };
      setSubmitting(true);
      const result = await submitB2bApplicationRequest({ ...input, facts }, locale);
      setSubmitting(false);

      if (result.error !== null) {
        // 401: oturum yok ya da düştü — ekran kimlik adımını açar ve aynı gövdeyle tekrar dener.
        if (result.status === 401) return { kind: 'unauthorized' };
        return { kind: 'failed', errorKey: result.error };
      }
      if (result.data.status === 'invalid_application') {
        // Sunucunun reddettiği alanlar motorun kendi adlarıyla gelir; ekran onları işaretler.
        return { kind: 'issues', issues: result.data.issues as B2bApplicationField[] };
      }
      setApplicant(result.data.applicant);
      setStatus('ready');
      return { kind: 'ok', applicant: result.data.applicant };
    },
    [locale, submitting],
  );

  return { status, applicant, reload, looking, lookup, vatValid, vatChecking, submitting, submit };
}
