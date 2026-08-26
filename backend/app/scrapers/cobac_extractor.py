"""Extraction des états financiers COBAC (bilan actif/passif + compte de résultat)
depuis des PDF scannés, via OCR Tesseract TSV positionnel.

Pipeline : rendu page -> TSV 400 dpi -> lignes logiques (médiane des centres,
merge 6pt) -> regroupement par pitch -> matching libellés SYSCOA -> récupération
des montants sur la ligne (priorité) puis crops 800 dpi whitelist chiffres.

Convention : col1 = année la plus récente (2025), col2 = année précédente.
"""
import os
import re
import shutil
import unicodedata
from typing import Optional

import pdfplumber
from PIL import Image, ImageOps
import pytesseract

def _resolve_tesseract() -> str:
    for cand in (os.environ.get("TESSERACT_CMD") or "",
                 shutil.which("tesseract") or "",
                 r"C:\Program Files\Tesseract-OCR\tesseract.exe",
                 r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
                 os.path.expanduser("~\\AppData\\Local\\Tesseract-OCR\\tesseract.exe")):
        if cand and os.path.exists(cand):
            return cand
    return os.environ.get("TESSERACT_CMD") or "tesseract"


def _resolve_tessdata() -> Optional[str]:
    for p in (os.environ.get("TESSDATA_PREFIX"),
              r"C:\Program Files\Tesseract-OCR\tessdata",
              os.path.join(os.path.dirname(os.path.abspath(__file__)), "tessdata")):
        if p and os.path.exists(os.path.join(p, "fra.traineddata")):
            return p
    return None


TESS_CMD = _resolve_tesseract()
pytesseract.pytesseract.tesseract_cmd = TESS_CMD
_TESSDATA = _resolve_tessdata()
if _TESSDATA:
    os.environ.setdefault("TESSDATA_PREFIX", _TESSDATA)

D = 800


def norm(s):
    s = s.replace("'", " ").replace("`", " ")
    s = unicodedata.normalize("NFD", s.upper())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^A-Z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


