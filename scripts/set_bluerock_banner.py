import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.database import SessionLocal
from app.models.community import CommunityGroup

# Image professionnelle BRVM / finance Afrique - bannière haute résolution
BANNER_URL = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1600&q=80"

db = SessionLocal()
try:
    g = db.query(CommunityGroup).filter(CommunityGroup.slug=="bluerock").first()
    if not g:
        print("bluerock not found")
        sys.exit(1)
    g.banner = BANNER_URL
    db.commit()
    print(f"[OK] Bluerock banner updated id={g.id} banner={BANNER_URL[:80]}")
    print(f"banner_url will be: {BANNER_URL}")
finally:
    db.close()
