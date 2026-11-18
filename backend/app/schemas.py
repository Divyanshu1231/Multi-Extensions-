from pydantic import BaseModel, Field
class LoginIn(BaseModel):
    extension_id: str = Field(min_length=3,max_length=64)
    username: str = Field(min_length=1,max_length=100)
    password: str = Field(min_length=1,max_length=256)
class AdminLoginIn(BaseModel):
    username: str
    password: str
class UserCreate(BaseModel):
    username: str = Field(min_length=2,max_length=100)
    password: str = Field(min_length=12,max_length=256)
class ExtensionCreate(BaseModel):
    extension_key: str = Field(pattern=r"^extension-[0-9]{2,}$")
    name: str
    version: str = "1.0.0"
class StatusIn(BaseModel):
    is_active: bool
class RefreshIn(BaseModel):
    refresh_token: str

class PasswordResetIn(BaseModel):
    password: str = Field(min_length=12,max_length=256)