DA = {
    "CAISSE BANQUE CENTRALE CCP": "RBA_0010",
    "CAISSE BANQUES CENTRALES CCP": "RBA_0010",
    "EFFETS PUBLICS ET VALEURS ASSIMILEES": "RBA_0020",
    "CREANCES INTERBANCAIRES ET ASSIMILEES": "RBA_0030",
    "CREANCES SUR LA CLIENTELE": "RBA_0040",
    "OBLIGATIONS ET AUTRES TITRES A REVENU FIXE": "RBA_0050",
    "ACTIONS ET AUTRES TITRES A REVENU VARIABLE": "RBA_0060",
    "ACTIONNAIRES OU ASSOCIES": "RBA_0070",
    "ACTIONNAIRES ET ASSOCIES": "RBA_0070",
    "AUTRES ACTIFS": "RBA_0080",
    "COMPTES DE REGULARISATION": "RBA_0090",
    "COMPTE DE REGULARISATION": "RBA_0090",
    "PARTICIPATIONS ET AUTRES TITRES DETENUS A LONG TERME": "RBA_0100",
    "PARTS DANS LES ENTREPRISES LIEES": "RBA_0110",
    "PART DANS LES ENTREPRISES LIEES": "RBA_0110",
    "PRETS SUBORDONNES": "RBA_0120",
    "IMMOBILISATIONS INCORPORELLES": "RBA_0130",
    "IMMOBILISATIONS CORPORELLES": "RBA_0140",
    "TOTAL DE L ACTIF": "RBA_0150",
    "TOTALDEL ACTIF": "RBA_0150",
}
DP = {
    "BANQUE CENTRALE CCP": "RBP_0010",
    "BANQUES CENTRALES CCP": "RBP_0010",
    "DETTES INTERBANCAIRES ET ASSIMILEES": "RBP_0020",
    "DETTES A L EGARD DE LA CLIENTELE": "RBP_0030",
    "DETTES REPRESENTEES PAR UN TITRE": "RBP_0040",
    "DETTES REPRESENTEE PAR UN TITRE": "RBP_0040",
    "AUTRES PASSIFS": "RBP_0050",
    "AUTRES PASSIF": "RBP_0050",
    "COMPTES DE REGULARISATION": "RBP_0060",
    "COMPTE DE REGULARISATION": "RBP_0060",
    "PROVISIONS": "RBP_0070",
    "PROVISION": "RBP_0070",
    "EMPRUNTS ET TITRES EMIS SUBORDONNES": "RBP_0080",
    "EMPRUNT ET TITRE EMIS SUBORDONNES": "RBP_0080",
    "EMPRUNTS ET TITRE EMIS SUBORDONNES": "RBP_0080",
    "DETTES REPRESENTEES PAR UN LITRE": "RBP_0040",
    "CAPITAUX PROPRES ET RESSOURCES ASSIMILEES": "RBP_0090",
    "CAPITAUX PROPRES ET RESSOURCES ASSIMILLEES": "RBP_0090",
    "CAPITAL SOUSCRIT": "RBP_0100",
    "CAPITAL SOUSCRIT VERSE": "RBP_0100",
    "PRIMES LIEES AU CAPITAL": "RBP_0110",
    "RESERVES": "RBP_0120",
    "ECARTS DE REEVALUATION": "RBP_0130",
    "ECART DE REEVALUATION": "RBP_0130",
    "PROVISIONS REGLEMENTEES": "RBP_0140",
    "PROVISION REGLEMENTEES": "RBP_0140",
    "REPORT A NOUVEAU": "RBP_0150",
    "RESUTAT DE L EXERCICE": "RBP_0160",
    "RESULTAT DE L EXERCICE": "RBP_0160",
    "TOTAL DU PASSIF": "RBP_0170",
    "TOTALDU PASSIF": "RBP_0170",
}
DR = {
    "INTERETS ET PRODUITS ASSIMILES": "RCR_0010",
    "INTERETS ET PRODUITS ASSIMILEES": "RCR_0010",
    "INTERETS ET CHARGES ASSIMILEES": "RCR_0020",
    "REVENUS DES TITRES A REVENU VARIABLE": "RCR_0030",
    "COMMISSIONS PRODUITS": "RCR_0040",
    "COMMISSONS PRODUITS": "RCR_0040",
    "COMMISSIONS CHARGES": "RCR_0050",
    "GAINS OU PERTES NETS SUR GPERATIONS DES PORTEFEUILLES DE NEGOCIATION": "RCR_0060",
    "GAINS OU PERTES NETS SUR OPERATIONS DES PORTEFEUILLES DE NEGOCIATION": "RCR_0060",
    "GAINS OU PERTES NETS SUR OPERATIONS DES PORTEFEUILLES DE PLACEMENT ET ASSIMILES": "RCR_0070",
    "AUTRES PRODUITS D EXPLOITATION BANCAIRE": "RCR_0080",
    "AUTRES CHARGES D EXPLOITATION BANCAIRE": "RCR_0090",
    "PRODUIT NET BANCAIRE": "RCR_0100",
    "SUBVENTIONS D INVESTISSEMENT": "RCR_0110",
    "CHARGES GENERALES D EXPLOITATION": "RCR_0120",
    "DOTATION AUX AMORTISSEMENTS ET AUX DEPRECIATIONS DES IMMOBILISATIONS INCORPORELLES ET CORPORELLES": "RCR_0130",
    "DOTATIONS AUX AMORTISSEMENTS ET AUX DEPRECIATIONS DES IMMOBILISATIONS INCORPORELLES ET CORPORELLES": "RCR_0130",
    "DOTATION AUX AMORTISSEMENTS ET AUX DEPRECIATIONS": "RCR_0130",
    "RESULTAT BRUT D EXPLOITATION": "RCR_0140",
    "COUT DU RISQUE": "RCR_0150",
    "RESULTAT D EXPLOITATION": "RCR_0160",
    "GAINS OU PERTES NETS SUR ACTIFS IMMOBILISES": "RCR_0170",
    "GAINS OU PERTE NETS SUR ACTIFS IMMOBILISES": "RCR_0170",
    "RESULTAT AVANT IMPOT": "RCR_0180",
    "IMPOTS SUR LES BENEFICES": "RCR_0190",
    "IMPOT SUR LES BENEFICES": "RCR_0190",
    "RESULTAT NET": "RCR_0200",
}
DICTS = {"A": DA, "P": DP, "R": DR}
KEYS = {
    t: sorted(((norm(k), v) for k, v in d.items()), key=lambda kv: -len(kv[0]))
    for t, d in DICTS.items()
}

MARKERS_P = ["TOTAL DU PASSIF", "DETTES INTERBANCAIRES", "DETTES A L EGARD", "CAPITAL SOUSCRIT",
             "RESULTAT DE L EXERCICE", "REPORT A NOUVEAU", "EMPRUNTS ET TITRES EMIS", "CAPITAUX PROPRES"]
