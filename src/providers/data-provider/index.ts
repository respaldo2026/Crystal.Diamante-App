"use client";

import { dataProvider as dataProviderSupabase } from "@refinedev/supabase";
import { supabaseBrowserClient } from "@utils/supabase/client";
import type { DataProvider, UpdateParams, UpdateResponse, BaseRecord } from "@refinedev/core";

const supabaseDataProvider = dataProviderSupabase(supabaseBrowserClient);

export const dataProvider: DataProvider = {
  ...supabaseDataProvider,
  
  update: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({ resource, id, variables }: UpdateParams<TVariables>): Promise<UpdateResponse<TData>> => {
    if (!id) {
      throw new Error("No hay ID para actualizar");
    }
    
    if (!variables || Object.keys(variables).length === 0) {
      throw new Error("No hay datos para actualizar");
    }
    
    try {
      const { data: sessionData } = await supabaseBrowserClient.auth.getSession();
      const session = sessionData?.session;
      const userId = session?.user?.id;
      const userRole = session?.user?.app_metadata?.rol;

      if (!session) {
        throw new Error("No hay sesión activa. Cierra sesión y vuelve a entrar.");
      }

      const isAdmin = ["admin", "director", "administrativo"].includes(String(userRole));
      const isOwner = String(userId) === String(id);
      if (!isAdmin && !isOwner) {
        throw new Error("Permisos insuficientes para actualizar este perfil.");
      }

      const { data, error: updateError } = await supabaseBrowserClient
        .from(resource)
        .update(variables as any)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (updateError) {
        throw updateError;
      }

      return { data: data as TData };
    } catch (error: any) {
      throw error;
    }
  },
};
