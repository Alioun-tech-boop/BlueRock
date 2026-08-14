"""Catalogue statique des sociétés cotées à la Nigerian Exchange (NGX).

Ce catalogue couvre les actions ordinaires du Main Board et du Growth Board
(ETFs/ETPs et obligations exclus). Il sert de socle hors-ligne : à chaque
démarrage l'applique fait un upsert idempotent (aucune donnée écrasée).

Lorsqu'une clé NGN Market API est configurée (settings.NGN_MARKET_API_KEY),
POST /api/seed/ngx-sync enrichit/maj ce catalogue depuis la liste officielle
(ticker, nom, sous-secteur, capitalisation, volume, logo) et alimente les prix
du jour. Les sociétés retirées de la liste officielle ne sont jamais supprimées
en base (historique conservé).
"""
from ..models.company import Sector

# (symbol, name, sub_sector NGX, secteur BlueRock)
# sub_sector suit la classification NGX (ex. "Banks", "Food & Beverages").
NGX_COMPANIES: list[tuple[str, str, str, Sector]] = [
    # ---- Financial Services — Banks (BANQUE) ----
    ("ACCESSCORP", "Access Holdings Plc", "Banks", Sector.BANQUE),
    ("ETI", "Ecobank Transnational Incorporated", "Banks", Sector.BANQUE),
    ("FBNH", "FBN Holdings Plc", "Banks", Sector.BANQUE),
    ("FCMB", "FCMB Group Plc", "Banks", Sector.BANQUE),
    ("FIDELITYBK", "Fidelity Bank Plc", "Banks", Sector.BANQUE),
    ("GTCO", "Guaranty Trust Holding Company Plc", "Banks", Sector.BANQUE),
    ("STANBIC", "Stanbic IBTC Holdings Plc", "Banks", Sector.BANQUE),
    ("STERLINGNG", "Sterling Financial Holdings Company Plc", "Banks", Sector.BANQUE),
    ("UBA", "United Bank for Africa Plc", "Banks", Sector.BANQUE),
    ("UNITYBNK", "Unity Bank Plc", "Banks", Sector.BANQUE),
    ("WEMABANK", "Wema Bank Plc", "Banks", Sector.BANQUE),
    ("ZENITHBANK", "Zenith Bank Plc", "Banks", Sector.BANQUE),
    # ---- Financial Services — Insurance (ASSURANCE) ----
    ("AIICO", "AIICO Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("CORNERST", "Cornerstone Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("CUSTODIAN", "Custodian Investment Plc", "Insurance", Sector.ASSURANCE),
    ("GUINEAINS", "Guinea Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("INTENEGINS", "International Energy Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("LASACO", "Lasaco Assurance Plc", "Insurance", Sector.ASSURANCE),
    ("LINKASSURE", "Linkage Assurance Plc", "Insurance", Sector.ASSURANCE),
    ("MANSARD", "AXA Mansard Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("NEM", "NEM Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("NIGERINS", "Niger Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("PRESTIGE", "Prestige Assurance Plc", "Insurance", Sector.ASSURANCE),
    ("REGALINS", "Regal Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("ROYALEX", "Royal Exchange Plc", "Insurance", Sector.ASSURANCE),
    ("SOVRENINS", "Sovereign Trust Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("STACO", "Staco Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("SUNUASSUR", "Sunu Assurances Nigeria Plc", "Insurance", Sector.ASSURANCE),
    ("UNIVINSURE", "Universal Insurance Plc", "Insurance", Sector.ASSURANCE),
    ("VERITASKAP", "Veritas Kapital Assurance Plc", "Insurance", Sector.ASSURANCE),
    ("WAPIC", "Wapic Insurance Plc", "Insurance", Sector.ASSURANCE),
    # ---- Financial Services — Autres (SERVICES_FINANCIERS) ----
    ("ABBEYBDS", "Abbey Mortgage Bank Plc", "Other Financial Institutions", Sector.SERVICES_FINANCIERS),
    ("DEAPCAP", "Deap Capital Management & Trust Plc", "Other Financial Institutions", Sector.SERVICES_FINANCIERS),
    ("INFINITY", "Infinity Trust Mortgage Bank Plc", "Other Financial Institutions", Sector.SERVICES_FINANCIERS),
    ("NPFMCRFBK", "NPF Microfinance Bank Plc", "Other Financial Institutions", Sector.SERVICES_FINANCIERS),
    ("UCAP", "United Capital Plc", "Other Financial Institutions", Sector.SERVICES_FINANCIERS),
    # ---- Consumer Goods — Food & Beverages (CONSOMMATION_BASE) ----
    ("BUAFOODS", "BUA Foods Plc", "Food & Beverages", Sector.CONSOMMATION_BASE),
    ("CADBURY", "Cadbury Nigeria Plc", "Food & Beverages", Sector.CONSOMMATION_BASE),
    ("CHAMPION", "Champion Breweries Plc", "Brewers", Sector.CONSOMMATION_BASE),
    ("DANGSUGAR", "Dangote Sugar Refinery Plc", "Sugar", Sector.CONSOMMATION_BASE),
    ("FLOURMILL", "Flour Mills of Nigeria Plc", "Food Products", Sector.CONSOMMATION_BASE),
    ("GUINNESS", "Guinness Nigeria Plc", "Brewers", Sector.CONSOMMATION_BASE),
    ("INTBREW", "International Breweries Plc", "Brewers", Sector.CONSOMMATION_BASE),
    ("NASCON", "NASCON Allied Industries Plc", "Food Products", Sector.CONSOMMATION_BASE),
    ("NB", "Nigerian Breweries Plc", "Brewers", Sector.CONSOMMATION_BASE),
    ("NESTLE", "Nestlé Nigeria Plc", "Food Products", Sector.CONSOMMATION_BASE),
    ("NNFM", "Northern Nigeria Flour Mills Plc", "Food Products", Sector.CONSOMMATION_BASE),
    ("TANTALIZER", "Tantalizers Plc", "Restaurants", Sector.CONSOMMATION_DISCRETIONNAIRE),
    # ---- Consumer Goods — Home & Personal Care ----
    ("PZ", "PZ Cussons Nigeria Plc", "Home & Personal Care", Sector.CONSOMMATION_DISCRETIONNAIRE),
    ("UNILEVER", "Unilever Nigeria Plc", "Home & Personal Care", Sector.CONSOMMATION_DISCRETIONNAIRE),
    ("VITAFOAM", "Vitafoam Nigeria Plc", "Household Goods", Sector.CONSOMMATION_DISCRETIONNAIRE),
    # ---- Industrial Goods (MATERIAUX / INDUSTRIELS) ----
    ("BUACEMENT", "BUA Cement Plc", "Building Materials", Sector.MATERIAUX),
    ("DANGCEM", "Dangote Cement Plc", "Building Materials", Sector.MATERIAUX),
    ("WAPCO", "Lafarge Africa Plc", "Building Materials", Sector.MATERIAUX),
    ("CCNN", "Cement Company of Northern Nigeria Plc", "Building Materials", Sector.MATERIAUX),
    ("CUTIX", "Cutix Plc", "Manufacturing", Sector.INDUSTRIELS),
    ("MEYER", "Meyer Plc", "Manufacturing", Sector.INDUSTRIELS),
    ("AMASSB", "B.O.C Gases Plc", "Manufacturing", Sector.INDUSTRIELS),
    ("CAP", "Chemical and Allied Products Plc", "Manufacturing", Sector.INDUSTRIELS),
    # ---- Oil & Gas (ENERGIE) ----
    ("ARDOVA", "Ardova Plc", "Oil & Gas", Sector.ENERGIE),
    ("CONOIL", "Conoil Plc", "Oil & Gas", Sector.ENERGIE),
    ("ETERNA", "Eterna Plc", "Oil & Gas", Sector.ENERGIE),
    ("JOHNHOLT", "John Holt Plc", "Oil & Gas", Sector.ENERGIE),
    ("MRS", "MRS Oil Nigeria Plc", "Oil & Gas", Sector.ENERGIE),
    ("OANDO", "Oando Plc", "Oil & Gas", Sector.ENERGIE),
    ("SEPLAT", "Seplat Energy Plc", "Oil & Gas", Sector.ENERGIE),
    ("TOTAL", "TotalEnergies Marketing Nigeria Plc", "Oil & Gas", Sector.ENERGIE),
    # ---- ICT (TELECOMS / AUTRE) ----
    ("AIRTELAFRI", "Airtel Africa Plc", "Telecommunication", Sector.TELECOMS),
    ("MTNN", "MTN Nigeria Communications Plc", "Telecommunication", Sector.TELECOMS),
    ("DAARCOMM", "Daar Communications Plc", "Media", Sector.TELECOMS),
    ("CHAMS", "Chams Holding Company Plc", "Software & IT Services", Sector.AUTRE),
    ("COURTVILLE", "Courtville Business Solutions Plc", "Software & IT Services", Sector.AUTRE),
    ("CWG", "CWG Plc", "Software & IT Services", Sector.AUTRE),
    ("GSPEC", "GSPEC Plc", "Software & IT Services", Sector.AUTRE),
    ("MULTIVERSE", "Multiverse Plc", "Software & IT Services", Sector.AUTRE),
    ("NCR", "NCR Nigeria Plc", "Software & IT Services", Sector.AUTRE),
    ("OMATEK", "Omatek Ventures Plc", "Software & IT Services", Sector.AUTRE),
    ("TRIPPLEG", "Tripple Gee and Company Plc", "Software & IT Services", Sector.AUTRE),
    ("TIP", "The Initiates Plc", "Software & IT Services", Sector.AUTRE),
    # ---- Agriculture (AGROALIMENTAIRE) ----
    ("ELLAHLAKES", "Ellah Lakes Plc", "Agriculture", Sector.AGROALIMENTAIRE),
    ("FTNCOCOA", "FTN Cocoa Processors Plc", "Agriculture", Sector.AGROALIMENTAIRE),
    ("LIVESTOCK", "Livestock Feeds Plc", "Agriculture", Sector.AGROALIMENTAIRE),
    ("OKOMUOIL", "Okomu Oil Palm Plc", "Agriculture", Sector.AGROALIMENTAIRE),
    ("PRESCO", "Presco Plc", "Agriculture", Sector.AGROALIMENTAIRE),
    ("PURITY", "Purity Plc", "Agriculture", Sector.AGROALIMENTAIRE),
    # ---- Healthcare (AUTRE) ----
    ("FIDSON", "Fidson Healthcare Plc", "Pharmaceuticals", Sector.AUTRE),
    ("MAYBAKER", "May & Baker Nigeria Plc", "Pharmaceuticals", Sector.AUTRE),
    ("MORISON", "Morison Industries Plc", "Pharmaceuticals", Sector.AUTRE),
    ("NEIMETH", "Neimeth International Pharmaceuticals Plc", "Pharmaceuticals", Sector.AUTRE),
    # ---- Conglomerates (HOLDING) ----
    ("TRANSCORP", "Transnational Corporation of Nigeria Plc", "Conglomerates", Sector.HOLDING),
    ("UACN", "UAC of Nigeria Plc", "Conglomerates", Sector.HOLDING),
    ("SCOA", "SCOA Nigeria Plc", "Conglomerates", Sector.HOLDING),
    ("CHELLARAM", "Chellarams Plc", "Conglomerates", Sector.HOLDING),
    # ---- Services (TRANSPORT / DISTRIBUTION / AUTRE) ----
    ("CAVERTON", "Cavertons Plc", "Aviation", Sector.TRANSPORT),
    ("NAHCO", "Nigerian Aviation Handling Company Plc", "Aviation", Sector.TRANSPORT),
    ("REDSTAREX", "Red Star Express Plc", "Logistics", Sector.DISTRIBUTION),
    ("IKEJAHOTEL", "Ikeja Hotel Plc", "Hospitality", Sector.AUTRE),
    ("TRANSCOHOT", "Transcorp Hotels Plc", "Hospitality", Sector.AUTRE),
    ("TOURIST", "Tourist Company of Nigeria Plc", "Hospitality", Sector.AUTRE),
    # ---- Real Estate (IMMOBILIER) ----
    ("UPDC", "UPDC Plc", "Real Estate", Sector.IMMOBILIER),
    ("SFSREIT", "SFS Real Estate Investment Trust", "Real Estate", Sector.IMMOBILIER),
    ("UPDCREIT", "UPDC Real Estate Investment Trust", "Real Estate", Sector.IMMOBILIER),
    # ---- Utilities (SERVICES_PUBLICS) ----
    ("TRANSPOWER", "Transcorp Power Plc", "Electricity", Sector.SERVICES_PUBLICS),
    # ---- Publishing / Divers (AUTRE) ----
    ("ACADEMY", "Academy Press Plc", "Publishing", Sector.AUTRE),
    ("LEARNAFRCA", "Learn Africa Plc", "Publishing", Sector.AUTRE),
]

NGX_COUNTRY = "Nigeria"
NGX_CURRENCY = "NGN"
NGX_EXCHANGE = "NGX"

NGX_SYMBOLS: set[str] = {sym for sym, _, _, _ in NGX_COMPANIES}


def company_dict(symbol: str) -> dict | None:
    """Détail catalogue d'un symbole NGX (None si inconnu)."""
    for sym, name, sub_sector, sector in NGX_COMPANIES:
        if sym == symbol:
            return {
                "symbol": sym,
                "name": name,
                "sub_sector": sub_sector,
                "sector": sector,
            }
    return None
