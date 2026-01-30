"use client";

import { dataProvider as dataProviderSupabase } from "@refinedev/supabase";
import { supabaseBrowserClient } from "@utils/supabase/client";
import type { DataProvider } from "@refinedev/core";

const supabaseDataProvider = dataProviderSupabase(supabaseBrowserClient);

export const dataProvider: DataProvider = {
  ...supabaseDataProvider,
  
  update: async ({ resource, id, variables, meta }) => {
    console.log("🔵 [DATA PROVIDER] UPDATE iniciado");
    console.log("  - Resource:", resource);
    console.log("  - ID:", id);
    console.log("  - Variables:", variables);
    console.log("  - Meta:", meta);
    
    try {
      const result = await supabaseDataProvider.update!({ resource, id, variables, meta });
      console.log("✅ [DATA PROVIDER] UPDATE exitoso:", result);
      return result;
    } catch (error: any) {
      console.error("❌ [DATA PROVIDER] UPDATE falló:", error);
      console.error("  - Error message:", error?.message);
      console.error("  - Error details:", error?.details);
      console.error("  - Error hint:", error?.hint);
      throw error;
    }
  },
};
