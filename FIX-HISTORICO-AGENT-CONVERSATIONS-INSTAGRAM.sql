-- ====================================================
-- FIX HISTORICO: agent_conversations.phone_number (Instagram IDs)
-- Fecha: 2026-03-07
-- Objetivo:
--   1) Detectar registros con IDs tecnicos guardados como phone_number
--   2) Marcar como ig:<id> los casos de ALTA CONFIANZA
--   3) Dejar trazabilidad y rollback
--
-- IMPORTANTE:
--   Este script SOLO actualiza casos con phone_number numerico de 16+ digitos,
--   porque en Meta/WhatsApp los wa_id telefonicos suelen ser maximo 15 digitos.
--   Asi evitamos tocar telefonos reales.
-- ====================================================

-- ----------------------------------------------------
-- A) DIAGNOSTICO (no modifica datos)
-- ----------------------------------------------------

-- Resumen por tipo
SELECT
  CASE
    WHEN phone_number ~ '^ig:[0-9]+$' THEN 'ya_ig_prefijo'
    WHEN lower(phone_number) IN ('unknown', 'desconocido') THEN 'unknown'
    WHEN phone_number ~ '^[0-9]+$' AND length(phone_number) >= 16 THEN 'sospechoso_instagram_16plus'
    WHEN phone_number ~ '^[0-9]+$' AND length(phone_number) BETWEEN 10 AND 15 THEN 'numerico_10_15'
    WHEN phone_number ~ '^[0-9]+$' THEN 'numerico_otro'
    ELSE 'texto_otro'
  END AS categoria,
  COUNT(*)::int AS total
FROM public.agent_conversations
GROUP BY 1
ORDER BY total DESC;

-- Muestra de sospechosos (alta confianza)
SELECT id, phone_number, created_at
FROM public.agent_conversations
WHERE phone_number ~ '^[0-9]+$'
  AND length(phone_number) >= 16
ORDER BY created_at DESC
LIMIT 100;

-- ----------------------------------------------------
-- B) BACKUP DE CAMBIOS
-- ----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_conversations_phone_fix_backup (
  id uuid PRIMARY KEY,
  old_phone_number text NOT NULL,
  new_phone_number text NOT NULL,
  reason text NOT NULL,
  backup_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------
-- C) UPDATE SEGURO (alta confianza)
-- ----------------------------------------------------

WITH candidates AS (
  SELECT
    id,
    phone_number AS old_phone_number,
    ('ig:' || phone_number) AS new_phone_number,
    'phone_number numerico >=16 digitos (alta confianza instagram_id)'::text AS reason
  FROM public.agent_conversations
  WHERE phone_number ~ '^[0-9]+$'
    AND length(phone_number) >= 16
    AND phone_number NOT LIKE 'ig:%'
),
backup_insert AS (
  INSERT INTO public.agent_conversations_phone_fix_backup (id, old_phone_number, new_phone_number, reason)
  SELECT c.id, c.old_phone_number, c.new_phone_number, c.reason
  FROM candidates c
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
UPDATE public.agent_conversations ac
SET phone_number = c.new_phone_number,
    updated_at = now()
FROM candidates c
WHERE ac.id = c.id
  AND ac.phone_number = c.old_phone_number;

-- ----------------------------------------------------
-- D) VERIFICACION POST-UPDATE
-- ----------------------------------------------------

SELECT COUNT(*)::int AS total_marcados_ig
FROM public.agent_conversations
WHERE phone_number LIKE 'ig:%';

SELECT id, phone_number, created_at
FROM public.agent_conversations
WHERE phone_number LIKE 'ig:%'
ORDER BY created_at DESC
LIMIT 100;

-- ----------------------------------------------------
-- E) ROLLBACK (solo si necesitas revertir)
-- ----------------------------------------------------
-- UPDATE public.agent_conversations ac
-- SET phone_number = b.old_phone_number,
--     updated_at = now()
-- FROM public.agent_conversations_phone_fix_backup b
-- WHERE ac.id = b.id;

-- ====================================================
-- OPCIONAL: REVISION MANUAL DE CASOS GRISES (NO AUTO-UPDATE)
-- ====================================================
-- -- Estos son numericos 13-15 que no inician por 57. Revisalos manualmente.
-- SELECT id, phone_number, created_at
-- FROM public.agent_conversations
-- WHERE phone_number ~ '^[0-9]+$'
--   AND length(phone_number) BETWEEN 13 AND 15
--   AND phone_number NOT LIKE '57%'
-- ORDER BY created_at DESC
-- LIMIT 200;
