// Servicio modular para roles y permisos
import { supabaseBrowserClient } from "@utils/supabase/client";

  // Simple in-memory cache
  if (!globalThis.__permisosCache) globalThis.__permisosCache = {};
  const cache = globalThis.__permisosCache;
  if (cache[rol]) return cache[rol];
  const { data, error } = await supabaseBrowserClient
    .from("role_permissions")
    .select("permisos")
    .eq("rol", rol)
    .single();
  if (error) throw error;
  cache[rol] = data?.permisos || {};
  return cache[rol];
}

  const { error } = await supabaseBrowserClient
    .from("role_permissions")
    .upsert({ rol, permisos: nuevoPermisos }, { onConflict: "rol" });
  if (error) throw error;
  // Update cache
  if (!globalThis.__permisosCache) globalThis.__permisosCache = {};
  globalThis.__permisosCache[rol] = nuevoPermisos;
  return true;
}
