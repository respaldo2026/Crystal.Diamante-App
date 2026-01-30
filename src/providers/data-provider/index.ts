"use client";

import { dataProvider as dataProviderSupabase } from "@refinedev/supabase";
import { supabaseBrowserClient } from "@utils/supabase/client";
import type { DataProvider, UpdateParams, UpdateResponse, BaseRecord } from "@refinedev/core";

const supabaseDataProvider = dataProviderSupabase(supabaseBrowserClient);

export const dataProvider: DataProvider = {
  ...supabaseDataProvider,
  
  update: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({ resource, id, variables, meta }: UpdateParams<TVariables>) => {
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
      const result = await supabaseDataProvider.update!({ resource, id, variables, meta });
      
      console.log("✅ [DATA PROVIDER] UPDATE EXITOSO");
      console.log("  📊 Resultado:", JSON.stringify(result, null, 2));
      console.log("  📊 Data retornada:", result?.data);
      console.log("  📊 Tipo de resultado:", typeof result);
      
      return result;
    } catch (error: any) {
      console.error("❌ [DATA PROVIDER] UPDATE FALLÓ");
      console.error("  💥 Error message:", error?.message);
      console.error("  💥 Error code:", error?.code);
      console.error("  💥 Error details:", error?.details);
      console.error("  💥 Error hint:", error?.hint);
      console.error("  💥 Error status:", error?.status);
      console.error("  💥 Error completo:", error);
      throw error;
    }
  },
};
