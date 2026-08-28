import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../lib/auth'
import { t, detectLang } from '../lib/i18n'
import { FEATURES } from '../lib/features'
import {
  getKycStatus, saveKycProfile, startDiditVerification, retryKycVerification,
} from '../services/api'
import {
  Check, ChevronLeft, ChevronRight, ShieldCheck, AlertTriangle, Loader2,
  X, ScanFace, BadgeCheck, ArrowRight, RefreshCw, UserRound, Wallet, Building2,
} from 'lucide-react'
import BottomNav from '../components/BottomNav'
import TriLoader from '../components/TriLoader'

const STEPS = ['kycTypeStep', 'kycStep1', 'kycStep2', 'kycStep3', 'kycStep4', 'kycStep5', 'kycStep6']

const EMPTY = {
  account_type: '',
  civility: '', last_name: '', first_name: '', gender: 'male', birth_date: '', birth_place: '',
  nationality: '', marital_status: 'single',
  company_name: '', company_rc: '', company_nif: '',
  address: '', city: '', country: '', phoneDial: '', phone: '',
  profession: '', employer: '', monthly_income: '', source_of_funds: '',
  is_pep: false, tax_residence: '',
  invest_experience: '', invest_objectives: '', invest_knowledge: '', risk_tolerance: '', invest_horizon: '',
  signature_name: '', consent: false,
}

// Champs du dossier, figés par le backend une fois l'identité vérifiée.
const IDENTITY_KEYS = new Set([
  'account_type', 'civility', 'last_name', 'first_name', 'gender', 'birth_date', 'birth_place',
  'nationality', 'marital_status', 'company_name', 'company_rc', 'company_nif',
  'address', 'city', 'country', 'phoneDial', 'phone',
])
const INVESTOR_KEYS = ['profession', 'employer', 'monthly_income', 'source_of_funds', 'is_pep', 'tax_residence',
  'invest_experience', 'invest_objectives', 'invest_knowledge', 'risk_tolerance', 'invest_horizon',
  'signature_name', 'consent']

