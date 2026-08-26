from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from .config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=settings.SQL_POOL_SIZE,
    max_overflow=settings.SQL_MAX_OVERFLOW,
    pool_recycle=settings.SQL_POOL_RECYCLE,
    pool_pre_ping=True,
)

# Réplica lecture (optionnel). Même configuration de pool ; utilisé
# exclusivement par les dépendances de lecture (get_reader_db).
# Si l'URL du réplica est identique au primaire, on réutilise le même engine
# pour éviter de doubler le pool (40 connexions > limite Supabase 15).
reader_engine = None
if settings.DATABASE_READER_URL and settings.DATABASE_READER_URL != settings.DATABASE_URL:
    reader_engine = create_engine(
        settings.DATABASE_READER_URL,
        pool_size=settings.SQL_POOL_SIZE,
        max_overflow=settings.SQL_MAX_OVERFLOW,
        pool_recycle=settings.SQL_POOL_RECYCLE,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
SessionLocalReader = sessionmaker(autocommit=False, autoflush=False, bind=reader_engine) if reader_engine else None
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_reader_db():
    """Dépendance de lecture : utilise le réplica si configuré, sinon le
    primaire. Les endpoints GET chauds l'utilisent pour décharger le
    primaire. Ne doit jamais être utilisé pour une écriture."""
    if SessionLocalReader is not None:
        db = SessionLocalReader()
    else:
        db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
    _ensure_community_indexes()
    _ensure_order_columns()
    _ensure_community_post_seen()


def _ensure_community_indexes():
    """Crée les index de performance manquants (idempotent). create_all() ne
    modifie pas les tables existantes, donc on émet du DDL IF NOT EXISTS au
    démarrage pour accélérer les tris/filtres chauds de la communauté à
    grande échelle."""
    from sqlalchemy import text
    ddl = [
        "CREATE INDEX IF NOT EXISTS ix_posts_created_at ON community_posts (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_posts_hidden_at ON community_posts (hidden_at)",
        "CREATE INDEX IF NOT EXISTS ix_posts_symbol_created ON community_posts (symbol, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_posts_group_created ON community_posts (group_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_comments_created_at ON community_comments (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_groups_created_at ON community_groups (created_at)",
        "CREATE INDEX IF NOT EXISTS ix_cusers_banned_at ON community_users (banned_at)",
        "CREATE INDEX IF NOT EXISTS ix_reactions_post ON community_reactions (post_id)",
        "CREATE INDEX IF NOT EXISTS ix_shares_post ON community_shares (post_id)",
    ]
    try:
        with engine.begin() as conn:
            for stmt in ddl:
                conn.execute(text(stmt))
    except Exception:
        logging.getLogger("db").exception("ensure_community_indexes failed")


def _ensure_order_columns():
    """Ajoute les colonnes manquantes sur la table orders (idempotent).
    create_all() ne modifie pas les tables existantes, donc on ajoute la
    colonne valid_until au démarrage si elle n'existe pas encore."""
    from sqlalchemy import inspect as sa_inspect, text
    try:
        cols = [c["name"] for c in sa_inspect(engine).get_columns("orders")]
        if "valid_until" not in cols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE orders ADD COLUMN valid_until TIMESTAMP"))
    except Exception:
        logging.getLogger("db").exception("ensure_order_columns failed")


def _ensure_community_post_seen():
    """Crée la table des posts vus (idempotent, dialecte-agnostique)."""
    try:
        from .models.community import CommunityPostSeen
        CommunityPostClass = CommunityPostSeen
        CommunityPostClass.__table__.create(bind=engine, checkfirst=True)
    except Exception:
        logging.getLogger("db").exception("ensure_community_post_seen failed")
