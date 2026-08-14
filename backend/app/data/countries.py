"""Pays de cotation des instruments financiers.

La BRVM (Bourse Régionale des Valeurs Mobilières) couvre les pays de
l'UEMOA. Ce mapping rattache chaque instrument à son pays, préparant
l'intégration future d'autres bourses africaines (chaque entreprise
porte alors son pays de cotation).
"""

COUNTRY_BY_SYMBOL = {
    # ---- Actions BRVM (47) ----
    "ABJC": "Côte d'Ivoire",
    "BICB": "Bénin",
    "BICC": "Côte d'Ivoire",
    "BNBC": "Côte d'Ivoire",
    "BOAB": "Bénin",
    "BOABF": "Burkina Faso",
    "BOAC": "Côte d'Ivoire",
    "BOAM": "Mali",
    "BOAN": "Niger",
    "BOAS": "Sénégal",
    "CABC": "Côte d'Ivoire",
    "CBIBF": "Burkina Faso",
    "CFAC": "Côte d'Ivoire",
    "CIEC": "Côte d'Ivoire",
    "ECOC": "Côte d'Ivoire",
    "ETIT": "Togo",
    "FTSC": "Côte d'Ivoire",
    "LNBB": "Bénin",
    "NEIC": "Côte d'Ivoire",
    "NSBC": "Côte d'Ivoire",
    "NTLC": "Côte d'Ivoire",
    "ONTBF": "Burkina Faso",
    "ORAC": "Côte d'Ivoire",
    "ORGT": "Togo",
    "PALC": "Côte d'Ivoire",
    "PRSC": "Côte d'Ivoire",
    "SAFC": "Côte d'Ivoire",
    "SCRC": "Côte d'Ivoire",
    "SDCC": "Côte d'Ivoire",
    "SDSC": "Côte d'Ivoire",
    "SEMC": "Côte d'Ivoire",
    "SGBC": "Côte d'Ivoire",
    "SHEC": "Côte d'Ivoire",
    "SIBC": "Côte d'Ivoire",
    "SICC": "Côte d'Ivoire",
    "SIVC": "Côte d'Ivoire",
    "SLBC": "Côte d'Ivoire",
    "SMBC": "Côte d'Ivoire",
    "SNTS": "Sénégal",
    "SOGC": "Côte d'Ivoire",
    "SPHC": "Côte d'Ivoire",
    "STAC": "Côte d'Ivoire",
    "STBC": "Côte d'Ivoire",
    "TTLC": "Côte d'Ivoire",
    "TTLS": "Sénégal",
    "UNLC": "Côte d'Ivoire",
    "UNXC": "Côte d'Ivoire",
    # ---- Obligations ----
    "EPA-24": "Côte d'Ivoire",
    "ECCI-24": "Côte d'Ivoire",
    "CTEL-23": "Côte d'Ivoire",
    "CIE-23": "Côte d'Ivoire",
    "PALM-23": "Côte d'Ivoire",
    "SIB-23": "Côte d'Ivoire",
    "BOACI-23": "Côte d'Ivoire",
    "BHS-23": "Sénégal",
    "ONATEL-23": "Burkina Faso",
    "SEN-24": "Sénégal",
    "MALI-23": "Mali",
    "TOGO-24": "Togo",
    "NESTLE-24": "Côte d'Ivoire",
    "UNIWAX-24": "Côte d'Ivoire",
    # ---- FCP (sociétés de gestion régionales) ----
    "FAO": "UEMOA",
    "FAA": "UEMOA",
    "FNC": "UEMOA",
    "FNP": "UEMOA",
    "FNR": "UEMOA",
    "FUR": "UEMOA",
    "FCO": "UEMOA",
    "FCA": "UEMOA",
    "FBJ": "UEMOA",
    "FSS": "UEMOA",
    "FEC": "UEMOA",
    "FBR": "UEMOA",
}

DEFAULT_COUNTRY = "Côte d'Ivoire"

# Bourse de cotation selon le pays (BRVM aujourd'hui ; autres bourses
# africaines prévues : NGX, GSE, NSE, Casablanca, EGX, JSE...).
EXCHANGE_BY_COUNTRY = {
    "Côte d'Ivoire": "BRVM",
    "Bénin": "BRVM",
    "Burkina Faso": "BRVM",
    "Mali": "BRVM",
    "Niger": "BRVM",
    "Sénégal": "BRVM",
    "Togo": "BRVM",
    "Guinée-Bissau": "BRVM",
    "UEMOA": "BRVM",
    "Nigeria": "NGX",
    "Ghana": "GSE",
    "Kenya": "NSE",
    "Maroc": "Casablanca",
    "Égypte": "EGX",
    "Afrique du Sud": "JSE",
}

DEFAULT_EXCHANGE = "BRVM"
