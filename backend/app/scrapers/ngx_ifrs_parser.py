"""Parser d'états financiers IFRS anglo-saxons (NGX Nigeria) depuis un PDF.

Approche v3 : parsing par mots/positions (PyMuPDF get_text("words")) :
- lignes = regroupement par coordonnée y ;
- colonnes = positions x des années relevées sur la ligne d'en-tête "Notes 31/12/2024 …" ;
- chaque ligne logique = niveau label (gauche) + valeurs de colonnes ;
- échelle détectée sur la ligne "₦'million" / "₦'000" / "in thousands of naira" ;
- seules les colonnes consolidées (première moitié) sont conservées.

Sortie : {
    "income_statement": {year: {canon: value}},
    "balance_sheet": {...},
    "cash_flow": {...},
    "metadata": {...}
}
"""

import os
import re
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional, Tuple

try:
    import fitz
except ImportError:
    fitz = None

CANON_TERMS: Dict[str, List[str]] = {
    "Chiffre d'affaires": [
        "revenue from contracts with customers", "revenue",
        "turnover", "gross earnings", "net revenue", "sales",
    ],
    "Produit net bancaire": [
        "net interest income and net fee", "net interest and net fee income",
        "net operating income", "operating income", "total operating income",
    ],
    "Résultat net": [
        "profit for the year attributable to owners of the company",
        "profit for the year attributable to owners",
        "profit for the year attributable to equity holders",
        "profit for the year", "profit/(loss) for the year",
        "loss for the year", "net profit", "net income",
    ],
    "Résultat d'exploitation": [
        "profit from operating activities", "operating profit",
        "profit before tax", "profit/(loss) before tax",
        "profit before taxation", "operating profit/(loss)",
    ],
    "EBITDA": ["ebitda", "earnings before interest, tax, depreciation"],
    "Impôts": ["income tax expense", "taxation", "tax expense", "provision for taxation", "income taxes"],
    "Marge brute": ["gross profit/(loss)", "gross profit"],
    "Coût des ventes": [
        "production cost of sales", "cost of sales", "cost of goods sold",
        "cost of sales and services", "cost of raw materials consumed",
    ],
    "Charges d'exploitation": [
        "selling and distribution expenses", "administrative and other expenses",
        "operating and administrative expenses", "administrative expenses",
        "general and administrative expenses", "operating expenses",
        "operating expenditure",
    ],
    "Charges financières": [
        "finance costs", "finance charges", "interest expense and similar charges",
        "interest expense", "net finance costs",
    ],
    "Produits d'intérêts": ["interest income", "interest and similar income", "interest revenue"],
    "Charges d'intérêts": ["interest expense", "interest and similar charges"],
    "Marge nette d'intérêts": ["net interest income", "net interest revenue"],
    "Commissions nettes": [
        "net fee and commission income", "fee and commission income",
        "net fees and commission", "net fees and other income",
    ],
    "Coût du risque": [
        "impairment of financial assets", "loan impairment charges",
        "credit loss expense", "impairment loss on loans and advances",
        "impairment charge", "impairment charges", "impairment loss",
        "provision for loans",
    ],
    "Amortissements": [
        "depreciation and amortisation", "depreciation and amortization",
        "depreciation of property, plant",
    ],
    "Total actif": ["total assets"],
    "Actif courant": ["total current assets", "current assets total"],
    "Trésorerie": [
        "cash and cash equivalents at end of the year",
        "cash and cash equivalents at end of year",
        "cash and cash equivalents at end of period",
        "cash and cash equivalents", "cash and bank balances",
        "cash and balances with central bank",
    ],
    "Créances clients": [
        "trade and other receivables", "trade receivables",
        "accounts receivable", "receivables",
    ],
    "Stocks": ["inventories", "inventory"],
    "Capitaux propres": [
        "total equity attributable to owners of the company",
        "total equity", "total shareholders' funds",
        "shareholders' funds", "equity attributable to owners",
    ],
    "Dette totale": ["total liabilities"],
    "Passif courant": ["total current liabilities", "current liabilities total"],
    "Prêts et avances à la clientèle": [
        "loans and advances to customers", "loans and advances",
        "loans to customers", "customer loans",
    ],
    "Dépôts de la clientèle": [
        "deposits from customers", "deposits from banks and customers", "customer deposits",
    ],
    "Provisions": [
        "provision for liabilities", "provisions for liabilities and charges", "provisions",
    ],
    "Nombre d'actions": [
        "number of ordinary shares", "ordinary shares in issue",
        "number of shares in issue", "shares in issue",
    ],
    "Flux de trésorerie d'exploitation": [
        "net cash flows provided from/(used in) operating activities",
        "net cash generated from operating activities", "net cash from operating activities",
        "net cash provided by operating activities", "cash generated from operations",
    ],
    "Flux de trésorerie d'investissement": [
        "net cash flows from/(used in) from investing activities",
        "net cash flows from/(used in) investing activities",
        "net cash used in investing activities", "net cash from investing activities",
        "net cash used in/(generated from) investing activities",
    ],
    "Flux de trésorerie de financement": [
        "net cash flows from/(used in) from financing activities",
        "net cash flows from/(used in) financing activities",
        "net cash used in financing activities", "net cash from financing activities",
        "net cash used in/(generated from) financing activities",
    ],
}

