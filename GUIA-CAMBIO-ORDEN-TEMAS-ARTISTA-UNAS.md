# 📋 Guía: Cambio de Orden de Temas - Artista Integral en Uñas

## Cambio Solicitado

**Curso:** Artista Integral en Uñas  
**Ciclo:** 2 - "Sistemas Semipermanentes y Soft Gel"

### Nuevo Orden

| Clase Anterior | Tema | Clase Nueva |
|---|---|---|
| 1 | Esmaltado Semipermanente | **5** |
| 2 | Press-on (Soft Gel) | **8** |
| 3 | Efectos 1 | **6** |
| 4 | Efectos 2 | **7** |

---

## Pasos a Ejecutar

### 1️⃣ Ejecutar el SQL en Supabase

Dirígete a **Supabase Dashboard** → **SQL Editor** → **New Query**

Copia y pega el contenido de:  
📄 [`cambiar-orden-temas-artista-unas.sql`](cambiar-orden-temas-artista-unas.sql)

Luego haz clic en **Run** (o presiona `Cmd+Enter`)

**Resultado esperado:**
```
✅ UPDATE 4 rows
```

### 2️⃣ Verificar en la BD

La query de verificación al final del SQL debe mostrar:
```
programa | numero_ciclo | nombre_ciclo | nombre_curso | orden | horas | tipo_curso
----------|---|---|---|---|---|---
Artista Integral en Uñas | 2 | Sistemas... | Esmaltado Semipermanente | 5 | 4 | obligatorio
Artista Integral en Uñas | 2 | Sistemas... | Efectos 1 | 6 | 4 | obligatorio
Artista Integral en Uñas | 2 | Sistemas... | Efectos 2 | 7 | 4 | obligatorio
Artista Integral en Uñas | 2 | Sistemas... | Press-on (Soft Gel) | 8 | 4 | obligatorio
```

---

## ✅ Puntos de Consumo Ya Preparados

El cambio se propaga **automáticamente** a todos los lugares donde se usa este temario:

### 📱 **Portal de Estudiantes** 
- Archivo: [`src/modules/portal-estudiante/services/portal-data.service.ts`](src/modules/portal-estudiante/services/portal-data.service.ts#L8)
- Query: `.order('orden', { ascending: true })` ✅ ya presente
- Componente: Mostrará los temas en orden 5, 6, 7, 8 automáticamente

### 👨‍🏫 **Portal de Profesores**
- Archivo: [`src/modules/academico/cursos.service.ts`](src/modules/academico/cursos.service.ts#L127)
- Query: `.order('orden', { ascending: true })` ✅ ya presente
- Efecto: El listado de temas se reordena automáticamente

### 💰 **Tesorería / Pagos**
- Archivo: [`src/app/dashboard/admin.tsx`](src/app/dashboard/admin.tsx)
- Usa: `getPensumByProgram()` que ordena por `orden` ✅
- Efecto: Reportes y facturación reflejan nuevo orden

### 🛒 **POS / Caja**
- Archivo: [`src/app/caja/page.tsx`](src/app/caja/page.tsx)
- Usa: Data de `pensum` con `.order('orden')` ✅
- Efecto: Cobros por clase mostrarán clase 5-8 automáticamente

### 🤖 **Agente IA / Chat**
- Archivo: [`src/utils/supabase/agent-courses.ts`](src/utils/supabase/agent-courses.ts#L879)
- Query: `.order('orden', { ascending: true })` ✅ en `getPensumByProgram()`
- Efecto: Respuestas sobre temario mostrarán nuevo orden

### 📊 **Control Kit Mensual**
- Archivo: [`src/app/kit-mensual/page.tsx`](src/app/kit-mensual/page.tsx)
- Usa: Pensum ordenado por `orden` ✅
- Efecto: Kit de clase 5-8 se prepara automáticamente

---

## 🔍 Verificación Post-Cambio

Una vez ejecutado el SQL, verifica en estos lugares:

1. **Portal Estudiante:** Ve al temario de "Artista Integral en Uñas" → debe mostrar nuevas clases
2. **Portal Profesor:** Abre el mismo curso → verifica que clases aparezcan en orden 5-8
3. **Tesorería:** Crea un pago por clase 5 → debe ser "Esmaltado Semipermanente"
4. **POS:** Crea una transacción de clase 6 → debe ser "Efectos 1"

---

## 📝 Notas Importantes

⚠️ **No es necesario**:
- ❌ Recompilar la app
- ❌ Cambiar código TypeScript
- ❌ Ejecutar migraciones de Next.js
- ❌ Actualizar variables de entorno

✅ **Solo ejecuta el SQL** y el cambio se propaga automáticamente a todas las vistas.

---

## 🆘 Si Algo Falla

Si después de ejecutar el SQL los temas aún muestran orden 1-4 en el portal:

1. Limpia caché del navegador (`Ctrl+Shift+Delete`)
2. Reinicia el dev server: `npm run dev`
3. Verifica que el SQL se ejecutó exitosamente (debe decir `UPDATE 4 rows`)
4. Revisa la tabla `pensum_cursos` directamente en Supabase
