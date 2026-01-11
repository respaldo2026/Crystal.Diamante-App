-- ================================================
-- SCHEMA COMPLETO - ACADEMIA CRYSTAL DIAMANTE
-- ================================================
-- Ejecuta este script COMPLETO en Supabase SQL Editor
-- antes de ejecutar seed-data.sql
-- ================================================

-- ENABLE UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. TABLA PERFILES (Usuarios: Profesores, Estudiantes, Administrativos)
CREATE TABLE IF NOT EXISTS perfiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_completo TEXT NOT NULL,
    email TEXT UNIQUE,
    telefono TEXT,
    identificacion TEXT UNIQUE,
    fecha_nacimiento DATE,
    genero TEXT,
    direccion TEXT,
    rol TEXT NOT NULL CHECK (rol IN ('profesor', 'estudiante', 'administrativo')),
    acudiente_nombre TEXT,
    acudiente_telefono TEXT,
    valor_hora NUMERIC(10,2),
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. TABLA PROFESORES_INFO
CREATE TABLE IF NOT EXISTS profesores_info (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    perfil_id UUID REFERENCES perfiles(id) ON DELETE CASCADE UNIQUE,
    especialidad TEXT,
    valor_hora NUMERIC(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. TABLA CONFIGURACION
CREATE TABLE IF NOT EXISTS configuracion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre_academia TEXT NOT NULL,
    nit TEXT,
    direccion TEXT,
    telefono TEXT,
    email TEXT,
    ciudad TEXT,
    moneda TEXT DEFAULT 'COP',
    mensaje_factura TEXT,
    sitio_web TEXT,
    instagram TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. TABLA CURSOS
CREATE TABLE IF NOT EXISTS cursos (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    profesor_id UUID REFERENCES perfiles(id),
    duracion TEXT,
    duracion_horas INTEGER,
    horario TEXT,
    precio NUMERIC(10,2),
    precio_inscripcion NUMERIC(10,2),
    precio_mensualidad NUMERIC(10,2),
    cupos INTEGER DEFAULT 20,
    estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'finalizado', 'proximo')),
    fecha_inicio DATE,
    fecha_fin DATE,
    porcentaje_minimo NUMERIC(5,2) DEFAULT 80,
    porcentaje_comision NUMERIC(5,2) DEFAULT 10,
    total_clases INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TABLA MATRICULAS
CREATE TABLE IF NOT EXISTS matriculas (
    id SERIAL PRIMARY KEY,
    estudiante_id UUID REFERENCES perfiles(id) ON DELETE CASCADE,
    curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
    estado TEXT DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'finalizado', 'cancelado')),
    fecha_inicio DATE DEFAULT CURRENT_DATE,
    monto_pagado NUMERIC(10,2) DEFAULT 0,
    deuda_pendiente NUMERIC(10,2) DEFAULT 0,
    nota_final NUMERIC(5,2),
    estado_academico TEXT CHECK (estado_academico IN ('cursando', 'aprobado', 'reprobado', 'retirado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(estudiante_id, curso_id)
);

-- 6. TABLA PAGOS
CREATE TABLE IF NOT EXISTS pagos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    estudiante_id UUID REFERENCES perfiles(id),
    matricula_id INTEGER REFERENCES matriculas(id),
    monto NUMERIC(10,2) NOT NULL,
    metodo_pago TEXT CHECK (metodo_pago IS NULL OR LOWER(metodo_pago) IN ('efectivo', 'transferencia', 'tarjeta', 'nequi', 'sistecredito', 'otro')),
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'vencido', 'cancelado')),
    fecha_pago TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    observaciones TEXT,
    referencia TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. TABLA TEMAS_CURSO