MARKERS_A = ["TOTAL DE L ACTIF", "CREANCES SUR LA CLIENTELE", "EFFETS PUBLICS", "ACTIONNAIRES",
             "AUTRES ACTIFS", "PARTICIPATIONS ET AUTRES", "PRETS SUBORDONNES", "CREANCES INTERBANCAIRES"]
MARKERS_R = ["PRODUIT NET BANCAIRE", "RESULTAT NET", "COUT DU RISQUE", "IMPOTS SUR LES BENEFICES",
             "RESULTAT AVANT IMPOT"]


def find_code(line, dtype):
    n = norm(re.sub(r"\d", "", clean_label(line)))
    for k, v in KEYS[dtype]:
        if n == k:
            return v, "exact"
        if len(k) >= 14 and (n.startswith(k) or k in n):
            return v, "prefix"
        if len(n) >= 14 and k.startswith(n):
            return v, "prefix"
    return None, None


def clean_label(text):
    t = re.sub(r"^[\s\d\[\]|&+=\-.,;:'\"()%]+", "", text)
    t = re.sub(r"^[A-Za-z]\d*\s", "", t)
    t = re.sub(r"[\[\]|]+", " ", t)
    return t.strip()


def page_type(rows):
    texts = [norm(clean_label(r["text"])) for r in rows]
    for t, marks in [("P", MARKERS_P), ("A", MARKERS_A), ("R", MARKERS_R)]:
        for m in marks:
            if any(norm(m) in t or t.startswith(norm(m)) for t in texts):
                return t
    scores = {"A": 0, "P": 0, "R": 0}
    for t in texts:
        for dtype in scores:
            if find_code(t, dtype)[0]:
                scores[dtype] += 1
    return max(scores, key=lambda k: scores[k])


CODE_RE = re.compile(r"\bR[BC][ARP][_\s-]?0*(\d{2,4})\b")


def printed_code(text):
    """Codes COBAC imprimés dans le libellé (format 'Reporting annuel' de la BCEAO :
    'RCR_0010', 'RCR-0060', 'RCR 0040', 'RBA_0010'...)."""
    m = CODE_RE.search(text)
    if m:
        pfx = re.search(r"R[BC][ARP]", text).group(0)
        return pfx + "_" + m.group(1).zfill(4)
    return None


def render(page, res=D):
    img = page.to_image(resolution=res).original.convert("L")
    img = ImageOps.autocontrast(img)
    return img, res / 72.0


def _binarize(img, cutoff: int = 150):
    """Niveaux de gris -> noir/blanc (les scans BCEAO ont souvent des chiffres
    très pâles que Tesseract ignore en niveau de gris)."""
    if img.mode != "L":
        img = img.convert("L")
    return img.point(lambda p: 255 if p > cutoff else 0)


def tsv_tokens(page, res=400):
    img, sc = render(page, res)
    d = pytesseract.image_to_data(img, lang="fra", config="--psm 6", output_type=pytesseract.Output.DICT)
    toks = []
    for t, x, y, w, h in zip(d["text"], d["left"], d["top"], d["width"], d["height"]):
        t = t.strip()
        if t:
            toks.append({"text": t, "x0": x / sc, "x1": (x + w) / sc,
                         "y0": y / sc, "y1": (y + h) / sc})
    return toks