_DATE_RE = re.compile(r"\b(?:31/12|30/09|30/06|31/03|30/11|31/07|28/02|31/01|31/08|30/04|31/10|30/11|29/02)\s*[/\\]?\s*(20\d{2})\b")
_MONTH_DATE_RE = re.compile(r"(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)-?\s*(20\d{2})")
_YEAR_RE = re.compile(r"(?:20\d{2}|19\d{2})")
_SCALE_TEXT_RE = re.compile(
    r"(?:in\s+)?(hundreds?|thousands?|millions?|billions?)\s+of\s+(?:Nigerian\s+)?(?:naira|ngn|\u20a6)",
    re.IGNORECASE)
_SCALE_SYMBOL_RE = re.compile(r"\u20a6'?\s*(million|millions|thousand|thousands|billion|billions|hundred|hundreds|units)", re.IGNORECASE)
_SCALE_ALIAS = {
    "hundreds": 100, "hundred": 100,
    "thousands": 1000, "thousand": 1000,
    "millions": 1e6, "million": 1e6,
    "billions": 1e9, "billion": 1e9,
    "units": 1,
}
_NUM_RE = re.compile(r"^[+-]?[\d,]{4,}$|^\([\d,]{4,}\)$|^\([\d,]+\)$|^[+-]?[\d,]+\.\d+$")
_END_MARKERS = (
    "accompanying notes form an integral part",
    "these financial statements were approved",
    "approved by the board of directors",
    "signed pursuant to the provisions",
)


def _clean_num(raw) -> Optional[float]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s in ("-", "–", "—", ""):
        return None
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace(",", "").replace("'", "").replace("\u20a6", "").replace("N", "")
    if not re.search(r"[0-9]", s):
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    # les références de notes ("17", "35") ne sont pas des valeurs :
    # exiger >= 4 chiffres sauf format monétaire (virgule / parenthèses)
    if abs(v) < 1000 and "," not in str(raw) and "(" not in str(raw):
        return None
    if neg:
        v = -v
    return v


# Termes très génériques : refusés comme match pour les labels longs
_AMBIG_REFS = {
    "revenue", "sales", "turnover", "receivables", "inventories",
    "inventory", "taxation", "net profit", "net income", "gross earnings",
}


def _match_canon(label: str) -> Optional[Tuple[str, int, int]]:
    """Retourne (canon, longueur du terme matché, nb de mots du label) ou None."""
    n_words = len(label.strip().split())
    low = " " + label.lower().replace("&", "and").strip() + " "
    best = None
    for canon, terms in CANON_TERMS.items():
        for t in terms:
            nt = len(t.split())
            if nt <= 2 and n_words > 3 and t in _AMBIG_REFS:
                continue
            if (" " + t.lower() + " ") in low:
                if best is None or nt > best[1]:
                    best = (canon, nt, n_words)
    return best


_DIRTY_VALUE_RE = re.compile(r"^\d{1,5}\.\d+$")


def _page_scale(text: str) -> float:
    for m in _SCALE_TEXT_RE.finditer(text):
        return _SCALE_ALIAS.get(m.group(1).lower(), 1.0)
    for m in _SCALE_SYMBOL_RE.finditer(text):
        return _SCALE_ALIAS.get(m.group(1).lower(), 1.0)
    return 1.0


