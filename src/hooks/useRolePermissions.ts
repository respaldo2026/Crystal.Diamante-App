import { useEffect, useState } from "react";
import { supabaseBrowserClient } from "@utils/supabase/client";

export interface RolePermissions {
  rol: string;
  permisos: {
    [modulo: string]: boolean;
  };
}

// Módulos disponibles en la aplicación
export const MODULOS_DISPONIBLES = [
  { key: "cursos", label: "Cursos" },
  { key: "estudiantes", label: "Estudiantes" },
  { key: "matriculas", label: "Matrículas" },
  { key: "asistencias", label: "Asistencias" },
  { key: "profesores", label: "Profesores" },
  { key: "tesoreria", label: "Tesorería/Pagos" },
  { key: "nomina", label: "Nómina" },
  { key: "perfiles", label: "Perfiles" },
  { key: "leads", label: "Leads" },
  { key: "inventario", label: "Inventario" },
  { key: "planificador", label: "Planificador" },
  { key: "portal-estudiante", label: "Portal Estudiante" },
  { key: "configuracion", label: "Configuración" },
];

// Roles disponibles - JERARQUÍA ACTUALIZADA
export const ROLES_DISPONIBLES = {
  director: { label: "🏆 Director", color: "gold", nivel: 5, descripcion: "Propietario de la academia" },
  administrador: { label: "👔 Administrador", color: "blue", nivel: 4, descripcion: "Apoyo operativo" },
  asesor: { label: "📞 Asesor", color: "cyan", nivel: 3, descripcion: "Gestión de leads" },
  profesor: { label: "🎓 Profesor", color: "green", nivel: 2, descripcion: "Docente" },
  estudiante: { label: "👨‍🎓 Estudiante", color: "default", nivel: 1, descripcion: "Aprendiz" },
};

/**
// Hook de permisos migrado a contexto global. Usar useRolesPermissions de @contexts/roles-permissions-context
