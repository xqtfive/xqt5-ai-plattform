from pydantic import BaseModel, Field, field_validator
from typing import Any, Dict, List, Literal, Optional


class CreateConversationRequest(BaseModel):
    title: Optional[str] = "New Conversation"
    model: Optional[str] = None
    temperature: Optional[float] = None
    assistant_id: Optional[str] = None


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=50000)
    model: Optional[str] = None
    temperature: Optional[float] = None
    stream: bool = False
    image_mode: Literal["auto", "on", "off"] = "auto"


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None


class AvailableModel(BaseModel):
    id: str
    provider: str
    name: str
    available: bool


class ConversationMetadata(BaseModel):
    id: str
    created_at: str
    title: str
    message_count: int
    last_message_at: Optional[str] = None


class ConversationResponse(BaseModel):
    id: str
    created_at: str
    title: str
    messages: List[Dict[str, Any]]
    model: Optional[str] = None
    temperature: Optional[float] = None


# Auth models
class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    user: Dict[str, Any]


# Assistant models
class CreateAssistantRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = ""
    system_prompt: str = Field(min_length=1)
    model: Optional[str] = None
    temperature: Optional[float] = None
    is_global: bool = False
    icon: str = "\U0001f916"


class UpdateAssistantRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    icon: Optional[str] = None


# Template models
class CreateTemplateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = ""
    content: str = Field(min_length=1)
    category: str = "general"
    is_global: bool = False


class UpdateTemplateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None


# Usage models
class UsageSummaryResponse(BaseModel):
    total_tokens: int
    prompt_tokens: int
    completion_tokens: int
    estimated_cost: float
    request_count: int


# Admin models
class UpdateUserRequest(BaseModel):
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


class CreateModelConfigRequest(BaseModel):
    model_id: str = Field(min_length=1)
    provider: str = Field(min_length=1)
    display_name: str = Field(min_length=1)
    sort_order: int = 0
    deployment_name: Optional[str] = None
    model_type: str = "chat"
    pricing: Optional[Dict[str, Any]] = None

    @field_validator("model_type")
    @classmethod
    def validate_model_type(cls, v: str) -> str:
        allowed = {"chat", "image"}
        if v not in allowed:
            raise ValueError(f"model_type muss 'chat' oder 'image' sein, erhalten: {v!r}")
        return v


class UpdateModelConfigRequest(BaseModel):
    display_name: Optional[str] = None
    is_enabled: Optional[bool] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None
    deployment_name: Optional[str] = None


# Runtime RAG settings
class UpdateRagSettingsRequest(BaseModel):
    rerank_enabled: Optional[bool] = None
    rerank_candidates: Optional[int] = Field(default=None, ge=5, le=100)
    rerank_top_n: Optional[int] = Field(default=None, ge=1, le=30)
    rerank_model: Optional[str] = None
    embedding_provider: Optional[str] = None
    embedding_deployment: Optional[str] = None
    contextual_retrieval_enabled: Optional[bool] = None
    contextual_retrieval_model: Optional[str] = None
    neighbor_chunks_enabled: Optional[bool] = None
    max_context_tokens: Optional[int] = Field(default=None, ge=1000, le=32000)


# Pool models
class CreatePoolRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = ""
    icon: str = "\U0001f4da"
    color: str = "#ee7f00"


class UpdatePoolRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None


class AddPoolMemberRequest(BaseModel):
    username: str = Field(min_length=1)
    role: str = Field(default="viewer", pattern="^(viewer|editor|admin)$")


class UpdatePoolMemberRequest(BaseModel):
    role: str = Field(pattern="^(viewer|editor|admin)$")


class CreateInviteLinkRequest(BaseModel):
    role: str = Field(default="viewer", pattern="^(viewer|editor|admin)$")
    max_uses: Optional[int] = None
    expires_at: Optional[str] = None


class JoinPoolRequest(BaseModel):
    token: str = Field(min_length=1)


class CreatePoolChatRequest(BaseModel):
    title: str = Field(default="New Chat", max_length=200)
    is_shared: bool = False
    model: Optional[str] = None
    temperature: Optional[float] = None


class SendPoolMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=50000)
    model: Optional[str] = None
    temperature: Optional[float] = None
    stream: bool = False
    image_mode: Literal["auto", "on", "off"] = "auto"


class UploadPoolTextRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    content: str = Field(min_length=1, max_length=500000)


# Image generation models
class ImageGenerationRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)
    model: Optional[str] = None
    parameters: Dict[str, Any] = {}
    source: Literal["studio"]
    chat_id: Optional[str] = None
    pool_chat_id: Optional[str] = None


class GeneratedImage(BaseModel):
    id: str
    user_id: str
    prompt: str
    resolved_prompt: str
    provider: str
    model: str
    image_url: Optional[str] = None
    storage_kind: str
    status: str
    error_message: Optional[str] = None
    cost_usd: float
    source: str
    chat_id: Optional[str] = None
    pool_chat_id: Optional[str] = None
    provider_url_expires_at: Optional[str] = None
    parameters_json: Dict[str, Any] = {}
    created_at: str
    updated_at: str


class ImageStylePresetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    prefix: str = Field(min_length=0, max_length=1000)


class ImageStylePresetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=100)
    prefix: Optional[str] = Field(default=None, max_length=1000)
    is_active: Optional[bool] = None


class ImageStylePresetResponse(BaseModel):
    id: str
    scope_type: str
    scope_id: Optional[str] = None
    name: str
    prefix: str
    is_active: bool
    created_by: Optional[str] = None
    created_at: str
    updated_at: str


class UpdateUserLimitsRequest(BaseModel):
    daily_image_cost_limit_usd: float = Field(ge=0.01, le=1000)


class ImageGenerationUsage(BaseModel):
    cost_usd_today: float
    daily_limit_usd: float
    remaining_usd: float
