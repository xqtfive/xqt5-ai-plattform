from pydantic import BaseModel, Field
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
