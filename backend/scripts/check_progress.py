import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal
from sqlalchemy import text

with SessionLocal() as db:
    total = db.execute(text(
        "select count(*) from market_data where source = :s"
    ).bindparams(s="BFIN")).scalar()
    dates = db.execute(text(
        "select count(distinct date) from market_data where source = :s"
    ).bindparams(s="BFIN")).scalar()
    by_kind = dict(db.execute(text(
        """
        select c.instrument_type, count(distinct md.date)
        from market_data md
        join companies c on c.id = md.company_id
        where md.source = :s and c.instrument_type != 'equity'
        group by c.instrument_type
        """
    ).bindparams(s="BFIN")).all())
print(f"BFIN rows  : {total}")
print(f"dates      : {dates}")
for k, v in sorted(by_kind.items()):
    print(f"  {k}: {v} dates")
print("--- par exchange / instrument_type ---")
for r in db.execute(text(
    "select exchange, instrument_type, count(*) from companies "
    "group by 1, 2 order by 1, 2"
)).all():
    print(f"  {r[0]}  {r[1]}  {r[2]}")
print("--- doublons de symboles BRVM ---")
n = 0
for r in db.execute(text(
    "select symbol, count(*) from companies where exchange = 'BRVM' "
    "group by symbol having count(*) > 1 order by 2 desc limit 15"
)).all():
    print(f"  {r[0]}  x{r[1]}")
    n += 1
if not n:
    print("  aucun")
print("--- dernières dates ---")
for r in db.execute(text(
    "select date, count(*) n from market_data where source = :s "
    "group by date order by date desc limit 12"
).bindparams(s="BFIN")).all():
    print(f"  {r[0]}  {r[1]} lignes")