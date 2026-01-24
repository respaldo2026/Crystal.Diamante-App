import { NextResponse, type NextRequest } from "next/server";
import { CookieOptions, createServerClient } from "@supabase/ssr";

type SupabaseCookie = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const pendingCookies: SupabaseCookie[] = [];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment variables are not configured");
    }

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookies: SupabaseCookie[]) {
            pendingCookies.push(...cookies);
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(
      url.toString()
    );

    // Always redirect to home (or / after successful exchange)
    const redirectTo = url.searchParams.get("redirect") || "/";
    const response = NextResponse.redirect(url.origin + redirectTo);

    pendingCookies.forEach(({ name, value, options }) => {
      response.cookies.set(name, value, options);
    });

    if (error) {
      // Preserve cookies even on error; add error marker for debugging
      response.headers.set("x-auth-error", error.message);
    }

    return response;
  } catch (e: any) {
    // Fallback redirect
    return NextResponse.redirect(new URL("/", request.url));
  }
}
