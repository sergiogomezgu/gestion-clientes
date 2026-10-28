# Gestión de clientes

Aplicación local para gestionar clientes, sus contactos y consultar sus facturas e historial.

## Cómo arrancar

Necesitas Docker Desktop abierto. Desde PowerShell, en la carpeta del proyecto, crea el archivo `.env` y sus claves:

```powershell
Copy-Item .env.example .env
$apiToken = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
$databasePassword = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
"API_TOKEN=$apiToken`nPOSTGRES_PASSWORD=$databasePassword" | Set-Content .env -Encoding ascii
```

Inicia la aplicación:

```powershell
docker compose up --build -d
```

Abre <http://localhost:3000> e inicia sesión con el valor de `API_TOKEN` y tu nombre.

Para cargar los datos de ejemplo:

```powershell
docker compose run --rm app npm run import:csv -- data/clientes_antiguos.csv
```

La importación se puede repetir sin duplicar facturas. Para detener la aplicación:

```powershell
docker compose down
```

Los datos se conservan al detenerla. Para borrar también la base de datos de prueba, ejecuta `docker compose down -v`.

## Uso de IA

Resumen de las peticiones principales; están redactadas de forma resumida y no son transcripciones literales:

- «Crea una aplicación sencilla de gestión de clientes con Node.js, Express, PostgreSQL y Docker Compose, siguiendo los requisitos del enunciado.»
- «Revisa el CSV de clientes: normaliza CIF, fechas e importes, evita facturas duplicadas y avisa de las filas inválidas o dudosas.»
- «Añade una interfaz en español para buscar y filtrar clientes, consultar sus contactos, facturas e historial, y mantener clientes y contactos.»
- «Organiza el proyecto en partes claras para que la pantalla, las peticiones, el acceso a la base de datos y las pruebas sean fáciles de encontrar y explicar.»
- «Comprueba que la solución cubre los requisitos de la web y añade pruebas sin cambiar el aspecto de la interfaz.»

## Cómo probar la API

1. Abre `requests.http` en VS Code. Si no tienes la extensión REST Client, instálala.
2. Cambia el valor de `@token` por el `API_TOKEN` de `.env`.
3. Pulsa **Send Request** encima de una petición. La ruta de salud se puede probar sin token; las demás usan el token.

El archivo incluye consultas para comprobar la aplicación, ver la lista, abrir la ficha y consultar el historial. Son ejemplos de lectura: no cambian ni borran datos.

`.gitignore` excluye los archivos de configuración local; `.env.example` es solo una plantilla sin claves.

Para ejecutar los tests:

```powershell
docker compose run --rm app npm test
```

## Decisiones técnicas

- Uso PostgreSQL para guardar clientes, contactos, facturas e historial.
- La pantalla, las peticiones y las consultas a la base de datos están separadas en `public/` y `src/`.
- Las facturas se importan desde el CSV y se pueden consultar, pero no se editan manualmente desde la aplicación.
- La importación evita duplicados y avisa cuando encuentra datos inválidos o dudosos.
- La facturación acumulada suma las bases imponibles, sin IVA.
- La aplicación usa un token compartido, suficiente para probarla en local, pero no pensado para producción.

## Qué dejaría para más adelante

- Añadir usuarios individuales, permisos y una forma más completa de iniciar sesión.
- Preparar la aplicación para publicarla de forma segura fuera del equipo local.
- Añadir copias de seguridad y una forma controlada de actualizar la base de datos.
- Ampliar las pruebas con más casos de uso reales.
