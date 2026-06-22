from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    google_client_id: str
    google_client_secret: str
    backend_base_url: str = "http://localhost:8000"
    frontend_base_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"

settings = Settings()
