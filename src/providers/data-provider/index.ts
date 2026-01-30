"use client";

import { dataProvider as dataProviderSupabase } from "@refinedev/supabase";
import { supabaseBrowserClient } from "@utils/supabase/client";
import type { DataProvider, UpdateParams, UpdateResponse, BaseRecord } from "@refinedev/core";

const supabaseDataProvider = dataProviderSupabase(supabaseBrowserClient);

export const dataProvider: DataProvider = {
  ...supabaseDataProvider,
  
  update: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({ resource, id, variables, meta }: UpdateParams<TVariables>): Promise<UpdateResponse<TData>> => {
    console.log("🔵 [DATA PROVIDER] UPDATE INICIADO");
    console.log("  📌 Resource:", resource);
    console.log("  📌 ID:", id);
    console.log("  📌 Variables (datos a guardar):", JSON.stringify(variables, null, 2));
    console.log("  📌 Meta:", meta);
    console.log("  📌 Timestamp:", new Date().toISOString());
    
    if (!id) {
      console.error("❌ [DATA PROVIDER] ERROR: NO HAY ID!");
      throw new Error("No hay ID para actualizar");
    }
    
    if (!variables || Object.keys(variables).length === 0) {
      console.error("❌ [DATA PROVIDER] ERROR: Variables vacías!");
      throw new Error("No hay datos para actualizar");
    }
    
    try {
      console.log("🟡 [DATA PROVIDER] Enviando a Supabase...");
      
      // Hacer el UPDATE directamente con el cliente de Supabase
      const { data, error } = await supabaseBrowserClient
        .from(resource)
        .update(variables as any)
        .eq("id", id)
        .select("*");
      
      console.log("🟡 [DATA PROVIDER] Respuesta de Supabase:");
      console.log("  - data:", data);
      console.log("  - error:", error);
      
      if (error) {
        console.error("❌ [DATA PROVIDER] ERROR DE SUPABASE:", error);
        throw error;
      }
      
      console.log("✅ [DATA PROVIDER] UPDATE EXITOSO");
      console.log("  📊 Datos retornados:", data);
      console.log("  📊 Cantidad de filas actualizadas:", data?.length);
      
      return { data: data as TData };
    } catch (error: any) {
      console.error("❌ [DATA PROVIDER] UPDATE FALLÓ");
      console.error("  💥 Error message:", error?.message);
      console.error("  💥 Error code:", error?.code);
      console.error("  💥 Error details:", error?.details);
      console.error("  💥 Error completo:", error);
      throw error;
    }
  },
};
