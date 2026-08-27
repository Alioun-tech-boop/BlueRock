"""Seed 20 posts ultra-professionnels dans la communauté Bluerock."""
import sys
from pathlib import Path

# Ensure backend imports work
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.database import SessionLocal
from app.models.community import CommunityGroup, CommunityUser, CommunityPost, CommunityMember
from app.models.user import User
from sqlalchemy import text

POSTS = [
    {
        "title": "BRVM : Sonatel (SNTS) publie un RN 2024 en hausse de 9,2% — cap sur la 5G",
        "symbol": "SNTS",
        "sentiment": "bullish",
        "content": "Sonatel confirme sa résilience : chiffre d'affaires +7,8% à 1 654 Md FCFA, marge EBITDA à 44,3%. Le déploiement 5G au Sénégal et au Mali porte la data (+18% YoY). Dividende proposé : 1 650 FCFA/action (rendement ~7,1% au cours actuel). Notre valorisation DCF ressort à 18 900 FCFA (potentiel +12%). Risque principal : pression réglementaire sur les tarifs data. Nous restons acheteurs avec un stop sous 15 800 FCFA.\n\nSources : états financiers audités 2024, conférence analystes du 20/08/2025.",
    },
    {
        "title": "SIB (SIBC) : résultats semestriels S1 2025 solides — PNB +11% et coût du risque maîtrisé",
        "symbol": "SIBC",
        "sentiment": "bullish",
        "content": "La Société Ivoirienne de Banque délivre un S1 au-dessus du consensus : PNB 58,2 Md FCFA (+11%), RBE +14%, coût du risque à 0,82% (vs 1,05% en 2024). Ratio CET1 à 13,1% (+40 bps). La dynamique crédit aux entreprises (+9%) compense la normalisation des marges. PER 2025e 6,8x vs moyenne sectorielle 8,2x. Nous relevons notre objectif à 5 450 FCFA.",
    },
    {
        "title": "NSIA Banque (NSBC) : l'intégration Diamond Bank porte ses fruits — synergies confirmées",
        "symbol": "NSBC",
        "sentiment": "bullish",
        "content": "NSIA Banque affiche un RN S1 2025 de 18,7 Md FCFA (+22% YoY) grâce à la montée en puissance de la banque de détail et aux synergies IT. Le ROE annualisé atteint 18,4% (objectif 17% dépassé). Le titre reste décoté (P/B 0,89x) malgré une génération de capital solide. Catalyseur : dividende exceptionnel possible au T4 après cession d'actifs non stratégiques.",
    },
    {
        "title": "Onatel Burkina (ONTBF) : dividende stable malgré un ARPU sous pression",
        "symbol": "ONTBF",
        "sentiment": "neutral",
        "content": "Chiffre d'affaires S1 2025 quasi stable (-0,8%) à 82,3 Md FCFA. La voix recule (-4%) mais la data mobile compense (+11%). EBITDA margin à 52,1% (-120 bps) sous l'effet des coûts énergétiques. Dividende maintenu à 380 FCFA (rendement 8,2%) grâce à un FCF solide. Valorisation : 4 650 FCFA. Neutre en attendant le redressement de l'ARPU au S2.",
    },
    {
        "title": "ECOBANK CI (ECOC) : forte reprise du crédit PME — attention au provisionnement",
        "symbol": "ECOC",
        "sentiment": "neutral",
        "content": "ECOC surprend avec un encours crédits +13% YoY, tiré par les PME ivoiriennes. PNB +9% mais provisions en hausse (+18%) sur deux dossiers corporate. Le management guide un coût du risque 2025e à 1,1%-1,3%. Nous maintenons Neutre (objectif 4 200 FCFA) en attendant la publication du S1 détaillé début septembre.",
    },
    {
        "title": "BOA Burkina (BOABF) : prudence — RONE sous 14% et liquidité faible",
        "symbol": "BOABF",
        "sentiment": "bearish",
        "content": "Résultat net S1 2025 en repli de -6% à 7,9 Md FCFA. La compression de la marge nette d'intérêt (-35 bps) pèse plus que la baisse du coût du risque. Le titre traite à PER 9,1x, prime injustifiée vs BOA CI. Nous restons vendeurs avec cible 3 800 FCFA. À éviter avant clarification de la politique de distribution.",
    },
    {
        "title": "Palme CI (PALC) : cours du CPO à 1 180 $/t — super-cycle confirmé jusqu'en 2026",
        "symbol": "PALC",
        "sentiment": "bullish",
        "content": "Le CPO reste ferme grâce à la demande indienne et au déficit en Indonésie. PALC devrait afficher un EBITDA 2025e en hausse de 28% à 31 Md FCFA. FCF yield >12% au cours actuel. Risque ESG maîtrisé (RSPO 92% de la production). Objectif relevé à 1 480 FCFA (+18%). Idéal pour diversification matières premières au sein d'un PEA BRVM.",
    },
    {
        "title": "Sucrivoire (SCR C) : redressement opérationnel — seuil de rentabilité enfin franchi",
        "symbol": "SCRC",
        "sentiment": "bullish",
        "content": "Après 3 années difficiles, Sucrivoire renoue avec un RN positif au S1 2025 (+1,2 Md FCFA vs -2,4 Md en S1 2024). Rendements agronomiques +14% et prix administré du sucre +8%. La dette nette recule de 22%. Potentiel spéculatif mais momentum réel — objectif 780 FCFA. Stop loss 520 FCFA conseillé.",
    },
    {
        "title": "TotalEnergies CI (TTLC) : distribution et mobilité électrique — cap stratégique 2025-2030",
        "symbol": "TTLC",
        "sentiment": "bullish",
        "content": "TTLC dévoile son plan CAPEX 75 Md FCFA sur 5 ans : 40 stations-service modernisées, réseau de recharge rapide sur l'axe Abidjan-Yamoussoukro. Marge de distribution sécurisée (prix administrés). Dividende 2024 : 215 FCFA (rendement 9,4%). Défensif et rendement — à conserver en fonds de portefeuille.",
    },
    {
        "title": "Coris Bank (CBIBF) : expansion UEMOA maîtrisée — RN +19% et ROE 22%",
        "symbol": "CBIBF",
        "sentiment": "bullish",
        "content": "Coris confirme son statut de champion régional : PNB S1 2025 +16%, RN +19% à 24,3 Md FCFA, ROE 22,1%. Ouverture de 8 agences au Sénégal et au Togo sans dégradation du ratio d'exploitation (42%). Prime méritée (P/B 1,6x) vs secteur 1,1x. Objectif 11 200 FCFA.",
    },
    {
        "title": "BICI CI (BICC) : BNP Paribas cède — quel impact pour les minoritaires ?",
        "symbol": "BICC",
        "sentiment": "neutral",
        "content": "La cession de la participation BNP (59,1%) à un consortium ouest-africain est en due diligence. Le prix évoqué (5 200 FCFA/action) offre un plancher. Opérationnellement, S1 solide (RN +8%). Nous passons à Neutre en attendant le SPA et l'offre publique potentielle. Les minoritaires doivent conserver leurs titres d'ici là.",
    },
    {
        "title": "Vivo Energy CI (SHEC) : volumes carburants +7% — résilience malgré la volatilité pétrole",
        "symbol": "SHEC",
        "sentiment": "neutral",
        "content": "SHEC bénéficie de la reprise du trafic et de la montée en gamme des lubrifiants (+12%). Marge brute stable à 18,4%. Le titre reste corrélé au Brent — couverture conseillée. Objectif 1 050 FCFA (rendement dividende 6,8%).",
    },
    {
        "title": "BOA CI (BOAC) : référence bancaire — PER 7,1x et dividende 8,3%",
        "symbol": "BOAC",
        "sentiment": "bullish",
        "content": "BOA CI reste notre top pick bancaire : croissance crédits +10%, coût du risque 0,75%, ROE 21%. La digitalisation (38% des transactions via mobile) dope l'efficacité. Cours 4 850 FCFA, objectif 5 800 FCFA. Rendement total attendu 2025-26 : ~22% dividendes inclus.",
    },
    {
        "title": "Unilever CI (UNLC) : retournement marges — EBE x2,1 au S1 2025",
        "symbol": "UNLC",
        "sentiment": "bullish",
        "content": "UNLC surprend : CA +9% et EBE doublé grâce à la rationalisation SKU et au pricing power sur les savons. La dette nette devient légèrement positive (trésorerie excédentaire). Le titre, longtemps délaissé, offre un potentiel de re-rating. Objectif 8 900 FCFA (+25%).",
    },
    {
        "title": "Nestlé CI (NTLC) : inflation intrants absorbée — pricing et mix premium",
        "symbol": "NTLC",
        "sentiment": "bullish",
        "content": "Malgré cacao à 4 800 FCFA/kg, NTLC maintient sa marge brute à 38,2% via hausses tarifaires ciblées (+6%) et montée en gamme (Nescafé Gold +22%). RN S1 2025 +11% à 9,8 Md FCFA. Défensive de qualité — à conserver, objectif 14 200 FCFA.",
    },
    {
        "title": "SODE CI (SDCC) : contrat DSP Abidjan — visibilité 12 ans et FCF prévisible",
        "symbol": "SDCC",
        "sentiment": "bullish",
        "content": "Le renouvellement de la DSP eau potable sécurise ~85% du CA jusqu'en 2037. Investissements réseau 45 Md FCFA financés à 70% par dette concessionnelle (3,5%). Dividende 315 FCFA stable, rendement 6,1%. Idéal profil rendement défensif pour allocation retraite.",
    },
    {
        "title": "CIE (CIEC) : pertes techniques en baisse — plan smart grid porte ses fruits",
        "symbol": "CIEC",
        "sentiment": "neutral",
        "content": "Pertes réseau ramenées de 21,3% à 19,1% grâce aux compteurs intelligents. EBITDA S1 +5% mais créances État en hausse (87 jours de CA). Le titre reste dépendant du règlement du secteur. Neutre, objectif 1 850 FCFA.",
    },
    {
        "title": "BRVM Composite : franchissement des 265 points — flux étrangers de retour",
        "symbol": "BRVM",
        "sentiment": "bullish",
        "content": "Le BRVM Composite gagne +9,4% YTD, surperformant le MSCI FM. Flux nets étrangers +18 Md FCFA en août (vs -4 Md en 2024). Moteurs : résultats bancaires, CPO et télécoms. Notre cible fin 2025 : 278 pts (+5%). Surpondérer banques et agro-industrie, sous-pondérer services cycliques.",
    },
    {
        "title": "Gestion de portefeuille : notre allocation modèle 60/30/10 pour un profil équilibré",
        "symbol": "BRVM",
        "sentiment": "neutral",
        "content": "Modèle BlueRock — 60% actions BRVM (SNTS 15%, BOAC 12%, PALC 10%, SIBC 8%, BOABF 5%, diversifié 10%), 30% obligations souveraines UEMOA 5,5%-6,2%, 10% cash. Volatilité cible 9%, rendement attendu 13,5% net. Rééquilibrage trimestriel et stop global -12% max drawdown.",
    },
    {
        "title": "Risques à surveiller : Cedi, pétrole et saison des pluies — guide de couverture",
        "symbol": "BRVM",
        "sentiment": "bearish",
        "content": "Trois risques sous-estimés : (1) dépréciation du Cedi ghanéen impactant ECOBANK, (2) Brent >85$ comprimant marges distribution, (3) pluies abondantes affectant logistique cacao/palme. Couvertures conseillées : options CPO, diversification devises, et cash tactique 10-15% d'ici octobre.",
    },
]

