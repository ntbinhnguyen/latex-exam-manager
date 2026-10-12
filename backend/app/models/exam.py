import uuid
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, Enum, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.question import QuestionType, DifficultyLevel

class ExamMatrix(Base):
    """Lưu trữ cấu hình tổng thể của một ma trận đề thi"""
    __tablename__ = "exam_matrices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name = Column(String, nullable=False)
    grade_level = Column(String, nullable=True)
    total_questions = Column(Integer, nullable=False)
    
    cells = relationship("MatrixCell", back_populates="matrix", cascade="all, delete-orphan")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class MatrixCell(Base):
    """Mỗi bản ghi là một 'ô' trong ma trận, chứa các điều kiện lọc"""
    __tablename__ = "matrix_cells"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    matrix_id = Column(UUID(as_uuid=True), ForeignKey("exam_matrices.id"))
    
    # Các điều kiện của ô ma trận
    chapter = Column(String, nullable=True)
    topic = Column(String, nullable=True)
    question_type = Column(Enum(QuestionType), nullable=False)
    difficulty_level = Column(Enum(DifficultyLevel), nullable=False)
    
    required_count = Column(Integer, nullable=False, default=0) # Số câu yêu cầu
    
    matrix = relationship("ExamMatrix", back_populates="cells")

class ExamConfig(Base):
    """Cấu hình cho một lần sinh đề"""
    __tablename__ = "exam_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    matrix_id = Column(UUID(as_uuid=True), ForeignKey("exam_matrices.id"))
    name = Column(String, nullable=False) # Tên kỳ thi
    number_of_versions = Column(Integer, default=1) # Số lượng mã đề cần sinh
    allow_duplicates = Column(Boolean, default=False) # Cho phép trùng câu giữa các mã đề không
    
    versions = relationship("ExamVersion", back_populates="config", cascade="all, delete-orphan")

class ExamVersion(Base):
    """Lưu trữ từng Mã đề cụ thể được sinh ra"""
    __tablename__ = "exam_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_config_id = Column(UUID(as_uuid=True), ForeignKey("exam_configs.id"))
    version_code = Column(String, nullable=False) # Mã đề (VD: 101, 102)
    
    config = relationship("ExamConfig", back_populates="versions")
    questions = relationship("ExamQuestion", back_populates="exam_version", cascade="all, delete-orphan")

class ExamQuestion(Base):
    """Bảng trung gian: Lưu danh sách câu hỏi của từng mã đề"""
    __tablename__ = "exam_questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    exam_version_id = Column(UUID(as_uuid=True), ForeignKey("exam_versions.id"))
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id"))
    order_index = Column(Integer, nullable=False) # Thứ tự câu hỏi trong đề (để xáo trộn)
    
    exam_version = relationship("ExamVersion", back_populates="questions")