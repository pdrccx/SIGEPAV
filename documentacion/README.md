# Documentación técnica — SIGEPAV

Sistema de Gestión del Parque Vehicular · INNOVATEC 2026

Documentación de ingeniería del sistema: cómo está construido, cómo viaja la información
por dentro y cómo se despliega.

---

## Trazas de flujo

Cada traza recorre una funcionalidad **de punta a punta** —del clic en la pantalla hasta la
consulta SQL y de regreso— con diagramas y referencias `archivo:línea` al código real.
Siguen el modelo **entrada → proceso → estado interno → salida → fallo/limitación**.

| # | Flujo | Qué enseña | Estado |
|---|---|---|---|
| 1 | [Login y roles](flujos/01-login.md) | La puerta de entrada, el modelo de sesión y por qué la guardia de rol es de navegación y no de seguridad | ✅ |
| 2 | [Comisión completa](flujos/02-comision.md) | El corazón del sistema: la máquina de estados de una comisión, el candado de un vehículo a la vez, y por qué el operativo no puede cerrar su propia comisión | ✅ |
| 3 | [Reporte ciudadano por QR](flujos/03-reporte-ciudadano.md) | La única entrada sin sesión: los dos tokens, las cinco validaciones del endpoint más expuesto, y cómo finalizar una comisión resuelve reportes sola | ✅ |
| 4 | [Salud de la flota y el motor de IA](flujos/04-salud-flota-ia.md) | Por qué la IA no calcula nada: el algoritmo de urgencia de 5 factores, el catálogo que traduce el español del chofer, y el anclaje anti-alucinación | ✅ |
| 5 | Vale de gasolina + medidor | El cruce al servicio de Python/Flask por proxy interno | ⬜ |

> Los diagramas están en formato **Mermaid**: se renderizan solos en GitHub y siguen siendo
> texto plano, así que se versionan y se editan sin depender de un programa de dibujo.

## Despliegue

Instrucciones de puesta en marcha en distintos entornos.

| Documento | Entorno |
|---|---|
| [INSTRUCCIONES_AZURE_SIGEPAV.txt](despliegue/INSTRUCCIONES_AZURE_SIGEPAV.txt) | Servidor en Azure |
| [INSTRUCCIONES_NGROK_SIGEPAV.txt](despliegue/INSTRUCCIONES_NGROK_SIGEPAV.txt) | Exposición pública con ngrok |
| [INSTRUCCIONES_LARAGON_NGROK.txt](despliegue/INSTRUCCIONES_LARAGON_NGROK.txt) | Entorno local con Laragon |

> ⚠️ **Estos tres archivos traen rutas y comandos desactualizados.** Revísalos antes de
> seguirlos al pie de la letra:
>
> - Mencionan la carpeta `Gesti-n-Vehicular-main`, renombrada a `SIGEPAV`.
> - Mencionan scripts que hoy viven en `scripts/`, o que **ya no existen**:
>   `detener-sigepav.ps1` y `detener-todo-ngrok.ps1` se eliminaron porque mataban
>   *todos* los procesos `node.exe` y `python.exe` de la máquina, no solo los de
>   SIGEPAV. Se reemplazaron por `APAGAR-SIGEPAV.bat` en la raíz, que cierra por
>   título de ventana.
> - `INSTRUCCIONES_LARAGON_NGROK.txt` habla del servicio `MySQL80`; el entorno local
>   usa `MySQL84`.

## Otros documentos del proyecto

| Documento | Para qué sirve |
|---|---|
| [`../README.md`](../README.md) | Presentación general y cómo ejecutar el sistema |
| [`../CLAUDE.md`](../CLAUDE.md) | Mapa estático de la arquitectura: qué existe, cómo se organiza y dónde están las trampas |
| [`../CONTEXTO-SIGEPAV.md`](../CONTEXTO-SIGEPAV.md) | Bitácora de en qué se quedó el trabajo entre sesiones |

**La diferencia entre `CLAUDE.md` y esta carpeta:** `CLAUDE.md` es el mapa —qué existe y
dónde. Las trazas de `flujos/` son el recorrido —qué pasa cuando alguien usa el sistema.
El mapa te ubica; la traza te explica.
