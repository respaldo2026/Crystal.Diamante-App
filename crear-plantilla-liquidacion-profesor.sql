-- Plantilla para liquidación quincenal de horas del profesor
-- Variables esperadas: {{nombre}}, {{periodo}}, {{horas}}, {{valor}}

INSERT INTO public.plantillas_whatsapp (nombre, descripcion, plantilla, tipo, activa)
SELECT
  'liquidacion_horas_profesor',
  'Liquidación automática de horas del profesor para corte quincenal (15 y fin de mes)',
  'Profesora {{nombre}}, esta es la liquidación del periodo {{periodo}}.\n\nHoras dictadas: {{horas}}\nValor total a pagar: {{valor}}\n\nAcademia Crystal Diamante.',
  'transaccional',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_whatsapp
  WHERE nombre = 'liquidacion_horas_profesor'
);

-- Si ya existe y quieres actualizarla:
-- UPDATE public.plantillas_whatsapp
-- SET
--   descripcion = 'Liquidación automática de horas del profesor para corte quincenal (15 y fin de mes)',
--   plantilla = 'Profesora {{nombre}}, esta es la liquidación del periodo {{periodo}}.\n\nHoras dictadas: {{horas}}\nValor total a pagar: {{valor}}\n\nAcademia Crystal Diamante.',
--   activa = true,
--   updated_at = now()
-- WHERE nombre = 'liquidacion_horas_profesor';
