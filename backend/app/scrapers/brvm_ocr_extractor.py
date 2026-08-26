"""Extraction d'états financiers BRVM par OCR (Tesseract, fra) pour les PDF dont
la couche texte est corrompue (couches superposées, chiffres fusionnés) ou scannée.

Stratégie :
- pages candidates repérées par mots pdfplumber (libellés canoniques + chiffres) ;
- chaque page candidate est rendue à 300 dpi et OCRisée en TSV (coordonnées) ;
- lignes logiques = bandes y ; colonnes = centres x des années lues sur la ligne
  d'en-tête (« Note  2 025  2 024 ») ; année la plus récente = plus grande valeur ;
- chaque ligne : libellé (gauche) -> clé canonique ; montants -> colonne la plus proche ;
- échelle de la légende (« En millions de FCFA ») multipliée sur les valeurs ;
- sortie identique à PDFExtractor : {income_statement, balance_sheet, cash_flow, ...}.
"""
import csv
import os
import re
import shutil
import subprocess
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import pdfplumber

from .pdf_extractor import LABEL_TERMS, _INFERRED_INCOME, _INFERRED_BALANCE, _INFERRED_CF

_PLAUSIBLE_MAX = 1e14

_SCALE_RE = re.compile(
    r"\b(?:en\s+)?(milliards?|millions?|milliers?)\s*(?:de\s+f?cfa|de\s+francs?)?\b",
    re.IGNORECASE,
)
_SCALE_IMPL = {"milliard": 1e9, "millions": 1e6, "millier": 1e3,
               "milliards": 1e9, "million": 1e6, "milliers": 1e3}


_LABEL_EXCLUDE = (
    "par action", "par titre", "par employe", "par branche",
    "par salarie", "taux de distribution", "dividendes en",
    "benefice par", "actif net par", " net action", "action ",
)


def _norm(s: str) -> str:
    return s.lower().replace("é", "e").replace("è", "e").replace("ê", "e").replace("ë", "e") \
        .replace("à", "a").replace("â", "a").replace("î", "i").replace("ï", "i") \
        .replace("ô", "o").replace("û", "u").replace("ù", "u").replace("ç", "c") \
        .replace("’", "'").replace("ʼ", "'")


def _match_label(label: str) -> Optional[str]:
    """Clé canonique FR la plus spécifique contenue dans le libellé."""
    low = _norm(label)
    best, best_len = None, 0
    for key, terms in LABEL_TERMS.items():
        for term in terms:
            t = _norm(term)
            idx = low.find(t)
            if idx < 0:
                continue
            if idx > 0 and low[idx - 1].isalnum():
                continue
            end = idx + len(t)
            if end < len(low) and low[end].isalnum():
                continue
            if len(t) > best_len:
                best, best_len = key, len(t)
    return best


def _parse_num(tok: str) -> Optional[float]:
    """« 1 234 », « -1 234 », « (12) » -> float (brut, sans échelle).
    Refuse les tokens mélangeant groupes d'espace et décimales (« 1 248,3 »)."""
    t = tok.strip()
    if not t:
        return None
    if (" " in t or "\u202f" in t or "\xa0" in t) and ("," in t or "." in t):
        return None
    neg = False
    if t.startswith("(") and t.endswith(")"):
        neg = True
        t = t[1:-1].strip()
    if t[:1] in "-−–":
        neg = True
        t = t[1:].strip()
    if not re.fullmatch(r"[\d\s.,]+", t):
        return None
    if re.fullmatch(r"\s*20[12]\d\s*", t):
        return None
    t = t.replace("\u202f", "").replace("\xa0", "").replace(" ", "")
    if "," in t and "." in t:
        if t.rfind(",") > t.rfind("."):
            t = t.replace(".", "").replace(",", ".")
        else:
            t = t.replace(",", "")
    elif "," in t:
        if re.fullmatch(r"\d{1,3}(?:,\d{3})+", t) or not re.fullmatch(r"\d+,\d{1,2}", t):
            t = t.replace(",", "")
        else:
            t = t.replace(",", ".")
    elif "." in t and not re.fullmatch(r"\d+\.\d{1,2}", t):
        t = t.replace(".", "")
    try:
        v = float(t)
    except ValueError:
        return None
    return -v if neg else v


