"""Runtime configuration. Every value can be overridden with a CBT_* environment variable (see .env.example)."""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CBT_", env_file=".env", extra="ignore")

    # --- storage / lifecycle -------------------------------------------------
    storage_dir: Path = Path("./storage")
    static_dir: Path | None = None  # built frontend (frontend/dist); mounted at "/" when it exists
    ttl_hours: float = 24  # batches idle for longer than this are deleted
    cleanup_interval_s: int = 300
    max_storage_mb: int = 4096  # refuse new uploads when all batches together exceed this

    # --- limits (never trust the client; these are enforced on the server) ---
    max_file_mb: int = 25
    max_files_per_batch: int = 100
    max_pixels: int = 64_000_000  # per image (covers 61 MP cameras). Measured ~7 bytes/pixel while processing: 3 x 56 MP peaked at ~1.25 GB
    max_output_dim: int = 8000
    max_active_batches_per_ip: int = 10

    # --- processing ------------------------------------------------------------
    concurrency: int = 3  # global number of images processed at the same time

    # --- access control --------------------------------------------------------
    basic_auth_user: str = ""
    basic_auth_password: str = ""  # auth is enabled only when BOTH are set
    trust_proxy: bool = False  # true when running behind nginx that sets X-Real-IP
    require_auth: bool = False  # production switch: refuse to start unless auth is configured with a strong password
    cookie_secure: bool = True  # invite session cookie is HTTPS-only (browsers still accept it on localhost)

    # --- invite links (guests): smaller limits than the admin ----------------------------
    invite_ttl_days: int = 7
    invite_max_files_per_batch: int = 20
    invite_max_file_mb: int = 10
    invite_images_per_day: int = 200

    # --- rate limits (per client IP) ----------------------------------------------
    rate_batches_per_hour: int = 30
    rate_uploads_per_min: int = 600  # one request per file
    rate_process_per_min: int = 30
    rate_export_per_min: int = 30
    rate_auth_failures_per_min: int = 10

    @property
    def max_file_bytes(self) -> int:
        return self.max_file_mb * 1024 * 1024

    @property
    def auth_enabled(self) -> bool:
        return bool(self.basic_auth_user and self.basic_auth_password)
