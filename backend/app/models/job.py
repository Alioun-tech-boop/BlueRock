"""File d'attente de tâches en arrière-plan (PostgreSQL).

Table durable utilisée comme file : les tâches sont inscrites par les
handlers HTTP et consommées par le worker (drainer APScheduler). Le claim
se fait avec `FOR UPDATE SKIP LOCKED` : sûr pour plusieurs instances.
"""

from sqlalchemy import Column, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB

from ..database import Base


class BackgroundJob(Base):
    __tablename__ = "background_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(String(64), nullable=False, index=True)
    payload = Column(JSONB, nullable=False, default=dict)
    status = Column(String(16), nullable=False, default="pending", index=True)
    attempts = Column(Integer, nullable=False, default=0)
    max_attempts = Column(Integer, nullable=False, default=5)
    available_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(Text, nullable=True)