def ensure_bluerock(db):
    g = db.query(CommunityGroup).filter(CommunityGroup.slug == "bluerock").first()
    if g:
        print(f"Groupe Bluerock trouvé : id={g.id} slug={g.slug}")
        return g
    # Besoin d'un creator_id : prend premier CommunityUser ou premier User
    cu = db.query(CommunityUser).first()
    if not cu:
        u = db.query(User).first()
        if not u:
            raise RuntimeError("Aucun User trouvé — créez un user admin d'abord")
        # crée un CommunityUser admin
        handle = "bluerock_admin"
        i=2
        while db.query(CommunityUser).filter(CommunityUser.handle==handle).first():
            handle=f"bluerock_admin_{i}"; i+=1
        cu = CommunityUser(user_id=u.id, handle=handle, display_name=u.name or "Bluerock Admin", is_pro=True, verified=True)
        db.add(cu); db.flush()
        print(f"CommunityUser créé id={cu.id}")
    g = CommunityGroup(
        name="Bluerock Community",
        slug="bluerock",
        description="Communauté officielle BlueRock — analyses BRVM, idées d'investissement et éducation financière. Animée par l'équipe de recherche.",
        category="general",
        visibility="public",
        status="active",
        rules="Bienveillance, analyses sourcées, pas de conseil personnalisé sans KYC.",
        banner="",
        creator_id=cu.id,
        is_paid=False,
        price_xof=0,
    )
    db.add(g); db.commit(); db.refresh(g)
    print(f"Groupe Bluerock créé id={g.id}")
    # ajoute creator comme membre
    existing = db.query(CommunityMember).filter(CommunityMember.community_id==g.id, CommunityMember.user_id==cu.id).first()
    if not existing:
        db.add(CommunityMember(community_id=g.id, user_id=cu.id, role="creator", status="active"))
        db.commit()
    return g

