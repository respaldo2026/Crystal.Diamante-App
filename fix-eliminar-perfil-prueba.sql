-- ============================================================
-- FIX: Eliminar perfil de prueba sin usuario auth
--   "estudiante prueba" / ana@gmail.com
--   No tiene usuario en auth.users y está inactivo,
--   así que no hay riesgo de dejar datos huérfanos en auth.
-- ============================================================

-- Paso 1: Ver qué matrículas/pagos tiene antes de borrar
SELECT 'matriculas' AS tabla, COUNT(*) AS cantidad
FROM matriculas
WHERE estudiante_id = '6b7ed57b-13d1-4cc2-9ed3-ce5ce57e5b9c'
UNION ALL
SELECT 'pagos', COUNT(*)
FROM pagos
WHERE estudiante_id = '6b7ed57b-13d1-4cc2-9ed3-ce5ce57e5b9c';

-- Paso 2: Eliminar el perfil de prueba (solo si el paso 1 devuelve 0 en ambas)
-- Descomenta la línea siguiente después de confirmar:
-- DELETE FROM perfiles WHERE id = '6b7ed57b-13d1-4cc2-9ed3-ce5ce57e5b9c';


-- ============================================================
-- RECORDATORIO: Estudiantes con acceso pero que nunca
--               han ingresado al portal (pueden necesitar
--               que se les reenvíe el link de acceso):
-- ============================================================
SELECT
    p.nombre_completo,
    p.email,
    p.identificacion
FROM perfiles p
JOIN auth.users u ON u.id = p.id
WHERE p.rol = 'estudiante'
  AND p.activo = true
  AND u.last_sign_in_at IS NULL
ORDER BY p.nombre_completo;