const COUNTRIES = [
  { code: 'CI', fr: "Côte d'Ivoire", en: 'Ivory Coast', natFr: 'Ivoirienne', natEn: 'Ivorian', dial: '+225' },
  { code: 'SN', fr: 'Sénégal', en: 'Senegal', natFr: 'Sénégalaise', natEn: 'Senegalese', dial: '+221' },
  { code: 'BF', fr: 'Burkina Faso', en: 'Burkina Faso', natFr: 'Burkinabè', natEn: 'Burkinabe', dial: '+226' },
  { code: 'BJ', fr: 'Bénin', en: 'Benin', natFr: 'Béninoise', natEn: 'Beninese', dial: '+229' },
  { code: 'ML', fr: 'Mali', en: 'Mali', natFr: 'Malienne', natEn: 'Malian', dial: '+223' },
  { code: 'NE', fr: 'Niger', en: 'Niger', natFr: 'Nigérienne', natEn: 'Nigerien', dial: '+227' },
  { code: 'TG', fr: 'Togo', en: 'Togo', natFr: 'Togolaise', natEn: 'Togolese', dial: '+228' },
  { code: 'GM', fr: 'Gambie', en: 'Gambia', natFr: 'Gambienne', natEn: 'Gambian', dial: '+220' },
  { code: 'GW', fr: 'Guinée-Bissau', en: 'Guinea-Bissau', natFr: 'Bissau-Guinéenne', natEn: 'Bissau-Guinean', dial: '+245' },
  { code: 'GN', fr: 'Guinée', en: 'Guinea', natFr: 'Guinéenne', natEn: 'Guinean', dial: '+224' },
  { code: 'SL', fr: 'Sierra Leone', en: 'Sierra Leone', natFr: 'Sierra-Léonaise', natEn: 'Sierra Leonean', dial: '+232' },
  { code: 'LR', fr: 'Libéria', en: 'Liberia', natFr: 'Libérienne', natEn: 'Liberian', dial: '+231' },
  { code: 'GH', fr: 'Ghana', en: 'Ghana', natFr: 'Ghanéenne', natEn: 'Ghanaian', dial: '+233' },
  { code: 'NG', fr: 'Nigéria', en: 'Nigeria', natFr: 'Nigériane', natEn: 'Nigerian', dial: '+234' },
  { code: 'CM', fr: 'Cameroun', en: 'Cameroon', natFr: 'Camerounaise', natEn: 'Cameroonian', dial: '+237' },
  { code: 'GA', fr: 'Gabon', en: 'Gabon', natFr: 'Gabonaise', natEn: 'Gabonese', dial: '+241' },
  { code: 'CG', fr: 'Congo', en: 'Congo', natFr: 'Congolaise', natEn: 'Congolese', dial: '+242' },
  { code: 'CD', fr: 'RD Congo', en: 'DR Congo', natFr: 'Congolaise', natEn: 'Congolese', dial: '+243' },
  { code: 'TD', fr: 'Tchad', en: 'Chad', natFr: 'Tchadienne', natEn: 'Chadian', dial: '+235' },
  { code: 'CF', fr: 'Centrafrique', en: 'Central African Republic', natFr: 'Centrafricaine', natEn: 'Central African', dial: '+236' },
  { code: 'GQ', fr: 'Guinée équatoriale', en: 'Equatorial Guinea', natFr: 'Équato-guinéenne', natEn: 'Equatorial Guinean', dial: '+240' },
  { code: 'ST', fr: 'São Tomé-et-Príncipe', en: 'Sao Tome and Principe', natFr: 'Santoméenne', natEn: 'Sao Tomean', dial: '+239' },
  { code: 'CV', fr: 'Cap-Vert', en: 'Cape Verde', natFr: 'Cap-Verdienne', natEn: 'Cape Verdean', dial: '+238' },
  { code: 'MR', fr: 'Mauritanie', en: 'Mauritania', natFr: 'Mauritanienne', natEn: 'Mauritanian', dial: '+222' },
  { code: 'MG', fr: 'Madagascar', en: 'Madagascar', natFr: 'Malgache', natEn: 'Malagasy', dial: '+261' },
  { code: 'MU', fr: 'Maurice', en: 'Mauritius', natFr: 'Mauricienne', natEn: 'Mauritian', dial: '+230' },
  { code: 'KM', fr: 'Comores', en: 'Comoros', natFr: 'Comorienne', natEn: 'Comorian', dial: '+269' },
  { code: 'DJ', fr: 'Djibouti', en: 'Djibouti', natFr: 'Djiboutienne', natEn: 'Djiboutian', dial: '+253' },
  { code: 'MA', fr: 'Maroc', en: 'Morocco', natFr: 'Marocaine', natEn: 'Moroccan', dial: '+212' },
  { code: 'DZ', fr: 'Algérie', en: 'Algeria', natFr: 'Algérienne', natEn: 'Algerian', dial: '+213' },
  { code: 'TN', fr: 'Tunisie', en: 'Tunisia', natFr: 'Tunisienne', natEn: 'Tunisian', dial: '+216' },
  { code: 'LY', fr: 'Libye', en: 'Libya', natFr: 'Libyenne', natEn: 'Libyan', dial: '+218' },
  { code: 'EG', fr: 'Égypte', en: 'Egypt', natFr: 'Égyptienne', natEn: 'Egyptian', dial: '+20' },
  { code: 'ET', fr: 'Éthiopie', en: 'Ethiopia', natFr: 'Éthiopienne', natEn: 'Ethiopian', dial: '+251' },
  { code: 'KE', fr: 'Kenya', en: 'Kenya', natFr: 'Kényane', natEn: 'Kenyan', dial: '+254' },
  { code: 'TZ', fr: 'Tanzanie', en: 'Tanzania', natFr: 'Tanzanienne', natEn: 'Tanzanian', dial: '+255' },
  { code: 'UG', fr: 'Ouganda', en: 'Uganda', natFr: 'Ougandaise', natEn: 'Ugandan', dial: '+256' },
  { code: 'RW', fr: 'Rwanda', en: 'Rwanda', natFr: 'Rwandaise', natEn: 'Rwandan', dial: '+250' },
  { code: 'BI', fr: 'Burundi', en: 'Burundi', natFr: 'Burundaise', natEn: 'Burundian', dial: '+257' },
  { code: 'ZA', fr: 'Afrique du Sud', en: 'South Africa', natFr: 'Sud-africaine', natEn: 'South African', dial: '+27' },
  { code: 'AO', fr: 'Angola', en: 'Angola', natFr: 'Angolaise', natEn: 'Angolan', dial: '+244' },
  { code: 'MZ', fr: 'Mozambique', en: 'Mozambique', natFr: 'Mozambicaine', natEn: 'Mozambican', dial: '+258' },
  { code: 'ZW', fr: 'Zimbabwe', en: 'Zimbabwe', natFr: 'Zimbabwéenne', natEn: 'Zimbabwean', dial: '+263' },
  { code: 'NA', fr: 'Namibie', en: 'Namibia', natFr: 'Namibienne', natEn: 'Namibian', dial: '+264' },
  { code: 'ZM', fr: 'Zambie', en: 'Zambia', natFr: 'Zambienne', natEn: 'Zambian', dial: '+260' },
  { code: 'BW', fr: 'Botswana', en: 'Botswana', natFr: 'Botswanaise', natEn: 'Botswanan', dial: '+267' },
  { code: 'SC', fr: 'Seychelles', en: 'Seychelles', natFr: 'Seychelloise', natEn: 'Seychellois', dial: '+248' },
  { code: 'SD', fr: 'Soudan', en: 'Sudan', natFr: 'Soudanaise', natEn: 'Sudanese', dial: '+249' },
  { code: 'SO', fr: 'Somalie', en: 'Somalia', natFr: 'Somalienne', natEn: 'Somali', dial: '+252' },
  { code: 'FR', fr: 'France', en: 'France', natFr: 'Française', natEn: 'French', dial: '+33' },
  { code: 'BE', fr: 'Belgique', en: 'Belgium', natFr: 'Belge', natEn: 'Belgian', dial: '+32' },
  { code: 'CH', fr: 'Suisse', en: 'Switzerland', natFr: 'Suisse', natEn: 'Swiss', dial: '+41' },
  { code: 'LU', fr: 'Luxembourg', en: 'Luxembourg', natFr: 'Luxembourgeoise', natEn: 'Luxembourgish', dial: '+352' },
  { code: 'MC', fr: 'Monaco', en: 'Monaco', natFr: 'Monégasque', natEn: 'Monégasque', dial: '+377' },
  { code: 'DE', fr: 'Allemagne', en: 'Germany', natFr: 'Allemande', natEn: 'German', dial: '+49' },
  { code: 'GB', fr: 'Royaume-Uni', en: 'United Kingdom', natFr: 'Britannique', natEn: 'British', dial: '+44' },
  { code: 'PT', fr: 'Portugal', en: 'Portugal', natFr: 'Portugaise', natEn: 'Portuguese', dial: '+351' },
  { code: 'ES', fr: 'Espagne', en: 'Spain', natFr: 'Espagnole', natEn: 'Spanish', dial: '+34' },
  { code: 'IT', fr: 'Italie', en: 'Italy', natFr: 'Italienne', natEn: 'Italian', dial: '+39' },
  { code: 'US', fr: 'États-Unis', en: 'United States', natFr: 'Américaine', natEn: 'American', dial: '+1' },
  { code: 'CA', fr: 'Canada', en: 'Canada', natFr: 'Canadienne', natEn: 'Canadian', dial: '+1' },
  { code: 'CN', fr: 'Chine', en: 'China', natFr: 'Chinoise', natEn: 'Chinese', dial: '+86' },
  { code: 'IN', fr: 'Inde', en: 'India', natFr: 'Indienne', natEn: 'Indian', dial: '+91' },
  { code: 'BR', fr: 'Brésil', en: 'Brazil', natFr: 'Brésilienne', natEn: 'Brazilian', dial: '+55' },
  { code: 'MX', fr: 'Mexique', en: 'Mexico', natFr: 'Mexicaine', natEn: 'Mexican', dial: '+52' },
  { code: 'AE', fr: 'Émirats arabes unis', en: 'United Arab Emirates', natFr: 'Émiratie', natEn: 'Emirati', dial: '+971' },
  { code: 'SA', fr: 'Arabie saoudite', en: 'Saudi Arabia', natFr: 'Saoudienne', natEn: 'Saudi', dial: '+966' },
  { code: 'TR', fr: 'Turquie', en: 'Turkey', natFr: 'Turque', natEn: 'Turkish', dial: '+90' },
]

const DIALS_SORTED = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
const countryOf = code => COUNTRIES.find(c => c.code === code)
const countryName = (code, lang) => {
  const c = countryOf(code)
  return c ? (lang === 'fr' ? c.fr : c.en) : (code || '—')
}
const natName = (code, lang) => {
  const c = countryOf(code)
  return c ? (lang === 'fr' ? c.natFr : c.natEn) : (code || '—')
}

const VERIFICATION_STATUSES = ['not_started', 'in_progress', 'document_submitted', 'verification_in_progress', 'retry_required', 'error']
const FINAL_STATUSES = ['verified', 'rejected', 'review_required', 'retry_required', 'error']
const POLL_STATUSES = ['in_progress', 'document_submitted', 'verification_in_progress']

const REQ_STEP0 = new Set([
  'civility', 'last_name', 'first_name', 'gender', 'birth_date', 'birth_place',
  'nationality', 'marital_status', 'country', 'phoneDial', 'phone',
  'company_name', 'company_rc', 'company_nif',
])
const REQ_STEP4 = new Set([
  'profession', 'employer', 'monthly_income', 'source_of_funds', 'tax_residence',
  'invest_experience', 'invest_objectives', 'invest_knowledge', 'risk_tolerance', 'invest_horizon',
])

const field = (label, node, req) => (
  <label className="kyc-field">
    <span className="kyc-label">{label}{req && <b className="kyc-req">*</b>}</span>
    {node}
  </label>
)

const inputCls = 'kyc-input'