CREATE TABLE IF NOT EXISTS temas_curso (
    id SERIAL PRIMARY KEY,
    curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    orden INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. TABLA SESIONES_CLASE
CREATE TABLE IF NOT EXISTS sesiones_clase (
    id SERIAL PRIMARY KEY,
    curso_id INTEGER REFERENCES cursos(id) ON DELETE CASCADE,
    profesor_id UUID REFERENCES perfiles(id),
    fecha DATE NOT NULL,
    horas_dictadas NUMERIC(5,2),
    tema_visto TEXT,
    estado_pago TEXT DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente', 'pagado')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. TABLA ASISTENCIAS
CREATE TABLE IF NOT EXISTS asistencias (
    id SERIAL PRIMARY KEY,
    matricula_id INTEGER REFERENCES matriculas(id) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    estado TEXT CHECK (estado IN ('presente', 'ausente', 'tardanza', 'justificado')),
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(matricula_id, fecha)
);

-- 10. TABLA INVENTARIO
CREATE TABLE IF NOT EXISTS inventario (
    id SERIAL PRIMARY KEY,
    nombre_producto TEXT NOT NULL,
    descripcion TEXT,
    cantidad_stock INTEGER DEFAULT 0,
    precio_costo NUMERIC(10,2),
    unidad_medida TEXT,
    categoria TEXT,
    stock_minimo INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. TABLA PAGOS_NOMINA
CREATE TABLE IF NOT EXISTS pagos_nomina (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profesor_id UUID REFERENCES perfiles(id),
    fecha_inicio_periodo DATE,
    fecha_fin_periodo DATE,
    fecha_pago TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    total_horas NUMERIC(10,2),
    total_pagado NUMERIC(10,2) NOT NULL,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. TABLA PAGOS_PROFESORES (alternativa)
CREATE TABLE IF NOT EXISTS pagos_profesores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profesor_id UUID REFERENCES perfiles(id),
    monto NUMERIC(10,2) NOT NULL,
    fecha_pago TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metodo_pago TEXT,
    referencia TEXT,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ================================================
-- INDICES PARA MEJOR RENDIMIENTO
-- ================================================
CREATE INDEX IF NOT EXISTS idx_perfiles_rol ON perfiles(rol);
CREATE INDEX IF NOT EXISTS idx_perfiles_email ON perfiles(email);
CREATE INDEX IF NOT EXISTS idx_cursos_profesor ON cursos(profesor_id);
CREATE INDEX IF NOT EXISTS idx_cursos_estado ON cursos(estado);
CREATE INDEX IF NOT EXISTS idx_matriculas_estudiante ON matriculas(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_curso ON matriculas(curso_id);
CREATE INDEX IF NOT EXISTS idx_matriculas_estado ON matriculas(estado);
CREATE INDEX IF NOT EXISTS idx_pagos_estudiante ON pagos(estudiante_id);
CREATE INDEX IF NOT EXISTS idx_pagos_matricula ON pagos(matricula_id);
CREATE INDEX IF NOT EXISTS idx_pagos_fecha ON pagos(fecha_pago);
CREATE INDEX IF NOT EXISTS idx_asistencias_matricula ON asistencias(matricula_id);
CREATE INDEX IF NOT EXISTS idx_asistencias_fecha ON asistencias(fecha);
CREATE INDEX IF NOT EXISTS idx_sesiones_curso ON sesiones_clase(curso_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_profesor ON sesiones_clase(profesor_id);
CREATE INDEX IF NOT EXISTS idx_pagos_nomina_profesor ON pagos_nomina(profesor_id);

-- ================================================
-- FUNCIONES Y TRIGGERS
-- ================================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para updated_at (solo para tablas que tienen esta columna)
DROP TRIGGER IF EXISTS update_perfiles_updated_at ON perfiles;
CREATE TRIGGER update_perfiles_updated_at
    BEFORE UPDATE ON perfiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_cursos_updated_at ON cursos;
CREATE TRIGGER update_cursos_updated_at
    BEFORE UPDATE ON cursos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_matriculas_updated_at ON matriculas;
CREATE TRIGGER update_matriculas_updated_at
    BEFORE UPDATE ON matriculas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_configuracion_updated_at ON configuracion;
CREATE TRIGGER update_configuracion_updated_at
    BEFORE UPDATE ON configuracion
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inventario_updated_at ON inventario;
CREATE TRIGGER update_inventario_updated_at
    BEFORE UPDATE ON inventario
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Validación de montos y método de pago en tabla pagos
CREATE OR REPLACE FUNCTION validar_monto_pago()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.monto IS NULL OR NEW.monto <= 0 THEN
        RAISE EXCEPTION 'El monto debe ser mayor a 0';
    END IF;

    IF NEW.monto > 999999999 THEN
        RAISE EXCEPTION 'El monto es demasiado alto';
    END IF;

    -- Solo validar método de pago si no es NULL (permitir NULL para pagos pendientes)
    IF NEW.metodo_pago IS NOT NULL AND LOWER(NEW.metodo_pago) NOT IN ('efectivo', 'transferencia', 'tarjeta', 'nequi', 'sistecredito', 'otro') THEN
        RAISE EXCEPTION 'Método de pago no permitido: %', NEW.metodo_pago;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_monto_pago ON pagos;
CREATE TRIGGER check_monto_pago
    BEFORE INSERT OR UPDATE ON pagos
    FOR EACH ROW
    EXECUTE FUNCTION validar_monto_pago();

-- NOTA: Las siguientes tablas NO tienen updated_at:
-- profesores_info, pagos, temas_curso, sesiones_clase, asistencias, pagos_nomina, pagos_profesores

-- ================================================
-- POLITICAS RLS (Row Level Security)
-- ================================================
-- Habilitar RLS en todas las tablas
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profesores_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE matriculas ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE temas_curso ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesiones_clase ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_nomina ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_profesores ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para desarrollo (ajustar en producción)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'perfiles' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON perfiles FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'profesores_info' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON profesores_info FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'configuracion' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON configuracion FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cursos' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON cursos FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'matriculas' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON matriculas FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pagos' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON pagos FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'temas_curso' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON temas_curso FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sesiones_clase' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON sesiones_clase FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'asistencias' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON asistencias FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventario' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON inventario FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pagos_nomina' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON pagos_nomina FOR ALL USING (true);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pagos_profesores' AND policyname = 'Enable all access for authenticated users') THEN
        CREATE POLICY "Enable all access for authenticated users" ON pagos_profesores FOR ALL USING (true);
    END IF;
END $$;

-- ================================================
-- FIN DEL SCHEMA
-- ================================================
-- Ahora puedes ejecutar seed-data.sql para cargar datos de prueba
-- ================================================
