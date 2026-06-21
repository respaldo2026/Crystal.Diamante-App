# Plantilla Meta WhatsApp: Inasistencia Motivación

## Datos para Meta Business Manager

**Nombre de plantilla:** `inasistencia_motivacion`

**Idioma:** Spanish (es_CO - Colombiano)

**Categoría:** Marketing / Relationship

---

## Contenido de la Plantilla

```
Hola {{1}}, notamos tu ausencia en {{2}} el {{3}}. 

Queremos motivarte a seguir firme: cada clase suma a tu meta. Te esperamos en la próxima clase. 

Si necesitas apoyo, responde este mensaje. 

Academia Crystal.
```

---

## Variables (en orden)

| # | Variable | Ejemplo | Descripción |
|----|----------|---------|-------------|
| 1 | nombre | María | Nombre completo de la estudiante |
| 2 | curso | Diseño Gráfico | Nombre del curso |
| 3 | fecha_clase | 21 de junio de 2026 | Fecha de la clase en que faltó |

---

## Pasos en Meta Business Manager

1. Ve a **Meta Business Manager** → **WhatsApp Manager** → **Templates**
2. Haz clic en **Create Template**
3. Rellena:
   - **Template name:** `inasistencia_motivacion`
   - **Category:** Marketing (o la que prefieras)
   - **Language:** Spanish (Colombia) o Spanish
   - **Message body (Header):** (Opcional - dejar vacío)
   - **Message body (Content):** 
     ```
     Hola {{1}}, notamos tu ausencia en {{2}} el {{3}}. 
     
     Queremos motivarte a seguir firme: cada clase suma a tu meta. Te esperamos en la próxima clase. 
     
     Si necesitas apoyo, responde este mensaje. 
     
     Academia Crystal.
     ```
   - **Message body (Footer):** (Opcional - dejar vacío)
   - **Buttons:** No agregar botones por ahora
4. Haz clic en **Submit for Review**
5. Meta revisará y aprobará (usualmente en minutos/horas)

---

## Importante

⚠️ **No incluyas emojis** en la plantilla inicial - Meta puede rechazarla. Ya aprobada, puedes usar emojis en la versión final.

⚠️ **Las variables {{1}}, {{2}}, {{3}}** se reemplazarán automáticamente desde el código con los valores reales.

⚠️ **En el código**, las variables se envían como array:
```javascript
templateVariables: [nombre, cursoNombre, fechaTexto]
```

---

## Status

- ✅ Plantilla definida en `src/constants/whatsappTemplates.ts`
- ✅ Integrada en flujo de asistencia (`src/app/asistencias/create/page.tsx`)
- ⏳ **PENDIENTE:** Crear en Meta Business Manager y esperar aprobación

---

## Fallback (si la plantilla falla)

Si Meta rechaza o hay error en envío, se envía automáticamente este texto:

```
Hola {{nombre}}, notamos tu ausencia en {{curso}} el {{fecha_clase}}. Queremos motivarte a seguir firme: cada clase suma a tu meta. Te esperamos en la próxima clase. Si necesitas apoyo, responde este mensaje. Academia Crystal.
```
