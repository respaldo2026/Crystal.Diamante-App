import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const cronApiKey = process.env.CRON_API_KEY;
    if (!cronApiKey) {
      return NextResponse.json(
        { success: false, error: "CRON_API_KEY no está configurada" },
        { status: 500 },
      );
    }

    const origin = new URL(request.url).origin;
    const response = await fetch(`${origin}/api/cron/liquidacion-profesores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cronApiKey,
      },
      cache: "no-store",
    });

    const payload = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: payload?.error || "No se pudo ejecutar la liquidación" },
        { status: response.status },
      );
    }

    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error("[Tesorería] Error ejecutando liquidación manual:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 },
    );
  }
}
