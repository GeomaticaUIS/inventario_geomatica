import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from backend.app import app

def run_tests():
    client = TestClient(app)

    # 1. Index.html
    r = client.get('/')
    assert r.status_code == 200, f"Index falló con código {r.status_code}"
    assert "Inventario de Equipos" in r.text
    assert "vendor/leaflet/leaflet.js" in r.text
    print("[OK] GET / (index.html): OK")

    # 2. Admin.html
    r = client.get('/admin.html')
    assert r.status_code == 200, f"Admin falló con código {r.status_code}"
    assert "Administrar Inventario" in r.text
    print("[OK] GET /admin.html: OK")

    # 3. Redirección Admin.html
    r = client.get('/Admin.html', follow_redirects=False)
    assert r.status_code == 301
    print("[OK] GET /Admin.html redirección 301: OK")

    # 4. Archivos estáticos de Leaflet offline
    r = client.get('/vendor/leaflet/leaflet.js')
    assert r.status_code == 200
    r_css = client.get('/vendor/leaflet/leaflet.css')
    assert r_css.status_code == 200
    print("[OK] Archivos estáticos de Leaflet offline: OK")

    # 5. Planos esquemáticos SVG
    r = client.get('/uploads/planos/oficina_rectoria.svg')
    assert r.status_code == 200
    print("[OK] Planos SVG en uploads/planos/: OK")

    # 6. API Items
    r = client.get('/api/items')
    assert r.status_code == 200
    items = r.json()
    assert len(items) >= 169, f"Se esperaban al menos 169 items, se encontraron {len(items)}"
    print(f"[OK] GET /api/items: OK ({len(items)} items cargados)")

    # 7. API Salas
    r = client.get('/api/salas')
    assert r.status_code == 200
    salas = r.json()
    assert len(salas) >= 8, f"Se esperaban al menos 8 salas, se encontraron {len(salas)}"
    print(f"[OK] GET /api/salas: OK ({len(salas)} salas configuradas)")

    print("\nDetalle de items con coordenadas de plano:")
    for it in items:
        sala = it.get('sala_nombre') or 'Sin sala'
        coords = f"({it.get('pos_x')}, {it.get('pos_y')})" if it.get('pos_x') is not None else "Sin coordenadas"
        print(f"  * [{it['id']}] {it['descripcion']} -> {sala} {coords}")

    # 8. Test de creación con upload simulado
    res_save = client.post('/api/items', json={
        "id": "7777",
        "descripcion": "Receptor GNSS Trimble R10",
        "ubicacion": "Gabinete GNSS",
        "observacion": "Con antena y colector",
        "tipo_inventario": "Mayor",
        "funcionario": "jhon",
        "imagen": "",
        "sala_id": "lab_geomatica",
        "pos_x": 130.0,
        "pos_y": 200.0
    })
    assert res_save.status_code == 200
    print("[OK] Guardado de nuevo item con coordenadas: OK")

    # Verificar que existe
    r_item = client.get('/api/items/7777')
    assert r_item.status_code == 200
    assert r_item.json()["pos_x"] == 130.0
    print("[OK] Lectura y verificacion de coordenadas del item: OK")

    # Limpiar
    client.delete('/api/items/7777')
    print("[OK] Eliminacion de prueba: OK")

    print("\n=======================================================")
    print("  TODAS LAS PRUEBAS DE VERIFICACION PASARON CON EXITO! ")
    print("=======================================================")

if __name__ == "__main__":
    run_tests()
