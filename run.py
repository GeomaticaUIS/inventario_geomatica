import uvicorn
import socket
import sys

def find_available_port(default_port=8000, fallback_ports=(8080, 8001, 8500)):
    # Probar puerto por defecto primero
    ports_to_try = [default_port] + [p for p in fallback_ports if p != default_port]
    for port in ports_to_try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return default_port

if __name__ == "__main__":
    port = find_available_port(8000)

    print("=" * 65)
    print("  INVENTARIO GEOMÁTICA UIS - Servidor Local Seguro")
    print("=" * 65)
    if port != 8000:
        print(f"  [AVISO] El puerto 8000 está ocupado por otro proceso en tu equipo.")
        print(f"  -> Se ha seleccionado automáticamente el puerto {port}.\n")

    print(f"  • Consulta y Planos: http://localhost:{port}")
    print(f"  • Administración:   http://localhost:{port}/admin.html")
    print(f"  • En red local:     http://0.0.0.0:{port}")
    print(f"  • Base de datos:    data/inventario.db (SQLite)")
    print("  • Para detener el servidor presiona Ctrl + C en esta ventana")
    print("=" * 65)

    try:
        uvicorn.run(
            "backend.app:app",
            host="0.0.0.0",
            port=port,
            reload=False
        )
    except Exception as e:
        print(f"\n[ERROR] No se pudo iniciar el servidor: {e}")
