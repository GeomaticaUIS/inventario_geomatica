import os
import shutil
import uuid
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel

from backend.database import (
    init_db,
    verify_credentials,
    list_all_usuarios,
    list_items,
    get_item,
    upsert_item,
    delete_item,
    list_salas,
    get_sala,
    upsert_sala,
    delete_sala
)

# Inicializar Base de Datos al arrancar
init_db()

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOADS_FOTOS_DIR = os.path.join(BASE_DIR, 'uploads', 'fotos')
UPLOADS_PLANOS_DIR = os.path.join(BASE_DIR, 'uploads', 'planos')
os.makedirs(UPLOADS_FOTOS_DIR, exist_ok=True)
os.makedirs(UPLOADS_PLANOS_DIR, exist_ok=True)

app = FastAPI(
    title="Inventario Geomática UIS",
    description="Sistema de Inventario con Gestión de Equipos y Diseñador de Esquemas de Sala 2D",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Modelos Pydantic ---

class LoginRequest(BaseModel):
    usuario: str
    password: str

class ItemModel(BaseModel):
    id: str
    descripcion: str
    ubicacion: Optional[str] = ""
    observacion: Optional[str] = ""
    tipo_inventario: str
    funcionario: Optional[str] = ""
    imagen: Optional[str] = ""
    sala_id: Optional[str] = None
    pos_x: Optional[float] = None
    pos_y: Optional[float] = None

class SalaModel(BaseModel):
    id: str
    nombre: str
    descripcion: Optional[str] = ""
    plano_imagen: str
    ancho: int = 1000
    alto: int = 700

class SalaDesignModel(BaseModel):
    id: str
    nombre: str
    descripcion: Optional[str] = ""
    ancho: int = 1000
    alto: int = 700
    svg_content: str

# --- Rutas de Autenticación ---

@app.post("/api/auth/login")
def login(payload: LoginRequest):
    user = verify_credentials(payload.usuario, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Usuario o contraseña incorrectos")
    token = f"sess_{user['usuario']}_{uuid.uuid4().hex[:12]}"
    return {
        "ok": True,
        "token": token,
        "user": {
            "id": user["id"],
            "usuario": user["usuario"],
            "nombre": user["nombre"],
            "rol": user["rol"]
        }
    }

@app.get("/api/auth/usuarios")
def get_usuarios():
    return list_all_usuarios()

# --- Rutas de Inventario ---

@app.get("/api/items")
def get_items(
    q: Optional[str] = None,
    tipo: Optional[str] = None,
    funcionario: Optional[str] = None,
    sala_id: Optional[str] = None
):
    return list_items(search=q, tipo=tipo, funcionario=funcionario, sala_id=sala_id)

@app.get("/api/items/{item_id}")
def get_single_item(item_id: str):
    it = get_item(item_id)
    if not it:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    return it

@app.post("/api/items")
def save_item(item: ItemModel):
    res = upsert_item(item.dict())
    return {"ok": True, "item": res}

@app.delete("/api/items/{item_id}")
def remove_item(item_id: str):
    success = delete_item(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Ítem no encontrado")
    return {"ok": True, "deleted_id": item_id}

# --- Rutas de Salas y Esquemas ---

@app.get("/api/salas")
def get_salas():
    return list_salas()

@app.get("/api/salas/{sala_id}")
def get_single_sala(sala_id: str):
    s = get_sala(sala_id)
    if not s:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    return s

@app.post("/api/salas")
def save_sala(sala: SalaModel):
    res = upsert_sala(sala.dict())
    return {"ok": True, "sala": res}

@app.post("/api/salas/design")
def save_designed_sala(payload: SalaDesignModel):
    sala_id_clean = payload.id.strip().lower().replace(' ', '_')
    filename = f"plano_{sala_id_clean}.svg"
    dest = os.path.join(UPLOADS_PLANOS_DIR, filename)

    with open(dest, "w", encoding="utf-8") as f:
        f.write(payload.svg_content)

    sala_dict = {
        "id": sala_id_clean,
        "nombre": payload.nombre.strip(),
        "descripcion": payload.descripcion.strip(),
        "plano_imagen": f"uploads/planos/{filename}",
        "ancho": payload.ancho,
        "alto": payload.alto
    }
    res = upsert_sala(sala_dict)
    return {"ok": True, "sala": res}

@app.delete("/api/salas/{sala_id}")
def remove_sala(sala_id: str):
    success = delete_sala(sala_id)
    if not success:
        raise HTTPException(status_code=404, detail="Sala no encontrada")
    return {"ok": True, "deleted_id": sala_id}

# --- Rutas de Carga de Archivos ---

@app.post("/api/upload/foto")
async def upload_foto(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower() or '.jpg'
    filename = f"foto_{uuid.uuid4().hex[:10]}{ext}"
    dest = os.path.join(UPLOADS_FOTOS_DIR, filename)

    with open(dest, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"ok": True, "url": f"uploads/fotos/{filename}"}

@app.post("/api/upload/plano")
async def upload_plano(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[1].lower() or '.png'
    filename = f"plano_{uuid.uuid4().hex[:10]}{ext}"
    dest = os.path.join(UPLOADS_PLANOS_DIR, filename)

    with open(dest, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"ok": True, "url": f"uploads/planos/{filename}"}

# --- Rutas para Vistas y Estáticos ---

@app.get("/")
@app.get("/index.html")
def serve_index():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

@app.get("/admin")
@app.get("/admin.html")
def serve_admin():
    return FileResponse(os.path.join(BASE_DIR, "admin.html"))

@app.get("/Admin.html")
def redirect_admin_case():
    return RedirectResponse(url="/admin.html", status_code=301)

# Montar directorios estáticos
app.mount("/uploads", StaticFiles(directory=os.path.join(BASE_DIR, "uploads")), name="uploads")
app.mount("/vendor", StaticFiles(directory=os.path.join(BASE_DIR, "vendor")), name="vendor")
app.mount("/css", StaticFiles(directory=os.path.join(BASE_DIR, "css")), name="css")
app.mount("/js", StaticFiles(directory=os.path.join(BASE_DIR, "js")), name="js")
if os.path.exists(os.path.join(BASE_DIR, "fotos_inventario")):
    app.mount("/fotos_inventario", StaticFiles(directory=os.path.join(BASE_DIR, "fotos_inventario")), name="fotos_inventario")
