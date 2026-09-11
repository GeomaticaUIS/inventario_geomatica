import sqlite3
import json
import os
import hashlib
from typing import List, Dict, Optional, Any

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'inventario.db')
ITEMS_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'items.json')

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

    # 1. Salas reales de Geomática UIS
    salas_reales = [
        ("nuevo_geo", "Laboratorio Principal (Nuevo Geo)", "Laboratorio principal de Geomática y sensores", "uploads/planos/lab_geomatica.svg", 1200, 800),
        ("labvis", "Laboratorio de Visualización (LABVIS)", "Laboratorio de visualización y modelado 3D", "uploads/planos/sala_sistemas.svg", 1200, 800),
        ("oficina_jhon", "Oficina Jhon Cáceres", "Oficina de coordinación técnica", "uploads/planos/oficina_rectoria.svg", 1000, 700),
        ("oficina_yerly", "Oficina Yerly Martínez", "Oficina administrativa y gestión", "uploads/planos/oficina_rectoria.svg", 1000, 700),
        ("nueva_sala_aux", "Nueva Sala Auxiliar", "Sala auxiliar de cómputo y reuniones", "uploads/planos/sala_sistemas.svg", 1200, 800),
        ("datacenter", "Datacenter / Servidores", "Área de servidores y almacenamiento", "uploads/planos/sala_sistemas.svg", 1000, 700),
        ("oficina_rectoria", "Oficina Rectoría", "Despacho principal", "uploads/planos/oficina_rectoria.svg", 1000, 700),
        ("auditorio", "Auditorio", "Auditorio principal de eventos", "uploads/planos/auditorio.svg", 1000, 700)
    ]

    for s in salas_reales:
        cur.execute("""
            INSERT INTO salas (id, nombre, descripcion, plano_imagen, ancho, alto)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                nombre = excluded.nombre,
                descripcion = excluded.descripcion,
                plano_imagen = excluded.plano_imagen,
                ancho = excluded.ancho,
                alto = excluded.alto
        """, s)

    # 2. Usuarios del sistema
    cur.execute("""
        INSERT OR IGNORE INTO usuarios (usuario, password_hash, nombre, rol)
        VALUES 
            ('rector', '9b841968f952acd89807c2290958218c4cf808b763a3b5c0d1aaeca0a393a563', 'Hernán Porras (Rector)', 'admin'),
            ('jhon', '9b841968f952acd89807c2290958218c4cf808b763a3b5c0d1aaeca0a393a563', 'Jhon Cáceres', 'editor'),
            ('yerly', '9b841968f952acd89807c2290958218c4cf808b763a3b5c0d1aaeca0a393a563', 'Yerly Martínez', 'editor'),
            ('carlos', '9b841968f952acd89807c2290958218c4cf808b763a3b5c0d1aaeca0a393a563', 'Carlos García', 'editor')
    """)

    # 3. Migrar ítems desde data/items.json si la tabla está vacía
    cur.execute("SELECT COUNT(*) FROM items")
    if cur.fetchone()[0] == 0 and os.path.exists(ITEMS_JSON_PATH):
        try:
            with open(ITEMS_JSON_PATH, 'r', encoding='utf-8') as f:
                items = json.load(f)
                room_counters = {}

                for it in items:
                    item_id = str(it.get("id") or "").strip()
                    desc = (it.get("descripcion") or "").strip()
                    ub = (it.get("ubicacion") or "").strip()
                    ub_upper = ub.upper()
                    obs = (it.get("observacion") or "").strip()
                    tipo = (it.get("tipo_inventario") or "MAYOR").strip().upper()
                    if tipo not in ["MAYOR", "MENOR", "INTANGIBLE"]:
                        tipo = "MAYOR"

                    func = (it.get("funcionario") or "").strip()
                    func_upper = func.upper()
                    if "PORRAS" in func_upper or func_upper == "RECTOR":
                        func = "HERNAN PORRAS"
                    elif "CERES" in func_upper or func_upper == "JHON":
                        func = "JHON CÁCERES"
                    elif "MARTINEZ" in func_upper or func_upper == "YERLY":
                        func = "YERLY MARTINEZ"
                    elif "GARCIA" in func_upper or func_upper == "CARLOS":
                        func = "CARLOS GARCIA"

                    img = (it.get("imagen") or "").strip()
                    if not img or img.endswith("/") or not ("." in os.path.basename(img)):
                        img = ""

                    # Asignar sala según ubicación
                    if "NUEVO GEO" in ub_upper or "GEO" in ub_upper or "SALA SIG" in ub_upper:
                        sala_id = "nuevo_geo"
                    elif "LABVIS" in ub_upper:
                        sala_id = "labvis"
                    elif "JHON" in ub_upper:
                        sala_id = "oficina_jhon"
                    elif "YERLY" in ub_upper:
                        sala_id = "oficina_yerly"
                    elif "SALA AUX" in ub_upper or "ABP" in ub_upper:
                        sala_id = "nueva_sala_aux"
                    elif "DATACENTER" in ub_upper:
                        sala_id = "datacenter"
                    elif "RECTOR" in ub_upper:
                        sala_id = "oficina_rectoria"
                    elif "AUDITORIO" in ub_upper:
                        sala_id = "auditorio"
                    else:
                        sala_id = "nuevo_geo"

                    count = room_counters.get(sala_id, 0)
                    room_counters[sala_id] = count + 1
                    col = count % 8
                    row = (count // 8) % 6
                    pos_x = 280 + (col * 90)
                    pos_y = 220 + (row * 80)

                    cur.execute("""
                        INSERT OR REPLACE INTO items (id, descripcion, ubicacion, observacion, tipo_inventario, funcionario, imagen, sala_id, pos_x, pos_y, actualizado_en)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """, (item_id, desc, ub, obs, tipo, func, img, sala_id, float(pos_x), float(pos_y)))
        except Exception as e:
            print(f"Advertencia migrando items.json: {e}")

    # 4. Normalizar datos existentes para consistencia total en tipo y funcionario
    try:
        cur.execute("UPDATE items SET tipo_inventario = 'MAYOR' WHERE tipo_inventario IS NULL OR TRIM(tipo_inventario) = ''")
        cur.execute("UPDATE items SET tipo_inventario = UPPER(TRIM(tipo_inventario)) WHERE tipo_inventario IS NOT NULL")
        cur.execute("UPDATE items SET funcionario = 'JHON CÁCERES' WHERE funcionario = 'jhon' OR funcionario LIKE '%CERES%'")
        cur.execute("UPDATE items SET funcionario = 'HERNAN PORRAS' WHERE LOWER(funcionario) = 'rector'")
        cur.execute("UPDATE items SET funcionario = 'YERLY MARTINEZ' WHERE LOWER(funcionario) = 'yerly'")
        cur.execute("UPDATE items SET funcionario = 'CARLOS GARCIA' WHERE LOWER(funcionario) = 'carlos'")
        cur.execute("UPDATE usuarios SET nombre = 'Hernán Porras (Rector)' WHERE usuario = 'rector'")
        cur.execute("UPDATE usuarios SET nombre = 'Jhon Cáceres' WHERE usuario = 'jhon'")
        cur.execute("UPDATE usuarios SET nombre = 'Yerly Martínez' WHERE usuario = 'yerly'")
        cur.execute("UPDATE usuarios SET nombre = 'Carlos García' WHERE usuario = 'carlos'")
    except Exception as e:
        print(f"Advertencia normalizando datos: {e}")

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
