"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_KEY } from "./constants";

export const supabaseBrowserClient = createBrowserClient(
  SUPABASE_URL,
  SUPABASE_KEY
);