// Centralized roles and permissions definitions

export interface RoleDefinition {
  label: string;
  color: string;
  nivel: number;
  descripcion: string;
}

export const ROLES: Record<string, RoleDefinition> = {
  director: { label: "🏆 Director", color: "gold", nivel: 5, descripcion: "Propietario de la academia" },
  administrador: { label: "👔 Administrador", color: "blue", nivel: 4, descripcion: "Apoyo operativo" },
  asesor: { label: "📞 Asesor", color: "cyan", nivel: 3, descripcion: "Gestión de leads" },
  profesor: { label: "🎓 Profesor", color: "green", nivel: 2, descripcion: "Docente" },
  estudiante: { label: "👨‍🎓 Estudiante", color: "default", nivel: 1, descripcion: "Aprendiz" },
};

export type RoleKey = keyof typeof ROLES;