def ensure_author(db, group):
    # Auteur principal : le créateur du groupe, sinon premier pro
    cu = db.query(CommunityUser).filter(CommunityUser.id == group.creator_id).first()
    if cu:
        if not cu.is_pro:
            cu.is_pro=True; cu.verified=True; db.commit()
        return cu
    cu = db.query(CommunityUser).filter(CommunityUser.is_pro==True).first()
    if cu:
        return cu
    cu = db.query(CommunityUser).first()
    if cu:
        cu.is_pro=True; cu.verified=True; db.commit()
        return cu
    raise RuntimeError("Aucun CommunityUser disponible pour auteur")

def main():
    db = SessionLocal()
    try:
        group = ensure_bluerock(db)
        author = ensure_author(db, group)
        print(f"Auteur : {author.display_name} id={author.id} is_pro={author.is_pro}")

        # Nettoie doublons éventuels (évite de recréer 20 fois)
        existing_titles = {t[0] for t in db.query(CommunityPost.title).filter(CommunityPost.group_id==group.id).all()}
        created=0
        for p in POSTS:
            if p["title"] in existing_titles:
                print(f"Skip (existe) : {p['title'][:60]}")
                continue
            post = CommunityPost(
                author_id=author.id,
                group_id=group.id,
                symbol=p["symbol"],
                sentiment=p["sentiment"],
                title=p["title"],
                content=p["content"],
                is_editor_pick=False,
            )
            db.add(post)
            created+=1
        db.commit()
        print(f"[OK] {created} posts crees / {len(POSTS)} demandes dans groupe bluerock id={group.id}")

        # Vérif : compte total
        total = db.query(CommunityPost).filter(CommunityPost.group_id==group.id).count()
        print(f"Total posts bluerock désormais : {total}")

        # Vérif fil forYou : doit inclure bluerock (logique community.py 658)
        # Affiche 3 posts pour test
        sample = db.query(CommunityPost).filter(CommunityPost.group_id==group.id).order_by(CommunityPost.id.desc()).limit(3).all()
        for s in sample:
            print(f" - {s.id} | {s.symbol} | {s.title[:70]}")

    finally:
        db.close()

if __name__ == "__main__":
    main()
