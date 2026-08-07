from typing import List, Dict, Optional, Tuple
import pdfplumber
import re
from datetime import datetime
import os

SCALE_WORDS = {
    "milliards": 1e9,
    "milliard": 1e9,
    "millions": 1e6,
    "million": 1e6,
    "milliers": 1e3,
    "millier": 1e3,
    "centaines de milliers": 1e5,
    "centaine de milliers": 1e5,
    "k": 1e3,
    "M": 1e6,
    "Md": 1e9,
    "Mds": 1e9,
    "Mrds": 1e9,
    "MFCFA": 1e6,
    "M FCFA": 1e6,
    "MdFCFA": 1e9,
    "Md FCFA": 1e9,
}

# Libellés canoniques -> termes de tableaux (triés par spécificité décroissante dans le code)
LABEL_TERMS: Dict[str, List[str]] = {
    "Chiffre d'affaires": [
        "chiffre d'affaires", "produits des activités ordinaires",
        "produits d'exploitation bancaire", "produits d'exploitation",
        "produits des operations", "revenus d'exploitation",
    ],
    "Produit net bancaire": [
        "produit net bancaire", "produits nets bancaires", "produit bancaire net",
        "p.n.b", "pnb",
    ],
    "Résultat net": [
        "résultat net de l'exercice", "résultat net de l'ensemble consolidé",
        "résultat net part du groupe", "résultat net consolidé",
        "résultat net global", "résultat net", "bénéfice net de l'exercice",
        "bénéfice net", "résultat de l'exercice", "perte de l'exercice",
    ],
    "Résultat d'exploitation": [
        "résultat d'exploitation", "résultat opérationnel", "résultat avant impôt",
        "resultat d'exploitation",
    ],
    "EBITDA": ["ebitda", "excédent brut d'exploitation"],
    "Charges financières": [
        "charges financières", "frais financiers", "charges d'intérêts",
        "charges d'interets",
    ],
    "Impôts": [
        "impôt sur les bénéfices", "impôt sur les resultats", "impôts sur les bénéfices",
        "impôt sur le résultat", "impôts sur le résultat",
    ],
    "Marge brute": ["marge brute", "bénéfice brut"],
    "Charges d'exploitation": [
        "charges d'exploitation", "charges opérationnelles", "charges de personnel",
        "charges generales d'exploitation",
    ],
    "Coût des ventes": [
        "coût des ventes", "cout des ventes", "coût des marchandises vendues",
        "coût des matières", "achats de marchandises",
    ],
    "Amortissements": [
        "amortissements et dépréciations", "amortissements et depreciations",
        "dotations aux amortissements", "amortissements",
    ],
    "Produits d'intérêts": [
        "produits nets d'intérêts", "produits d'intérêts et assimilés",
        "produits d'interets", "intérêts et produits assimilés",
        "interets et produits assimiles",
    ],
    "Charges d'intérêts": [
        "charges d'intérêts et assimilés", "charges d'interets",
        "intérêts et charges assimilées", "interets et charges assimiles",
    ],
    "Marge nette d'intérêts": ["marge nette d'intérêts", "marge nette d'interets", "marge d'intérêts"],
    "Commissions nettes": ["commissions nettes", "produits de commissions", "commissions"],
    "Coût du risque": [
        "coût du risque", "cout du risque", "charges de provisions nettes",
        "dotations nettes aux provisions",
    ],
    "Total actif": ["total actif", "total de l'actif", "total bilan", "total des actifs",
                    "total du passif et des capitaux propres"],
    "Actif courant": [
        "actif courant", "actif circulant", "actifs courants", "actif à court terme",
    ],
    "Trésorerie": [
        "trésorerie et équivalents de trésorerie", "trésorerie et équivalents",
        "caisse, banque centrale", "caisse et banques centrales", "disponibilités",
        "trésorerie",
    ],
    "Créances clients": [
        "créances clients", "creances clients", "créances commerciales",
        "creances commerciales", "clients et comptes rattachés",
        "clients et comptes rattaches",
    ],
    "Stocks": ["stocks et en-cours", "stocks et en cours", "stocks"],
    "Capitaux propres": [
        "capitaux propres et ressources assimilées", "total capitaux propres",
        "capitaux propres part du groupe", "capitaux propres",
    ],
    "Dette totale": [
        "dette totale", "total dettes", "total du passif", "total passif",
    ],
    "Passif courant": [
        "passif courant", "dettes à court terme", "passifs courants",
        "passif à court terme", "dettes a court terme",
    ],
    "Prêts et avances à la clientèle": [
        "prêts et créances sur la clientèle", "prets et creances sur la clientele",
        "prêts et avances à la clientèle", "prets et avances a la clientele",
        "crédits à la clientèle", "credits a la clientele",
        "encours de crédits", "encours de credits", "créances sur la clientèle",
        "creances sur la clientele",
    ],
    "Dépôts de la clientèle": [
        "dépôts et avoirs de la clientèle", "depots et avoirs de la clientele",
        "dettes à l'égard de la clientèle", "dettes a l'egard de la clientele",
        "dépôts de la clientèle", "depots de la clientele", "dettes envers la clientèle",
    ],
    "Provisions": [
        "provisions pour risques et charges", "provisions nettes",
        "provisions pour risques", "provisions",
    ],
    "Nombre d'actions": ["nombre d'actions", "actions en circulation"],
    "Flux de trésorerie d'exploitation": [
        "flux de trésorerie nets générés par l'activité", "flux de trésorerie d'exploitation",
        "flux net de trésorerie d'exploitation", "flux d'exploitation",
        "flux de tresorerie d'exploitation",
    ],
    "Flux de trésorerie d'investissement": [
        "flux de trésorerie d'investissement", "flux net de trésorerie d'investissement",
        "flux d'investissement", "flux de tresorerie d'investissement",
    ],
    "Flux de trésorerie de financement": [
        "flux de trésorerie de financement", "flux net de trésorerie de financement",
        "flux de financement", "flux de tresorerie de financement",
    ],
    "Free cash flow": ["free cash flow", "flux de trésorerie disponible", "fcf"],
    "Variation de trésorerie": [
        "variation de trésorerie", "variation nette de trésorerie",
        "variation de tresorerie",
    ],
}

