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

    # Test de diseño y guardado de plano SVG
    test_svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect x="10" y="10" width="100" height="80"/><text x="60" y="50">Test Mesa</text></svg>'
    res_design = client.post('/api/salas/design', json={
        "id": "sala_test_svg",
        "nombre": "Sala de Prueba SVG",
        "descripcion": "Sala para verificar edición de SVG",
        "ancho": 1000,
        "alto": 700,
        "svg_content": test_svg
    })
    assert res_design.status_code == 200
    assert os.path.exists("uploads/planos/plano_sala_test_svg.svg")
    client.delete('/api/salas/sala_test_svg')
    if os.path.exists("uploads/planos/plano_sala_test_svg.svg"):
        os.remove("uploads/planos/plano_sala_test_svg.svg")
    print("[OK] POST /api/salas/design y verificación de archivo SVG: OK")

    print("\nDetalle de items con coordenadas de plano:")
    for it in items:
        sala = it.get('sala_nombre') or 'Sin sala'
        coords = f"({it.get('pos_x')}, {it.get('pos_y')})" if it.get('pos_x') is not None else "Sin coordenadas"
        print(f"  * [{it['id']}] {it['descripcion']} -> {sala} {coords}")

    # 8. Test de creación con upload simulado y categoría
    res_save = client.post('/api/items', json={
        "id": "7777",
        "descripcion": "Receptor GNSS Trimble R10",
        "ubicacion": "Gabinete GNSS",
        "observacion": "Con antena y colector",
        "tipo_inventario": "Mayor",
        "categoria": "gnss",
        "funcionario": "jhon",
        "imagen": "",
        "sala_id": "nuevo_geo",
        "pos_x": 130.0,
        "pos_y": 200.0
    })
    assert res_save.status_code == 200
    print("[OK] Guardado de nuevo item con coordenadas y categoría: OK")

    # Verificar que existe y tiene categoría gnss
    r_item = client.get('/api/items/7777')
    assert r_item.status_code == 200
    assert r_item.json()["pos_x"] == 130.0
    assert r_item.json()["tipo_inventario"] == "MAYOR"
    assert r_item.json()["funcionario"] == "JHON CÁCERES"
    assert r_item.json()["categoria"] == "gnss"
    print("[OK] Lectura y verificacion de coordenadas y categoría del item: OK")

    # 9. Test de actualización rápida de categoría (PATCH)
    r_patch = client.patch('/api/items/7777/categoria', json={"categoria": "dron"})
    assert r_patch.status_code == 200
    assert r_patch.json()["categoria"] == "dron"
    r_item2 = client.get('/api/items/7777')
    assert r_item2.json()["categoria"] == "dron"
    print("[OK] PATCH /api/items/7777/categoria: OK")

    # 10. Test de guardado de posiciones en lote (Batch update)
    res_save2 = client.post('/api/items', json={
        "id": "7778",
        "descripcion": "Monitor Dell UltraSharp 27",
        "ubicacion": "Mesa 1",
        "tipo_inventario": "Mayor",
        "categoria": "monitor",
        "sala_id": "nuevo_geo",
        "pos_x": 300.0,
        "pos_y": 400.0
    })
    assert res_save2.status_code == 200

    r_batch = client.post('/api/items/batch-positions', json={
        "items": [
            {"id": "7777", "pos_x": 180.0, "pos_y": 250.0, "sala_id": "nuevo_geo"},
            {"id": "7778", "pos_x": 350.0, "pos_y": 450.0, "sala_id": "nuevo_geo", "categoria": "torre"}
        ]
    })
    assert r_batch.status_code == 200
    assert r_batch.json()["updated_count"] == 2

    # Verificar nuevas posiciones en base de datos
    v1 = client.get('/api/items/7777').json()
    v2 = client.get('/api/items/7778').json()
    assert v1["pos_x"] == 180.0 and v1["pos_y"] == 250.0
    assert v2["pos_x"] == 350.0 and v2["pos_y"] == 450.0 and v2["categoria"] == "torre"
    print("[OK] POST /api/items/batch-positions (Edición masiva de coordenadas y categoría): OK")

    # 11. Test de filtrado por categoría (monitor, torre, pc_pantalla)
    r_mon = client.get('/api/items?categoria=monitor')
    assert r_mon.status_code == 200
    assert len(r_mon.json()) > 0
    print(f"[OK] GET /api/items?categoria=monitor: OK ({len(r_mon.json())} pantallas encontradas)")

    r_torre = client.get('/api/items?categoria=torre')
    assert r_torre.status_code == 200
    assert len(r_torre.json()) > 0
    print(f"[OK] GET /api/items?categoria=torre: OK ({len(r_torre.json())} torres encontradas)")

    r_pc = client.get('/api/items?categoria=pc_pantalla')
    assert r_pc.status_code == 200
    assert len(r_pc.json()) > 0
    print(f"[OK] GET /api/items?categoria=pc_pantalla: OK ({len(r_pc.json())} PCs con pantalla encontrados)")

    # Limpiar
    client.delete('/api/items/7777')
    client.delete('/api/items/7778')
    print("[OK] Eliminacion de prueba: OK")

    print("\n=======================================================")
    print("  TODAS LAS PRUEBAS DE VERIFICACION PASARON CON EXITO! ")
    print("=======================================================")

if __name__ == "__main__":
    run_tests()