_NOTE_LABEL_RE = re.compile(r"^\d{1,3}([.,]\d+)*(\s*&\s*\d{1,3}([.,]\d+)*)*$")
_SUM_CANONS = {"Charges d'exploitation", "Coût des ventes", "Créances clients"}
_STOCK_CANONS = {"Trésorerie", "Prêts et avances à la clientèle",
                 "Dépôts de la clientèle", "Créances clients", "Stocks"}


def _is_note_label(label: str) -> bool:
    return bool(_NOTE_LABEL_RE.fullmatch(label.strip()))


class NGXIFRSParser:
    """Parseur des états financiers NGX (IFRS anglais) par positions."""

    def __init__(self):
        self._cache: Dict[str, Dict] = {}

    def extract(self, pdf_path: str) -> Dict:
        if not os.path.exists(pdf_path):
            raise ValueError("Fichier PDF introuvable")
        if pdf_path in self._cache:
            return self._cache[pdf_path]
        if fitz is None:
            raise ValueError("PyMuPDF (fitz) requis : pip install pymupdf")
        sections: Dict[str, Dict[int, Dict[str, float]]] = {}
        for key in ("income_statement", "balance_sheet", "cash_flow"):
            sections[key] = defaultdict(lambda: defaultdict(float))
        doc = fitz.open(pdf_path)
        n_pages = doc.page_count
        for i, page in enumerate(doc):
            txt = page.get_text()
            scale = _page_scale(txt)
            kind = self._detect_kind(txt)
            if not kind:
                continue
            lines = self._physical_lines(page)
            # uniquement les pages-tableaux à forte densité de labels canon
            canon_lines = [(ln, _match_canon(ln["label"])) for ln in lines]
            canon_lines = [(ln, m) for ln, m in canon_lines if m is not None]
            if len(canon_lines) < 1:
                continue
            for ln, (canon, tlen, n_words) in canon_lines:
                years, columns = ln["years"], ln["vals"]
                if not years:
                    continue
                # dans le cash flow, les lignes de variation ne sont pas des
                # stocks (Trésorerie, Prêts, Dépôts, Créances, Stocks)
                if kind == "cash_flow" and canon in _STOCK_CANONS:
                    head = ln["label"].lower().strip()
                    if not any(mk in head for mk in ("at end", "at beginning",
                                                     "opening", "closing")):
                        continue
                # moitié gauche : colonnes consolidées (Group)
                half = len(columns) // 2
                for j in range(half):
                    if columns[j] is None:
                        continue
                    val = columns[j] * scale
                    if canon in _SUM_CANONS:
                        sections[kind][years[j]][canon] += val
                        continue
                    old = sections[kind][years[j]].get(canon)
                    score = (tlen, -n_words, abs(val))
                    if old is None or score > old[0]:
                        sections[kind][years[j]][canon] = (score, val)
        doc.close()
        out = {
            "metadata": {
                "source": pdf_path,
                "pages": n_pages,
                "extracted_at": datetime.now().isoformat(),
            },
            "income_statement": {},
            "balance_sheet": {},
            "cash_flow": {},
        }
        for key, bucket in sections.items():
            merged: Dict[int, Dict[str, float]] = defaultdict(dict)
            for y, items in bucket.items():
                for canon, val in items.items():
                    merged[y][canon] = val[1] if isinstance(val, tuple) else val
            out[key] = {y: dict(d) for y, d in sorted(merged.items())}
        self._cache[pdf_path] = out
        return out

    @staticmethod
    def _detect_kind(text: str) -> Optional[str]:
        low = text.lower()
        if "notes to the consolidated" in low[:250] or "notes to the financial statements" in low[:250]:
            return None
        if ("statement of profit or loss" in low or "statements of profit or loss" in low
                or "income statement" in low or "income statements" in low):
            if "comprehensive income" in low and "income statement" not in low:
                return None
            if "for the year ended" not in low and "year ended" not in low:
                return None
            return "income_statement"
        if ("statement of financial position" in low
                or "statements of financial position" in low) and "notes" in low:
            return "balance_sheet"
        if "statement of cash flows" in low or "statements of cash flows" in low:
            if "for the year ended" not in low and "year ended" not in low:
                return None
            return "cash_flow"
        return None

    def _physical_lines(self, page) -> List:
        """Retourne les lignes logiques du tableau : (annees, [val_col1, val_col2...]).

        Chaque page-tableau : en-tête "Notes 31/12/2024 31/12/2023 …" puis des
        lignes label + valeurs. Les lignes sans label (continuations) sont
        rattachées au label précédent ; les notes (numéros isolés) ignorées.
        """
        words = page.get_text("words")
        # bandes y : tolérance pour les lignes de label / valeurs décalées
        raw: List[Tuple[float, List[Tuple[float, str]]]] = []
        for w in sorted(words, key=lambda w: (w[1], w[0])):
            x0, y0, x1, y1, text, *_ = w
            if raw and y0 - raw[-1][0] < 1.8:
                raw[-1][1].append((x0, text))
            else:
                raw.append((y0, [(x0, text)]))
        # trouver la ligne d'en-tête des colonnes : contient une date 31/12/…
        header_y: Optional[float] = None
        col_x: List[float] = []
        years: List[int] = []
        best_n = 0
        for y, items in raw:
            # ligne d'en-tête : la plus riche en tokens "date de colonne"
            tokens = [(x0, t) for x0, t in items
                      if _DATE_RE.search(t) or _MONTH_DATE_RE.search(t)]
            if len(tokens) < 2:
                continue
            if len(tokens) <= best_n:
                continue
            best_n = len(tokens)
            header_y = y
            col_x = [x0 for x0, t in tokens]
            years = []
            for x0, t in tokens:
                m = _DATE_RE.search(t) or _MONTH_DATE_RE.search(t)
                years.append(int(m.group(1)))
        if header_y is None or not col_x:
            return []
        # bornes de colonnes
        col_x0 = min(col_x)
        col_x1 = max(col_x)
        # zone des numéros de notes entre label et valeurs : ignorée
        note_zone_right = col_x0 - 45
        bounds = []
        for i, cx in enumerate(col_x):
            left = cx - 40
            right = (col_x[i + 1] - 20) if i + 1 < len(col_x) else col_x1 + 200
            bounds.append((left, right))
        label_zone = col_x0 - 20
        out: List[Dict] = []
        current_label = ""
        current = None
        for y, items in raw:
            if y <= header_y + 10:
                continue
            items = sorted(items)
            line_text = " ".join(t for _, t in items).lower()
            if any(mk in line_text for mk in _END_MARKERS):
                break
            # séparer label / notes / valeurs
            candidates: List[Tuple[float, float]] = []
            label_words: List[str] = []
            for x0, t in items:
                v = _clean_num(t)
                if v is None or _DIRTY_VALUE_RE.match(t):
                    if x0 < label_zone:
                        label_words.append(t)
                    continue
                candidates.append((x0, v))
            # assignation greedy : chaque colonne ne reçoit qu'une valeur,
            # la plus proche de son centre (gère grilles compactées)
            centres = [((lo + hi) / 2) for lo, hi in bounds]
            vals = [None] * len(col_x)
            used = set()
            for x0, v in sorted(candidates):
                best_i = min((i for i in range(len(col_x)) if i not in used),
                             key=lambda i: abs(x0 - centres[i]))
                vals[best_i] = v
                used.add(best_i)
            label = " ".join(label_words).strip()
            _words = label.split()
            is_continuation = (not label) or _is_note_label(label) or (
                len(_words) <= 2 and _words[0][0].islower())
            if not is_continuation:
                current_label = label
                current = {"years": list(years), "vals": list(vals), "label": label}
                out.append(current)
            elif current is not None:
                # ligne de continuation (label trop long / numéro de note)
                for i, v in enumerate(vals):
                    if v is not None and current["vals"][i] is None:
                        current["vals"][i] = v
        return out


def parse_ngx_pdf(pdf_path: str) -> Dict:
    return NGXIFRSParser().extract(pdf_path)


if __name__ == "__main__":
    import sys
    res = parse_ngx_pdf(sys.argv[1])
    for key in ("income_statement", "balance_sheet", "cash_flow"):
        print(f"== {key}")
        for year, items in res[key].items():
            print(f"  {year} :", {k: round(v, 0) for k, v in items.items()})