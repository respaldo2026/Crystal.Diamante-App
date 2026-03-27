-- Backfill de mensajes historicos enviados por plantilla a agent_conversations
-- Objetivo: que Conversaciones IA muestre tambien envios anteriores, no solo los nuevos.
--
-- Fuente esperada: public.whatsapp_mensajes
-- Criterio: registros con formato de plantilla en mensaje_texto ("Template: ...")
-- Estado recomendado: enviado o entregado o leido
--
-- Idempotente: evita duplicados por message_id (cuando existe) y por contenido+fecha.

DO $$
DECLARE
  has_whatsapp_mensajes boolean;
  has_channel_column boolean;
  has_profile_name_column boolean;
  inserted_count bigint := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_mensajes'
  ) INTO has_whatsapp_mensajes;

  IF NOT has_whatsapp_mensajes THEN
    RAISE NOTICE 'No existe public.whatsapp_mensajes. Backfill omitido.';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_conversations'
      AND column_name = 'channel'
  ) INTO has_channel_column;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'agent_conversations'
      AND column_name = 'profile_name'
  ) INTO has_profile_name_column;

  IF has_channel_column AND has_profile_name_column THEN
    WITH source_rows AS (
      SELECT
        wm.id,
        wm.telefono,
        wm.tipo,
        wm.mensaje_texto,
        wm.message_id,
        wm.creado_en,
        CASE
          WHEN length(regexp_replace(coalesce(wm.telefono, ''), '\\D', '', 'g')) = 10
               AND left(regexp_replace(coalesce(wm.telefono, ''), '\\D', '', 'g'), 1) = '3'
            THEN '57' || regexp_replace(coalesce(wm.telefono, ''), '\\D', '', 'g')
          ELSE regexp_replace(coalesce(wm.telefono, ''), '\\D', '', 'g')
        END AS normalized_phone,
        trim(split_part(replace(coalesce(wm.mensaje_texto, ''), 'Template:', ''), '|', 1)) AS template_name,
        coalesce(wm.creado_en, now()) AS created_ts
      FROM public.whatsapp_mensajes wm
      WHERE coalesce(wm.mensaje_texto, '') ILIKE 'Template:%'
        AND coalesce(wm.estado, '') IN ('enviado', 'entregado', 'leido')
    ), filtered_rows AS (
      SELECT *
      FROM source_rows sr
      WHERE coalesce(sr.normalized_phone, '') <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM public.agent_conversations ac
          WHERE ac.phone_number = sr.normalized_phone
            AND (
              (
                sr.message_id IS NOT NULL
                AND sr.message_id <> ''
                AND ac.agent_response ILIKE ('%Meta Message ID: ' || sr.message_id || '%')
              )
              OR (
                coalesce(ac.user_message, '') = '[SISTEMA] Envio de plantilla WhatsApp'
                AND ac.created_at = sr.created_ts
                AND ac.agent_response ILIKE ('%Plantilla enviada: ' || sr.template_name || '%')
              )
            )
        )
    )
    INSERT INTO public.agent_conversations (
      phone_number,
      user_message,
      agent_response,
      transcription,
      channel,
      profile_name,
      created_at,
      updated_at
    )
    SELECT
      fr.normalized_phone,
      '[SISTEMA] Envio de plantilla WhatsApp',
      '📤 Plantilla enviada: ' || coalesce(fr.template_name, fr.tipo, 'desconocida') || E'\n'
      || 'Origen: backfill whatsapp_mensajes' || E'\n'
      || 'Variables: no disponibles en historico' || E'\n'
      || 'Meta Message ID: ' || coalesce(fr.message_id, 'sin ID'),
      NULL,
      'whatsapp',
      NULL,
      fr.created_ts,
      fr.created_ts
    FROM filtered_rows fr;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
  ELSE
    WITH source_rows AS (
      SELECT
        wm.id,
        wm.telefono,
        wm.tipo,
        wm.mensaje_texto,
        wm.message_id,
        wm.creado_en,
        CASE
          WHEN length(regexp_replace(coalesce(wm.telefono, ''), '\\D', '', 'g')) = 10
               AND left(regexp_replace(coalesce(wm.telefono, ''), '\\D', '', 'g'), 1) = '3'
            THEN '57' || regexp_replace(coalesce(wm.telefono, ''), '\\D', '', 'g')
          ELSE regexp_replace(coalesce(wm.telefono, ''), '\\D', '', 'g')
        END AS normalized_phone,
        trim(split_part(replace(coalesce(wm.mensaje_texto, ''), 'Template:', ''), '|', 1)) AS template_name,
        coalesce(wm.creado_en, now()) AS created_ts
      FROM public.whatsapp_mensajes wm
      WHERE coalesce(wm.mensaje_texto, '') ILIKE 'Template:%'
        AND coalesce(wm.estado, '') IN ('enviado', 'entregado', 'leido')
    ), filtered_rows AS (
      SELECT *
      FROM source_rows sr
      WHERE coalesce(sr.normalized_phone, '') <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM public.agent_conversations ac
          WHERE ac.phone_number = sr.normalized_phone
            AND (
              (
                sr.message_id IS NOT NULL
                AND sr.message_id <> ''
                AND ac.agent_response ILIKE ('%Meta Message ID: ' || sr.message_id || '%')
              )
              OR (
                coalesce(ac.user_message, '') = '[SISTEMA] Envio de plantilla WhatsApp'
                AND ac.created_at = sr.created_ts
                AND ac.agent_response ILIKE ('%Plantilla enviada: ' || sr.template_name || '%')
              )
            )
        )
    )
    INSERT INTO public.agent_conversations (
      phone_number,
      user_message,
      agent_response,
      transcription,
      created_at,
      updated_at
    )
    SELECT
      fr.normalized_phone,
      '[SISTEMA] Envio de plantilla WhatsApp',
      '📤 Plantilla enviada: ' || coalesce(fr.template_name, fr.tipo, 'desconocida') || E'\n'
      || 'Origen: backfill whatsapp_mensajes' || E'\n'
      || 'Variables: no disponibles en historico' || E'\n'
      || 'Meta Message ID: ' || coalesce(fr.message_id, 'sin ID'),
      NULL,
      fr.created_ts,
      fr.created_ts
    FROM filtered_rows fr;

    GET DIAGNOSTICS inserted_count = ROW_COUNT;
  END IF;

  RAISE NOTICE 'Backfill completado. Filas insertadas: %', inserted_count;
END $$;
