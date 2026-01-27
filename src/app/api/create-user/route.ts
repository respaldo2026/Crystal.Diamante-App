import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, rol, user_metadata } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña son obligatorios' }, { status: 400 });
    }

    // Inicializar cliente Admin de Supabase (Solo servidor)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 1. Crear usuario en Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto confirmar email
      user_metadata: {
        ...user_metadata,
        rol,
      },
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authData.user.id;

    // 2. Crear/actualizar el perfil público (con upsert para asegurar que exista)
    const { error: profileError } = await supabaseAdmin
      .from('perfiles')
      .upsert({
        id: userId,
        ...user_metadata,
        rol,
        email,
      }, { onConflict: 'id' });

    if (profileError) {
        console.error("Error actualizando perfil:", profileError);
        // No retornamos error 500 porque el usuario Auth ya se creó, es mejor avisar
        return NextResponse.json({ user: authData.user, warning: "Usuario creado pero hubo un error actualizando detalles del perfil." });
    }

    const { data: perfil } = await supabaseAdmin
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();


    // 3. Registrar acción en audit_logs (no bloquear si falta URL)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
    try {
      await fetch(appUrl + '/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          action: 'create',
          entity: 'user',
          entity_id: userId,
          details: { email, rol, user_metadata },
        }),
      });
    } catch (logErr) {
      console.warn('Audit log fallo (se continúa):', logErr);
    }

    return NextResponse.json({ user: authData.user, perfil, message: 'Usuario creado exitosamente' });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}