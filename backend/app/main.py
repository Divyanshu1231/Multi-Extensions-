from fastapi import FastAPI, Depends, HTTPException, Header, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import select, func
from datetime import datetime, timedelta, timezone
from fastapi.responses import StreamingResponse
import io, json, zipfile, re, hashlib, posixpath
from pathlib import Path
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.database import Base, engine, get_db
from app.models import Admin, Extension, ExtensionUser, Session, RefreshToken, ActivityLog, ExtensionPackage
from app.schemas import LoginIn, AdminLoginIn, UserCreate, ExtensionCreate, StatusIn, RefreshIn, PasswordResetIn
from app.security import hash_password, verify_password, token_hash, access_token, decode_token, new_refresh
from app.core.config import settings
Base.metadata.create_all(bind=engine)
app=FastAPI(title="Central Extension Platform API",version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()],
    # Chrome extension IDs are 32 characters using letters a-p.
    allow_origin_regex=r"chrome-extension://[a-p]{32}",
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)
limiter=Limiter(key_func=get_remote_address); app.state.limiter=limiter; app.add_exception_handler(RateLimitExceeded,_rate_limit_exceeded_handler)
def log(db, actor, actor_id, ext, action, detail=None, request=None):
    db.add(ActivityLog(actor_type=actor,actor_id=actor_id,extension_id=ext,action=action,detail=detail,ip_address=request.client.host if request and request.client else None)); db.commit()
