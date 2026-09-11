import sqlite3
import json
import os
import hashlib
from typing import List, Dict, Optional, Any

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'inventario.db')
ITEMS_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'items.json')
CREDENTIALS_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'credentials.json')

def hash_password(password: str) -> str:
    """Calcula el hash SHA-256 de una contraseña."""
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def get_connection() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn

def init_db():
    conn = get_connection()
    cur = conn.cursor()

    # 1. Tabla de Usuarios
    cur.execute("""
    CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        nombre TEXT NOT NULL,
        rol TEXT DEFAULT 'editor',
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Tabla de Salas / Espacios
    cur.execute("""
    CREATE TABLE IF NOT EXISTS salas (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        descripcion TEXT,
        plano_imagen TEXT NOT NULL,
        ancho INTEGER NOT NULL DEFAULT 1000,
        alto INTEGER NOT NULL DEFAULT 700,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 3. Tabla de Ítems de Inventario
    cur.execute("""
    CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY,
        descripcion TEXT NOT NULL,
        ubicacion TEXT,
        observacion TEXT,
        tipo_inventario TEXT NOT NULL,
        funcionario TEXT,
        imagen TEXT,
        sala_id TEXT REFERENCES salas(id) ON DELETE SET NULL,
        pos_x REAL,
        pos_y REAL,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.commit()

    # Migrar datos si la base de datos está vacía
    _migrate_initial_data(conn)
    conn.close()

def _migrate_initial_data(conn: sqlite3.Connection):
    cur = conn.cursor()

    # 1. Salas por defecto
    salas_defecto = [
        ("oficina_rectoria", "Oficina Rectoría", "Oficina principal y sala de reuniones", "uploads/planos/oficina_rectoria.svg", 1000, 700),
        ("sala_sistemas", "Sala de Sistemas", "Aulas de cómputo y servidores", "uploads/planos/sala_sistemas.svg", 1200, 800),
        ("lab_geomatica", "Laboratorio de Geomática UIS", "Área de sensores, topografía y procesamiento SIG", "uploads/planos/lab_geomatica.svg", 1200, 800),
        ("auditorio", "Auditorio", "Auditorio principal de eventos y presentaciones", "uploads/planos/auditorio.svg", 1000, 700)
    ]

    for s in salas_defecto:
        cur.execute("""
            INSERT OR IGNORE INTO salas (id, nombre, descripcion, plano_imagen, ancho, alto)
            VALUES (?, ?, ?, ?, ?, ?)
        """, s)

    # 2. Migrar credenciales
    cur.execute("SELECT COUNT(*) FROM usuarios")
    if cur.fetchone()[0] == 0 and os.path.exists(CREDENTIALS_JSON_PATH):
        try:
            with open(CREDENTIALS_JSON_PATH, 'r', encoding='utf-8') as f:
                creds = json.load(f)
                for c in creds:
                    cur.execute("""
                        INSERT OR IGNORE INTO usuarios (usuario, password_hash, nombre, rol)
                        VALUES (?, ?, ?, ?)
                    """, (c["usuario"].strip().lower(), c["hash"], c.get("nombre", c["usuario"]), "admin" if c["usuario"] == "rector" else "editor"))
        except Exception as e:
            print(f"Advertencia migrando credentials.json: {e}")

    # 3. Migrar ítems
    cur.execute("SELECT COUNT(*) FROM items")
    if cur.fetchone()[0] == 0 and os.path.exists(ITEMS_JSON_PATH):
        try:
            with open(ITEMS_JSON_PATH, 'r', encoding='utf-8') as f:
                items = json.load(f)
                for it in items:
                    ub = (it.get("ubicacion") or "").lower()
                    sala_id = None
                    pos_x = None
                    pos_y = None

                    # Asignación espacial inteligente inicial
                    if "rector" in ub:
                        sala_id = "oficina_rectoria"
                        pos_x, pos_y = (260.0, 230.0) if it["id"] == "1001" else (255.0, 200.0)
                    elif "sistema" in ub or "profesor" in ub:
                        sala_id = "sala_sistemas"
                        pos_x, pos_y = (260.0, 240.0) if it["id"] == "1003" else (350.0, 370.0)
                    elif "auditorio" in ub:
                        sala_id = "auditorio"
                        pos_x, pos_y = (500.0, 350.0)
                    else:
                        sala_id = "lab_geomatica"
                        pos_x, pos_y = (660.0, 530.0)

                    cur.execute("""
                        INSERT OR IGNORE INTO items (id, descripcion, ubicacion, observacion, tipo_inventario, funcionario, imagen, sala_id, pos_x, pos_y)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        it["id"],
                        it.get("descripcion", ""),
                        it.get("ubicacion", ""),
                        it.get("observacion", ""),
                        it.get("tipo_inventario", "Mayor"),
                        it.get("funcionario", ""),
                        it.get("imagen", ""),
                        sala_id,
                        pos_x,
                        pos_y
                    ))
        except Exception as e:
            print(f"Advertencia migrando items.json: {e}")

    conn.commit()

# --- Funciones de Acceso a Datos (CRUD) ---

def verify_credentials(usuario: str, password: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    h = hash_password(password)
    cur.execute("SELECT id, usuario, nombre, rol FROM usuarios WHERE LOWER(usuario) = ? AND password_hash = ?",
                (usuario.strip().lower(), h))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

def list_all_usuarios() -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, usuario, nombre, rol FROM usuarios ORDER BY nombre ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def list_salas() -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, nombre, descripcion, plano_imagen, ancho, alto FROM salas ORDER BY nombre ASC")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def get_sala(sala_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, nombre, descripcion, plano_imagen, ancho, alto FROM salas WHERE id = ?", (sala_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

def upsert_sala(s: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO salas (id, nombre, descripcion, plano_imagen, ancho, alto)
        VALUES (:id, :nombre, :descripcion, :plano_imagen, :ancho, :alto)
        ON CONFLICT(id) DO UPDATE SET
            nombre = excluded.nombre,
            descripcion = excluded.descripcion,
            plano_imagen = excluded.plano_imagen,
            ancho = excluded.ancho,
            alto = excluded.alto
    """, s)
    conn.commit()
    conn.close()
    return s

def delete_sala(sala_id: str) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE items SET sala_id = NULL, pos_x = NULL, pos_y = NULL WHERE sala_id = ?", (sala_id,))
    cur.execute("DELETE FROM salas WHERE id = ?", (sala_id,))
    affected = cur.rowcount > 0
    conn.commit()
    conn.close()
    return affected

def list_items(search: Optional[str] = None, tipo: Optional[str] = None, funcionario: Optional[str] = None, sala_id: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()

    sql = """
        SELECT i.id, i.descripcion, i.ubicacion, i.observacion, i.tipo_inventario, i.funcionario,
               i.imagen, i.sala_id, i.pos_x, i.pos_y, i.actualizado_en,
               s.nombre as sala_nombre, s.plano_imagen as sala_plano, s.ancho as sala_ancho, s.alto as sala_alto
        FROM items i
        LEFT JOIN salas s ON i.sala_id = s.id
        WHERE 1=1
    """
    params = []

    if tipo:
        sql += " AND i.tipo_inventario = ?"
        params.append(tipo)

    if funcionario:
        sql += " AND i.funcionario = ?"
        params.append(funcionario)

    if sala_id:
        sql += " AND i.sala_id = ?"
        params.append(sala_id)

    if search:
        term = f"%{search.strip().lower()}%"
        sql += " AND (LOWER(i.id) LIKE ? OR LOWER(i.descripcion) LIKE ? OR LOWER(i.ubicacion) LIKE ? OR LOWER(i.observacion) LIKE ? OR LOWER(i.funcionario) LIKE ?)"
        params.extend([term, term, term, term, term])

    sql += " ORDER BY i.id ASC"

    cur.execute(sql, params)
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def get_item(item_id: str) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT i.id, i.descripcion, i.ubicacion, i.observacion, i.tipo_inventario, i.funcionario,
               i.imagen, i.sala_id, i.pos_x, i.pos_y, i.actualizado_en,
               s.nombre as sala_nombre, s.plano_imagen as sala_plano
        FROM items i
        LEFT JOIN salas s ON i.sala_id = s.id
        WHERE i.id = ?
    """, (item_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

def upsert_item(it: Dict[str, Any]) -> Dict[str, Any]:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO items (id, descripcion, ubicacion, observacion, tipo_inventario, funcionario, imagen, sala_id, pos_x, pos_y, actualizado_en)
        VALUES (:id, :descripcion, :ubicacion, :observacion, :tipo_inventario, :funcionario, :imagen, :sala_id, :pos_x, :pos_y, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            descripcion = excluded.descripcion,
            ubicacion = excluded.ubicacion,
            observacion = excluded.observacion,
            tipo_inventario = excluded.tipo_inventario,
            funcionario = excluded.funcionario,
            imagen = CASE WHEN excluded.imagen IS NOT NULL AND excluded.imagen != '' THEN excluded.imagen ELSE items.imagen END,
            sala_id = excluded.sala_id,
            pos_x = excluded.pos_x,
            pos_y = excluded.pos_y,
            actualizado_en = CURRENT_TIMESTAMP
    """, it)
    conn.commit()
    conn.close()
    return get_item(it["id"])

def delete_item(item_id: str) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM items WHERE id = ?", (item_id,))
    affected = cur.rowcount > 0
    conn.commit()
    conn.close()
    return affected