_SECTION_HEADERS = [
    ("income", ["compte de résultat", "compte de resultat", "état du résultat",
                "etat du resultat", "résultat global", "resultat global"]),
    ("balance", ["bilan", "situation financière", "situation financiere",
                 "état consolidé de la situation financière", "etat consolide de la situation financiere",
                 "état de la situation financière", "etat de la situation financiere",
                 "état consolidé de situation financière", "etat consolide de situation financiere"]),
    ("cf", ["flux de trésorerie", "flux de tresorerie", "tableau des flux",
            "tableau consolidé des flux", "tableau consolide des flux"]),
]

_INFERRED_INCOME = {
    "Chiffre d'affaires", "Produit net bancaire", "Résultat net", "Résultat d'exploitation",
    "EBITDA", "Impôts", "Marge brute", "Coût des ventes", "Charges d'exploitation",
    "Charges financières", "Produits d'intérêts", "Charges d'intérêts",
    "Marge nette d'intérêts", "Commissions nettes", "Coût du risque", "Amortissements",
}
_INFERRED_BALANCE = {
    "Total actif", "Actif courant", "Capitaux propres", "Dette totale",
    "Passif courant", "Créances clients", "Stocks", "Dépôts de la clientèle",
    "Prêts et avances à la clientèle", "Nombre d'actions", "Provisions", "Trésorerie",
}
_INFERRED_CF = {
    "Flux de trésorerie d'exploitation", "Flux de trésorerie d'investissement",
    "Flux de trésorerie de financement", "Free cash flow", "Variation de trésorerie",
}

_PAGE_KEYWORDS = ["bilan", "résultat", "resultat", "flux", "produits", "actif", "passif",
                  "trésorerie", "tresorerie", "capitaux propres", "chiffre d'affaires"]

# Échelles dans les LÉGENDES de tableaux (« Montants en Millions », « (en milliers de FCFA) »).
# Les mentions hors légende (texte narratif du rapport : « besoin en milliards FCFA »,
# graphiques « PNB (en milliards de FCFA) ») ne doivent JAMAIS fixer l'échelle des tableaux.
_SCALE_LEGEND_RE = re.compile(
    r"(?:\b(?:montants?|chiffres?|donn[eé]es|exprim[eé]s?|libell[eé]s?|unit[eé]s?)\s+(?:en\s+)?"
    r"|\((?:en\s+)?)(milliards?|millions?|milliers?|centaines?\s+de\s+milliers?)",
    re.IGNORECASE,
)

# Plausibilité : aucun poste de bilan BRVM ne dépasse 100 000 milliards de FCFA.
# Au-delà, l'échelle appliquée est trop grande et doit être réduite.
_PLAUSIBLE_MAX = 1e14

# Ordre de descente quand l'échelle détectée produit des valeurs absurdes.
_SCALE_DESCENT = [1e9, 1e6, 1e3, 1.0]


def _term_match_rank(terms: List[str]) -> List[str]:
    return sorted(terms, key=len, reverse=True)