_STATEMENT_KEYWORDS = (
    "compte de résultat", "compte de resultat", "état du résultat", "etat du resultat",
    "situation financière", "situation financiere", "tableau des flux",
    "flux de trésorerie", "flux de tresorerie", "capitaux propres",
    "chiffre d'affaires", "chiffre d affaires", "produit net bancaire",
    "total actif", "total bilan", "résultat net", "resultat net",
)


class BRVMOcrExtractor:
    """Extraction BRVM par OCR positionnel (remplace les couches texte corrompues)."""

    @staticmethod
    def _resolve_tesseract(cmd: Optional[str]) -> str:
        if cmd:
            return cmd
        for cand in (
            os.environ.get("TESSERACT_CMD"),
            shutil.which("tesseract"),
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
            os.path.expanduser("~\\AppData\\Local\\Tesseract-OCR\\tesseract.exe"),
        ):
            if cand and os.path.exists(cand):
                return cand
        return "tesseract"

    def __init__(self, tesseract_cmd: Optional[str] = None, tessdata_dir: Optional[str] = None,
                 res: int = 300):
        self.tesseract = self._resolve_tesseract(tesseract_cmd)
        self.tessdata_dir = tessdata_dir
        self.res = res

    def _resolve_tessdata(self) -> Optional[str]:
        """Répertoire tessdata contenant fra.traineddata (sinon None)."""
        for p in (self.tessdata_dir, os.environ.get("TESSDATA_PREFIX")):
            if p and os.path.exists(os.path.join(p, "fra.traineddata")):
                return p
        exe_dir = os.path.dirname(self.tesseract) if os.path.sep in self.tesseract else ""
        for cand in (
            os.path.join(exe_dir, "tessdata"),
            os.path.join(os.path.dirname(exe_dir), "tessdata"),
            r"C:\Program Files\Tesseract-OCR\tessdata",
            os.path.expanduser("~\\AppData\\Local\\Tesseract-OCR\\tessdata"),
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "tessdata"),
        ):
            if cand and os.path.exists(os.path.join(cand, "fra.traineddata")):
                return cand
        return None

    # ------------------------------------------------------------------ OCR
    def _ocr_page(self, page, tag: str) -> List[Dict]:
        im = page.to_image(resolution=self.res).original
        base = os.path.join(os.environ.get("TEMP", "/tmp"), f"brvm_ocr_{tag}")
        png, tsv = base + ".png", base
        im.save(png)
        env = dict(os.environ)
        tessdata = self._resolve_tessdata()
        if tessdata:
            env["TESSDATA_PREFIX"] = tessdata
        try:
            subprocess.run([self.tesseract, png, tsv, "-l", "fra", "--psm", "6", "tsv"],
                           check=True, capture_output=True, env=env, timeout=120)
        except Exception:
            try:
                os.remove(png)
            except OSError:
                pass
            return []
        finally:
            if os.path.exists(png):
                os.remove(png)
        tokens: List[Dict] = []
        try:
            with open(tsv + ".tsv", encoding="utf-8") as f:
                for rec in csv.DictReader(f, delimiter="\t"):
                    txt = (rec.get("text") or "").strip()
                    if not txt:
                        continue
                    try:
                        conf = float(rec.get("conf") or 0)
                    except ValueError:
                        conf = 0
                    if conf < 35:
                        continue
                    tokens.append({
                        "text": txt,
                        "x": float(rec["left"]),
                        "cx": float(rec["left"]) + float(rec["width"]) / 2,
                        "y": float(rec["top"]),
                    })
        except (OSError, KeyError):
            tokens = []
        finally:
            if os.path.exists(tsv + ".tsv"):
                os.remove(tsv + ".tsv")
        return tokens

    @staticmethod
    def _page_scale(text: str) -> float:
        m = _SCALE_RE.search(text)
        if m:
            return _SCALE_IMPL.get(m.group(1).lower(), 1.0)
        return 1.0

    @staticmethod
    def _bands(tokens: List[Dict], tol: float = 2.0) -> List[List[Dict]]:
        bands: List[List[Dict]] = []
        for t in sorted(tokens, key=lambda t: t["y"]):
            for b in bands:
                if abs(b[0]["y"] - t["y"]) <= tol:
                    b.append(t)
                    break
            else:
                bands.append([t])
        for b in bands:
            b.sort(key=lambda t: t["x"])
        return bands

    @staticmethod
    def _is_candidate_page(page) -> bool:
        try:
            txt = (page.extract_text() or "").lower()
        except Exception:
            return False
        return any(k in txt for k in _STATEMENT_KEYWORDS)

    # ------------------------------------------------------------- header
    @staticmethod
    def _is_year_token(text: str) -> Optional[int]:
        t = text.replace(" ", "").replace("\u202f", "").replace("\xa0", "")
        if re.fullmatch(r"20[12]\d", t):
            return int(t)
        return None

    @staticmethod
    def _header_cols(bands: List[List[Dict]]) -> Optional[List[Optional[float]]]:
        """Centres x des colonnes [récent, précédent] depuis la ligne d'en-tête :
        la ligne « Note  2 025  2 024 » porte les années (la plus grande = récente)."""
        for b in bands:
            joined = " ".join(t["text"] for t in b).lower()
            if not any(k in joined for k in ("note", "notes", "en millions", "en milliers",
                                             "en milliards", "montants")):
                continue
            years = []
            for i, t0 in enumerate(b):
                y = BRVMOcrExtractor._is_year_token(t0["text"])
                if y is not None:
                    years.append((y, t0["cx"]))
                else:
                    for t1 in b[i + 1:i + 3]:
                        joined = (t0["text"] + t1["text"]).replace(" ", "").replace("\u202f", "")
                        y = BRVMOcrExtractor._is_year_token(joined)
                        if y is not None:
                            years.append((y, (t0["cx"] + t1["cx"]) / 2))
                            break
            if len(years) >= 2:
                years.sort(key=lambda p: -p[0])
                return [years[0][1], years[1][1]]
            if len(years) == 1:
                return [years[0][1], None]
            nums = [t["cx"] for t in b if _parse_num(t["text"]) is not None]
            if len(nums) >= 2:
                return sorted(nums[:4])[:2]
            if nums:
                return [nums[0], None]
        return None

    # ------------------------------------------------------------- columns
    def _page_cols(self, bands: List[List[Dict]]) -> Optional[List[float]]:
        """Sans ligne d'années : (1) moyenne des paires de groupes numériques par
        bande (structure du tableau : 1 groupe = valeur 2025, 2e = 2024) ;
        (2) repli : histogramme x des tokens numériques (≥ 3 chiffres)."""
        pairs: List[List[float]] = [[], []]
        for b in bands:
            toks = sorted(
                [t for t in b if _parse_num(t["text"]) is not None],
                key=lambda t: t["x"],
            )
            if len(toks) < 4:
                continue
            groups: List[List[Dict]] = []
            for t in toks:
                if groups and t["x"] - groups[-1][-1]["x"] < 90:
                    groups[-1].append(t)
                else:
                    groups.append([t])
            if len(groups) != 2:
                continue
            g0 = (groups[0][0]["x"] + groups[0][-1]["x"]) / 2
            g1 = (groups[1][0]["x"] + groups[1][-1]["x"]) / 2
            if g1 - g0 < 40:
                continue
            pairs[0].append(g0)
            pairs[1].append(g1)
        if len(pairs[0]) >= 3 and len(pairs[1]) >= 3:
            return [sum(pairs[0]) / len(pairs[0]), sum(pairs[1]) / len(pairs[1])]
        cxs: List[float] = []
        for b in bands:
            for t in b:
                txt = t["text"]
                if "." in txt or "," in txt or re.search(r"[A-Za-zÀ-ÿ]", txt):
                    continue
                if len(re.sub(r"[^\d]", "", txt)) < 3:
                    continue
                cxs.append(t["cx"])
        if len(cxs) < 6:
            return None
        cxs.sort()
        clusters: List[List[float]] = []
        for x in cxs:
            if clusters and x - clusters[-1][-1] <= 60:
                clusters[-1].append(x)
            else:
                clusters.append([x])
        best = sorted(clusters, key=len, reverse=True)[:2]
        if not best:
            return None
        best.sort(key=lambda c: c[0])
        return [(c[0] + c[-1]) / 2 for c in best]

    # --------------------------------------------------------------- rows
    def _col_values(self, b: List[Dict],
                    cols: Optional[List[Optional[float]]]) -> Dict[int, float]:
        """Valeur par colonne (recent=0, prior=1) : chaque token numérique est
        assigné à sa colonne la plus proche puis les tokens d'une même colonne
        sont fusionnés en un seul montant (« 1 181 045 » = 1+181+045)."""
        out: Dict[int, float] = {}
        num_toks = [t for t in b if _parse_num(t["text"]) is not None]
        if not num_toks:
            return out
        if cols and any(cols):
            cxs = [c for c in cols if c is not None]
            gap = (cxs[1] - cxs[0]) if len(cxs) > 1 else 150
            note_x = cxs[0] - max(gap * 0.5, 45)
            dist_cap = max(gap * 1.2, 200)
            buckets: Dict[int, List[Dict]] = {0: [], 1: []}
            for t in num_toks:
                if t["cx"] < note_x:
                    continue
                d0 = abs(t["cx"] - cols[0]) if cols[0] is not None else 1e12
                d1 = abs(t["cx"] - cols[1]) if cols[1] is not None else 1e12
                col = 0 if d0 <= d1 else 1
                if min(d0, d1) > dist_cap:
                    continue
                buckets[col].append(t)
            for col, toks in buckets.items():
                toks.sort(key=lambda t: t["x"])
                if len(toks) > 4:
                    continue
                text = " ".join(t["text"] for t in toks)
                v = _parse_num(text)
                if v is not None:
                    out[col] = v
        else:
            toks = sorted(num_toks, key=lambda t: t["x"])
            gaps = [toks[i + 1]["x"] - toks[i]["x"] for i in range(len(toks) - 1)]
            med = sorted(gaps)[len(gaps) // 2] if gaps else 0
            thr = max(70.0, med * 1.8)
            groups: List[List[Dict]] = []
            for t in toks:
                if groups and t["x"] - groups[-1][-1]["x"] < thr:
                    groups[-1].append(t)
                else:
                    groups.append([t])
            for col, grp in enumerate(groups[:2]):
                text = " ".join(t["text"] for t in grp)
                v = _parse_num(text)
                if v is not None:
                    out[col] = v
        return out

    def _rows_from_bands(self, bands: List[List[Dict]],
                         cols: Optional[List[Optional[float]]]
                         ) -> List[Tuple[str, float, Optional[float]]]:
        """(canon, valeur_récente, valeur_précédente) — 1re valeur par colonne."""
        out = []
        for b in bands:
            label_toks = [t for t in b if re.search(r"[A-Za-zà-ÿÀ-Ý]", t["text"])]
            num_toks = [t for t in b if not re.search(r"[A-Za-zà-ÿÀ-Ý]", t["text"])]
            if not label_toks or not num_toks:
                continue
            label = " ".join(t["text"] for t in label_toks)
            canon = _match_label(label)
            if canon is None:
                continue
            if any(k in _norm(label) for k in _LABEL_EXCLUDE):
                continue
            if _norm(label).startswith(("en ", "note")):
                continue
            vals = self._col_values(b, cols)
            if not vals:
                continue
            out.append((canon, vals.get(0), vals.get(1)))
        return out

    @staticmethod
    def _target(canon: str) -> str:
        if canon in _INFERRED_INCOME:
            return "INCOME"
        if canon in _INFERRED_BALANCE:
            return "BALANCE"
        if canon in _INFERRED_CF:
            return "CF"
        return "INCOME"

    # -------------------------------------------------------------- main
    def extract(self, pdf_path: str) -> Optional[Dict]:
        """Retourne les 3 états (dicts canoniques, FCFA) ou None si rien d'exploitable."""
        if not os.path.exists(pdf_path):
            return None
        income, balance, cf = {}, {}, {}
        n_pages = 0
        with pdfplumber.open(pdf_path) as pdf:
            n_pages = len(pdf.pages)
            candidates = [i for i in range(n_pages) if self._is_candidate_page(pdf.pages[i])]
            if not candidates:
                candidates = list(range(n_pages))
            for idx in candidates:
                page = pdf.pages[idx]
                tokens = self._ocr_page(page, f"p{idx}")
                if not tokens:
                    continue
                bands = self._bands(tokens)
                all_text = " ".join(t["text"] for t in tokens)
                variants = []
                cols = self._header_cols(bands)
                if cols is not None:
                    variants.append((cols, self._rows_from_bands(bands, cols)))
                pc = self._page_cols(bands)
                if pc and (cols is None or pc != cols):
                    variants.append((pc, self._rows_from_bands(bands, pc)))
                variants.append((None, self._rows_from_bands(bands, None)))
                def _vscore(rs):
                    good = [abs(r[1]) for r in rs
                            if r[1] is not None and 0 < abs(r[1]) <= 1e12]
                    if not good:
                        return (0, 0.0)
                    med = sorted(good)[len(good) // 2]
                    if med and max(good) > 100 * med:
                        med = 0.0
                    return (len(good), med)

                variants.sort(key=lambda v: _vscore(v[1]), reverse=True)
                scales = [self._page_scale(all_text), 1e6, 1e3, 1]
                cols, best_rows = variants[0]
                for scale in dict.fromkeys(scales):
                    good = [r for r in best_rows if r[1] is not None and abs(r[1]) <= 1e12]
                    if good and all(abs(r[1] * scale) <= _PLAUSIBLE_MAX for r in good):
                        break
                med = 0.0
                vals = [abs(r[1]) for r in best_rows if r[1] is not None and abs(r[1]) >= 1e2]
                if vals:
                    med = sorted(abs(v) for v in vals)[len(vals) // 2]
                for canon, recent, prior in best_rows:
                    if recent is None:
                        continue
                    if abs(recent) > 1e12:
                        continue
                    value = recent * scale
                    if abs(value) > _PLAUSIBLE_MAX:
                        continue
                    if (med > 1e7 and abs(value) < 1e6) or abs(value) < 1e5:
                        continue
                    bucket = {"INCOME": income, "BALANCE": balance, "CF": cf}[
                        self._target(canon)]
                    if value == 0 and bucket.get(canon):
                        continue
                    bucket[canon] = value
                for _, rows in variants[1:]:
                    for canon, recent, prior in rows:
                        bucket = {"INCOME": income, "BALANCE": balance, "CF": cf}[
                            self._target(canon)]
                        if canon in bucket:
                            continue
                        if recent is None or abs(recent) > 1e12:
                            continue
                        value = recent * scale
                        if abs(value) > _PLAUSIBLE_MAX:
                            continue
                        if (med > 1e7 and abs(value) < 1e6) or abs(value) < 1e5:
                            continue
                        if value == 0 and bucket.get(canon):
                            continue
                        bucket[canon] = value
        if not (income or balance or cf):
            return None
        return {
            "income_statement": income,
            "balance_sheet": balance,
            "cash_flow": cf,
            "metadata": {
                "source": pdf_path,
                "pages": n_pages,
                "detected_scale": "ocr",
                "ocr": True,
                "extracted_at": datetime.now().isoformat(),
            },
        }


