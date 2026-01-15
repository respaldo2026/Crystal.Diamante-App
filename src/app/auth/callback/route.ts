import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookies) {
            const response = NextResponse.redirect(url.origin + "/");
            cookies.forEach(({ name, value, options }: any) => {
              response.cookies.set(name, value, options);
            });
            return response;
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(url);

    // Always redirect to home (or / after successful exchange)
    const redirectTo = url.searchParams.get("redirect") || "/";
    const response = NextResponse.redirect(url.origin + redirectTo);

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
