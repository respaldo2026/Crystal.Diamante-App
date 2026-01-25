-- Actualiza o crea la plantilla de WhatsApp para la bienvenida al portal del estudiante
-- Ejecutar en Supabase (SQL editor) antes de habilitar el flujo en producción

INSERT INTO plantillas_whatsapp (nombre, descripcion, plantilla, variables, activa)
VALUES (
    'bienvenida_portal_estudiante',
    'Bienvenida al portal con credenciales iniciales',
    'Hola {{nombre}}, ¡bienvenido(a) al curso {{curso}}! Ingresa al portal estudiantil: {{enlace_portal}} con usuario {{usuario}} y contraseña {{contrasena}} (tu número de cédula).',
    ARRAY['nombre', 'curso', 'enlace_portal', 'usuario', 'contrasena'],
    true
)
ON CONFLICT (nombre) DO UPDATE SET
    descripcion = EXCLUDED.descripcion,
    plantilla = EXCLUDED.plantilla,
    variables = EXCLUDED.variables,
    activa = true,
    updated_at = NOW();