class PDFExtractor:
    """Extraction des états financiers réels depuis un PDF : stratégie tableaux
    (colonnes années, échelle détectée par ordre de grandeur) puis fallback regex.
    JAMAIS de données d'exemple inventées : ValueError si rien d'exploitable."""

    def __init__(self):
        self.current_data = {}

    def extract_financial_statements(self, pdf_path: str) -> Dict:
        if not os.path.exists(pdf_path):
            raise ValueError("Fichier PDF introuvable")

        try:
            with pdfplumber.open(pdf_path) as pdf:
                pages = pdf.pages
                text = ""
                for page in pages:
                    text += (page.extract_text() or "") + "\n"

                scanned = len(text.strip()) < 300
                ocr_pages = None
                if scanned:
                    try:
                        from .cobac_extractor import extract_cobac
                        try:
                            cobac = extract_cobac(pdf_path)
                        except Exception:
                            cobac = None
                        if cobac:
                            cobac["metadata"]["pages"] = len(pages)
                            cobac["metadata"]["extracted_at"] = datetime.now().isoformat()
                            return cobac
                    except Exception:
                        pass
                    try:
                        ocr_pages = self._ocr_pages(pages)
                        text = "\n".join(ocr_pages)
                    except Exception as e:
                        raise ValueError(f"PDF scanné et OCR indisponible : {e}")

                scale, scale_word = self._detect_scale(text)

                dual = self._is_dual_currency(text)

                if ocr_pages is not None:
                    ocr_objs = [self._OcrPage(t) for t in ocr_pages]
                    l_income, l_balance, l_cf = self._extract_from_lines(ocr_objs, scale, dual)
                    t_income, t_balance, t_cf = {}, {}, {}
                else:
                    l_income, l_balance, l_cf = self._extract_from_lines(pages, scale, dual)
                    t_income, t_balance, t_cf = self._extract_from_tables(pages, scale, dual)

                def merge(line_based: Dict, table_based: Dict) -> Dict:
                    """Les tableaux (cellules pdfplumber propres) priment sur les
                    lignes de texte (montants fusionnés / colonnes confondues)."""
                    out = dict(table_based)
                    for k, v in line_based.items():
                        out.setdefault(k, v)
                    return out

                income = merge(l_income, t_income)
                balance = merge(l_balance, t_balance)
                cf = merge(l_cf, t_cf)

                result = {
                    "income_statement": income or self._extract_income_statement(text, scale),
                    "balance_sheet": balance or self._extract_balance_sheet(text, scale),
                    "cash_flow": cf or self._extract_cash_flow(text, scale),
                    "notes": self._extract_notes(text),
                    "metadata": {
                        "source": pdf_path,
                        "pages": len(pages),
                        "detected_scale": scale_word,
                        "ocr": scanned,
                        "extracted_at": datetime.now().isoformat(),
                    },
                }
                if not (result["income_statement"] or result["balance_sheet"] or result["cash_flow"]):
                    raise ValueError("Aucun état financier exploitable détecté (PDF scanné ou mal formaté)")
                return result
        except ValueError:
            raise
        except Exception as e:
            print(f"Error extracting PDF: {e}")
            raise ValueError(f"Erreur d'extraction du PDF : {e}")

    @staticmethod
    def _legend_scale(text: str) -> Optional[Tuple[float, str]]:
        """Échelle mentionnée dans une LÉGENDE de tableau (« Montants en Millions »,
        « Données (en milliards FCFA) », « (en milliers de Dollars EU) »).
        Retourne None si aucune légende d'échelle n'est présente."""
        counts = {}
        for m in _SCALE_LEGEND_RE.finditer(text):
            word = m.group(1).lower()
            scale = SCALE_WORDS.get(word)
            if scale is None:
                continue
            counts[word] = counts.get(word, 0) + 1
        if not counts:
            return None
        best = max(counts, key=lambda w: (counts[w], len(w)))
        return SCALE_WORDS[best], best

    @staticmethod
    def _recent_last(header_text: str) -> bool:
        """Vrai si les en-têtes de colonnes listent les années par ordre CROISSANT
        (« 31/12/2018 | 31/12/2019 ») : la colonne la plus récente est alors la
        DERNIÈRE. Si les en-têtes n'explicitent pas d'années (ex. « 31/12/N »),
        la colonne la plus récente est la PREMIÈRE (défaut)."""
        years = [int(y) for y in re.findall(r"\b\d{1,2}/\d{1,2}/(20\d{2})\b", header_text)]
        return len(years) >= 2 and years[-1] > years[0]

    @staticmethod
    def _candidate_scales(detected: float) -> List[float]:
        """Échelles à essayer pour une table, de la plus probable à la moins."""
        cands = []
        for s in _SCALE_DESCENT:
            if s not in cands:
                cands.append(s)
        if detected in cands:
            cands.remove(detected)
        return [detected] + cands

    @classmethod
    def _pick_scale(cls, detected: float, final_values: List[float], dual: bool) -> float:
        """Échelle la plus plausible : la première (dans l'ordre de descente) pour
        laquelle toutes les valeurs finales restent sous le plafond de plausibilité.
        En mode bilingue (milliers $EU + millions FCFA) l'échelle est imposée (1e6)."""
        if dual:
            return detected
        for s in cls._candidate_scales(detected):
            vals = [abs(v) for v in final_values if v is not None]
            if vals and max(vals) <= _PLAUSIBLE_MAX:
                return s
        return detected

    def _detect_scale(self, text: str) -> Tuple[float, str]:
        """Échelle GLOBALE du document, détectée uniquement dans les LÉGENDES de
        tableaux (le texte narratif « ... en milliards ... » ne fait pas foi)."""
        hit = self._legend_scale(text)
        if hit:
            return hit
        return 1.0, "unité"

    @staticmethod
    def _scale_cap(scale: float) -> float:
        """Plafond de plausibilité pour une valeur brute (non multipliée) selon l'unité."""
        return {1e9: 1e11, 1e6: 1e7, 1e3: 1e10, 1.0: 1e14}.get(scale, 1e14)

    @staticmethod
    def _page_scale(text: str, fallback: float) -> float:
        """Échelle d'une page, détectée uniquement dans ses LÉGENDES de tableaux
        (ex. « Montants en Millions »), sinon repli global (déjà légende-only)."""
        hit = PDFExtractor._legend_scale(text)
        if hit:
            return hit[0]
        return fallback

    def _detect_table_scale(self, page, table_obj, table, global_scale: float) -> float:
        """Échelle d'une table : légende au-dessus de la table, en-têtes de lignes,
        puis légende de la page, puis échelle globale."""
        context = ""
        try:
            bbox = table_obj.bbox
            above = page.crop((bbox[0], max(0, bbox[1] - 150), bbox[2], bbox[1]))
            context += above.extract_text() or ""
        except Exception:
            pass
        context += " " + " ".join((c or "") for row in table[:2] for c in row if c)
        hit = self._legend_scale(context)
        if hit:
            return hit[0]
        try:
            page_text = page.extract_text() or ""
        except Exception:
            page_text = ""
        hit = self._legend_scale(page_text)
        if hit:
            return hit[0]
        return global_scale

    @staticmethod
    def _is_plausible_label(txt: str) -> bool:
        if not txt:
            return False
        if "\n" in txt:
            return False
        if re.fullmatch(r"[\d\s\-–.:/()%€,]*", txt):
            return False
        if re.fullmatch(r"(montants nets|montants en|actif|passif|20\d\d|\d{4})", txt, re.IGNORECASE):
            return False
        return True

    def _table_section(self, table, above_text: str) -> Optional[str]:
        """Détermine la section (income/balance/cf) d'une table à partir de ses
        cellules (signaux forts), puis de la légende au-dessus de la table.
        Les tables HORS BILAN sont ignorées."""
        cells = " ".join((c or "") for row in table for c in row if c).lower()
        if "hors bilan" in cells:
            return None
        if "chiffres clés" in cells or "chiffres cles" in cells:
            return None
        if any(h in cells for h in ["produits/charges", "compte de résultat",
                                    "compte de resultat", "état du résultat",
                                    "etat du resultat", "résultat global", "resultat global"]):
            return "income"
        if any(h in cells for h in ["flux de trésorerie", "flux de tresorerie", "tableau des flux"]):
            return "cf"
        if "bilan" in cells or re.search(r"\bactif\b|\bpassif\b", cells):
            return "balance"
        block = (above_text + " " + cells).lower()
        if "hors bilan" in block:
            return None
        for key, headers in _SECTION_HEADERS:
            if any(h in block for h in headers):
                return key
        return None

    def _extract_from_tables(self, pages, global_scale: float, dual: bool = False) -> Tuple[Dict, Dict, Dict]:
        """Stratégie tableaux : libellés et paires (libellé, année1, année2) en lecture
        séquentielle des cellules — dernière valeur par libellé = année la plus récente.
        Échelle par table (légende → page → globale) puis validée par plausibilité
        (descente d'échelle si les valeurs finales sont absurdes)."""
        income, balance, cf = {}, {}, {}

        for page in pages:
            try:
                page_text = page.extract_text() or ""
            except Exception:
                page_text = ""
            low = page_text.lower()
            if not any(k in low for k in _PAGE_KEYWORDS):
                continue
            try:
                table_objs = page.find_tables()
            except Exception:
                table_objs = []
            if not table_objs:
                continue

            for table_obj in table_objs:
                try:
                    table = table_obj.extract()
                except Exception:
                    continue
                if not table:
                    continue

                above_text = ""
                try:
                    bbox = table_obj.bbox
                    above = page.crop((0, max(0, bbox[1] - 80), page.width, bbox[1]))
                    above_text = above.extract_text() or ""
                except Exception:
                    pass

                section = self._table_section(table, above_text)
                if not section:
                    continue

                header = above_text + " " + " ".join(
                    (c or "") for row in table[:2] for c in row if c)
                recent_last = self._recent_last(header)

                rows_items = []
                for row in table:
                    if not row:
                        continue
                    last_key = None
                    tokens: List[float] = []
                    for cell in row:
                        if cell is None:
                            continue
                        txt = cell.strip()
                        if not txt:
                            continue
                        parsed = self._parse_amount(txt)
                        if parsed is not None:
                            tokens.append(parsed)
                            continue
                        multi = self._split_numbers(txt)
                        if multi:
                            tokens.extend(multi)
                            keys = self._cell_label_keys(txt)
                            if len(keys) == 1:
                                last_key = keys[0]
                            continue
                        keys = self._cell_label_keys(txt)
                        if keys:
                            last_key = keys[0]
                    if last_key and tokens:
                        rows_items.append((last_key, txt.lower(), tokens))

                table_scale = self._detect_table_scale(page, table_obj, table, global_scale)

                def _final_values(scale_try: float) -> List[Optional[float]]:
                    vals = []
                    for last_key, _, tokens in rows_items:
                        raw = self._select_period_value(tokens, scale_try, dual, recent_last)
                        if raw is None:
                            vals.append(None)
                            continue
                        if last_key != "Nombre d'actions" and abs(raw) > self._scale_cap(scale_try):
                            vals.append(None)
                            continue
                        vals.append(raw if last_key == "Nombre d'actions"
                                    else raw * (1e6 if dual else scale_try))
                    return vals

                best_scale = self._pick_scale(table_scale, _final_values(table_scale), dual)
                final_vals = _final_values(best_scale)

                numeric = [abs(v) for v in final_vals if v is not None]
                max_allowed = self._scale_cap(best_scale)
                pos = sorted(n for n in numeric if n > 0)
                if pos:
                    max_allowed = min(max_allowed, pos[len(pos) // 2] * 100000)

                for (last_key, label, _), raw_or_value in zip(rows_items, final_vals):
                    if raw_or_value is None:
                        continue
                    if last_key != "Nombre d'actions" and abs(raw_or_value) > max_allowed:
                        continue
                    value = raw_or_value
                    target_section = section
                    if section == "balance" and last_key in _INFERRED_INCOME:
                        target_section = "income"
                    elif section == "income" and last_key in _INFERRED_BALANCE:
                        target_section = "balance"
                    elif last_key in _INFERRED_CF and section in ("balance", "income"):
                        target_section = "cf"
                    target = {"income": income, "balance": balance, "cf": cf}[target_section]
                    if last_key not in target or self._total_pref(label, last_key):
                        target[last_key] = value

        return income, balance, cf

    def _extract_from_lines(self, pages, scale: float, dual: bool) -> Tuple[Dict, Dict, Dict]:
        """Stratégie lignes de texte : chaque ligne « libellé + montants » est
        traitée indépendamment, ce qui gère les tableaux fragmentés par
        pdfplumber (libellés et chiffres dans des colonnes différentes) et les
        cellules contenant plusieurs montants. L'échelle de la page (légende) est
        validée par plausibilité : si les valeurs finales sont absurdes, l'échelle
        est réduite et les lignes sont re-tokenisées."""
        income, balance, cf = {}, {}, {}
        section = None
        for page in pages:
            try:
                page_text = page.extract_text() or ""
            except Exception:
                page_text = ""
            page_scale = self._page_scale(page_text, scale)
            recent_last = self._recent_last(page_text[:600])

            lines = []
            for line in page_text.splitlines():
                low = line.strip().lower()
                if not low:
                    continue
                if "hors bilan" in low:
                    continue
                if low.startswith("- ") or "chiffres clés" in low or "chiffres cles" in low:
                    continue
                for key, headers in _SECTION_HEADERS:
                    if any(h in low for h in headers):
                        section = key
                        break
                if low == "actif" or low == "passif":
                    section = "balance"
                    continue
                if section is None:
                    continue
                key = self._match_label(low)
                if not key:
                    continue
                rest = self._label_rest(line, key)
                lines.append((key, low, rest))

            def _try_scale(scale_try: float) -> Tuple[float, List[Tuple[str, str, float]]]:
                cap = self._scale_cap(scale_try)
                items: List[Tuple[str, str, float]] = []
                for key, low, rest in lines:
                    tokens = self._line_tokens(rest, cap)
                    if not dual and len(tokens) >= 2 and 0 <= tokens[0] < 100 \
                            and all(abs(v) >= 1000 for v in tokens[1:]):
                        tokens = tokens[1:]
                    if not tokens:
                        continue
                    raw = self._select_period_value(tokens, scale_try, dual, recent_last)
                    if raw is None:
                        continue
                    if key != "Nombre d'actions" and abs(raw) > cap:
                        continue
                    value = raw if key == "Nombre d'actions" else raw * (1e6 if dual else scale_try)
                    items.append((key, low, value))
                return scale_try, items

            best_scale, items = _try_scale(page_scale)
            if not dual:
                for s in self._candidate_scales(page_scale):
                    _, cand = _try_scale(s)
                    vals = [abs(v) for k, _, v in cand if k != "Nombre d'actions"]
                    if vals and max(vals) <= _PLAUSIBLE_MAX:
                        best_scale, items = s, cand
                        break

            for key, low, value in items:
                target_section = section
                if section == "balance" and key in _INFERRED_INCOME:
                    target_section = "income"
                elif section == "income" and key in _INFERRED_BALANCE:
                    target_section = "balance"
                elif key in _INFERRED_CF and section in ("balance", "income"):
                    target_section = "cf"
                target = {"income": income, "balance": balance, "cf": cf}[target_section]
                if key not in target or self._total_pref(low, key):
                    target[key] = value
        return income, balance, cf

    def _cell_label_keys(self, txt: str) -> List[str]:
        """Clés canoniques d'une cellule : 1 seule si la cellule contient un
        libellé (même sur plusieurs lignes type « (En milliers FCFA)\\nChiffre
        d'affaires »), 0 si aucun, >1 si libellés empilés (à ignorer)."""
        keys: List[str] = []
        for ln in txt.split("\n"):
            k = self._match_label(ln.strip().lower())
            if k and k not in keys:
                keys.append(k)
        if len(keys) == 1:
            return keys
        if not keys:
            k = self._match_label(txt.lower())
            if k:
                return [k]
        return []

    def _match_label(self, label: str) -> Optional[str]:
        if "en cours de cession" in label:
            return None
        candidates = []
        for key, terms in LABEL_TERMS.items():
            for term in _term_match_rank(terms):
                idx = label.find(term)
                if idx < 0:
                    continue
                if idx > 0 and label[idx - 1].isalnum():
                    continue
                if idx + len(term) < len(label) and label[idx + len(term)].isalnum():
                    continue
                before = label[:idx].strip()
                if before.startswith("("):
                    continue
                if before.endswith("autres") or "quote-part" in before:
                    break
                after = label[idx + len(term):].strip()
                if after.startswith("non ") or after.startswith("sur autres"):
                    break
                if after.startswith(("courant", "circulant", "non courant", "ajusté", "ajuste")):
                    break
                candidates.append((len(term), key))
                break
        if not candidates:
            return None
        candidates.sort(key=lambda x: -x[0])
        return candidates[0][1]

    @staticmethod
    def _total_pref(label: str, key: str) -> bool:
        """La ligne désigne explicitement le « Total » de la clé (ex. « Total
        capitaux propres ») : elle doit alors primer sur une sous-ligne capturée
        plus tôt (ex. « Capitaux propres part du Groupe »)."""
        low = label.lower()
        for term in _term_match_rank(LABEL_TERMS[key]):
            idx = low.find(term)
            if idx >= 0 and low[:idx].strip().endswith("total"):
                return True
        return False

    @staticmethod
    def _first_amount(chunk: str) -> Optional[float]:
        """Premier montant d'un bloc de texte (lignes « libellé 2025 2024 »
        capturées en entier par les regex : ne retenir que la 1re valeur)."""
        if not chunk:
            return None
        chunk = chunk.strip()
        if not chunk:
            return None
        negative = False
        if chunk.startswith("(") and chunk.endswith(")"):
            negative = True
            chunk = chunk[1:-1].strip()
        if chunk[:1] in "-−–":
            negative = True
            chunk = chunk[1:].strip()
        m = re.match(r"\d[\d\s.,]*\d|\d", chunk)
        if not m:
            return None
        value = PDFExtractor._parse_amount(m.group(0))
        if value is None:
            return None
        return -value if negative else value

    def _ocr_pages(self, pages, max_pages: int = 40) -> List[str]:
        """OCR des pages d'un PDF scanné (Tesseract, fra+eng). Arrêt précoce dès
        que les trois états financiers sont repérés dans le texte OCR. Le binaire
        est localisé via la variable d'environnement TESSERACT_CMD (portable),
        sinon par le PATH (installation système / Docker)."""
        import pytesseract
        from pytesseract import TesseractNotFoundError

        cmd = os.environ.get("TESSERACT_CMD") or "tesseract"
        pytesseract.pytesseract.tesseract_cmd = cmd

        results: List[str] = []
        for i, page in enumerate(pages):
            if i >= max_pages:
                break
            img = page.to_image(resolution=200)
            try:
                txt = pytesseract.image_to_string(img.original, lang="fra+eng")
            except TesseractNotFoundError:
                raise ValueError(f"binaire Tesseract introuvable ({cmd})")
            results.append(txt)
            joined = "\n".join(results).lower()
            has_income = any(k in joined for k in (
                "chiffre d'affaires", "chiffre d'affaires", "produit net bancaire",
                "produits d'exploitation bancaire", "résultat net", "resultat net"))
            has_balance = any(k in joined for k in (
                "total actif", "total bilan", "capitaux propres", "depôts de la clientèle"))
            has_cf = any(k in joined for k in (
                "flux de trésorerie", "flux de tresorerie", "tableau des flux"))
            if has_income and has_balance and has_cf:
                break
        return results

    class _OcrPage:
        """Adaptateur minimal : une page OCR se comporte comme une page
        pdfplumber pour la stratégie d'extraction par lignes de texte."""
        def __init__(self, text: str):
            self._text = text
        def extract_text(self) -> str:
            return self._text

    def _extract_income_statement(self, text: str, scale: float = 1.0) -> Dict:
        patterns = {
            "Chiffre d'affaires": r"(?:Chiffre d'affaires|Produits d'exploitation|Revenus? nets?|Produits des activités ordinaires)\s*[:\s]+([\d\s.,()-]+)",
            "Résultat d'exploitation": r"(?:Résultat d'exploitation|Résultat opérationnel)\s*[:\s]+([\d\s.,()-]+)",
            "Résultat net": r"(?:Résultat net|Bénéfice net|Résultat net de l'exercice)\s*(?:de l'exercice)?\s*[:\s]+([\d\s.,()-]+)",
            "Résultat net part du groupe": r"(?:Résultat net part du groupe|Résultat net consolidé)\s*[:\s]+([\d\s.,()-]+)",
            "EBITDA": r"EBITDA\s*[:\s]+([\d\s.,()-]+)",
            "Charges financières": r"(?:Charges financières|Frais financiers)\s*[:\s]+([\d\s.,()-]+)",
            "Impôts": r"(?:Impôt sur les bénéfices|Impôts)\s*[:\s]+([\d\s.,()-]+)",
            "Marge brute": r"(?:Marge brute|Bénéfice brut)\s*[:\s]+([\d\s.,()-]+)",
            "Charges d'exploitation": r"(?:Charges d'exploitation|Charges opérationnelles)\s*[:\s]+([\d\s.,()-]+)",
            "Coût des ventes": r"(?:Coût des ventes|Coût des marchandises vendues|Coût des matières)\s*[:\s]+([\d\s.,()-]+)",
            "Amortissements": r"(?:Amortissements et dépréciations|Amortissements)\s*[:\s]+([\d\s.,()-]+)",
            "Produits d'intérêts": r"(?:Produits d'intérêts|Produits d'intérêts et assimilés|Produits nets d'intérêts)\s*[:\s]+([\d\s.,()-]+)",
            "Charges d'intérêts": r"(?:Charges d'intérêts|Charges d'intérêts et assimilés)\s*[:\s]+([\d\s.,()-]+)",
            "Marge nette d'intérêts": r"(?:Marge nette d'intérêts|Marge d'intérêts)\s*[:\s]+([\d\s.,()-]+)",
            "Commissions nettes": r"(?:Commissions nettes|Produits de commissions)\s*[:\s]+([\d\s.,()-]+)",
            "Coût du risque": r"(?:Coût du risque|Charges de provisions nettes)\s*[:\s]+([\d\s.,()-]+)",
        }
        income_data = {}
        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                parsed = self._first_amount(match.group(1))
                if parsed is not None and abs(parsed) <= self._scale_cap(scale):
                    income_data[key] = parsed * scale
        return income_data

    def _extract_balance_sheet(self, text: str, scale: float = 1.0) -> Dict:
        patterns = {
            "Total actif": r"(?:Total actif|Total bilan|Total des actifs|Total de l'actif)\s*[:\s]+([\d\s.,()-]+)",
            "Actif courant": r"(?:Actif courant|Actif circulant|Actifs courants|Actif à court terme)\s*[:\s]+([\d\s.,()-]+)",
            "Trésorerie": r"(?:Trésorerie et équivalents|Trésorerie et équivalent|Disponibilités|Trésorerie)\s*[:\s]+([\d\s.,()-]+)",
            "Créances clients": r"(?:Créances clients|Créances commerciales|Clients et comptes rattachés)\s*[:\s]+([\d\s.,()-]+)",
            "Stocks": r"Stocks(?: et en-cours)?\s*[:\s]+([\d\s.,()-]+)",
            "Capitaux propres": r"(?:Total capitaux propres|Capitaux propres|Capitaux propres et réserves)\s*[:\s]+([\d\s.,()-]+)",
            "Dette totale": r"(?:Dette totale|Total dettes|Passif non courant et courant|Total du passif)\s*[:\s]+([\d\s.,()-]+)",
            "Passif courant": r"(?:Passif courant|Dettes à court terme|Passifs courants|Passif à court terme)\s*[:\s]+([\d\s.,()-]+)",
            "Prêts et avances à la clientèle": r"(?:Prêts et avances à la clientèle|Crédits à la clientèle|Crédits clients et autres|Encours de crédits)\s*[:\s]+([\d\s.,()-]+)",
            "Dépôts de la clientèle": r"(?:Dépôts de la clientèle|Dettes envers la clientèle|Dépôts clients|Dépôts et avoirs de la clientèle)\s*[:\s]+([\d\s.,()-]+)",
            "Provisions": r"(?:Provisions pour risques et charges|Provisions nettes|Provisions)\s*[:\s]+([\d\s.,()-]+)",
            "Nombre d'actions": r"(?:Nombre d'actions|Actions en circulation)\s*[:\s]+([\d\s.,()-]+)",
        }
        balance_data = {}
        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                parsed = self._first_amount(match.group(1))
                if parsed is not None and (key == "Nombre d'actions" or abs(parsed) <= self._scale_cap(scale)):
                    balance_data[key] = parsed if key == "Nombre d'actions" else parsed * scale
        return balance_data

    def _extract_cash_flow(self, text: str, scale: float = 1.0) -> Dict:
        patterns = {
            "Flux de trésorerie d'exploitation": r"(?:Flux de trésorerie nets générés par l'activité|Flux de trésorerie d'exploitation|Flux net de trésorerie d'exploitation|Flux d'exploitation)\s*[:\s]+([\d\s.,()-]+)",
            "Flux de trésorerie d'investissement": r"(?:Flux de trésorerie d'investissement|Flux net de trésorerie d'investissement|Flux d'investissement)\s*[:\s]+([\d\s.,()-]+)",
            "Flux de trésorerie de financement": r"(?:Flux de trésorerie de financement|Flux net de trésorerie de financement|Flux de financement)\s*[:\s]+([\d\s.,()-]+)",
            "Free cash flow": r"(?:Free cash flow|Flux de trésorerie disponible|FCF)\s*[:\s]+([\d\s.,()-]+)",
            "Variation de trésorerie": r"(?:Variation de trésorerie|Variation nette de trésorerie)\s*[:\s]+([\d\s.,()-]+)",
        }
        cf_data = {}
        for key, pattern in patterns.items():
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                parsed = self._first_amount(match.group(1))
                if parsed is not None and abs(parsed) <= self._scale_cap(scale):
                    cf_data[key] = parsed * scale
        return cf_data

    def _extract_notes(self, text: str) -> List[Dict]:
        notes = []
        note_sections = re.findall(r"Note\s+(\d+)[\s\-:]+([^\n]+?)(?=Note\s+\d+|$)", text, re.IGNORECASE | re.DOTALL)
        for num, content in note_sections[:5]:
            notes.append({"note_number": num, "content": content.strip()[:300]})
        return notes

    @staticmethod
    def _parse_amount(text: str) -> Optional[float]:
        if text is None:
            return None
        text = text.strip()
        if not text:
            return None

        negative = False
        if text.startswith("(") and text.endswith(")"):
            negative = True
            text = text[1:-1]
        if text.startswith("-"):
            negative = True
            text = text[1:]
        if text.startswith("−") or text.startswith("–"):
            negative = True
            text = text[1:]

        text = text.replace("\u202f", "").replace("\xa0", "")
        text = text.replace(" ", "")
        text = text.replace("−", "-").replace("–", "-")

        if "," in text and "." in text:
            if text.rfind(",") > text.rfind("."):
                text = text.replace(".", "").replace(",", ".")
            else:
                text = text.replace(",", "")
        elif "," in text:
            if re.fullmatch(r"\d{1,3}(?:,\d{3})+", text):
                text = text.replace(",", "")
            elif re.fullmatch(r"\d+,\d{1,2}", text):
                text = text.replace(",", ".")
            else:
                return None
        elif "." in text:
            if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", text):
                text = text.replace(".", "")
            elif not re.fullmatch(r"\d+\.\d{1,2}", text):
                text = text.replace(".", "")

        try:
            value = float(text)
        except ValueError:
            return None

        return -value if negative else value

    @staticmethod
    def _split_numbers(cell: str) -> List[float]:
        """Découpe une cellule contenant PLUSIEURS montants (colonnes années
        fusionnées par pdfplumber, ex. « 2 ,448,994 1 ,424,261 ») en valeurs.
        Stratégie : suppression des espaces puis regroupement par séparateurs
        de milliers (les espaces internes des nombres tombent alors correctement).
        Cellules multi-lignes : seule la dernière ligne chiffrée est retenue
        (l'en-tête de colonne « 06.2026\\n1 049 789 » donne 1 049 789)."""
        if not cell:
            return []
        for line in reversed(cell.split("\n")):
            line = line.strip()
            if not any(ch.isdigit() for ch in line):
                continue
            compact = line.replace(" ", "").replace("\u202f", "").replace("\xa0", "")
            compact = compact.replace("−", "-").replace("–", "-")
            tokens: List[float] = []
            for m in re.finditer(r"\d{1,3}(?:,\d{3})+", compact):
                s, e = m.start(), m.end()
                negative = (s > 0 and compact[s - 1] == "(") and (e < len(compact) and compact[e] == ")")
                v = float(m.group(0).replace(",", ""))
                tokens.append(-v if negative else v)
            if tokens:
                return tokens
            if re.search(r"[a-zA-Zà-ÿÀ-Ý]", compact):
                return []
            for m in re.finditer(r"-?\d+", compact):
                tokens.append(float(m.group(0)))
            if tokens:
                return tokens
        return []

    @staticmethod
    def _coherence(vals: List[float]) -> float:
        """Homogénéité d'un découpage : ratio max/moyenne (1.0 = montants de même
        ordre de grandeur, ce qui est attendu pour des colonnes d'années N/N-1).
        Un découpage faux (concaténation de colonnes) a des valeurs très hétérogènes."""
        av = [abs(v) for v in vals]
        if not av:
            return 0.0
        mean = sum(av) / len(av)
        if mean == 0:
            return 1.0
        return max(av) / mean

    @staticmethod
    def _line_tokens(rest: str, cap: float) -> List[float]:
        """Montants d'une ligne de texte après le libellé (gère « 2 ,448,994 »,
        « 208,107 », « 1 049 789 960 233 », « 1 634 589 », « (572) (586) » et
        « de +10,5% »). Les pourcentages sont ignorés ; chaque valeur entre
        parenthèses est un montant négatif atomique."""
        if not rest:
            return []
        rest = re.sub(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b", " ", rest)
        rest = re.sub(r"\b\d{1,2}\.\d{2,4}\b", " ", rest)
        rest = re.sub(
            r"\b\d{1,2}\s*(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre|dec)\s*\d{4}\b",
            " ", rest, flags=re.IGNORECASE)
        rest = re.sub(r"[+-]?\d[\d\s.,]*\s*%", " ", rest)
        tokens: List[float] = []
        for m in re.finditer(r"\((-?[\d\s.,]+)\)", rest):
            compact = m.group(1).replace(" ", "").replace("\u202f", "").replace("\xa0", "")
            compact = compact.replace("−", "-").replace("–", "-")
            compact = compact.lstrip("-")
            v = None
            if re.fullmatch(r"\d{1,3}(?:,\d{3})+", compact):
                v = float(compact.replace(",", ""))
            elif re.fullmatch(r"\d+", compact):
                v = float(compact)
            if v is not None:
                tokens.append(-v)
        rest = re.sub(r"\(-?[\d\s.,]+\)", " ", rest)
        if re.search(r"\d,\d(?!\d)", rest):
            return []
        compact = rest.replace(" ", "").replace("\u202f", "").replace("\xa0", "")
        compact = compact.replace("−", "-").replace("–", "-")
        for m in re.finditer(r"\d{1,3}(?:,\d{3})+", compact):
            tokens.append(float(m.group(0).replace(",", "")))
        if tokens:
            return tokens
        norm = re.sub(r"\(\s*", "-", rest)
        norm = re.sub(r"\s*\)", " ", norm)
        norm = re.sub(r"-\s+(?=\d)", "-", norm)
        groups = re.findall(r"-?\d+", norm)
        if not groups:
            return []

        memo: Dict[int, Optional[List[float]]] = {}

        def _search(start: int) -> Optional[List[float]]:
            if start in memo:
                return memo[start]
            if start == len(groups):
                memo[start] = []
                return []
            best_part = None
            for k in (1, 2, 3, 4):
                if start + k > len(groups):
                    break
                gs = groups[start:start + k]
                if len(gs) > 1 and not all(len(g) == 3 for g in gs[1:]):
                    continue
                rest_vals = _search(start + k)
                if rest_vals is None:
                    continue
                v = int("".join(g.lstrip("-") for g in gs))
                if gs[0].startswith("-"):
                    v = -v
                if abs(v) > cap:
                    continue
                vals = [float(v)] + rest_vals
                if best_part is None or len(vals) < len(best_part):
                    best_part = vals
                elif len(vals) == len(best_part) \
                        and PDFExtractor._coherence(vals) < PDFExtractor._coherence(best_part):
                    best_part = vals
            memo[start] = best_part
            return best_part

        return _search(0) if _search(0) is not None else []

    @staticmethod
    def _label_rest(line: str, key: str) -> str:
        """Partie de la ligne située APRÈS le libellé correspondant à la clé
        canonique (le reste = les montants)."""
        low = line.lower()
        for term in _term_match_rank(LABEL_TERMS[key]):
            idx = low.find(term)
            if idx >= 0:
                return line[idx + len(term):]
        return ""

    @staticmethod
    def _is_dual_currency(text: str) -> bool:
        """Document bilingue (ex. Ecobank : « milliers $EU » + « millions FCFA ») :
        chaque ligne contient 2 colonnes par année ; il faut alors choisir la
        colonne correspondant à l'échelle détectée."""
        low = text.lower()
        scale_first = re.search(r"milliers?[^\n]{0,60}(?:\$|dollar|euro|€)", low)
        scale_second = re.search(r"millions?[^\n]{0,60}(?:fcf|francs?|euro|€)", low)
        return bool(scale_first and scale_second)

    @staticmethod
    def _select_period_value(tokens: List[float], scale: float, dual: bool, recent_last: bool = False) -> Optional[float]:
        """Sélectionne la valeur de l'exercice le plus récent : 1er groupe de
        colonnes par défaut, DERNIER groupe si les en-têtes listent les années en
        ordre croissant (« 31/12/2018 | 31/12/2019 »). En mode bilingue (milliers
        $EU + millions FCFA), retient la colonne FCFA (2e de chaque groupe) : la
        multiplication par l'échelle de la colonne FCFA (1e6) est faite par
        l'appelant."""
        if not tokens:
            return None
        group = 2 if dual else 1
        if recent_last:
            last_year = tokens[-group:]
            if len(last_year) == 1:
                return last_year[0]
            return last_year[1] if dual else last_year[0]
        first_year = tokens[:group]
        if len(first_year) == 1:
            return first_year[0]
        return first_year[1] if dual else first_year[0]
