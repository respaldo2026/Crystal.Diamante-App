-- ============================================================
-- VERIFICACIÓN: Estudiantes que pueden/no pueden acceder
--               al Portal de Estudiante
--
-- Requiere:
--   1. Usuario en auth.users con email_confirmed_at NOT NULL
--   2. Perfil en perfiles con rol = 'estudiante'
--   3. El id del perfil = id del usuario en auth.users
--
-- Ejecutar en Supabase → SQL Editor.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- SECCIÓN 1: Estudiantes SIN usuario en auth.users
--   → Solo tienen perfil, nunca podrán iniciar sesión
-- ─────────────────────────────────────────────────────────────
SELECT
    p.id            AS perfil_id,
    p.nombre_completo,
    p.email,
    p.identificacion,
    p.activo,
    '❌ SIN usuario auth' AS problema
FROM perfiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.rol = 'estudiante'
  AND u.id IS NULL
ORDER BY p.nombre_completo;


-- ─────────────────────────────────────────────────────────────
-- SECCIÓN 2: Estudiantes con email NO confirmado en auth.users
--   → Supabase bloqueará el login hasta que lo confirmen
--   (No aplica si se crearon con email_confirm: true)
-- ─────────────────────────────────────────────────────────────
SELECT
    p.id            AS perfil_id,
    p.nombre_completo,
    p.email,
    u.email_confirmed_at,
    u.created_at    AS usuario_creado_en,
    '⚠️  Email sin confirmar' AS problema
FROM perfiles p
JOIN auth.users u ON u.id = p.id
WHERE p.rol = 'estudiante'
  AND u.email_confirmed_at IS NULL
ORDER BY u.created_at DESC;


-- ─────────────────────────────────────────────────────────────
-- SECCIÓN 3: Estudiantes con perfil inactivo (activo = false)
--   → El portal carga el perfil pero puede restringir funciones
-- ─────────────────────────────────────────────────────────────
SELECT
    p.id            AS perfil_id,
    p.nombre_completo,
    p.email,
    p.activo,
    '⚠️  Perfil inactivo' AS problema
FROM perfiles p
JOIN auth.users u ON u.id = p.id
WHERE p.rol = 'estudiante'
  AND (p.activo = false OR p.activo IS NULL)
ORDER BY p.nombre_completo;


-- ─────────────────────────────────────────────────────────────
-- SECCIÓN 4: Estudiantes con email distinto entre auth y perfil
--   → Puede causar confusión al iniciar sesión
-- ─────────────────────────────────────────────────────────────
SELECT
    p.id            AS perfil_id,
    p.nombre_completo,
    p.email         AS email_perfil,
    u.email         AS email_auth,
    '⚠️  Email desincronizado' AS problema
FROM perfiles p
JOIN auth.users u ON u.id = p.id
WHERE p.rol = 'estudiante'
  AND LOWER(TRIM(p.email)) <> LOWER(TRIM(u.email))
ORDER BY p.nombre_completo;


-- ─────────────────────────────────────────────────────────────
-- SECCIÓN 5: RESUMEN — Todos los estudiantes y su estado
-- ─────────────────────────────────────────────────────────────
SELECT
    p.id            AS perfil_id,
    p.nombre_completo,
    p.email,
    p.activo,
    CASE
        WHEN u.id IS NULL             THEN '❌ Sin usuario auth'
        WHEN u.email_confirmed_at IS NULL THEN '⚠️  Email sin confirmar'
        WHEN (p.activo = false OR p.activo IS NULL)
                                      THEN '⚠️  Perfil inactivo'
        ELSE '✅ Puede ingresar'
    END             AS estado_acceso,
    u.email_confirmed_at IS NOT NULL  AS auth_confirmado,
    u.last_sign_in_at                 AS ultimo_ingreso
FROM perfiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE p.rol = 'estudiante'
ORDER BY estado_acceso, p.nombre_completo;


-- ─────────────────────────────────────────────────────────────
-- FIX RÁPIDO: Confirmar email a todos los estudiantes
--   que tengan usuario auth pero email sin confirmar.
--   Solo ejecutar si lo deseas — es seguro en entorno dev/prod
--   porque /api/create-user ya hace email_confirm: true.
-- ─────────────────────────────────────────────────────────────
/*
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE id IN (
    SELECT u.id
    FROM auth.users u
    JOIN perfiles p ON p.id = u.id
    WHERE p.rol = 'estudiante'
      AND u.email_confirmed_at IS NULL
);
*/
