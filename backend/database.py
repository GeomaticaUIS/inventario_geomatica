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
        categoria TEXT DEFAULT 'otro',
        sala_id TEXT REFERENCES salas(id) ON DELETE SET NULL,
        pos_x REAL,
        pos_y REAL,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Migración de columna categoria si la tabla items ya existía previamente
    cur.execute("PRAGMA table_info(items)")
    cols = [row["name"] for row in cur.fetchall()]
    if "categoria" not in cols:
        cur.execute("ALTER TABLE items ADD COLUMN categoria TEXT DEFAULT 'otro'")

    conn.commit()

    # Migrar datos si es necesario
    _migrate_initial_data(conn)
    conn.close()

def _migrate_initial_data(conn: sqlite3.Connection):
    cur = conn.cursor()

    # 1. Salas reales de Geomática UIS
    salas_reales = [
        ("nuevo_geo", "Laboratorio Principal (Nuevo Geo)", "Laboratorio principal de Geomática y sensores", "uploads/planos/plano_nuevo_geo.svg", 1200, 1200),
        ("labvis", "Laboratorio de Visualización (LABVIS)", "Laboratorio de visualización y modelado 3D", "uploads/planos/sala_sistemas.svg", 1200, 800),
        ("oficina_jhon", "Oficina Jhon Cáceres", "Oficina de coordinación técnica", "uploads/planos/oficina_rectoria.svg", 1000, 700),
        ("oficina_yerly", "Oficina Yerly Martínez", "Oficina administrativa y gestión", "uploads/planos/oficina_rectoria.svg", 1000, 700),
        ("nueva_sala_aux", "Nueva Sala Auxiliar", "Sala auxiliar de cómputo y reuniones", "uploads/planos/plano_nueva_sala_aux.svg", 1200, 800),
        ("datacenter", "Datacenter / Servidores", "Área de servidores y almacenamiento", "uploads/planos/plano_datacenter.svg", 1200, 800),
        ("recepcion", "Recepción", "Área de recepción y atención", "uploads/planos/plano_recepcion.svg", 1000, 700),
        ("oficina_rectoria", "Oficina Rectoría", "Despacho principal", "uploads/planos/oficina_rectoria.svg", 1000, 700),
        ("auditorio", "Auditorio", "Auditorio principal de eventos", "uploads/planos/auditorio.svg", 1000, 700)
    ]

    for s in salas_reales:
        cur.execute("""
            INSERT OR IGNORE INTO salas (id, nombre, descripcion, plano_imagen, ancho, alto)
            VALUES (?, ?, ?, ?, ?, ?)
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

    # 5. Auto-clasificar categorías de ítems para visualización gráfica con iconos
    try:
        cur.execute("SELECT id, descripcion, categoria FROM items")
        for r in cur.fetchall():
            curr_cat = r["categoria"]
            if not curr_cat or curr_cat in ("otro", "computador"):
                auto_cat = classify_item_category(r["descripcion"])
                if auto_cat != "otro" or not curr_cat:
                    cur.execute("UPDATE items SET categoria = ? WHERE id = ?", (auto_cat, r["id"]))
    except Exception as e:
        print(f"Advertencia clasificando ítems: {e}")

    conn.commit()

def classify_item_category(descripcion: str) -> str:
    """Clasifica automáticamente el ítem en una categoría reconocible según palabras clave."""
    d = (descripcion or '').upper()
    if 'PORTATIL' in d or 'LAPTOP' in d or 'PRECISION 3581' in d:
        return 'portatil'
    if any(k in d for k in ['IPAD', 'TABLET', 'TABLETA', 'APPLE PENCIL', 'MAGIC KEYBOARD', 'MAGIC MOUSE']):
        return 'tablet'
    if any(k in d for k in ['DRON', 'MAVIC', 'UAV']):
        return 'dron'
    if any(k in d for k in ['GNSS', 'GPS', 'GARMIN', 'TRIMBLE', 'SOUTH', 'GALAXY G7', 'ESTACION', 'ANTENA', 'SURVSTAR']):
        return 'gnss'
    if any(k in d for k in ['SERVIDOR', 'RACK', 'SAN', 'STORAGE', 'DISCO P2000', 'KVM']):
        return 'servidor'
    if any(k in d for k in ['TELEFONO', 'SWITCH', 'ROUTER', 'PATCH']):
        return 'red'
    if any(k in d for k in ['VIDEO BEAM', 'TELEVISOR', 'TV', 'BRAVIA', 'PROYECTOR', 'PLC-XD2200']):
        return 'proyector'
    if any(k in d for k in ['IMPRESORA', 'PLOTTER', 'ESCANER', 'SCANNER']):
        return 'impresora'
    if any(k in d for k in ['CAMARA', 'SENSOR', 'LIDAR', 'FOTOMETRO', 'ESPECTRO']):
        return 'camara'
    if any(k in d for k in ['UPS', 'ESTABILIZADOR', 'BATERIA', 'POWERCOM', 'ENERGEX']):
        return 'energia'
    if any(k in d for k in ['MESA', 'SILLA', 'ESCALERA', 'ARTECMA', 'ARCHIVADOR', 'GABINETE']):
        return 'mueble'
    # Distinción precisa: PC Torre con Pantalla, Torre sin Pantalla, Pantalla Sola
    if 'MINITORRE' in d or 'TORRE' in d or 'PRECISION 3680' in d or 'HP Z' in d or 'SFF' in d:
        if 'MONITOR' in d or 'PANTALLA' in d:
            return 'pc_pantalla'
        return 'torre'
    if 'ALL IN ONE' in d or 'TODO EN UNO' in d or 'IMAC' in d or ('COMPUTADOR' in d and ('MONITOR' in d or 'PANTALLA' in d)):
        return 'pc_pantalla'
    if 'MONITOR' in d or 'PANTALLA' in d:
        return 'monitor'
    if 'WORKSTATION' in d or 'COMPUTADOR' in d or 'PC' in d:
        return 'torre'
    return 'otro'

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

def list_items(
    search: Optional[str] = None,
    tipo: Optional[str] = None,
    funcionario: Optional[str] = None,
    sala_id: Optional[str] = None,
    categoria: Optional[str] = None
) -> List[Dict[str, Any]]:
    conn = get_connection()
    cur = conn.cursor()

    sql = """
        SELECT i.id, i.descripcion, i.ubicacion, i.observacion, i.tipo_inventario, i.funcionario,
               i.imagen, i.categoria, i.sala_id, i.pos_x, i.pos_y, i.actualizado_en,
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

    if categoria:
        cat_norm = categoria.strip().lower()
        if cat_norm in ('pc_pantalla', 'computador'):
            sql += " AND i.categoria IN ('pc_pantalla', 'computador')"
        else:
            sql += " AND i.categoria = ?"
            params.append(cat_norm)

    if search:
        term = f"%{search.strip().lower()}%"
        sql += " AND (LOWER(i.id) LIKE ? OR LOWER(i.descripcion) LIKE ? OR LOWER(i.ubicacion) LIKE ? OR LOWER(i.observacion) LIKE ? OR LOWER(i.funcionario) LIKE ? OR LOWER(i.categoria) LIKE ?)"
        params.extend([term, term, term, term, term, term])

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
               i.imagen, i.categoria, i.sala_id, i.pos_x, i.pos_y, i.actualizado_en,
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

    cat = (it.get("categoria") or "").strip().lower()
    if not cat:
        cat = classify_item_category(it.get("descripcion", ""))
    it["categoria"] = cat

    cur.execute("""
        INSERT INTO items (id, descripcion, ubicacion, observacion, tipo_inventario, funcionario, imagen, categoria, sala_id, pos_x, pos_y, actualizado_en)
        VALUES (:id, :descripcion, :ubicacion, :observacion, :tipo_inventario, :funcionario, :imagen, :categoria, :sala_id, :pos_x, :pos_y, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            descripcion = excluded.descripcion,
            ubicacion = excluded.ubicacion,
            observacion = excluded.observacion,
            tipo_inventario = excluded.tipo_inventario,
            funcionario = excluded.funcionario,
            imagen = CASE WHEN excluded.imagen IS NOT NULL AND excluded.imagen != '' THEN excluded.imagen ELSE items.imagen END,
            categoria = excluded.categoria,
            sala_id = excluded.sala_id,
            pos_x = excluded.pos_x,
            pos_y = excluded.pos_y,
            actualizado_en = CURRENT_TIMESTAMP
    """, it)
    conn.commit()
    conn.close()
    return get_item(it["id"])

def batch_update_positions(updates: List[Dict[str, Any]]) -> int:
    """Actualiza en una sola transacción las posiciones espaciales y/o categorías de múltiples ítems."""
    conn = get_connection()
    cur = conn.cursor()
    updated_count = 0
    for item in updates:
        item_id = str(item.get("id") or "").strip()
        if not item_id:
            continue

        set_clauses = ["actualizado_en = CURRENT_TIMESTAMP"]
        params = []

        if "pos_x" in item:
            val = item.get("pos_x")
            set_clauses.append("pos_x = ?")
            params.append(float(val) if val is not None else None)

        if "pos_y" in item:
            val = item.get("pos_y")
            set_clauses.append("pos_y = ?")
            params.append(float(val) if val is not None else None)

        if "sala_id" in item:
            val = item.get("sala_id")
            set_clauses.append("sala_id = ?")
            params.append(val if val else None)

        if "categoria" in item and item.get("categoria"):
            set_clauses.append("categoria = ?")
            params.append(item.get("categoria").strip().lower())

        params.append(item_id)
        cur.execute(f"UPDATE items SET {', '.join(set_clauses)} WHERE id = ?", params)
        if cur.rowcount > 0:
            updated_count += 1

    conn.commit()
    conn.close()
    return updated_count

def update_item_categoria(item_id: str, categoria: str) -> bool:
    """Actualiza rápidamente la categoría de un ítem."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE items SET categoria = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?", (categoria.strip().lower(), item_id))
    affected = cur.rowcount > 0
    conn.commit()
    conn.close()
    return affected

def delete_item(item_id: str) -> bool:
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM items WHERE id = ?", (item_id,))
    affected = cur.rowcount > 0
    conn.commit()
    conn.close()
    return affected
