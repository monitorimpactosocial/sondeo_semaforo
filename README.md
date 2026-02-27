# PARACEL · Sondeo Semáforo

Cuestionario breve para monitoreo de clima social y alerta temprana.  
PWA (Progressive Web App) con soporte offline y sincronización automática.

## Estructura del proyecto

```
├── app/
│   ├── index.html      ← Formulario de encuesta (PWA)
│   ├── app.js          ← Lógica, skip logic, cálculo de semáforo
│   ├── styles.css      ← Estilos
│   ├── idb.js          ← Helper IndexedDB para modo offline
│   ├── sw.js           ← Service Worker (cache offline)
│   ├── manifest.json   ← Manifest PWA
│   └── icons/          ← Iconos de la app
├── gas/
│   └── Code.gs         ← Backend Google Apps Script
├── index.html          ← Redirect a /app/
└── README.md
```

## Secciones del cuestionario

| # | Sección | Preguntas |
|---|---------|-----------|
| 0 | Identificación mínima | P01 (fecha auto), P02 (informante), P03 (zona), P04 (tipo lugar) |
| 1 | Estado general | P05 (ambiente), P06 (tendencia), P07 (certeza) |
| 2 | Señales de alerta temprana | P08 (señales), P09 (probabilidad), P10 (intervención) |
| 3 | Tema principal del malestar | P11 (tema), origen, P14 (canal de rumor) |
| 5 | Acción sugerida | P18 (acción), P19 (contacto), P20 (adjuntos) |

## Cálculo del semáforo (automático)

### Gatillos directos a ROJO
- P08 marcó C (corte), D (protesta), o F (quejas contratistas)
- P10 = Rojo (urgente hoy o mañana)
- P09 = Alta **y** P05 ≥ 4 (tenso o muy tenso)

### Puntaje (si no hubo gatillo rojo)
- P05: 1→0, 2→1, 3→2, 4→3, 5→4
- P06: mejoró→0, igual→1, empeoró→2
- P08: A, B, o E → 1 punto cada uno (máx 3)
- **Resultado**: 0–3 = VERDE, 4–7 = AMARILLO, 8–12 = ROJO

### Confiabilidad del dato
- P07 alta: 1.0, P07 media: 0.8, P07 baja: 0.6

## Despliegue

1. **Frontend**: Hospedar la carpeta `/app` en GitHub Pages o cualquier servidor estático
2. **Backend**: Desplegar `gas/Code.gs` como Google Apps Script Web App
3. **Configuración**: La URL del API se configura en `app/app.js` → `CONFIG.API_URL`

## Modo offline

- Las encuestas se guardan en IndexedDB cuando no hay conexión
- Se sincronizan automáticamente al reconectar
- El Service Worker cachea todos los assets para uso sin internet
