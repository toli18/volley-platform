# backend/app/models.py
from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Column,
    Integer,
    String,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Text,
    JSON,
    UniqueConstraint,
    Index,
    Boolean,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


# =========================
# Enums
# =========================
class UserRole(str, Enum):
    platform_admin = "platform_admin"
    federation_admin = "federation_admin"
    coach = "coach"


class DrillStatus(str, Enum):
    draft = "draft"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class ArticleStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    NEEDS_EDIT = "NEEDS_EDIT"


class ArticleMediaType(str, Enum):
    IMAGE = "IMAGE"
    FILE = "FILE"


class TrainingSource(str, Enum):
    manual = "ръчна"
    generator = "генерирана"


class TrainingStatus(str, Enum):
    draft = "чернова"
    saved = "запазена"


# =========================
# Clubs
# =========================
class Club(Base):
    __tablename__ = "clubs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False)
    city = Column(String(100))
    country = Column(String(100))
    address = Column(Text)
    contact_email = Column(String(255))
    contact_phone = Column(String(50))
    website_url = Column(String(500))
    logo_url = Column(String(500))
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="club")
    trainings = relationship("Training", back_populates="club")


# =========================
# Users
# =========================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(SqlEnum(UserRole), nullable=False)

    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    club = relationship("Club", back_populates="users")

    trainings = relationship(
        "Training",
        back_populates="coach",
        cascade="all, delete-orphan",
        foreign_keys="Training.coach_id",
    )
    authored_articles = relationship(
        "Article",
        back_populates="author",
        foreign_keys="Article.author_id",
    )
    approved_articles = relationship(
        "Article",
        back_populates="approver",
        foreign_keys="Article.approved_by",
    )
    article_comments = relationship(
        "ArticleComment",
        back_populates="author",
        cascade="all, delete-orphan",
        foreign_keys="ArticleComment.author_id",
    )


# =========================
# Drills
# =========================
class Drill(Base):
    __tablename__ = "drills"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String, nullable=False)
    description = Column(Text)
    goal = Column(Text)
    type_of_drill = Column(String)
    training_goal = Column(String)

    category = Column(String)
    level = Column(String)
    skill_focus = Column(String)
    rpe = Column(Integer)
    intensity_type = Column(String)
    complexity_level = Column(String)
    decision_level = Column(String)

    age_min = Column(Integer)
    age_max = Column(Integer)

    players = Column(String)
    equipment = Column(Text)
    duration_min = Column(Integer)
    duration_max = Column(Integer)
    variations = Column(Text)

    skill_domains = Column(JSON)
    game_phases = Column(JSON)
    tactical_focus = Column(JSON)
    technical_focus = Column(JSON)
    position_focus = Column(JSON)
    zone_focus = Column(JSON)

    setup = Column(Text)
    instructions = Column(Text)
    coaching_points = Column(Text)
    common_mistakes = Column(Text)
    progressions = Column(Text)
    regressions = Column(Text)

    image_urls = Column(JSON)
    video_urls = Column(JSON)

    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    status = Column(String, default="pending")
    rejection_reason = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User", foreign_keys=[created_by])
    training_items = relationship("TrainingDrill", back_populates="drill")


# =========================
# Training Drill (Pivot)
# =========================
class TrainingDrill(Base):
    __tablename__ = "training_drills"

    id = Column(Integer, primary_key=True, index=True)

    training_id = Column(
        Integer,
        ForeignKey("trainings.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    drill_id = Column(Integer, ForeignKey("drills.id"), nullable=False, index=True)

    section = Column(String(50), nullable=False, default="main")
    position = Column(Integer, nullable=False, default=0)

    notes = Column(Text, nullable=True)
    duration_min = Column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("training_id", "drill_id", "section", name="uq_training_drill_section"),
        Index("ix_training_drills_training_section_pos", "training_id", "section", "position"),
    )

    training = relationship("Training", back_populates="items")
    drill = relationship("Drill", back_populates="training_items")


# =========================
# Trainings
# =========================
class Training(Base):
    __tablename__ = "trainings"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)

    coach_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)

    source = Column(SqlEnum(TrainingSource), nullable=False, default=TrainingSource.manual)
    status = Column(SqlEnum(TrainingStatus), nullable=False, default=TrainingStatus.draft)

    # ✅ JSON план (секция -> list[int])
    plan = Column(JSON, nullable=True)

    # ✅ notes (за да не гърми router-а)
    notes = Column(Text, nullable=True)
    generation_request = Column(JSON, nullable=True)
    model_version = Column(String(50), nullable=True)
    score_summary = Column(JSON, nullable=True)
    selected_drill_ids = Column(JSON, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    coach = relationship("User", back_populates="trainings", foreign_keys=[coach_id])
    club = relationship("Club", back_populates="trainings")

    items = relationship(
        "TrainingDrill",
        back_populates="training",
        cascade="all, delete-orphan",
        order_by="TrainingDrill.section, TrainingDrill.position",
    )


# =========================
# Articles
# =========================
class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    excerpt = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    status = Column(SqlEnum(ArticleStatus), nullable=False, default=ArticleStatus.PENDING)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    reject_reason = Column(Text, nullable=True)
    needs_edit_comment = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    author = relationship("User", back_populates="authored_articles", foreign_keys=[author_id])
    approver = relationship("User", back_populates="approved_articles", foreign_keys=[approved_by])
    media_items = relationship(
        "ArticleMedia",
        back_populates="article",
        cascade="all, delete-orphan",
    )
    links = relationship(
        "ArticleLink",
        back_populates="article",
        cascade="all, delete-orphan",
    )
    comments = relationship(
        "ArticleComment",
        back_populates="article",
        cascade="all, delete-orphan",
        order_by="ArticleComment.created_at",
    )


class ArticleMedia(Base):
    __tablename__ = "article_media"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(SqlEnum(ArticleMediaType), nullable=False)
    url = Column(String(1000), nullable=False)
    name = Column(String(255), nullable=False)
    mime_type = Column(String(255), nullable=False)
    size = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    article = relationship("Article", back_populates="media_items")


class ArticleLink(Base):
    __tablename__ = "article_links"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=True)
    url = Column(String(1000), nullable=False)

    article = relationship("Article", back_populates="links")


class ArticleComment(Base):
    __tablename__ = "article_comments"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("articles.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    article = relationship("Article", back_populates="comments")
    author = relationship("User", back_populates="article_comments", foreign_keys=[author_id])


# =========================
# Forum
# =========================
class ForumPost(Base):
    __tablename__ = "forum_posts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    author = relationship("User")
    replies = relationship(
        "ForumReply",
        back_populates="post",
        cascade="all, delete-orphan",
    )


class ForumReply(Base):
    __tablename__ = "forum_replies"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("forum_posts.id"), nullable=False)
    content = Column(Text, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    post = relationship("ForumPost", back_populates="replies")
    author = relationship("User")
