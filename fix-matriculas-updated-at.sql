-- Fix: Agregar campo updated_at a tabla matriculas
-- Ejecutar en Supabase SQL Editor

-- Agregar columna updated_at si no existe
ALTER TABLE matriculas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Actualizar registros existentes para que tengan un valor
UPDATE matriculas SET updated_at = created_at WHERE updated_at IS NULL;

-- Verificar que el trigger existe y funciona
SELECT trigger_name, event_manipulation, event_object_table 
FROM information_schema.triggers 
WHERE event_object_table = 'matriculas';