def admin_guard(authorization: str|None=Header(default=None),db:DBSession=Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "): raise HTTPException(401,"Admin token required")
    try: p=decode_token(authorization[7:])
    except Exception: raise HTTPException(401,"Invalid token")
    if p.get("type")!="admin": raise HTTPException(403,"Admin access required")
    a=db.get(Admin,int(p["sub"]))
    if not a or not a.is_active: raise HTTPException(401,"Admin disabled")
    return a
def user_guard(authorization: str|None=Header(default=None),db:DBSession=Depends(get_db)):
    if not authorization or not authorization.startswith("Bearer "): raise HTTPException(401,"Access token required")
    try: p=decode_token(authorization[7:])
    except Exception: raise HTTPException(401,"Invalid or expired token")
    if p.get("type")!="access": raise HTTPException(401,"Wrong token type")
    s=db.get(Session,int(p["sid"])); u=db.get(ExtensionUser,int(p["sub"])); e=db.scalar(select(Extension).where(Extension.extension_key==p["ext"]))
    if not s or s.revoked_at or s.expires_at < datetime.now(timezone.utc) or not u or not u.is_active or not e or not e.is_active or u.extension_id!=e.id or s.user_id!=u.id:
        raise HTTPException(401,"Session or extension disabled")
    return (u,e,s)
@app.on_event("startup")
def bootstrap():
    db=next(get_db())
    try:
        if not db.scalar(select(Admin).where(Admin.username==settings.admin_username)):
            db.add(Admin(username=settings.admin_username,password_hash=hash_password(settings.admin_password))); db.commit()
        names=[("extension-01","Naukri Resdex Extractor","5.5.2"),("extension-02","Shine Recruiter Sender","2.0.0"),("extension-03","CSV DoubleTick Bulk","1.1.0"),("extension-04","Shine Airtable Matcher","2.3.0"),("extension-05","Naukri Airtable Matcher","6.0.0")]
        for key,name,version in names:
            if not db.scalar(select(Extension).where(Extension.extension_key==key)):
                db.add(Extension(extension_key=key,name=name,version=version))
        db.commit()
    finally: db.close()
@app.get("/health")
def health(): return {"status":"ok"}
@app.post("/api/v1/admin/login")
@limiter.limit("5/minute")
def admin_login(data:AdminLoginIn,request:Request,db:DBSession=Depends(get_db)):
    a=db.scalar(select(Admin).where(Admin.username==data.username))
    if not a or not a.is_active or not verify_password(data.password,a.password_hash): raise HTTPException(401,"Invalid credentials")
    from jose import jwt
    from datetime import timedelta
    tok=jwt.encode({"sub":str(a.id),"type":"admin","exp":datetime.now(timezone.utc)+timedelta(hours=8)},settings.jwt_secret,algorithm=settings.jwt_algorithm)
    log(db,"admin",a.id,None,"admin.login",request=request)
    return {"access_token":tok,"token_type":"bearer","username":a.username}
@app.get("/api/v1/admin/dashboard")
def dashboard(a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    return {"total_extensions":db.scalar(select(func.count(Extension.id))) or 0,"active_extensions":db.scalar(select(func.count(Extension.id)).where(Extension.is_active==True)) or 0,"total_users":db.scalar(select(func.count(ExtensionUser.id))) or 0,"active_sessions":db.scalar(select(func.count(Session.id)).where(Session.revoked_at==None,Session.expires_at>datetime.now(timezone.utc))) or 0}
@app.get("/api/v1/extensions")
def list_extensions(a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    rows=db.scalars(select(Extension).order_by(Extension.id)).all()
    user_counts=dict(db.execute(select(ExtensionUser.extension_id,func.count(ExtensionUser.id)).group_by(ExtensionUser.extension_id)).all())
    package_ids=set(db.scalars(select(ExtensionPackage.extension_id)).all())
    return [{"id":e.id,"extension_key":e.extension_key,"name":e.name,"version":e.version,"is_active":e.is_active,"users":user_counts.get(e.id,0),"has_package":e.id in package_ids} for e in rows]
@app.post("/api/v1/extensions")
def create_extension(d:ExtensionCreate,a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    if db.scalar(select(Extension).where(Extension.extension_key==d.extension_key)): raise HTTPException(409,"Extension key already exists")
    e=Extension(**d.model_dump()); db.add(e); db.commit(); db.refresh(e); return {"id":e.id,"extension_key":e.extension_key}
@app.get("/api/v1/extensions/{id}")
def get_extension(id:int,a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    e=db.get(Extension,id)
    if not e: raise HTTPException(404,"Extension not found")
    return {"id":e.id,"extension_key":e.extension_key,"name":e.name,"version":e.version,"is_active":e.is_active}
@app.patch("/api/v1/extensions/{id}")
def patch_extension(id:int,d:StatusIn,a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    e=db.get(Extension,id)
    if not e: raise HTTPException(404,"Extension not found")
    e.is_active=d.is_active; db.commit()
    if not e.is_active:
        for s in db.scalars(select(Session).where(Session.extension_id==id,Session.revoked_at==None)): s.revoked_at=datetime.now(timezone.utc)
        db.commit()
    return {"ok":True,"is_active":e.is_active}
@app.post("/api/v1/extensions/{id}/users")
def add_user(id:int,d:UserCreate,a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    e=db.get(Extension,id)
    if not e: raise HTTPException(404,"Extension not found")
    if db.scalar(select(ExtensionUser).where(ExtensionUser.extension_id==id,ExtensionUser.username==d.username)): raise HTTPException(409,"Username already exists for this extension")
    u=ExtensionUser(extension_id=id,username=d.username,password_hash=hash_password(d.password)); db.add(u); db.commit(); db.refresh(u); return {"id":u.id,"username":u.username,"extension_id":id}
@app.get("/api/v1/extensions/{id}/users")
def list_users(id:int,a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    if not db.get(Extension,id): raise HTTPException(404,"Extension not found")
    return [{"id":u.id,"username":u.username,"is_active":u.is_active,"created_at":u.created_at} for u in db.scalars(select(ExtensionUser).where(ExtensionUser.extension_id==id)).all()]
@app.patch("/api/v1/users/{id}/status")
def user_status(id:int,d:StatusIn,a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    u=db.get(ExtensionUser,id)
    if not u: raise HTTPException(404,"User not found")
    u.is_active=d.is_active
    if not d.is_active:
        for s in db.scalars(select(Session).where(Session.user_id==id,Session.revoked_at==None)): s.revoked_at=datetime.now(timezone.utc)
    db.commit(); return {"ok":True,"is_active":u.is_active}
@app.post("/api/v1/users/{id}/reset-password")
def reset_password(id:int,d:PasswordResetIn,a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    u=db.get(ExtensionUser,id)
    if not u: raise HTTPException(404,"User not found")
    u.password_hash=hash_password(d.password)
    for s in db.scalars(select(Session).where(Session.user_id==id,Session.revoked_at==None)): s.revoked_at=datetime.now(timezone.utc)
    db.commit(); return {"ok":True,"sessions_revoked":True}
@app.get("/api/v1/activity-logs")
def activity_logs(limit:int=100,a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    limit=max(1,min(limit,500)); rows=db.scalars(select(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(limit)).all()
    return [{"id":x.id,"actor_type":x.actor_type,"actor_id":x.actor_id,"extension_id":x.extension_id,"action":x.action,"detail":x.detail,"created_at":x.created_at} for x in rows]
@app.post("/api/v1/auth/login")
@limiter.limit("5/minute")
def extension_login(d:LoginIn,request:Request,db:DBSession=Depends(get_db)):
    e=db.scalar(select(Extension).where(Extension.extension_key==d.extension_id))
    if not e or not e.is_active: raise HTTPException(401,"Unknown or disabled extension")
    u=db.scalar(select(ExtensionUser).where(ExtensionUser.extension_id==e.id,ExtensionUser.username==d.username))
    if not u or not u.is_active or not verify_password(d.password,u.password_hash):
        log(db,"extension",u.id if u else None,e.id,"auth.failed",request=request); raise HTTPException(401,"Invalid credentials")
    rt=new_refresh(); s=Session(user_id=u.id,extension_id=e.id,refresh_hash=token_hash(rt),expires_at=datetime.now(timezone.utc)+timedelta(days=settings.refresh_token_days)); db.add(s); db.commit(); db.refresh(s)
    db.add(RefreshToken(session_id=s.id,token_hash=token_hash(rt))); db.commit()
    log(db,"extension",u.id,e.id,"auth.login",request=request)
    return {"access_token":access_token(u.id,e.extension_key,s.id),"refresh_token":rt,"token_type":"bearer","expires_in":settings.access_token_minutes*60,"username":u.username}
@app.post("/api/v1/auth/refresh")
def refresh(d:RefreshIn,db:DBSession=Depends(get_db)):
    h=token_hash(d.refresh_token); row=db.scalar(select(RefreshToken).where(RefreshToken.token_hash==h))
    if not row or row.used_at: raise HTTPException(401,"Refresh token invalid or already used")
    s=db.get(Session,row.session_id); u=db.get(ExtensionUser,s.user_id) if s else None; e=db.get(Extension,s.extension_id) if s else None
    if not s or s.revoked_at or s.expires_at<datetime.now(timezone.utc) or not u or not u.is_active or not e or not e.is_active: raise HTTPException(401,"Session revoked or expired")
    row.used_at=datetime.now(timezone.utc); newrt=new_refresh(); row2=RefreshToken(session_id=s.id,token_hash=token_hash(newrt)); s.refresh_hash=token_hash(newrt); db.add(row2); db.commit()
    return {"access_token":access_token(u.id,e.extension_key,s.id),"refresh_token":newrt,"token_type":"bearer","expires_in":settings.access_token_minutes*60}
@app.post("/api/v1/auth/logout")
def logout(pair=Depends(user_guard),db:DBSession=Depends(get_db)):
    u,e,s=pair; s.revoked_at=datetime.now(timezone.utc); db.commit(); return {"ok":True}
@app.get("/api/v1/auth/me")
def me(pair=Depends(user_guard)):
    u,e,s=pair; return {"username":u.username,"extension_id":e.extension_key,"extension_name":e.name}
@app.post("/api/v1/admin/sessions/revoke")
def revoke_sessions(user_id:int,a=Depends(admin_guard),db:DBSession=Depends(get_db)):
    rows=db.scalars(select(Session).where(Session.user_id==user_id,Session.revoked_at==None)).all()
    for s in rows: s.revoked_at=datetime.now(timezone.utc)
    db.commit(); return {"revoked":len(rows)}


# --------------------------------------------------
# DASHBOARD ZIP UPLOAD / DYNAMIC EXTENSION REGISTRY
# --------------------------------------------------

MAX_UPLOAD_BYTES = 15 * 1024 * 1024       # 15 MB compressed ZIP
MAX_UNPACKED_BYTES = 40 * 1024 * 1024     # 40 MB expanded content
MAX_ZIP_FILES = 300
BACKEND_ORIGIN = "https://central-extension-platform-api.onrender.com"

def _safe_zip_name(name: str) -> bool:
    name = name.replace("\\", "/")
    return (not name.startswith("/")) and (".." not in name.split("/")) and (not re.match(r"^[A-Za-z]:", name))

@app.post("/api/v1/extensions/upload")
async def upload_extension_zip(
    file: UploadFile = File(...),
    extension_id: int | None = Form(None),
    admin=Depends(admin_guard),
    db: DBSession = Depends(get_db),
):
    filename = (file.filename or "extension.zip").strip()
    if not filename.lower().endswith(".zip"):
        raise HTTPException(400, "Please upload a .zip file")
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "ZIP must be 15 MB or smaller")
    if not raw:
        raise HTTPException(400, "Uploaded ZIP is empty")

    try:
        source = zipfile.ZipFile(io.BytesIO(raw))
        infos = source.infolist()
        if len(infos) > MAX_ZIP_FILES:
            raise HTTPException(400, "ZIP contains too many files (maximum 300)")
        total_size, names = 0, set()
        for info in infos:
            if not _safe_zip_name(info.filename):
                raise HTTPException(400, "ZIP contains an unsafe file path")
            if info.is_dir():
                continue
            total_size += info.file_size
            names.add(info.filename)
        if total_size > MAX_UNPACKED_BYTES:
            raise HTTPException(400, "Uncompressed ZIP content exceeds 40 MB")

        # Accept either a normal ZIP root or one enclosing project directory.
        manifest_name = "manifest.json" if "manifest.json" in names else None
        if not manifest_name:
            candidates = [n for n in names if n.count("/") == 1 and n.endswith("/manifest.json")]
            if len(candidates) == 1:
                manifest_name = candidates[0]
        if not manifest_name:
            raise HTTPException(400, "ZIP must contain manifest.json at its root (or one enclosing folder)")
        prefix = manifest_name[:-len("manifest.json")]
        manifest = json.loads(source.read(manifest_name).decode("utf-8-sig"))
        if manifest.get("manifest_version") != 3:
            raise HTTPException(400, "Only Chrome Manifest V3 extensions are supported")
        extension_name = str(manifest.get("name", "")).strip()
        version = str(manifest.get("version", "1.0.0")).strip()
        if not extension_name or len(extension_name) > 160:
            raise HTTPException(400, "Manifest must contain a valid extension name (max 160 chars)")
        if len(version) > 32:
            raise HTTPException(400, "Extension version is too long")
    except HTTPException:
        raise
    except (zipfile.BadZipFile, json.JSONDecodeError, UnicodeDecodeError, KeyError) as exc:
        raise HTTPException(400, "Invalid extension ZIP or manifest.json") from exc

    existing_keys = db.scalars(select(Extension.extension_key)).all()
    numbers = [int(m.group(1)) for key in existing_keys if (m := re.fullmatch(r"extension-(\d+)", key))]
    target_extension = db.get(Extension, extension_id) if extension_id else None
    if extension_id and not target_extension:
        raise HTTPException(404, "Extension to update was not found")
    extension_key = target_extension.extension_key if target_extension else f"extension-{max(numbers, default=0) + 1:02d}"

    # Build a standard login gate automatically; no auth.js or popup.html required in upload.
    auth_js = auth_template = '(() => {\n"use strict";\nconst API_BASE_URL = "__API_BASE_URL__";\nconst EXTENSION_KEY = "__EXTENSION_KEY__";\nconst STORE = "cep_session_v1";\nconst api = async (path, method="GET", body=null, token=null) => {\n  const r = await fetch(API_BASE_URL.replace(/\\/+$/, "") + "/" + path.replace(/^\\/+/, ""), {\n    method, headers: {"Content-Type":"application/json", ...(token?{Authorization:"Bearer "+token}:{})},\n    ...(body ? {body:JSON.stringify(body)} : {})\n  });\n  const d = await r.json().catch(()=>({}));\n  if (!r.ok) throw new Error(d.detail || "Request failed");\n  return d;\n};\nconst get = async () => (await chrome.storage.local.get(STORE))[STORE] || null;\nconst save = async v => chrome.storage.local.set({[STORE]:v});\nconst clear = async () => chrome.storage.local.remove(STORE);\nfunction gate(message="") {\n  if (!document.body) return setTimeout(()=>gate(message), 20);\n  let overlay=document.getElementById("cep-auto-login-gate");\n  if (!overlay) {\n    overlay=document.createElement("div"); overlay.id="cep-auto-login-gate";\n    overlay.style.cssText="position:fixed;inset:0;z-index:2147483647;background:#f4f6fb;color:#172033;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font:14px Arial,sans-serif;min-width:300px";\n    overlay.innerHTML=`<section style="width:100%;max-width:360px;background:#fff;border:1px solid #e1e6ef;border-radius:14px;padding:22px;box-shadow:0 12px 35px #17233b18;box-sizing:border-box"><div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#5365c8">CENTRAL EXTENSION PLATFORM</div><h2 style="font-size:20px;margin:12px 0 6px">Extension Login</h2><p style="font-size:12px;color:#68758a;margin:0 0 16px">Sign in with the account assigned by your administrator.</p><label>Username</label><input id="cep-u" autocomplete="username" style="width:100%;box-sizing:border-box;padding:11px;margin:6px 0 12px;border:1px solid #d5dce8;border-radius:7px"><label>Password</label><input id="cep-p" type="password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:11px;margin:6px 0 12px;border:1px solid #d5dce8;border-radius:7px"><button id="cep-submit" style="width:100%;padding:11px;background:#4058ca;color:white;border:0;border-radius:7px;font-weight:bold;cursor:pointer">Sign in</button><div id="cep-msg" role="alert" style="font-size:12px;color:#b42318;margin-top:10px"></div></section>`;\n    document.body.appendChild(overlay);\n    overlay.querySelector("#cep-submit").addEventListener("click", async()=>{\n      const b=overlay.querySelector("#cep-submit"), username=overlay.querySelector("#cep-u").value.trim(), password=overlay.querySelector("#cep-p").value;\n      const msg=overlay.querySelector("#cep-msg");\n      if(!username||!password){msg.textContent="Enter username and password.";return;}\n      b.disabled=true; msg.textContent="Signing in…";\n      try {\n        const d=await api("/api/v1/auth/login","POST",{extension_id:EXTENSION_KEY,username,password});\n        await save({extension_id:EXTENSION_KEY,access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Date.now()+d.expires_in*1000});\n        overlay.remove();\n      } catch(e) { msg.textContent=e.message; b.disabled=false; }\n    });\n  }\n  overlay.querySelector("#cep-msg").textContent=message;\n}\nasync function validate() {\n  let s=await get();\n  if(!s || s.extension_id!==EXTENSION_KEY){await clear();gate();return;}\n  try {\n    if(Date.now()>=s.expires_at-30000){\n      const d=await api("/api/v1/auth/refresh","POST",{refresh_token:s.refresh_token});\n      s={...s,access_token:d.access_token,refresh_token:d.refresh_token,expires_at:Date.now()+d.expires_in*1000}; await save(s);\n    }\n    await api("/api/v1/auth/me","GET",null,s.access_token);\n  } catch(e) { await clear();gate("Session expired. Please sign in again."); }\n}\nvalidate().catch(()=>{clear();gate("Unable to verify login. Check your internet connection.");});\n})();'
    auth_js = auth_js.replace("__API_BASE_URL__", BACKEND_ORIGIN).replace("__EXTENSION_KEY__", extension_key)
    manifest_obj = manifest
    permissions = manifest_obj.setdefault("permissions", [])
    if not isinstance(permissions, list):
        raise HTTPException(400, "manifest.json permissions must be an array")
    if "storage" not in permissions:
        permissions.append("storage")
    host_permissions = manifest_obj.setdefault("host_permissions", [])
    if not isinstance(host_permissions, list):
        raise HTTPException(400, "manifest.json host_permissions must be an array")
    if BACKEND_ORIGIN + "/*" not in host_permissions:
        host_permissions.append(BACKEND_ORIGIN + "/*")

    # Resolve popup path. Existing popup is preserved; otherwise create a simple login popup.
    action = manifest_obj.setdefault("action", {})
    if not isinstance(action, dict):
        raise HTTPException(400, "manifest.json action must be an object")
    popup_path = action.get("default_popup") or "cep-login.html"
    popup_zip_path = prefix + popup_path
    existing_popup = popup_zip_path in names
    if not existing_popup:
        action["default_popup"] = "cep-login.html"
        popup_path = "cep-login.html"
        popup_zip_path = prefix + popup_path
        popup_html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Extension Login</title></head><body><script src="auth.js"></script></body></html>'
    else:
        popup_html = source.read(popup_zip_path).decode("utf-8", errors="replace")
        # Place the gate script before the extension's own popup scripts and UI.
        if not re.search(r"""<script[^>]+src=[\'"]auth\.js[\'"]""", popup_html, re.I):
            if re.search(r'<body[^>]*>', popup_html, re.I):
                auth_rel = posixpath.relpath("auth.js", posixpath.dirname(popup_path) or ".")
                tag = '<script src="' + auth_rel + '"></script>'
                popup_html = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + tag, popup_html, count=1, flags=re.I)
            else:
                popup_html = '<!doctype html><html><body><script src="auth.js"></script>' + popup_html + '</body></html>'
    auth_relative = posixpath.relpath("auth.js", posixpath.dirname(popup_path) or ".")
    auth_tag = '<script src="' + auth_relative + '"></script>'
    if not re.search(r"""<script[^>]+src=[\'"][^\'"]*auth\.js[\'"]""", popup_html, re.I):
        if re.search(r"</body>", popup_html, re.I):
            popup_html = re.sub(r"</body>", auth_tag + "</body>", popup_html, count=1, flags=re.I)
        else:
            popup_html += auth_tag

    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
        written = set()
        for info in infos:
            if info.is_dir():
                continue
            rel = info.filename[len(prefix):] if prefix and info.filename.startswith(prefix) else info.filename
            if rel == "manifest.json":
                content = json.dumps(manifest_obj, indent=2, ensure_ascii=False).encode("utf-8")
            elif rel == popup_path:
                content = popup_html.encode("utf-8")
            elif rel == "auth.js":
                content = auth_js.encode("utf-8")
            else:
                content = source.read(info.filename)
            target.writestr(rel, content)
            written.add(rel)
        if "auth.js" not in written:
            target.writestr("auth.js", auth_js.encode("utf-8"))
        if popup_path not in written:
            target.writestr(popup_path, popup_html.encode("utf-8"))
        if "manifest.json" not in written:
            target.writestr("manifest.json", json.dumps(manifest_obj, indent=2).encode("utf-8"))
    packaged = output.getvalue()
    digest = hashlib.sha256(packaged).hexdigest()

    if target_extension:
        extension = target_extension
        extension.name = extension_name
        extension.version = version
    else:
        extension = Extension(extension_key=extension_key, name=extension_name, version=version, is_active=True)
        db.add(extension); db.flush()
    package = db.scalar(select(ExtensionPackage).where(ExtensionPackage.extension_id == extension.id))
    if package:
        package.filename=f"{extension_key}-{filename}"
        package.sha256=digest
        package.file_size=len(packaged)
        package.package_data=packaged
        package.uploaded_at=datetime.now(timezone.utc)
    else:
        package = ExtensionPackage(extension_id=extension.id, filename=f"{extension_key}-{filename}", sha256=digest, file_size=len(packaged), package_data=packaged)
        db.add(package)
    db.commit(); db.refresh(extension)
    action = "extension.update" if target_extension else "extension.upload"
    log(db, "admin", admin.id, extension.id, action, f"{filename}; sha256={digest}")
    return {"id":extension.id,"extension_key":extension.extension_key,"name":extension.name,"version":extension.version,"is_active":extension.is_active,"sha256":digest,"file_size":len(packaged),"message":"Extension package integrated. Download the updated ZIP and load it in Chrome."}

@app.get("/api/v1/extensions/{extension_id}/package")
def download_extension_package(
    extension_id: int,
    admin=Depends(admin_guard),
    db: DBSession = Depends(get_db),
):
    extension = db.get(Extension, extension_id)
    if not extension:
        raise HTTPException(404, "Extension not found")
    package = db.scalar(select(ExtensionPackage).where(ExtensionPackage.extension_id == extension_id))
    if package:
        data, filename, digest = package.package_data, package.filename, package.sha256
    else:
        # Bundle the five built-in extensions from the repository so they are downloadable too.
        root = Path(__file__).resolve().parents[2] / "extensions"
        folder = next((p for p in root.glob(extension.extension_key + "-*" ) if p.is_dir()), None)
        if not folder:
            raise HTTPException(404, "No downloadable package is available yet. Upload this extension ZIP once to register its package.")
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in folder.rglob("*"):
                if path.is_file() and not any(part in {".git", "__pycache__"} for part in path.parts):
                    archive.write(path, path.relative_to(folder).as_posix())
        data = output.getvalue()
        digest = hashlib.sha256(data).hexdigest()
        filename = f"{extension.extension_key}-v{extension.version}.zip"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"', "X-Package-SHA256": digest},
    )
