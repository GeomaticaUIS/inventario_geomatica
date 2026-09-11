import sqlite3
import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, 'data', 'inventario.db')
ITEMS_JSON_PATH = os.path.join(BASE_DIR, 'data', 'items.json')

def run_migration():
    conn = sqlite3.connect(DB_PATH)
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

    # 2. Cargar datos de data/items.json
    with open(ITEMS_JSON_PATH, 'r', encoding='utf-8') as f:
        items = json.load(f)

    print(f"Cargando {len(items)} items desde data/items.json...")

    # Contadores para distribuir pines en las mesas de cada sala
    room_counters = {}

    cur.execute("DELETE FROM items;") # Reemplazar con el inventario real completo

    for it in items:
        item_id = str(it.get("id") or "").strip()
        desc = (it.get("descripcion") or "").strip()
        ub = (it.get("ubicacion") or "").strip()
        ub_upper = ub.upper()
        obs = (it.get("observacion") or "").strip()
        tipo = (it.get("tipo_inventario") or "MAYOR").strip().upper()
        func = (it.get("funcionario") or "").strip()

        # Limpiar ruta de imagen: si es solo carpeta o null, dejar vacío
        img = (it.get("imagen") or "").strip()
        if not img or img.endswith("/") or not ("." in os.path.basename(img)):
            img = ""

        # Asignar sala según la ubicación
        sala_id = None
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

        # Coordenadas inteligentes en cuadrícula sobre las mesas de la sala
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

    # 3. Asegurar usuarios en tabla usuarios
    cur.execute("""
        INSERT OR IGNORE INTO usuarios (usuario, password_hash, nombre, rol)
        VALUES 
            ('rector', '9b841968f952acd89807c2290958218c4cf808b763a3b5c0d1aaeca0a393a563', 'Hernán Porras (Rector)', 'admin'),
            ('jhon', '9b841968f952acd89807c2290958218c4cf808b763a3b5c0d1aaeca0a393a563', 'Jhon Cáceres', 'editor'),
            ('yerly', '9b841968f952acd89807c2290958218c4cf808b763a3b5c0d1aaeca0a393a563', 'Yerly Martínez', 'editor'),
            ('carlos', '9b841968f952acd89807c2290958218c4cf808b763a3b5c0d1aaeca0a393a563', 'Carlos García', 'editor')
    """)

    conn.commit()

    cur.execute("SELECT COUNT(*) FROM items;")
    total_items = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM salas;")
    total_salas = cur.fetchone()[0]
    conn.close()

    print(f"Migración completada con éxito: {total_items} ítems en SQLite y {total_salas} salas configuradas.")

if __name__ == "__main__":
    run_migration()