export default function Kyc() {
  const router = useRouter()
  const { user } = useAuth()
  const [lang, setLang] = useState('fr')
  const [loading, setLoading] = useState(true)
  const [kyc, setKyc] = useState(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [missing, setMissing] = useState('')
  const [done, setDone] = useState(false)
  const [diditBusy, setDiditBusy] = useState(false)
  const [diditModal, setDiditModal] = useState(false)
  const [verificationUrl, setVerificationUrl] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const safeRef = useRef(null)
  const [tilt, setTilt] = useState(0)
  const formRef = useRef(form)
  formRef.current = form
  const loadedRef = useRef(false)

  useEffect(() => {
    setLang(detectLang())
    if (!user || !FEATURES.kyc) return
    let mounted = true
    getKycStatus()
      .then(r => {
        if (!mounted) return
        const k = r.data
        setKyc(k)
        if (k) {
          const loaded = { ...EMPTY, ...k, is_pep: !!k.is_pep, consent: !!k.consent }
          if (loaded.phone) {
            const m = DIALS_SORTED.find(c => loaded.phone.startsWith(c.dial))
            if (m) {
              loaded.phoneDial = m.dial
              loaded.phone = loaded.phone.slice(m.dial.length)
            }
          }
          setForm(loaded)
        }
        loadedRef.current = true
        setLoading(false)
      })
      .catch(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [user])

  const status = kyc?.status || 'not_started'
  const isVerified = status === 'verified'
  const inVerification = VERIFICATION_STATUSES.includes(status)
  const isLocked = status === 'review_required' || status === 'rejected'

  // Polling du statut pendant la vérification (source de vérité : webhook).
  useEffect(() => {
    if (!user || !POLL_STATUSES.includes(status)) return
    const iv = setInterval(async () => {
      try {
        const r = await getKycStatus()
        setKyc(r.data)
        if (FINAL_STATUSES.includes(r.data.status)) {
          setDiditModal(false)
          setVerificationUrl('')
          clearInterval(iv)
        }
      } catch (e) {}
    }, 4000)
    return () => clearInterval(iv)
  }, [user, status])

  // Sauvegarde automatique page par page : chaque modification est enregistrée
// dès que l'utilisateur cesse de saisir (debounce), sans bouton intermédiaire.
  useEffect(() => {
    if (!user || loading || done || !loadedRef.current) return
    const locked = kyc?.status === 'review_required' || kyc?.status === 'rejected'
    if (locked) return
    setSaveState('saving')
    const id = setTimeout(async () => {
      let payload = {
        ...formRef.current,
        phone: `${formRef.current.phoneDial || ''}${String(formRef.current.phone || '').replace(/\s+/g, '')}`.trim(),
      }
      if (!payload.account_type) delete payload.account_type
      if (kyc?.status === 'verified') {
        payload = Object.fromEntries(Object.entries(payload).filter(([k]) => !IDENTITY_KEYS.has(k)))
      }
      try {
        const r = await saveKycProfile(payload)
        setKyc(prev => ({ ...(prev || {}), ...r.data }))
        setSaveState('saved')
      } catch (e) {
        setSaveState('error')
      }
    }, 900)
    return () => clearTimeout(id)
  }, [form, user, loading, done, kyc?.status])

  // Effet 3D au défilement : la pile de cartes pivote selon la progression.
  useEffect(() => {
    const el = safeRef.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const max = el.scrollHeight - el.clientHeight
        setTilt(max > 1 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0)
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [step, done, loading, user])

  if (!user) {
    return (
      <div className="mobile-root">
        <div className="safe-area kyc-center">
          <ShieldCheck size={44} color="#18C27C" />
          <p>{t(lang, 'kycLoginRequired')}</p>
          <button className="ch-btn ch-big" onClick={() => router.push('/login?next=/kyc')}>{t(lang, 'authLogin')}</button>
          <style jsx>{`
            .kyc-center { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; padding-top: 60px; }
          `}</style>
        </div>
        <BottomNav active="portfolio" />
      </div>
    )
  }

  if (!FEATURES.kyc) {
    return (
      <div className="mobile-root">
        <div className="safe-area kyc-safe">
          <header className="kyc-head">
            <div className="kyc-head-left">
              <button className="kyc-back" onClick={() => router.back()} aria-label={t(lang, 'kycBack')}>
                <ChevronLeft size={20} />
              </button>
              <div className="kyc-brand"><ShieldCheck size={22} color="#18C27C" /> {t(lang, 'kycTitle')}</div>
            </div>
          </header>
          <div className="kyc-stack">
            <div className="kyc-card kyc-enter">
              <div className="kyc-step-title">{t(lang, 'ftUnavailableTitle')}</div>
              <p className="kyc-doc-hint">{t(lang, 'ftSubKyc')}</p>
              <div className="kyc-nav">
                <button className="kyc-btn ghost" onClick={() => router.back()}>
                  <ChevronLeft size={16} /> {t(lang, 'kycBack')}
                </button>
              </div>
            </div>
          </div>
        </div>
        <BottomNav active="portfolio" />
        <style jsx>{KYC_CSS}</style>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="mobile-root">
        <div className="safe-area"><TriLoader label={t(lang, 'loading')} /></div>
        <BottomNav active="portfolio" />
      </div>
    )
  }

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const stepFields = [
    [],
    ['account_type', 'civility', 'last_name', 'first_name', 'gender', 'birth_date', 'birth_place', 'nationality', 'marital_status', 'country', 'phoneDial', 'phone',
      ...(form.account_type === 'entreprise' ? ['company_name', 'company_rc', 'company_nif'] : [])],
    [], [], [],
    ['profession', 'employer', 'monthly_income', 'source_of_funds', 'tax_residence',
      'invest_experience', 'invest_objectives', 'invest_knowledge', 'risk_tolerance', 'invest_horizon'],
    ['signature_name'],
  ]

  const FIELD_LABEL_KEYS = {
    account_type: 'kycAccountType', civility: 'kycCivility', last_name: 'kycLastName', first_name: 'kycFirstName', gender: 'kycGender',
    birth_date: 'kycBirthDate', birth_place: 'kycBirthPlace', nationality: 'kycNationality',
    marital_status: 'kycMarital',
    company_name: 'kycCompanyName', company_rc: 'kycCompanyRc', company_nif: 'kycCompanyNif',
    country: 'kycCountry', phone: 'kycPhone', phoneDial: 'kycDial',
    profession: 'kycProfession', employer: 'kycEmployer', monthly_income: 'kycIncome',
    source_of_funds: 'kycSource', is_pep: 'kycPep', tax_residence: 'kycTaxResidence',
    invest_experience: 'kycInvestExperience', invest_objectives: 'kycInvestObjectives',
    invest_knowledge: 'kycInvestKnowledge', risk_tolerance: 'kycRiskTolerance', invest_horizon: 'kycInvestHorizon',
    signature_name: 'kycSignature',
  }

  const saveAndGo = async next => {
    setErr('')
    const missingOnStep = stepFields[step].filter(f => {
      if (f === 'is_pep') return false
      const v = form[f]
      return v === null || v === undefined || String(v).trim() === ''
    })
    if (missingOnStep.length) {
      setMissing(missingOnStep.map(f => t(lang, FIELD_LABEL_KEYS[f] || f)).join(', '))
      setTimeout(() => setMissing(''), 4000)
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        phone: `${form.phoneDial || ''}${String(form.phone || '').replace(/\s+/g, '')}`.trim(),
      }
      if (!payload.account_type) delete payload.account_type
      const r = await saveKycProfile(payload)
      setKyc(prev => ({ ...(prev || {}), ...r.data }))
      if (next === 7) {
        if (!form.consent || !String(form.signature_name).trim()) {
          setErr(t(lang, 'kycRequired'))
          setSaving(false)
          return
        }
        setDone(true)
      } else {
        setStep(next)
        if (safeRef.current) safeRef.current.scrollTo({ top: 0 })
      }
    } catch (e) {
      const d = e?.response?.data?.detail
      setErr(typeof d === 'string' ? d : t(lang, 'tradeFailed'))
    } finally {
      setSaving(false)
    }
  }

  const startDidit = async () => {
    setErr('')
    setDiditBusy(true)
    try {
      const r = await startDiditVerification(lang)
      setKyc(prev => ({ ...(prev || {}), ...r.data.kyc }))
      if (r.data.verification && r.data.verification.verification_url) {
        setVerificationUrl(r.data.verification.verification_url)
        setDiditModal(true)
      } else {
        setErr(t(lang, 'kycDiditNoUrl'))
      }
    } catch (e) {
      const d = e?.response?.data?.detail
      setErr(typeof d === 'string' ? d : t(lang, 'tradeFailed'))
    } finally {
      setDiditBusy(false)
    }
  }

  const retryDidit = async () => {
    setErr('')
    setDiditBusy(true)
    try {
      const r = await retryKycVerification()
      setKyc(prev => ({ ...(prev || {}), ...r.data.kyc }))
      if (r.data.verification && r.data.verification.verification_url) {
        setVerificationUrl(r.data.verification.verification_url)
        setDiditModal(true)
      }
    } catch (e) {
      const d = e?.response?.data?.detail
      setErr(typeof d === 'string' ? d : t(lang, 'tradeFailed'))
    } finally {
      setDiditBusy(false)
    }
  }

  const verificationActive = !!kyc?.verification?.verification_url

  return (
    <div className="mobile-root">
      <div ref={safeRef} className="safe-area kyc-safe">
        <header className="kyc-head">
          <div className="kyc-head-left">
            <button className="kyc-back" onClick={() => router.back()} aria-label={t(lang, 'kycBack')}>
              <ChevronLeft size={20} />
            </button>
            <div className="kyc-brand"><ShieldCheck size={22} color="#18C27C" /> {t(lang, 'kycTitle')}</div>
          </div>
          {!done && !isLocked && (
            <div className="kyc-page">
              <div className="kyc-page-num"><span>{String(step + 1).padStart(2, '0')}</span><i>/</i><span>{String(STEPS.length).padStart(2, '0')}</span></div>
              <div className="kyc-page-name">{t(lang, STEPS[step])}</div>
            </div>
          )}
        </header>
        {!done && !isLocked && (
          <div className="kyc-savebar">
            {saveState === 'saving' && (<><Loader2 size={12} className="spin" /> {t(lang, 'kycSaving')}</>)}
            {saveState === 'saved' && (<span className="ok"><Check size={12} /> {t(lang, 'kycSaved')}</span>)}
            {saveState === 'error' && (<span className="bad">{t(lang, 'kycSaveFailed')}</span>)}
            {saveState === 'idle' && (<><span className="kyc-save-dot" /> {t(lang, 'kycAutosave')}</>)}
          </div>
        )}
        <div
          className="kyc-stack"
          style={{
            transform: `perspective(1200px) rotateX(${(1 - tilt) * 7}deg) scale(${1 - tilt * 0.03})`,
          }}
        >
        {(status === 'rejected') && (
          <div className="kyc-rejected">
            <AlertTriangle size={16} />
            {t(lang, 'kycStatusHintRejected').replace('{note}', kyc?.review_note || '—')}
          </div>
        )}
        {(status === 'review_required') && (
          <div className="kyc-review">
            <Loader2 size={16} className="spin" />
            {t(lang, 'kycStatusHintReviewRequired')}
          </div>
        )}
        {(status === 'retry_required' || status === 'error') && (
          <div className="kyc-retry">
            <RefreshCw size={16} />
            <span>{t(lang, status === 'error' ? 'kycStatusHintError' : 'kycStatusHintRetryRequired')}</span>
            <button className="kyc-mini primary" onClick={retryDidit} disabled={diditBusy}>
              {diditBusy ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />} {t(lang, 'kycRetry')}
            </button>
          </div>
        )}

        {done ? (
          <div className="kyc-locked-card">
            <div className="kyc-locked-ico ok"><BadgeCheck size={30} /></div>
            <h2>{t(lang, 'kycReadyTitle')}</h2>
            <p>{t(lang, 'kycReadySub')}</p>
            <button className="kyc-btn primary" onClick={() => router.push('/compte-titre')}>
              {t(lang, 'kycGoSgi')} <ArrowRight size={16} />
            </button>
          </div>
        ) : isLocked ? (
          <div className="kyc-locked-card">
            {status === 'review_required' ? (
              <>
                <div className="kyc-locked-ico"><Loader2 size={30} className="spin" /></div>
                <h2>{t(lang, 'kycStatusReviewRequired')}</h2>
                <p>{t(lang, 'kycLockedReview')}</p>
              </>
            ) : (
              <>
                <div className="kyc-locked-ico err"><X size={30} /></div>
                <h2>{t(lang, 'kycStatusRejected')}</h2>
                <p>{t(lang, 'kycStatusHintRejected').replace('{note}', kyc?.review_note || '—')}</p>
              </>
            )}
          </div>
        ) : (
          <>
            {step === 0 && (
              <div className="kyc-card kyc-enter kyc-type">
                <div className="kyc-step-title">{t(lang, STEPS[0])}</div>
                <p className="kyc-type-sub">{t(lang, 'kycTypeSub')}</p>
                <button className={`kyc-type-btn ${form.account_type === 'particulier' ? 'on' : ''}`} onClick={() => { set('account_type', 'particulier'); setStep(1); if (safeRef.current) safeRef.current.scrollTo({ top: 0 }) }}>
                  <UserRound size={24} />
                  <span><b>{t(lang, 'kycAccountParticulier')}</b><small>{t(lang, 'kycTypeParticulierDesc')}</small></span>
                </button>
                <button className={`kyc-type-btn ${form.account_type === 'entreprise' ? 'on' : ''}`} onClick={() => { set('account_type', 'entreprise'); setStep(1); if (safeRef.current) safeRef.current.scrollTo({ top: 0 }) }}>
                  <Building2 size={24} />
                  <span><b>{t(lang, 'kycAccountEntreprise')}</b><small>{t(lang, 'kycTypeEntrepriseDesc')}</small></span>
                </button>
              </div>
            )}

            {step === 1 && (
              <div className="kyc-card kyc-enter">
                <div className="kyc-step-title">{t(lang, STEPS[1])}</div>
                {field(t(lang, 'kycCivility'), (
                  <select className={inputCls} value={form.civility} onChange={e => set('civility', e.target.value)}>
                    <option value="">—</option>
                    <option value="mr">{t(lang, 'kycCivilityMr')}</option>
                    <option value="mme">{t(lang, 'kycCivilityMrs')}</option>
                  </select>
                ), REQ_STEP0.has('civility'))}
                <div className="kyc-row">
                  {field(t(lang, 'kycLastName'), <input className={inputCls} value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Kouassi" />, REQ_STEP0.has('last_name'))}
                  {field(t(lang, 'kycFirstName'), <input className={inputCls} value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Aya" />, REQ_STEP0.has('first_name'))}
                </div>
                <div className="kyc-row">
                  {field(t(lang, 'kycGender'), (
                    <select className={inputCls} value={form.gender} onChange={e => set('gender', e.target.value)}>
                      <option value="male">{t(lang, 'kycGenderMale')}</option>
                      <option value="female">{t(lang, 'kycGenderFemale')}</option>
                    </select>
                  ), REQ_STEP0.has('gender'))}
                  {field(t(lang, 'kycMarital'), (
                    <select className={inputCls} value={form.marital_status} onChange={e => set('marital_status', e.target.value)}>
                      <option value="single">{t(lang, 'kycMaritalSingle')}</option>
                      <option value="married">{t(lang, 'kycMaritalMarried')}</option>
                      <option value="divorced">{t(lang, 'kycMaritalDivorced')}</option>
                      <option value="widowed">{t(lang, 'kycMaritalWidowed')}</option>
                    </select>
                  ), REQ_STEP0.has('marital_status'))}
                </div>
                <div className="kyc-row">
                  {field(t(lang, 'kycBirthDate'), <input type="date" className={inputCls} value={form.birth_date} onChange={e => set('birth_date', e.target.value)} />, REQ_STEP0.has('birth_date'))}
                  {field(t(lang, 'kycNationality'), (
                    <select className={inputCls} value={form.nationality} onChange={e => set('nationality', e.target.value)}>
                      <option value="">—</option>
                      {COUNTRIES.map(c => <option key={c.code} value={c.code}>{natName(c.code, lang)}</option>)}
                    </select>
                  ), REQ_STEP0.has('nationality'))}
                </div>
                {field(t(lang, 'kycBirthPlace'), <input className={inputCls} value={form.birth_place} onChange={e => set('birth_place', e.target.value)} />, REQ_STEP0.has('birth_place'))}
                <div className="kyc-row">
                  {field(t(lang, 'kycCountry'), (
                    <select className={inputCls} value={form.country} onChange={e => set('country', e.target.value)}>
                      <option value="">—</option>
                      {COUNTRIES.map(c => <option key={c.code} value={c.code}>{countryName(c.code, lang)}</option>)}
                    </select>
                  ), REQ_STEP0.has('country'))}
                  <div className="kyc-field">
                    <span className="kyc-label">{t(lang, 'kycPhone')}{REQ_STEP0.has('phone') && <b className="kyc-req">*</b>}</span>
                    <div className="kyc-phone">
                      <select className={`${inputCls} kyc-phone-dial`} value={form.phoneDial} onChange={e => set('phoneDial', e.target.value)}>
                        <option value="">{t(lang, 'kycDial')}</option>
                        {DIALS_SORTED.map(c => <option key={c.code} value={c.dial}>{c.dial}</option>)}
                      </select>
                      <input className={inputCls} value={form.phone} onChange={e => set('phone', e.target.value)} inputMode="tel" placeholder="07 00 00 00 00" />
                    </div>
                  </div>
                </div>
                {field(t(lang, 'kycAddress'), <input className={inputCls} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Cocody Angré, Rue des Jardins" />)}
                <div className="kyc-row">
                  {field(t(lang, 'kycCity'), <input className={inputCls} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Abidjan" />)}
                </div>
                {form.account_type === 'entreprise' && (
                  <>
                    {field(t(lang, 'kycCompanyName'), <input className={inputCls} value={form.company_name} onChange={e => set('company_name', e.target.value)} />, REQ_STEP0.has('company_name'))}
                    <div className="kyc-row">
                      {field(t(lang, 'kycCompanyRc'), <input className={inputCls} value={form.company_rc} onChange={e => set('company_rc', e.target.value)} />, REQ_STEP0.has('company_rc'))}
                      {field(t(lang, 'kycCompanyNif'), <input className={inputCls} value={form.company_nif} onChange={e => set('company_nif', e.target.value)} />, REQ_STEP0.has('company_nif'))}
                    </div>
                  </>
                )}
              </div>
            )}

            {(step === 2 || step === 3) && (
              <div className="kyc-card">
                <div className="kyc-didit-head">
                  <div className="kyc-didit-ico"><ScanFace size={20} /></div>
                  <div>
                    <span className="kyc-didit-title">{step === 2 ? t(lang, 'kycDocStep') : t(lang, 'kycFaceStep')}</span>
                    <span className="kyc-didit-sub">{t(lang, 'kycDiditSub')}</span>
                  </div>
                </div>

                {verificationActive ? (
                  <div className="kyc-didit-active">
                    <div className="kyc-didit-wait">
                      <Loader2 size={16} className="spin" />
                      <span>{t(lang, 'kycDiditInProgress')}</span>
                    </div>
                    <button className="kyc-btn primary" onClick={() => setDiditModal(true)}>
                      {t(lang, 'kycDiditResume')} <ChevronRight size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="kyc-doc-hint">{t(lang, 'kycDiditHint')}</p>
                    <button className="kyc-btn primary" onClick={startDidit} disabled={diditBusy || !inVerification}>
                      {diditBusy ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
                      {diditBusy ? t(lang, 'kycDiditStarting') : t(lang, 'kycDiditStart')}
                    </button>
                  </>
                )}
              </div>
            )}

            {step === 4 && (
              <div className="kyc-card">
                <div className="kyc-verify">
                  <div className="kyc-verify-ico"><ScanFace size={26} /></div>
                  <span className="kyc-verify-title">{t(lang, 'kycVerifyInProgress')}</span>
                  <span className="kyc-verify-sub">{t(lang, 'kycVerifyWait')}</span>
                  {verificationActive && (
                    <button className="kyc-btn ghost" onClick={() => setDiditModal(true)}>
                      {t(lang, 'kycDiditResume')} <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="kyc-card">
                <div className="kyc-step-title">{t(lang, STEPS[5])}</div>
                <p className="kyc-doc-hint">{t(lang, 'kycInvestHint')}</p>
                {field(t(lang, 'kycProfession'), <input className={inputCls} value={form.profession} onChange={e => set('profession', e.target.value)} />, REQ_STEP4.has('profession'))}
                {field(t(lang, 'kycEmployer'), <input className={inputCls} value={form.employer} onChange={e => set('employer', e.target.value)} />, REQ_STEP4.has('employer'))}
                {field(t(lang, 'kycIncome'), (
                  <select className={inputCls} value={form.monthly_income} onChange={e => set('monthly_income', e.target.value)}>
                    <option value="">—</option>
                    <option value="lt250">{t(lang, 'kycIncomeLt250')}</option>
                    <option value="250-500">{t(lang, 'kycIncome250')}</option>
                    <option value="500-1m">{t(lang, 'kycIncome500')}</option>
                    <option value="1m-3m">{t(lang, 'kycIncome1m')}</option>
                    <option value="gt3m">{t(lang, 'kycIncomeGt3m')}</option>
                  </select>
                ), REQ_STEP4.has('monthly_income'))}
                {field(t(lang, 'kycSource'), (
                  <select className={inputCls} value={form.source_of_funds} onChange={e => set('source_of_funds', e.target.value)}>
                    <option value="">—</option>
                    <option value="salary">{t(lang, 'kycSourceSalary')}</option>
                    <option value="business">{t(lang, 'kycSourceBusiness')}</option>
                    <option value="savings">{t(lang, 'kycSourceSavings')}</option>
                    <option value="investments">{t(lang, 'kycSourceInvest')}</option>
                    <option value="inheritance">{t(lang, 'kycSourceInheritance')}</option>
                    <option value="other">{t(lang, 'kycSourceOther')}</option>
                  </select>
                ), REQ_STEP4.has('source_of_funds'))}
                {field(t(lang, 'kycTaxResidence'), <input className={inputCls} value={form.tax_residence} onChange={e => set('tax_residence', e.target.value)} />, REQ_STEP4.has('tax_residence'))}
                {field(t(lang, 'kycInvestExperience'), (
                  <select className={inputCls} value={form.invest_experience} onChange={e => set('invest_experience', e.target.value)}>
                    <option value="">—</option>
                    <option value="none">{t(lang, 'kycInvestExpNone')}</option>
                    <option value="lt1">{t(lang, 'kycInvestExpLt1')}</option>
                    <option value="1-3">{t(lang, 'kycInvestExp13')}</option>
                    <option value="3-5">{t(lang, 'kycInvestExp35')}</option>
                    <option value="gt5">{t(lang, 'kycInvestExpGt5')}</option>
                  </select>
                ), REQ_STEP4.has('invest_experience'))}
                {field(t(lang, 'kycInvestObjectives'), (
                  <select className={inputCls} value={form.invest_objectives} onChange={e => set('invest_objectives', e.target.value)}>
                    <option value="">—</option>
                    <option value="growth">{t(lang, 'kycInvestObjGrowth')}</option>
                    <option value="income">{t(lang, 'kycInvestObjIncome')}</option>
                    <option value="balanced">{t(lang, 'kycInvestObjBalanced')}</option>
                    <option value="speculation">{t(lang, 'kycInvestObjSpeculation')}</option>
                  </select>
                ), REQ_STEP4.has('invest_objectives'))}
                {field(t(lang, 'kycInvestKnowledge'), (
                  <select className={inputCls} value={form.invest_knowledge} onChange={e => set('invest_knowledge', e.target.value)}>
                    <option value="">—</option>
                    <option value="none">{t(lang, 'kycInvestKnwNone')}</option>
                    <option value="basic">{t(lang, 'kycInvestKnwBasic')}</option>
                    <option value="good">{t(lang, 'kycInvestKnwGood')}</option>
                    <option value="expert">{t(lang, 'kycInvestKnwExpert')}</option>
                  </select>
                ), REQ_STEP4.has('invest_knowledge'))}
                {field(t(lang, 'kycRiskTolerance'), (
                  <select className={inputCls} value={form.risk_tolerance} onChange={e => set('risk_tolerance', e.target.value)}>
                    <option value="">—</option>
                    <option value="low">{t(lang, 'kycRiskLow')}</option>
                    <option value="medium">{t(lang, 'kycRiskMedium')}</option>
                    <option value="high">{t(lang, 'kycRiskHigh')}</option>
                  </select>
                ), REQ_STEP4.has('risk_tolerance'))}
                {field(t(lang, 'kycInvestHorizon'), (
                  <select className={inputCls} value={form.invest_horizon} onChange={e => set('invest_horizon', e.target.value)}>
                    <option value="">—</option>
                    <option value="lt1">{t(lang, 'kycInvestHorLt1')}</option>
                    <option value="1-3">{t(lang, 'kycInvestHor13')}</option>
                    <option value="3-5">{t(lang, 'kycInvestHor35')}</option>
                    <option value="gt5">{t(lang, 'kycInvestHorGt5')}</option>
                  </select>
                ), REQ_STEP4.has('invest_horizon'))}
                <div className="kyc-radio-row">
                  <span className="kyc-label">{t(lang, 'kycPep')}</span>
                  <div className="kyc-seg small">
                    <button className={`kyc-seg-btn ${form.is_pep ? 'on' : ''}`} onClick={() => set('is_pep', true)}>{t(lang, 'kycPepYes')}</button>
                    <button className={`kyc-seg-btn ${!form.is_pep ? 'on' : ''}`} onClick={() => set('is_pep', false)}>{t(lang, 'kycPepNo')}</button>
                  </div>
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="kyc-card">
                <div className="kyc-step-title">{t(lang, STEPS[6])}</div>
                {isVerified && (
                  <div className="kyc-verified-banner">
                    <BadgeCheck size={16} />
                    <span>{t(lang, 'kycStatusHintApproved')}</span>
                  </div>
                )}
                <p className="kyc-doc-hint">{t(lang, 'kycSignatureHint')}</p>
                {field(t(lang, 'kycSignature'), <input className={inputCls} value={form.signature_name} onChange={e => set('signature_name', e.target.value)} />, true)}
                <div className="kyc-sep" />
                <label className="kyc-consent">
                  <input
                    type="checkbox"
                    checked={form.consent}
                    onChange={e => set('consent', e.target.checked)}
                  />
                  <span>{t(lang, 'kycConsent1')}<b className="kyc-req">*</b></span>
                </label>
                <div className="kyc-recap">
                  <div className="kyc-recap-title">{t(lang, 'kycSummary')}</div>
                  <div className="kyc-recap-row"><span>{t(lang, 'kycFullName')}</span><b>{[form.last_name, form.first_name].filter(Boolean).join(' ') || '—'}</b></div>
                  <div className="kyc-recap-row"><span>{t(lang, 'kycCountry')}</span><b>{countryName(form.country, lang)}</b></div>
                  <div className="kyc-recap-row"><span>{t(lang, 'kycIdentity')}</span><b style={{ color: '#18C27C' }}>{t(lang, 'kycStatusVerified')}</b></div>
                  <div className="kyc-recap-row"><span>{t(lang, 'kycInvestorProfile')}</span><b>{kyc?.profile_complete ? t(lang, 'kycComplete') : t(lang, 'kycIncomplete')}</b></div>
                </div>
              </div>
            )}

            {err && <div className="kyc-err"><AlertTriangle size={15} /> {err}</div>}
            {missing && <div className="kyc-err"><AlertTriangle size={15} /> {t(lang, 'kycMissing')} : {missing}</div>}

            {step > 0 && step < 6 && (
              <div className="kyc-nav">
                {step > 0 && (
                  <button className="kyc-btn ghost" onClick={() => { setStep(step - 1); setErr('') }} disabled={saving || diditBusy}>
                    <ChevronLeft size={16} /> {t(lang, 'kycBack')}
                  </button>
                )}
                <button className="kyc-btn primary" onClick={() => saveAndGo(step + 1)} disabled={saving || diditBusy}>
                  {saving ? <Loader2 size={16} className="spin" /> : <ChevronRight size={16} />}
                  {saving ? t(lang, 'kycSaving') : t(lang, 'kycNext')}
                </button>
              </div>
            )}

            {step === 6 && (
              <div className="kyc-nav">
                <button className="kyc-btn ghost" onClick={() => { setStep(5); setErr('') }} disabled={saving}>
                  <ChevronLeft size={16} /> {t(lang, 'kycBack')}
                </button>
                <button className="kyc-btn primary" onClick={() => saveAndGo(7)} disabled={saving}>
                  {saving ? <Loader2 size={16} className="spin" /> : <BadgeCheck size={16} />}
                  {saving ? t(lang, 'kycSaving') : t(lang, 'kycFinish')}
                </button>
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {diditModal && verificationUrl && (
        <div className="kyc-modal">
          <div className="kyc-modal-head">
            <span className="kyc-modal-title"><ShieldCheck size={16} /> {t(lang, 'kycDiditTitle')}</span>
            <button className="kyc-modal-close" onClick={() => setDiditModal(false)}><X size={18} /></button>
          </div>
          <iframe
            className="kyc-modal-frame"
            src={verificationUrl}
            allow="camera; microphone"
            allowFullScreen
            title={t(lang, 'kycDiditTitle')}
          />
        </div>
      )}

      <BottomNav active="portfolio" />
      <style jsx>{KYC_CSS}</style>
    </div>
  )
}

const KYC_CSS = `
  .mobile-root {
    display: flex; flex-direction: column; height: 100vh;
    background: #000; color: #fff; overflow: hidden;
    font-family: 'Inter', -apple-system, sans-serif;
  }
  .kyc-safe { flex: 1; min-height: 0; overflow-y: auto; padding: 0 22px 30px; -webkit-overflow-scrolling: touch; }
  .kyc-safe::-webkit-scrollbar { display: none; }
  .kyc-stack { transform-style: preserve-3d; transform-origin: 50% -8%; will-change: transform; }
  .kyc-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 16px; }
  .kyc-head-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .kyc-back { width: 38px; height: 38px; border-radius: 13px; background: #0E0E0E; border: 1px solid #222; color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; transition: border-color 0.15s, box-shadow 0.15s; }
  .kyc-back:hover { border-color: #18C27C; box-shadow: 0 0 20px -8px rgba(24,194,124,0.5); }
  .kyc-req { color: #18C27C; margin-left: 2px; font-style: normal; }
  .kyc-type { gap: 12px; }
  .kyc-type-sub { font-size: 13px; color: #8E8E93; line-height: 1.6; margin: -6px 0 4px; }
  .kyc-type-btn { display: flex; align-items: center; gap: 15px; padding: 19px 18px; border-radius: 17px; background: #121212; border: 1px solid #232323; color: #fff; cursor: pointer; text-align: left; font-family: inherit; transition: all 0.18s; }
  .kyc-type-btn:hover { border-color: #18C27C; background: #141414; box-shadow: 0 0 26px -10px rgba(24,194,124,0.45); }
  .kyc-type-btn.on { border-color: rgba(24,194,124,0.55); background: rgba(24,194,124,0.07); box-shadow: inset 0 0 0 1px rgba(24,194,124,0.3), 0 0 26px -10px rgba(24,194,124,0.45); }
  .kyc-type-btn > svg { color: #4ce3a0; flex-shrink: 0; }
  .kyc-type-btn span { display: flex; flex-direction: column; gap: 3px; }
  .kyc-type-btn b { font-size: 15.5px; font-weight: 800; }
  .kyc-type-btn small { font-size: 12px; color: #8E8E93; font-weight: 600; }
  .kyc-brand { display: flex; align-items: center; gap: 10px; font-size: 21px; font-weight: 800; letter-spacing: -0.03em; }
  .kyc-page { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .kyc-page-num { display: flex; align-items: baseline; gap: 2px; font-variant-numeric: tabular-nums; }
  .kyc-page-num span:first-child { font-size: 24px; font-weight: 800; letter-spacing: -0.03em; color: #fff; line-height: 1; }
  .kyc-page-num i { font-style: normal; font-size: 13px; font-weight: 700; color: #3A3A3E; }
  .kyc-page-num span:last-child { font-size: 13px; font-weight: 800; color: #55555A; }
  .kyc-page-name { font-size: 10.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; color: #18C27C; white-space: nowrap; }
  .kyc-savebar { display: flex; align-items: center; justify-content: flex-end; gap: 6px; min-height: 18px; margin: 8px 0 4px; font-size: 11.5px; font-weight: 800; color: #55555A; }
  .kyc-savebar .ok { color: #4ce3a0; display: inline-flex; align-items: center; gap: 5px; }
  .kyc-savebar .bad { color: #fff; display: inline-flex; align-items: center; gap: 5px; }
  .kyc-save-dot { width: 6px; height: 6px; border-radius: 50%; background: #3A3A3E; }
  .kyc-card {
    background:
      linear-gradient(180deg, #101010 0%, #0B0B0B 100%) padding-box,
      linear-gradient(165deg, rgba(24,194,124,0.45), rgba(24,194,124,0.12) 40%, rgba(255,255,255,0.05) 75%, rgba(24,194,124,0.3)) border-box;
    border: 1px solid transparent;
    border-radius: 24px; padding: 22px;
    display: flex; flex-direction: column; gap: 15px;
    box-shadow: 0 24px 60px -30px rgba(0,0,0,0.95);
    animation: kycLift 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
    animation-delay: 70ms;
  }
  .kyc-card:hover { box-shadow: 0 28px 70px -30px rgba(0,0,0,1), 0 0 30px -14px rgba(24,194,124,0.35); }
  @keyframes kycLift { from { opacity: 0; transform: translateY(22px) scale(0.98); } to { opacity: 1; transform: none; } }
  .kyc-step-title { font-size: 19px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.15; }
  .kyc-field { display: flex; flex-direction: column; gap: 6px; flex: 1; min-width: 0; }
  .kyc-label { font-size: 11px; font-weight: 700; color: #6E6E73; text-transform: uppercase; letter-spacing: 0.08em; }
  .kyc-input {
    width: 100%; padding: 15px 16px; border-radius: 15px;
    border: 1px solid #262626; background: #131313; color: #fff;
    font-size: 15.5px; font-weight: 600; outline: none; font-family: inherit;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .kyc-input:focus { border-color: #18C27C; box-shadow: 0 0 0 4px rgba(24,194,124,0.18); }
  .kyc-input::placeholder { color: #55555A; font-weight: 500; }
  .kyc-phone { display: flex; gap: 10px; }
  .kyc-phone-dial { width: 118px; flex-shrink: 0; }
  .kyc-row { display: flex; gap: 14px; }
  @media (max-width: 480px) { .kyc-row { flex-direction: column; } }
  .kyc-seg { display: flex; background: #0E0E0E; border: 1px solid #222; border-radius: 16px; padding: 5px; gap: 5px; }
  .kyc-seg.small { width: fit-content; }
  .kyc-seg-btn { flex: 1; padding: 13px; border: none; border-radius: 12px; background: transparent; color: #8E8E93; font-size: 14.5px; font-weight: 800; cursor: pointer; font-family: inherit; transition: all 0.18s; }
  .kyc-seg-btn.on { background: rgba(24,194,124,0.14); color: #4ce3a0; box-shadow: inset 0 0 0 1px rgba(24,194,124,0.45); }
  .kyc-sep { height: 1px; background: #1E1E1E; margin: 4px 0; }
  .kyc-didit-head { display: flex; align-items: flex-start; gap: 13px; }
  .kyc-didit-ico { width: 48px; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center; background: rgba(24,194,124,0.12); color: #4ce3a0; flex-shrink: 0; box-shadow: 0 14px 30px -14px rgba(24,194,124,0.55); }
  .kyc-didit-head > div:last-child { display: flex; flex-direction: column; gap: 4px; }
  .kyc-didit-title { font-size: 16px; font-weight: 800; letter-spacing: -0.01em; }
  .kyc-didit-sub { font-size: 12.5px; color: #8E8E93; line-height: 1.5; }
  .kyc-didit-active { display: flex; flex-direction: column; gap: 12px; }
  .kyc-didit-wait { display: flex; align-items: center; gap: 9px; font-size: 13px; color: #4ce3a0; }
  .kyc-doc-hint { font-size: 13px; color: #6E6E73; line-height: 1.6; }
  .kyc-verify { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 34px 14px; }
  .kyc-verify-ico { width: 70px; height: 70px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); color: #fff; border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 16px 40px -16px rgba(0,0,0,0.9); }
  .kyc-verify-title { font-size: 18px; font-weight: 800; }
  .kyc-verify-sub { font-size: 13px; color: #8E8E93; line-height: 1.6; }
  .kyc-radio-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; }
  .kyc-consents { display: flex; flex-direction: column; gap: 10px; }
  .kyc-consent { display: flex; align-items: flex-start; gap: 11px; font-size: 13px; color: #D1D1D6; line-height: 1.55; cursor: pointer; }
  .kyc-consent input { margin-top: 3px; accent-color: #18C27C; width: 17px; height: 17px; flex-shrink: 0; }
  .kyc-recap { border: 1px solid #222; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 9px; background: #0E0E0E; }
  .kyc-recap-title { font-size: 11px; font-weight: 700; color: #6E6E73; text-transform: uppercase; letter-spacing: 0.08em; }
  .kyc-recap-row { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; }
  .kyc-recap-row span { color: #8E8E93; }
  .kyc-recap-row b { font-weight: 800; text-align: right; color: #fff; }
  .kyc-nav { display: flex; justify-content: space-between; gap: 12px; margin-top: 22px; animation: kycLift 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: 120ms; }
  .kyc-btn { display: inline-flex; align-items: center; gap: 8px; padding: 15px 22px; border-radius: 16px; border: 1px solid #2A2A2A; background: #111; color: #fff; font-size: 15px; font-weight: 800; cursor: pointer; font-family: inherit; transition: all 0.15s; }
  .kyc-btn.primary { background: #fff; border-color: transparent; color: #000; flex: 1; justify-content: center; box-shadow: 0 12px 36px -16px rgba(255,255,255,0.25); }
  .kyc-btn.primary:hover { background: #E8E8EA; transform: translateY(-1px); }
  .kyc-btn.ghost { background: transparent; }
  .kyc-btn.ghost:hover { border-color: #3A3A3A; }
  .kyc-btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
  .kyc-err { display: flex; align-items: center; gap: 9px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; padding: 13px 15px; border-radius: 14px; margin-top: 18px; }
  .kyc-rejected { display: flex; align-items: flex-start; gap: 9px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; line-height: 1.55; padding: 13px 15px; border-radius: 14px; margin-bottom: 16px; }
  .kyc-review { display: flex; align-items: center; gap: 9px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 13px; line-height: 1.55; padding: 13px 15px; border-radius: 14px; margin-bottom: 16px; }
  .kyc-retry { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; background: rgba(24,194,124,0.09); border: 1px solid rgba(24,194,124,0.35); color: #4ce3a0; font-size: 13px; line-height: 1.55; padding: 13px 15px; border-radius: 14px; margin-bottom: 16px; }
  .kyc-retry .kyc-mini { margin-left: auto; }
  .kyc-mini { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 12px; border: 1px solid #2A2A2A; background: transparent; color: #fff; font-size: 11.5px; font-weight: 800; cursor: pointer; font-family: inherit; }
  .kyc-mini.primary { background: rgba(24,194,124,0.14); color: #4ce3a0; border-color: transparent; }
  .kyc-mini:disabled { opacity: 0.4; cursor: not-allowed; }
  .kyc-verified-banner { display: flex; align-items: flex-start; gap: 9px; background: rgba(24,194,124,0.09); border: 1px solid rgba(24,194,124,0.35); color: #4ce3a0; font-size: 13px; line-height: 1.55; padding: 13px 15px; border-radius: 14px; }
  .kyc-locked-card {
    display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 44px 26px;
    background:
      linear-gradient(180deg, #101010 0%, #0B0B0B 100%) padding-box,
      linear-gradient(165deg, rgba(24,194,124,0.35), rgba(24,194,124,0.1) 40%, rgba(255,255,255,0.05) 75%, rgba(24,194,124,0.25)) border-box;
    border: 1px solid transparent; border-radius: 24px; margin-top: 16px;
    box-shadow: 0 24px 60px -30px rgba(0,0,0,0.95);
    animation: kycLift 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: 70ms;
  }
  .kyc-locked-card h2 { font-size: 21px; font-weight: 800; letter-spacing: -0.02em; }
  .kyc-locked-card p { font-size: 13.5px; color: #8E8E93; line-height: 1.6; max-width: 420px; }
  .kyc-locked-card .kyc-btn { width: 100%; max-width: 300px; }
  .kyc-locked-ico { width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); color: #fff; border: 1px solid rgba(255,255,255,0.12); }
  .kyc-locked-ico.ok { background: rgba(24,194,124,0.12); color: #4ce3a0; border-color: rgba(24,194,124,0.35); }
  .kyc-locked-ico.err { background: rgba(255,255,255,0.05); color: #fff; border-color: rgba(255,255,255,0.12); }
  .kyc-modal { position: fixed; inset: 0; z-index: 200; display: flex; flex-direction: column; background: #000; }
  .kyc-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; background: #0A0A0A; border-bottom: 1px solid #1E1E1E; }
  .kyc-modal-title { display: flex; align-items: center; gap: 9px; font-size: 14.5px; font-weight: 800; color: #4ce3a0; }
  .kyc-modal-close { width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; border: none; border-radius: 50%; background: #161616; color: #fff; cursor: pointer; }
  .kyc-modal-frame { flex: 1; border: none; width: 100%; background: #fff; }
  .spin { animation: kycSpin 0.8s linear infinite; }
  @keyframes kycSpin { to { transform: rotate(360deg); } }
`
