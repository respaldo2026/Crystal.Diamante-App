import { useEffect, useState } from "react";

import { supabaseBrowserClient } from "@utils/supabase/client";
import { ROLES, RoleDefinition, RoleKey } from "@constants/roles";
import { MODULES, ModuleDefinition } from "@constants/modules";

export interface RolePermissions {
  rol: RoleKey;
  permisos: {
    [modulo: string]: boolean;
  };
}

// Centralized modules and roles
export const MODULOS_DISPONIBLES: ModuleDefinition[] = MODULES;
export const ROLES_DISPONIBLES: Record<string, RoleDefinition> = ROLES;

/**
// Hook de permisos migrado a contexto global. Usar useRolesPermissions de @contexts/roles-permissions-context