def logical_rows(toks, merge=6.0):
    rows = []
    for t in toks:
        yc = (t["y0"] + t["y1"]) / 2
        for r in rows:
            if abs(r["y"] - yc) < merge:
                r["toks"].append(t)
                break
        else:
            rows.append({"y": yc, "toks": [t]})
    for r in rows:
        ts = sorted(r["toks"], key=lambda t: t["x0"])
        r["text"] = " ".join(t["text"] for t in ts)
        cs = sorted((t["y0"] + t["y1"]) / 2 for t in r["toks"])
        r["y"] = cs[len(cs) // 2]
    rows.sort(key=lambda r: r["y"])
    return rows


def column_bands(toks, ymin, ymax):
    digs = [t for t in toks
            if t["x0"] > 300 and ymin <= (t["y0"] + t["y1"]) / 2 <= ymax
            and re.fullmatch(r"[\d.,' ]+", t["text"])
            and 3 <= sum(c.isdigit() for c in t["text"]) <= 12
            and not re.fullmatch(r"(19|20)\d{2}", t["text"].strip())]
    if len(digs) < 4:
        return None
    xs = sorted(t["x0"] for t in digs)
    best, best_gap = None, 0
    for i, (a, b) in enumerate(zip(xs, xs[1:])):
        g = b - a
        if g > best_gap and i + 1 >= 4 and len(xs) - (i + 1) >= 4:
            best, best_gap = (a, b), g
    if best is None or best_gap < 25:
        return None
    a, b = best
    col1 = [t for t in digs if t["x0"] <= a]
    col2 = [t for t in digs if t["x0"] >= b]
    if len(col1) < 4 or len(col2) < 4:
        return None
    split = (a + b) / 2
    return split, ymin, ymax


def col_tokens(img, sc, x0, x1, y0, y1, xmin=0):
    w, h = img.size
    bx0, by0 = max(0, int(x0 * sc)), max(0, int(y0 * sc))
    bx1, by1 = min(w, int(x1 * sc)), min(h, int(y1 * sc))
    if bx1 <= bx0 or by1 <= by0:
        return []
    crop = img.crop((bx0, by0, bx1, by1))
    cfg = "--psm 6 -c tessedit_char_whitelist=0123456789.,"
    d = pytesseract.image_to_data(crop, config=cfg, output_type=pytesseract.Output.DICT)
    out = []
    for t, x, y, w_, h_ in zip(d["text"], d["left"], d["top"], d["width"], d["height"]):
        t = t.strip()
        if t:
            xp = (x + bx0) / sc
            if xp >= xmin:
                out.append({"text": t, "x0": xp, "y0": (y + by0) / sc,
                            "y1": (y + h_ + by0) / sc})
    return out


def value_at(toks, y, tol=9):
    cand = [t for t in toks if abs((t["y0"] + t["y1"]) / 2 - y) < tol]
    ts = sorted(cand, key=lambda t: t["x0"])
    s = "".join("".join(c for c in t["text"] if c.isdigit()) for t in ts)
    return int(s) if s else None


def row_recovery(row, split, y, col1_band, col2_band, col2_right):
    dv = []
    for t in row["toks"]:
        if abs(t["y0"] - y) < 12:
            nd = sum(c.isdigit() for c in t["text"])
            if 1 <= nd <= 14:
                dv.append(t)
    dv.sort(key=lambda t: t["x0"])
    clean = []
    for i, t in enumerate(dv):
        nxt = dv[i + 1] if i + 1 < len(dv) else None
        if nxt and "|" in nxt["text"] and nxt["x0"] - t["x0"] < 12:
            continue
        clean.append(t)
    s1 = "".join("".join(c for c in t["text"] if c.isdigit())
                 for t in clean if col1_band <= t["x0"] < split and t["x1"] <= split + 15)
    s2 = "".join("".join(c for c in t["text"] if c.isdigit())
                 for t in clean
                 if (t["x0"] >= split or t["x1"] > split + 15) and t["x0"] < col2_right)
    return (int(s1) if s1 else None), (int(s2) if s2 else None)


def extract_page(page):
    toks = tsv_tokens(page)
    rows = logical_rows(toks)
    dtype = page_type(rows)
    ys = [r["y"] for r in rows]
    gaps = [b - a for a, b in zip(ys, ys[1:]) if 5 < b - a < 60]
    pitch = sorted(gaps)[len(gaps) // 2] if gaps else 27.0
    groups = []
    for r in rows:
        if groups and r["y"] - groups[-1][-1]["y"] <= pitch * 0.8:
            groups[-1].append(r)
        else:
            groups.append([r])
    lgroups = []
    for g in groups:
        joined = " ".join(r["text"] for r in g)
        per_row = [find_code(r["text"], dtype) for r in g]
        matched = [(r, c, m) for r, (c, m) in zip(g, per_row) if c]
        if not matched:
            c, m = find_code(joined, dtype)
            if c:
                lgroups.append((g, c, m, None))
        elif len({c for _, c, _ in matched}) > 1:
            for r, c, m in matched:
                lgroups.append((g, c, m, r))
        else:
            c, m = find_code(joined, dtype)
            if c and c != matched[0][1]:
                lgroups.append((g, c, m, None))
            else:
                lgroups.append((g, matched[0][1], matched[0][2], matched[0][0]))
    if not lgroups:
        return None
    ymin = min(g[0]["y"] for g, c, m, r in lgroups) - 5
    ymax = max(g[-1]["y"] for g, c, m, r in lgroups) + 8
    header_txt = " ".join(r["text"] for r in rows if r["y"] < ymin - 10)
    years = [int(y) for y in re.findall(r"\b\d{1,2}/\d{1,2}/(20\d{2})\b", header_txt)]
    recent_last = len(years) >= 2 and years[-1] > years[0]
    bands = column_bands(toks, ymin, ymax)
    if not bands:
        return None
    split, ymin, ymax = bands
    img, sc = render(page)
    lmax = max((t["x1"] for t in toks
                if t["x0"] < split and re.search(r"[A-Za-z]", t["text"])
                and ymin - 8 <= (t["y0"] + t["y1"]) / 2 <= ymax + 12), default=300)
    digs_all = [t for t in toks
                if t["x0"] > 300 and ymin <= (t["y0"] + t["y1"]) / 2 <= ymax
                and re.fullmatch(r"[\d.,' ]+", t["text"])
                and 2 <= sum(c.isdigit() for c in t["text"]) <= 12
                and not re.fullmatch(r"(19|20)\d{2}", t["text"].strip())]
    col1_band = min((t["x0"] for t in digs_all if t["x0"] < split), default=0) - 12
    col2_band = min((t["x0"] for t in digs_all if t["x0"] >= split), default=0) - 12
    col2_right = max((t["x1"] for t in digs_all if t["x0"] >= split), default=1e9) + 20
    crops = {"c1": None, "c2": None}

    def get_crop(key):
        if crops[key] is None:
            if key == "c1":
                crops[key] = col_tokens(img, sc, lmax + 4, split - 3, ymin - 8, ymax + 18,
                                        xmin=col1_band)
            else:
                crops[key] = col_tokens(img, sc, split + 3, page.width - 8, ymin - 8, ymax + 18,
                                        xmin=col2_band)
        return crops[key]
    found = {}
    for g, code, mode, rrow in lgroups:
        if code in found:
            continue
        if rrow is None or not any(
                col1_band <= t["x0"] < col2_right and 1 <= sum(c.isdigit() for c in t["text"]) <= 14
                for t in rrow["toks"]):
            cands = [r for r in g if any(
                col1_band <= t["x0"] < col2_right and 1 <= sum(c.isdigit() for c in t["text"]) <= 14
                for t in r["toks"])]
            rrow = cands[-1] if cands else (rrow or g[-1])
        y = rrow["y"]
        v1, v2 = row_recovery(rrow, split, y, col1_band, col2_band, col2_right)
        has_digits = any(
            col1_band <= t["x0"] < col2_right and 1 <= sum(c.isdigit() for c in t["text"]) <= 14
            for t in rrow["toks"])
        if v1 is None and v2 is None and not has_digits:
            continue
        if (v1 is None and v2 is None) and mode == "prefix":
            v1 = value_at(get_crop("c1"), y + pitch)
            v2 = value_at(get_crop("c2"), y + pitch)
        if v1 is None:
            v1 = value_at(get_crop("c1"), y)
        if v2 is None:
            v2 = value_at(get_crop("c2"), y)
        if v1 is not None or v2 is not None:
            found[code] = [v1, v2]
    return found, split, dtype, pitch, recent_last


def report_anchors(page):
    """Ancres (code, y) d'une page au format 'Reporting annuel'. Sources :
    1) libellés/codes imprimés lus à 150 dpi ; 2) si insuffisant, colonne des
    codes à 800 dpi (chiffres seuls) + page_type pour le préfixe."""
    toks = tsv_tokens(page, res=150)
    rows = logical_rows(toks)
    found = {}
    for r in rows:
        c = find_code(r["text"], "A")[0] or find_code(r["text"], "P")[0] \
            or find_code(r["text"], "R")[0]
        if not c:
            c = printed_code(r["text"])
        if not c or c not in set(DICTS["A"].values()) | set(DICTS["P"].values()) \
                | set(DICTS["R"].values()):
            continue
        found[c] = r["y"]
    dtype = None
    if len(found) < 5:
        dtype = page_type(rows)
        prefix = {"A": "RBA", "P": "RBP", "R": "RCR"}[dtype]
        img, sc = render(page)
        w, h = img.size
        crop = img.crop((int(395 * sc), int(150 * sc),
                         min(w, int(495 * sc)), min(h, int(500 * sc))))
        d = pytesseract.image_to_data(crop, config="--psm 6 -c tessedit_char_whitelist=0123456789",
                                      output_type=pytesseract.Output.DICT)
        for t, x, top, w_, c in zip(d["text"], d["left"], d["top"], d["width"], d["conf"]):
            t = t.strip()
            if not t:
                continue
            try:
                conf = int(c)
            except (TypeError, ValueError):
                continue
            if conf < 30:
                continue
            m = re.fullmatch(r"(\d{4})", t)
            if not m:
                continue
            yc = 150 + (top + 8) / sc
            found[prefix + "_" + m.group(1)] = yc
    if not found:
        return None, None, None
    if dtype is None:
        dtype = max(set(c[:3] for c in found),
                    key=lambda d: sum(1 for c in found if c.startswith(d)))
    if dtype in ("RBA", "RBP", "RCR"):
        prefix, dtype = dtype, {"RBA": "A", "RBP": "P", "RCR": "R"}[dtype]
    else:
        prefix = {"A": "RBA", "P": "RBP", "R": "RCR"}[dtype]
    anchors = [(c, y) for c, y in sorted(found.items(), key=lambda kv: kv[1])
               if c.startswith(prefix)]
    if len(anchors) < 5:
        return None, None, None
    header_txt = " ".join(r["text"] for r in rows if r["y"] < min(y for _, y in anchors))
    years = [int(y) for y in re.findall(r"\b\d{1,2}/\d{1,2}/(20\d{2})\b", header_txt)]
    recent_last = bool(len(years) >= 2 and years[-1] > years[0])
    return anchors, dtype, recent_last


def extract_report_page(page):
    """Extraction pour le format 'Reporting annuel' (codes imprimés) : ancres
    via libellés/codes, split des colonnes par page (strip 800 dpi), puis
    valeurs par strips colonnes (bilan) ou crops tight par ligne (résultat)."""
    anchors, dtype, recent_last = report_anchors(page)
    if not anchors:
        return None
    toks = tsv_tokens(page, res=400)
    rows = logical_rows(toks)
    ymin = min(y for _, y in anchors) - 8
    ymax = max(y for _, y in anchors) + 10
    letter = [t for t in toks
              if t["x0"] < 480 and re.search(r"[A-Za-z]", t["text"])
              and ymin - 5 <= (t["y0"] + t["y1"]) / 2 <= ymax + 15]
    lmax = max((t["x1"] for t in letter), default=0)
    img, sc = render(page)
    w, h = img.size

    def strip_tokens(x0, x1, y0, y1):
        bx0, by0 = max(0, int(x0 * sc)), max(0, int(y0 * sc))
        bx1, by1 = min(w, int(x1 * sc)), min(h, int(y1 * sc))
        if bx1 <= bx0 or by1 <= by0:
            return []
        crop = img.crop((bx0, by0, bx1, by1))
        d = pytesseract.image_to_data(_binarize(crop), lang="fra",
                                      config="--psm 6 -c tessedit_char_whitelist=0123456789",
                                      output_type=pytesseract.Output.DICT)
        out = []
        for t, x, top, w_, c in zip(d["text"], d["left"], d["top"], d["width"], d["conf"]):
            t = t.strip()
            if not t:
                continue
            out.append({"xc": (x + bx0 + w_ / 2) / sc,
                        "yc": y0 + (top + 8) / sc, "conf": int(c or 0), "text": t})
        return out

    split = None
    stoks = strip_tokens(lmax + 6, min(765.0, page.width - 8), ymin - 5, ymax + 15)
    if len(stoks) >= 4:
        xs = sorted(set(t["xc"] for t in stoks))
        best, best_gap = None, 0
        for a, b in zip(xs, xs[1:]):
            g = b - a
            if g > best_gap:
                best, best_gap = (a, b), g
        if best and best_gap >= 15:
            n1 = sum(1 for x in xs if x <= best[0])
            n2 = sum(1 for x in xs if x >= best[1])
            if n1 >= 1 and n2 >= 1:
                split = (best[0] + best[1]) / 2
    if split is None:
        split = 660.0
    refined = {}
    for r in rows:
        if any(t["x0"] > lmax + 10 for t in r["toks"]):
            refined.setdefault(round(r["y"]), r["y"])
    found = {}

    def grab(col, y, tol=9):
        cand = [t for t in col if abs(t["yc"] - y) <= tol]
        if not cand:
            return None
        s = "".join("".join(ch for ch in t["text"] if ch.isdigit()) for t in cand)
        return int(s) if s and len(s) >= 2 else None

    if dtype != "R":
        c1 = strip_tokens(lmax + 6, split - 10, ymin - 5, ymax + 15)
        c2 = strip_tokens(split + 10, min(765.0, page.width - 8), ymin - 5, ymax + 15)
        for code, y in anchors:
            ry = min((yy for yy in refined.values() if abs(yy - y) <= 20),
                     key=lambda yy: abs(yy - y), default=y)
            v1, v2 = grab(c1, ry), grab(c2, ry)
            if v1 is not None or v2 is not None:
                found[code] = [v1, v2]
    else:
        # Compte de résultat 'Reporting annuel' : libellés pâles illisibles, mais
        # codes + chiffres lisibles. Valeurs = 2 colonnes (N-1 ~x490, N ~x583) à
        # droite du code (x~390-412) ; on OCRise une bande fixe par ancrage.
        prior_x, recent_x = 440.0, 665.0
        split_x = 535.0
        for code, y in anchors:
            ry = y
            bx0, by0 = max(0, int(prior_x * sc)), max(0, int((ry - 9) * sc))
            bx1, by1 = min(w, int(recent_x * sc)), min(h, int((ry + 11) * sc))
            crop = img.crop((bx0, by0, bx1, by1))
            d = pytesseract.image_to_data(_binarize(crop),
                config="--psm 6 -c tessedit_char_whitelist=0123456789",
                output_type=pytesseract.Output.DICT)
            ts = []
            for t, x, top, w_, c in zip(d["text"], d["left"], d["top"], d["width"], d["conf"]):
                t = t.strip()
                if not t:
                    continue
                try:
                    conf = int(c)
                except (TypeError, ValueError):
                    continue
                if conf < 20:
                    continue
                yc = ry - 9 + (top + 8) / sc
                if abs(yc - ry) <= 8:
                    ts.append(((x + bx0 + w_ / 2) / sc, t))
            if not ts:
                continue
            s1 = "".join("".join(ch for ch in t if ch.isdigit())
                         for xc, t in ts if xc < split_x)
            s2 = "".join("".join(ch for ch in t if ch.isdigit())
                         for xc, t in ts if xc >= split_x)
            v1 = int(s1) if len(s1) >= 2 else None
            v2 = int(s2) if len(s2) >= 2 else None
            if v1 is not None or v2 is not None:
                found[code] = [v1, v2]
    if not found:
        return None
    if dtype == "R":
        if "RCR_0100" in found:
            recent_last = True
    else:
        tot = found.get("RBA_0150") or found.get("RBP_0170")
        if tot:
            recent_last = bool(tot[1] and (tot[0] or 0) <= tot[1])
    return found, 0, dtype, None, recent_last


def finalize(found, dtype):
    out = {k: [v[0], v[1]] if v else [0, 0] for k, v in found.items()}
    for k in set(DICTS[dtype].values()):
        out.setdefault(k, [0, 0])
    for k in list(out):
        out[k] = [0 if out[k][0] is None else out[k][0],
                  0 if out[k][1] is None else out[k][1]]

    def _near(a, b):
        return abs(a - b) <= max(1, 0.001 * max(abs(a), abs(b)))

    def _ident(dst, comps, sign):
        for i in (0, 1):
            try:
                v = 0
                for c, s in zip(comps, sign):
                    v += s * out[c][i]
            except KeyError:
                continue
            v = abs(v)
            if out[dst][i] == 0 or _near(v, out[dst][i]):
                out[dst][i] = v

    if dtype == "R":
        comps = ["RCR_0010", "RCR_0020", "RCR_0030", "RCR_0040", "RCR_0050",
                 "RCR_0060", "RCR_0070", "RCR_0080", "RCR_0090"]
        if sum(1 for c in comps if c in out) >= 6:
            for i in (0, 1):
                try:
                    v = 0
                    for c, s in zip(comps, [1, -1, 1, 1, -1, 1, 1, 1, -1]):
                        v += s * out[c][i]
                except KeyError:
                    continue
                v = abs(v)
                if not v:
                    continue
                r = out["RCR_0100"][i]
                if r == 0 or _near(v, r) or r > 1.5 * v or v > 1.5 * r:
                    out["RCR_0100"][i] = v
        _ident("RCR_0150", ["RCR_0140", "RCR_0160"], [1, -1])
        _ident("RCR_0170", ["RCR_0180", "RCR_0160"], [1, -1])
        _ident("RCR_0190", ["RCR_0180", "RCR_0200"], [1, -1])
    return out


# Traduction codes COBAC -> labels canoniques du système (col1 = année récente)
INCOME_MAP = {
    "RCR_0010": "Produits d'intérêts",
    "RCR_0020": "Charges d'intérêts",
    "RCR_0100": "Produit net bancaire",
    "RCR_0120": "Charges d'exploitation",
    "RCR_0130": "Amortissements",
    "RCR_0150": "Coût du risque",
    "RCR_0180": "Résultat d'exploitation",
    "RCR_0190": "Impôts",
    "RCR_0200": "Résultat net",
}
BALANCE_MAP = {
    "RBA_0010": "Trésorerie",
    "RBA_0040": "Prêts et avances à la clientèle",
    "RBA_0150": "Total actif",
    "RBP_0030": "Dépôts de la clientèle",
    "RBP_0070": "Provisions",
    "RBP_0090": "Capitaux propres",
    "RBP_0170": "Dette totale",
}


TITLE_MARKERS = [
    "BILAN DESTINE", "COMPTE DE RESULTAT", "RESULTAT DESTINE", "COUT DU RISQUE",
    "HORS BILAN DESTINE", "BILAN PUB", "BILAN_PUB", "RESU PUB", "RESU_PUB",
]


def _statement_pages(pdf, max_scan=60):
    """Pages 1..max_pages plus les pages marquées 'Reporting' (PDF longs type
    rapport annuel). Marquage via OCR rapide 150 dpi sur le texte du titre."""
    n = len(pdf.pages)
    idxs = list(range(min(n, 6)))
    if n > 6:
        for i, page in enumerate(pdf.pages[6:max_scan]):
            img, _ = render(page, 150)
            try:
                txt = pytesseract.image_to_string(img, lang="fra", config="--psm 6")
            except Exception:
                continue
            u = norm(txt)
            if any(norm(m) in u for m in TITLE_MARKERS):
                idxs.append(6 + i)
    return sorted(set(idxs))


def extract_cobac(pdf_path, max_pages=6, min_codes=8):
    """Extrait les états COBAC d'un PDF scanné. Retourne le dict standard
    (income_statement / balance_sheet / cash_flow / metadata) ou None si le
    format COBAC n'est pas reconnaissable (moins de min_codes lignes lues)."""
    income_pages, balance_pages, passif_pages = [], [], []
    totals = {"R": None, "A": None, "P": None}
    with pdfplumber.open(pdf_path) as pdf:
        for i in _statement_pages(pdf):
            page = pdf.pages[i]
            res = None
            try:
                res = extract_page(page)
            except Exception:
                res = None
            if not res:
                try:
                    res = extract_report_page(page)
                except Exception:
                    res = None
            if not res:
                continue
            found, split, dtype, pitch, recent_last = res
            found = finalize(found, dtype)
            if dtype == "R":
                income_pages.append((found, recent_last))
                totals["R"] = found
            elif dtype == "A":
                balance_pages.append((found, recent_last))
                totals["A"] = found
            elif dtype == "P":
                passif_pages.append((found, recent_last))
                totals["P"] = found
            if sum(len(p[0]) for p in income_pages + balance_pages + passif_pages) >= min_codes \
                    and totals["R"] and (totals["A"] or totals["P"]):
                break

    if not income_pages and not balance_pages:
        return None

    def recent(pg, code, recent_last=False):
        return pg[0].get(code, [0, 0])[1 if recent_last else 0]

    income_recent_last = bool(income_pages) and any(rl for _, rl in income_pages)
    balance_recent_last = bool(balance_pages + passif_pages) and any(
        rl for _, rl in balance_pages + passif_pages)

    inc = {}
    for pg in income_pages:
        for code, label in INCOME_MAP.items():
            v = recent(pg, code, income_recent_last)
            if v:
                inc[label] = v
        c4, c5 = recent(pg, "RCR_0040", income_recent_last), \
            recent(pg, "RCR_0050", income_recent_last)
        if c4:
            inc["Commissions nettes"] = c4 - c5
    if "Résultat net" not in inc:
        for pg in passif_pages:
            v = recent(pg, "RBP_0160", balance_recent_last)
            if v:
                inc["Résultat net"] = v
                break
    bal = {}
    for pg in balance_pages + passif_pages:
        for code, label in BALANCE_MAP.items():
            v = recent(pg, code, balance_recent_last)
            if v:
                bal[label] = v
    if not inc and not bal:
        return None

    # Identité du bilan : le total du passif égale le total de l'actif.
    if "Total actif" in bal and "Dette totale" not in bal:
        bal["Dette totale"] = bal["Total actif"]
    if "Dette totale" in bal and "Total actif" not in bal:
        bal["Total actif"] = bal["Dette totale"]

    # Échelle : un total d'actif < 1 Md FCFA est manifestement en millions.
    total = bal.get("Total actif", 0) or bal.get("Dette totale", 0)
    scale = 1e6 if 0 < total < 1e9 else 1.0
    if scale != 1.0:
        inc = {k: v * scale for k, v in inc.items()}
        bal = {k: v * scale for k, v in bal.items()}

    return {
        "income_statement": inc,
        "balance_sheet": bal,
        "cash_flow": {},
        "notes": [],
        "metadata": {
            "source": pdf_path,
            "pages": 0,
            "detected_scale": "millions FCFA" if scale != 1.0 else "FCFA",
            "ocr": True,
            "extractor": "cobac",
            "extracted_at": None,
        },
    }
