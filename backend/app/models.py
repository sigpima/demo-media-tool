"""API schemas. JSON uses camelCase so it matches the TypeScript types in frontend/src/types.ts."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

ResizeMode = Literal["fit", "cover", "width", "original"]
OutputFormat = Literal["webp", "jpeg", "png"]
SourceFormat = Literal["jpeg", "png", "webp"]
AssetStatus = Literal["pending", "processing", "completed", "failed"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class Recipe(CamelModel):
    """Everything that decides what the output looks like and how it is named."""

    resize_mode: ResizeMode = "fit"
    width: int = Field(1920, ge=1, le=8000)
    height: int = Field(1080, ge=1, le=8000)
    format: OutputFormat = "webp"
    quality: int = Field(80, ge=1, le=100)
    background: str = Field("#ffffff", pattern=r"^#[0-9a-fA-F]{6}$")
    remove_metadata: bool = True
    prefix: str = Field("", max_length=40)
    pattern: str = Field("{prefix}_{index}", max_length=80)
    padding: int = Field(3, ge=1, le=6)
    start_index: int = Field(1, ge=0, le=99999)


class ProcessRequest(CamelModel):
    asset_ids: list[str] = Field(min_length=1, max_length=200)
    settings: Recipe
    reset: bool = False  # true => reprocess every listed asset, even completed ones


class AssetOut(CamelModel):
    id: str
    name: str
    format: SourceFormat
    size: int
    width: int
    height: int
    status: AssetStatus
    slot: int | None = None
    error: str | None = None
    out_name: str | None = None
    out_size: int | None = None
    out_width: int | None = None
    out_height: int | None = None
    out_format: OutputFormat | None = None
    out_quality: int | None = None


class BatchOut(CamelModel):
    id: str
    status: Literal["idle", "processing"]
    assets: list[AssetOut]
    created_at: str
    expires_at: str


class UploadResult(CamelModel):
    name: str
    asset: AssetOut | None = None
    error: str | None = None


class UploadResponse(CamelModel):
    results: list[UploadResult]


class ConfigOut(CamelModel):
    role: Literal["admin", "guest"]
    images_left_today: int | None = None
    invite_expires_at: str | None = None
    max_file_mb: int
    max_files_per_batch: int
    max_pixels: int
    ttl_hours: float
    concurrency: int
    accepted_mime: list[str]
