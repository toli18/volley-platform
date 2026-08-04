# backend/app/models.py
from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Column,
    Integer,
    String,
    Date,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Text,
    JSON,
    UniqueConstraint,
    Index,
    Boolean,
    Float,
    LargeBinary,
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
    club_head_coach = "club_head_coach"


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
    full_name = Column(String(500), nullable=True)  # официално име от СЕК (fullName)
    city = Column(String(100))
    country = Column(String(100))
    address = Column(Text)
    contact_email = Column(String(255))
    contact_phone = Column(String(50))
    website_url = Column(String(500))
    logo_url = Column(String(500))
    bulstat = Column(String(32), nullable=True)
    license_number = Column(String(64), nullable=True)
    bvf_region = Column(String(120), nullable=True)
    bvf_logo_id = Column(String(64), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    # Връзка към db.bvf.bg (напр. 167 за Троян Волей)
    bvf_club_id = Column(Integer, nullable=True, unique=True, index=True)
    bvf_club_name = Column(String(255), nullable=True)
    bvf_linked_at = Column(DateTime, nullable=True)
    # Еднократна оторизация — username + криптирана парола (legacy) или ApiKey
    bvf_username = Column(String(100), nullable=True)
    bvf_password_enc = Column(Text, nullable=True)
    bvf_api_key_enc = Column(Text, nullable=True)
    bvf_api_key_prefix = Column(String(20), nullable=True)
    # Лицензиран FirstCoach fallback за създаване на състезатели в СЕК
    bvf_default_first_coach_id = Column(Integer, nullable=True)
    bvf_default_first_coach_name = Column(String(255), nullable=True)

    # Клубно заявление (Заявление) — конфиг за родителски портал
    # Изключено по подразбиране; активира се ръчно в Администрация БФВ
    membership_consent_enabled = Column(Boolean, nullable=False, default=False)
    membership_consent_addressee = Column(Text, nullable=True)
    membership_consent_body = Column(Text, nullable=True)
    membership_consent_gdpr = Column(Text, nullable=True)
    membership_consent_fee_amount = Column(Integer, nullable=True)
    membership_consent_fee_due_day = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", back_populates="club")
    trainings = relationship("Training", back_populates="club")
    membership_consents = relationship("AthleteClubConsent", back_populates="club")


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
    phone = Column(String(50), nullable=True)
    phone_visible_to_parents = Column(Boolean, nullable=False, default=True)

    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Връзка към лицензиран треньор в СЕК (db.bvf.bg) — за FirstCoachId
    bvf_coach_id = Column(Integer, nullable=True, index=True)
    bvf_coach_name = Column(String(255), nullable=True)
    # Ако локалният треньор няма лиценз — прокси лицензиран треньор от клуба
    bvf_first_coach_proxy_id = Column(Integer, nullable=True)
    bvf_first_coach_proxy_name = Column(String(255), nullable=True)

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

    # national_bfv: официални БФВ упражнения (read-only за треньори)
    scope = Column(String(20), nullable=False, default="community", index=True)
    is_national_read_only = Column(Boolean, nullable=False, default=False)
    method_source_id = Column(Integer, ForeignKey("method_sources.id", ondelete="SET NULL"), nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    creator = relationship("User", foreign_keys=[created_by])
    method_source = relationship("MethodSource", back_populates="drills")
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

    # Връзка с програмата: за кой отбор и за кой ден е планирана тренировката.
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    session_date = Column(String(10), nullable=True, index=True)  # YYYY-MM-DD

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
    blob = relationship(
        "ArticleMediaBlob",
        back_populates="media",
        cascade="all, delete-orphan",
        uselist=False,
    )


class ArticleMediaBlob(Base):
    __tablename__ = "article_media_blobs"

    id = Column(Integer, primary_key=True, index=True)
    media_id = Column(Integer, ForeignKey("article_media.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    content = Column(LargeBinary, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    media = relationship("ArticleMedia", back_populates="blob")


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
    category = Column(String(100), nullable=True)
    tags = Column(JSON, nullable=True)
    is_pinned = Column(Boolean, nullable=False, default=False)
    is_locked = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    author = relationship("User")
    media_items = relationship(
        "ForumPostMedia",
        back_populates="post",
        cascade="all, delete-orphan",
    )
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


class ForumPostMedia(Base):
    __tablename__ = "forum_post_media"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("forum_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(1000), nullable=False)
    name = Column(String(255), nullable=False)
    mime_type = Column(String(255), nullable=False)
    size = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    post = relationship("ForumPost", back_populates="media_items")


class ForumPostSubscription(Base):
    __tablename__ = "forum_post_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("forum_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_forum_post_subscription"),
    )

    post = relationship("ForumPost")
    user = relationship("User")


class ForumNotification(Base):
    __tablename__ = "forum_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    post_id = Column(Integer, ForeignKey("forum_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    reply_id = Column(Integer, ForeignKey("forum_replies.id", ondelete="CASCADE"), nullable=True, index=True)
    message = Column(String(400), nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
    post = relationship("ForumPost")
    reply = relationship("ForumReply")


# =========================
# Monthly Fees
# =========================
class Athlete(Base):
    __tablename__ = "athletes"

    id = Column(Integer, primary_key=True, index=True)
    coach_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)

    athlete_name = Column(String(255), nullable=False)
    first_name = Column(String(25), nullable=True)
    middle_name = Column(String(25), nullable=True)
    last_name = Column(String(25), nullable=True)
    athlete_phone = Column(String(50), nullable=True)
    parent_name = Column(String(255), nullable=True)
    parent_phone = Column(String(50), nullable=True)
    birth_year = Column(Integer, nullable=True, index=True)
    birth_date = Column(Date, nullable=True)
    place_of_birth = Column(String(255), nullable=True)
    nationality = Column(String(25), nullable=True, default="България")
    gender = Column(String(16), nullable=True)  # "male" | "female"
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    # БФВ картотека (db.bvf.bg)
    egn = Column(String(16), nullable=True, index=True)
    bvf_player_id = Column(Integer, nullable=True, unique=True, index=True)
    bvf_player_number = Column(Integer, nullable=True, index=True)
    bvf_photo_id = Column(String(64), nullable=True)
    bvf_synced_at = Column(DateTime, nullable=True)
    # Задача към груповия треньор (снимка/данни) преди create/link в СЕК
    sek_task_code = Column(String(32), nullable=True)
    sek_task_detail = Column(Text, nullable=True)
    sek_task_at = Column(DateTime, nullable=True)
    sek_task_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    coach = relationship("User", foreign_keys=[coach_id])
    club = relationship("Club")
    payments = relationship(
        "AthletePayment",
        back_populates="athlete",
        cascade="all, delete-orphan",
        order_by="AthletePayment.month_key.desc()",
    )
    parent_access_tokens = relationship(
        "AthleteParentAccessToken",
        back_populates="athlete",
        cascade="all, delete-orphan",
        order_by="AthleteParentAccessToken.created_at.desc()",
    )
    parent_push_subscriptions = relationship(
        "ParentPushSubscription",
        back_populates="athlete",
        cascade="all, delete-orphan",
    )
    parent_portal_change_markers = relationship(
        "ParentPortalChangeMarker",
        back_populates="athlete",
        cascade="all, delete-orphan",
    )
    bvf_documents = relationship(
        "AthleteBvfDocument",
        back_populates="athlete",
        cascade="all, delete-orphan",
    )
    physical_measurements = relationship(
        "AthletePhysicalMeasurement",
        back_populates="athlete",
        cascade="all, delete-orphan",
    )
    club_consents = relationship(
        "AthleteClubConsent",
        back_populates="athlete",
        cascade="all, delete-orphan",
    )
    carding_forms = relationship(
        "AthleteCardingForm",
        back_populates="athlete",
        cascade="all, delete-orphan",
    )


class AthleteClubConsent(Base):
    """Подписано клубно заявление — валидно 1 година, после се подновява от родителя."""

    __tablename__ = "athlete_club_consents"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)

    parent_full_name = Column(String(255), nullable=False)
    parent_egn = Column(String(16), nullable=False)
    parent_address = Column(String(500), nullable=False)
    parent_phone = Column(String(50), nullable=False)

    child_full_name = Column(String(255), nullable=False)
    child_egn = Column(String(16), nullable=False)
    child_address = Column(String(500), nullable=True)
    child_phone = Column(String(50), nullable=True)

    gdpr_accepted = Column(Boolean, nullable=False, default=True)
    signature_name = Column(String(255), nullable=False)
    signed_at = Column(DateTime, nullable=False)

    addressee_snapshot = Column(Text, nullable=True)
    body_text_snapshot = Column(Text, nullable=True)
    gdpr_text_snapshot = Column(Text, nullable=True)
    club_name_snapshot = Column(String(255), nullable=True)
    fee_amount_snapshot = Column(Integer, nullable=True)
    fee_due_day_snapshot = Column(Integer, nullable=True)

    pdf_rel_path = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    revoke_note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    athlete = relationship("Athlete", back_populates="club_consents")
    club = relationship("Club", back_populates="membership_consents")


class AthleteCardingForm(Base):
    """Подписана Форма 0-3 / 0-3 А за сезон (картотекиране)."""

    __tablename__ = "athlete_carding_forms"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)
    season_year = Column(Integer, nullable=False, index=True)
    # "03" (<14) | "03a" (14+)
    form_kind = Column(String(8), nullable=False)

    parent1_full_name = Column(String(255), nullable=False)
    parent1_egn = Column(String(16), nullable=False)
    parent2_full_name = Column(String(255), nullable=True)
    parent2_egn = Column(String(16), nullable=True)

    athlete_full_name = Column(String(255), nullable=False)
    athlete_egn = Column(String(16), nullable=False)

    city = Column(String(120), nullable=True)
    rules_accepted = Column(Boolean, nullable=False, default=True)
    signature_parent1 = Column(String(255), nullable=False)
    signature_parent2 = Column(String(255), nullable=True)
    signature_athlete = Column(String(255), nullable=True)
    signed_at = Column(DateTime, nullable=False)

    club_name_snapshot = Column(String(255), nullable=True)
    season_label_snapshot = Column(String(64), nullable=True)
    pdf_rel_path = Column(String(500), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    athlete = relationship("Athlete", back_populates="carding_forms")
    club = relationship("Club")


class AthletePhysicalMeasurement(Base):
    """Локални физически показатели + sync към БФВ PlayerDevelopment."""

    __tablename__ = "athlete_physical_measurements"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    measured_at = Column(DateTime, nullable=False, index=True)
    position = Column(Integer, nullable=True)  # БФВ Position (опционално)
    height_cm = Column(Integer, nullable=True)
    weight_kg = Column(Integer, nullable=True)
    full_extent_cm = Column(Integer, nullable=True)  # размах / FullExtent
    attack_cm = Column(Integer, nullable=True)
    block_cm = Column(Integer, nullable=True)
    notes = Column(String(255), nullable=True)
    bvf_development_id = Column(Integer, nullable=True, index=True)
    bvf_synced_at = Column(DateTime, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    athlete = relationship("Athlete", back_populates="physical_measurements")


class AthleteBvfDocument(Base):
    """Метаданни за документ в БФВ — файлът живее само във федерацията."""

    __tablename__ = "athlete_bvf_documents"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    bvf_document_id = Column(String(64), nullable=False, index=True)
    bvf_file_id = Column(String(64), nullable=True)
    doc_type = Column(Integer, nullable=True)
    description = Column(String(500), nullable=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    season_year = Column(Integer, nullable=True, index=True)
    synced_at = Column(DateTime, nullable=True)

    athlete = relationship("Athlete", back_populates="bvf_documents")


class BvfSeasonApplication(Base):
    """Заявка за участие за сезон — главният треньор я отваря и назначава треньори по възраст."""

    __tablename__ = "bvf_season_applications"
    __table_args__ = (UniqueConstraint("club_id", "year", name="uq_bvf_season_app_club_year"),)

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False, index=True)
    # draft | open | closed
    status = Column(String(32), nullable=False, default="open")
    note = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    club = relationship("Club")
    card_indexes = relationship("BvfCardIndex", back_populates="season_application")


class BvfCardIndex(Base):
    """Локален запис / огледало на БФВ card index (сезон × възраст × пол)."""

    __tablename__ = "bvf_card_indexes"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)
    bvf_card_index_id = Column(Integer, nullable=True, unique=True, index=True)
    year = Column(Integer, nullable=False, index=True)
    age = Column(Integer, nullable=False)
    age_group = Column(String(120), nullable=True)
    sex = Column(Integer, nullable=False, default=0)  # 0 male, 1 female
    is_signed = Column(Boolean, nullable=True)
    senior_coach_bvf_id = Column(Integer, nullable=True)
    # draft | building | ready_for_head | synced | ready | signed | pending_bvf_sign
    status = Column(String(32), nullable=False, default="draft")
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    assigned_coach_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    # Втори треньор + лекар (както в СЕК card index / протокол)
    second_coach_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    doctor_name = Column(String(255), nullable=True)
    season_application_id = Column(
        Integer, ForeignKey("bvf_season_applications.id", ondelete="SET NULL"), nullable=True, index=True
    )
    requested_at = Column(DateTime, nullable=True)
    requested_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    request_note = Column(Text, nullable=True)
    signed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    signed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    club = relationship("Club")
    season_application = relationship("BvfSeasonApplication", back_populates="card_indexes")
    members = relationship(
        "BvfCardIndexMember",
        back_populates="card_index",
        cascade="all, delete-orphan",
    )


class BvfCardIndexMember(Base):
    __tablename__ = "bvf_card_index_members"

    id = Column(Integer, primary_key=True, index=True)
    card_index_id = Column(Integer, ForeignKey("bvf_card_indexes.id", ondelete="CASCADE"), nullable=False, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    bvf_player_id = Column(Integer, nullable=True, index=True)
    synced = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())

    card_index = relationship("BvfCardIndex", back_populates="members")
    athlete = relationship("Athlete")


class ParentPortalChangeMarker(Base):
    __tablename__ = "parent_portal_change_markers"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    marker_key = Column(String(120), nullable=False)
    change_type = Column(String(40), nullable=False, index=True)
    date_iso = Column(String(10), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    athlete = relationship("Athlete", back_populates="parent_portal_change_markers")

    __table_args__ = (UniqueConstraint("athlete_id", "marker_key", name="uq_parent_portal_change_marker"),)


class ParentPushSubscription(Base):
    __tablename__ = "parent_push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False)
    p256dh = Column(String(255), nullable=False)
    auth = Column(String(255), nullable=False)
    user_agent = Column(String(512), nullable=True)
    portal = Column(String(32), nullable=False, default="parent", index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    athlete = relationship("Athlete", back_populates="parent_push_subscriptions")

    __table_args__ = (UniqueConstraint("endpoint", name="uq_parent_push_endpoint"),)


class AthletePayment(Base):
    __tablename__ = "athlete_payments"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    coach_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    month_key = Column(String(7), nullable=False, index=True)  # YYYY-MM
    amount = Column(Float, nullable=False)
    paid_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("athlete_id", "month_key", name="uq_athlete_month_payment"),
    )

    athlete = relationship("Athlete", back_populates="payments")
    coach = relationship("User", foreign_keys=[coach_id])


class AthleteParentAccessToken(Base):
    __tablename__ = "athlete_parent_access_tokens"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    token_prefix = Column(String(12), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    expires_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    athlete = relationship("Athlete", back_populates="parent_access_tokens")
    created_by = relationship("User", foreign_keys=[created_by_user_id])


class ParentAbsenceNotice(Base):
    __tablename__ = "parent_absence_notices"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    notice_date = Column(String(10), nullable=False, index=True)
    note = Column(Text, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    athlete = relationship("Athlete", foreign_keys=[athlete_id])
    team = relationship("Team", foreign_keys=[team_id])

    __table_args__ = (Index("ix_parent_absence_athlete_date", "athlete_id", "notice_date"),)


# =========================
# Teams & Attendance
# =========================
class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    coach_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id"), nullable=True, index=True)
    name = Column(String(120), nullable=False)
    age_group = Column(String(80), nullable=True)
    season = Column(String(40), nullable=True)
    gender = Column(String(16), nullable=True)  # "male" | "female"
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    coach = relationship("User", foreign_keys=[coach_id])
    club = relationship("Club")
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    sessions = relationship("TeamSession", back_populates="team", cascade="all, delete-orphan")
    team_access_tokens = relationship(
        "TeamAccessToken",
        back_populates="team",
        cascade="all, delete-orphan",
        order_by="TeamAccessToken.created_at.desc()",
    )
    portal_items = relationship(
        "TeamPortalItem",
        back_populates="team",
        cascade="all, delete-orphan",
        order_by="TeamPortalItem.created_at.desc()",
    )
    chat_messages = relationship(
        "TeamChatMessage",
        back_populates="team",
        cascade="all, delete-orphan",
        order_by="TeamChatMessage.created_at.asc()",
    )


class TeamAccessToken(Base):
    __tablename__ = "team_access_tokens"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    token_prefix = Column(String(12), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    expires_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    team = relationship("Team", back_populates="team_access_tokens")
    created_by = relationship("User", foreign_keys=[created_by_user_id])


class TeamPortalItemKind(str, Enum):
    text = "text"
    image = "image"


class TeamPortalItem(Base):
    __tablename__ = "team_portal_items"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(SqlEnum(TeamPortalItemKind), nullable=False, index=True)
    body = Column(Text, nullable=True)
    url = Column(String(512), nullable=True)
    file_name = Column(String(255), nullable=True)
    mime_type = Column(String(120), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    team = relationship("Team", back_populates="portal_items")
    created_by = relationship("User", foreign_keys=[created_by_user_id])


class TeamChatSenderKind(str, Enum):
    coach = "coach"
    athlete = "athlete"


class TeamChatMessage(Base):
    __tablename__ = "team_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_kind = Column(SqlEnum(TeamChatSenderKind), nullable=False, index=True)
    coach_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True, index=True)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    team = relationship("Team", back_populates="chat_messages")
    coach = relationship("User", foreign_keys=[coach_user_id])
    athlete = relationship("Athlete", foreign_keys=[athlete_id])
    read_receipts = relationship(
        "TeamChatMessageRead",
        back_populates="message",
        cascade="all, delete-orphan",
    )

    __table_args__ = (Index("ix_team_chat_team_created", "team_id", "created_at"),)


class TeamChatMessageRead(Base):
    __tablename__ = "team_chat_message_reads"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(
        Integer,
        ForeignKey("team_chat_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    read_at = Column(DateTime, nullable=False, server_default=func.now())

    message = relationship("TeamChatMessage", back_populates="read_receipts")
    athlete = relationship("Athlete", foreign_keys=[athlete_id])

    __table_args__ = (UniqueConstraint("message_id", "athlete_id", name="uq_team_chat_message_read"),)


class AthleteTeamChatRead(Base):
    __tablename__ = "athlete_team_chat_reads"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    last_read_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (UniqueConstraint("athlete_id", "team_id", name="uq_athlete_team_chat_read"),)


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    joined_at = Column(DateTime, server_default=func.now())
    left_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("team_id", "athlete_id", name="uq_team_member"),
    )

    team = relationship("Team", back_populates="members")
    athlete = relationship("Athlete")


class TeamSession(Base):
    __tablename__ = "team_sessions"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    title = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("team_id", "date", name="uq_team_session_date"),
    )

    team = relationship("Team", back_populates="sessions")
    attendance_items = relationship("AttendanceRecord", back_populates="session", cascade="all, delete-orphan")


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("team_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="present")  # present | late | absent | excused
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("session_id", "athlete_id", name="uq_session_athlete_attendance"),
    )

    session = relationship("TeamSession", back_populates="attendance_items")
    athlete = relationship("Athlete")


class TrainingAssignment(Base):
    __tablename__ = "training_assignments"

    id = Column(Integer, primary_key=True, index=True)
    training_id = Column(Integer, ForeignKey("trainings.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="new")  # new | in_progress | done
    note = Column(Text, nullable=True)
    completion_note = Column(Text, nullable=True)
    due_date = Column(String(10), nullable=True)  # YYYY-MM-DD
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("training_id", "assigned_to", name="uq_training_assignment_target"),
    )

    training = relationship("Training")
    assigner = relationship("User", foreign_keys=[assigned_by])
    assignee = relationship("User", foreign_keys=[assigned_to])


# =========================
# Training schedule (calendar)
# =========================
class TrainingScheduleRule(Base):
    __tablename__ = "training_schedule_rules"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    coach_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    location = Column(String(255), nullable=False)
    weekday = Column(Integer, nullable=False, index=True)  # 0=Mon .. 6=Sun
    start_time = Column(String(5), nullable=False)  # HH:MM
    end_time = Column(String(5), nullable=False)  # HH:MM

    effective_from = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    effective_to = Column(String(10), nullable=True, index=True)  # YYYY-MM-DD
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    club = relationship("Club")
    team = relationship("Team")
    coach = relationship("User", foreign_keys=[coach_id])
    exceptions = relationship(
        "TrainingScheduleException",
        back_populates="rule",
        cascade="all, delete-orphan",
        order_by="TrainingScheduleException.date.asc()",
    )

    __table_args__ = (
        Index("ix_schedule_rule_club_weekday", "club_id", "weekday"),
    )


class TrainingScheduleException(Base):
    __tablename__ = "training_schedule_exceptions"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("training_schedule_rules.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    kind = Column(String(20), nullable=False)  # cancelled | override

    # Optional overrides (used when kind=override)
    location = Column(String(255), nullable=True)
    coach_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    start_time = Column(String(5), nullable=True)  # HH:MM
    end_time = Column(String(5), nullable=True)  # HH:MM

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    rule = relationship("TrainingScheduleRule", back_populates="exceptions")
    coach = relationship("User", foreign_keys=[coach_id])
    team = relationship("Team", foreign_keys=[team_id])

    __table_args__ = (
        UniqueConstraint("rule_id", "date", name="uq_schedule_rule_date"),
    )


class ClubCompetitionEvent(Base):
    """One-off competition / match for a team (not a weekly training rule)."""

    __tablename__ = "club_competition_events"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    coach_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    start_time = Column(String(5), nullable=False)  # HH:MM
    end_time = Column(String(5), nullable=False)  # HH:MM
    location = Column(String(255), nullable=False)
    # championship | tournament | control | friendly
    competition_kind = Column(String(32), nullable=False, index=True)
    notes = Column(Text, nullable=True)
    is_cancelled = Column(Boolean, nullable=False, default=False, index=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    club = relationship("Club")
    team = relationship("Team")
    coach = relationship("User", foreign_keys=[coach_id])

    __table_args__ = (
        Index("ix_competition_club_date", "club_id", "date"),
    )


# =========================
# National method library (BVF)
# =========================
class MethodSource(Base):
    __tablename__ = "method_sources"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(512), nullable=False)
    original_language = Column(String(8), nullable=False, default="it")
    content_type = Column(String(32), nullable=False, default="methodology")
    age_band = Column(String(16), nullable=False, default="all")
    rights_note = Column(Text, nullable=True)
    ingest_status = Column(String(32), nullable=False, default="pending")
    extracted_text = Column(Text, nullable=True)
    admin_notes = Column(Text, nullable=True)
    wave = Column(Integer, nullable=False, default=1)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    articles = relationship("MethodArticle", back_populates="source")
    cycles = relationship("MethodCycle", back_populates="source")
    drills = relationship("Drill", back_populates="method_source")


class MethodArticle(Base):
    __tablename__ = "method_articles"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("method_sources.id", ondelete="SET NULL"), nullable=True, index=True)
    title_bg = Column(String(512), nullable=False)
    body_bg = Column(Text, nullable=False)
    category = Column(String(32), nullable=False, default="methodology")
    age_band = Column(String(16), nullable=False, default="all", index=True)
    status = Column(String(20), nullable=False, default="draft", index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    published_at = Column(DateTime, nullable=True)
    source_url = Column(String(1024), nullable=True)
    author = Column(String(256), nullable=True)
    series = Column(String(160), nullable=True, index=True)
    summary_bg = Column(Text, nullable=True)
    key_points = Column(JSON, nullable=True)
    content_origin = Column(String(32), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    source = relationship("MethodSource", back_populates="articles")


class MethodGuideline(Base):
    __tablename__ = "method_guidelines"

    id = Column(Integer, primary_key=True, index=True)
    skill_element = Column(String(32), nullable=False, index=True)
    error_bg = Column(Text, nullable=False)
    correction_bg = Column(Text, nullable=False)
    age_band = Column(String(16), nullable=False, default="all")
    sort_order = Column(Integer, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="published", index=True)
    created_at = Column(DateTime, server_default=func.now())


class MethodCycle(Base):
    __tablename__ = "method_cycles"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("method_sources.id", ondelete="SET NULL"), nullable=True, index=True)
    title_bg = Column(String(512), nullable=False)
    summary_bg = Column(Text, nullable=True)
    cycle_type = Column(String(16), nullable=False, default="meso")
    weeks = Column(Integer, nullable=False, default=4)
    age_band = Column(String(16), nullable=False, default="all", index=True)
    structure_json = Column(JSON, nullable=False, default=dict)
    status = Column(String(20), nullable=False, default="draft", index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    published_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    source = relationship("MethodSource", back_populates="cycles")
    club_instances = relationship("ClubCycleInstance", back_populates="cycle")


class ClubCycleInstance(Base):
    __tablename__ = "club_cycle_instances"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    cycle_id = Column(Integer, ForeignKey("method_cycles.id", ondelete="CASCADE"), nullable=False, index=True)
    start_date = Column(String(10), nullable=False)
    customizations_json = Column(JSON, nullable=True)
    status = Column(String(20), nullable=False, default="active")
    created_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    cycle = relationship("MethodCycle", back_populates="club_instances")
    team = relationship("Team")
    club = relationship("Club")


class MethodAssignment(Base):
    __tablename__ = "method_assignments"

    id = Column(Integer, primary_key=True, index=True)
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_by = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_to = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    cycle_id = Column(Integer, ForeignKey("method_cycles.id", ondelete="SET NULL"), nullable=True, index=True)
    club_cycle_instance_id = Column(
        Integer, ForeignKey("club_cycle_instances.id", ondelete="SET NULL"), nullable=True, index=True
    )
    week_ref = Column(Integer, nullable=True)
    title_bg = Column(String(512), nullable=False)
    guidance_bg = Column(Text, nullable=True)
    drill_ids = Column(JSON, nullable=True)
    due_date = Column(String(10), nullable=True)
    status = Column(String(20), nullable=False, default="new")
    completion_note = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    assigner = relationship("User", foreign_keys=[assigned_by])
    assignee = relationship("User", foreign_keys=[assigned_to])
    cycle = relationship("MethodCycle")


# =========================
# Pilot program (public landing → admin inbox)
# =========================
class PilotRequestStatus(str, Enum):
    new = "new"
    contacted = "contacted"
    activated = "activated"
    declined = "declined"


class PilotRequest(Base):
    __tablename__ = "pilot_requests"

    id = Column(Integer, primary_key=True, index=True)
    club_name = Column(String(255), nullable=False)
    city = Column(String(120), nullable=True)
    region = Column(String(64), nullable=True)
    teams_count = Column(String(32), nullable=True)
    coaches_count = Column(String(32), nullable=True)
    contact_name = Column(String(255), nullable=False)
    note = Column(Text, nullable=True)
    status = Column(
        SqlEnum(PilotRequestStatus, name="pilotrequeststatus", native_enum=False),
        nullable=False,
        default=PilotRequestStatus.new,
    )
    admin_seen = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now(), index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# =========================
# Methodical Assessment Layer v1
# Дефинирани в отделен модул за по-малък diff; импортирани тук, за да се
# регистрират към общия Base/metadata и да са достъпни през `app.models`.
# =========================
from .models_assessment import (  # noqa: E402,F401
    TestCategory,
    TestDirection,
    AssessmentWindowPhase,
    AssessmentSessionStatus,
    TestDefinition,
    AssessmentWindow,
    AssessmentSession,
    AssessmentResult,
    AssessmentNorm,
    DevelopmentScore,
    MethodicalIndexSnapshot,
    AssessmentConsent,
    BatteryAuditLog,
)
from .models_matches import (  # noqa: E402,F401
    MatchStatus,
    MatchSystem,
    MatchPosition,
    Match,
    MatchRosterPlayer,
    MatchLineupSlot,
    MatchSetStatus,
    MatchStatAction,
    MatchSet,
    MatchStatEvent,
)
