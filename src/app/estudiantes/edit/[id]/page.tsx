"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, Row, Col, Divider, Alert, DatePicker, Select, message, Card, Typography, Spin, Avatar, Space, Button, Modal } from "antd";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { MODALIDAD_PAGO_DEFAULT, PLANES_PAGO, normalizeModalidadPago, resolvePaymentPlanAmounts, type ModalidadPago, type ProgramaPaymentConfig } from "@/types/payment-plans";
import { CameraOutlined, UserOutlined } from "@ant-design/icons";

type MatriculaEditable = {
    id: string;
    curso_id: string | number | null;
    fecha_inicio: string | null;
    estado: string | null;
    modalidad_pago: string | null;
    valor_mensual_plan: number | null;
    valor_por_clase: number | null;
    porcentaje_productos: number | null;
    cursos?: {
        nombre?: string | null;
        precio_mensualidad?: number | null;
        numero_cuotas?: number | null;
        duracion?: string | number | null;
        programas?: {
            nombre?: string | null;
            precio_por_clase?: number | null;
            precio_mensual_100?: number | null;
            precio_mensualidad?: number | null;
            numero_cuotas?: number | null;
        } | null;
    } | null;
};

const { Text } = Typography;

const formatoCOP = (valor: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(valor);

const opcionesPlanPago = Object.values(PLANES_PAGO).map((plan) => ({
    value: plan.modalidad,
    label: `${plan.label} · ${plan.descripcion}`,
}));

export default function EditEstudiante() {
  const params = useParams();
  const id = params?.id as string;

  console.log("🟣 [COMPONENTE] EditEstudiante montado");
  console.log("🟣 [COMPONENTE] ID desde params:", id);

    const [matriculasEditable, setMatriculasEditable] = useState<MatriculaEditable[]>([]);
    const [loadingMatriculas, setLoadingMatriculas] = useState(true);
    const [fotoPreviewUrl, setFotoPreviewUrl] = useState<string>("");
    const [subiendoFoto, setSubiendoFoto] = useState(false);
    const [camaraAbierta, setCamaraAbierta] = useState(false);
    const [capturandoFoto, setCapturandoFoto] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

  const { formProps, saveButtonProps, formLoading, onFinish } = useForm({
    resource: "perfiles", // Guardamos en la tabla perfiles
    action: "edit",
    id,
    redirect: "list",     // Al terminar, volvemos a la lista
    // Pedirle a Supabase que retorne los datos actualizados
    meta: { 
      select: "*",
      returning: true 
    } 
  });
        const modalidadesMatriculaWatch = Form.useWatch("modalidades_matricula", formProps.form) || {};

    const calcularFechaVencimientoCuota = useCallback((fechaInicio?: string | null, numeroCuota?: number | null) => {
        if (!fechaInicio || !numeroCuota || numeroCuota < 1) return null;
        const fecha = dayjs(fechaInicio);
        if (!fecha.isValid()) return null;
        return fecha.add(numeroCuota - 1, "month").format("YYYY-MM-DD");
    }, []);

    const parseNumeroCuotas = useCallback((matricula: MatriculaEditable) => {
        const direct = Number(
            matricula?.cursos?.numero_cuotas ??
            matricula?.cursos?.programas?.numero_cuotas ??
            0,
        );
        if (Number.isFinite(direct) && direct > 0) return direct;

        const raw = String(matricula?.cursos?.duracion ?? "");
        const match = raw.match(/\d+/);
        if (match?.[0]) {
            const parsed = Number(match[0]);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }

        return 4;
    }, []);

    const fotoUrlWatch = Form.useWatch("foto_url", formProps.form);

    useEffect(() => {
        if (typeof fotoUrlWatch === "string") {
            setFotoPreviewUrl(fotoUrlWatch);
        }
    }, [fotoUrlWatch]);

    const detenerCamara = useCallback(() => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const abrirCamara = useCallback(async () => {
        try {
            setCamaraAbierta(true);
        } catch (error) {
            console.error("No se pudo abrir la cámara:", error);
            message.error("No se pudo abrir la cámara");
        }
    }, []);

    useEffect(() => {
        if (!camaraAbierta) {
            detenerCamara();
            return;
        }

        let cancelado = false;

        const iniciarCamara = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: "environment" } },
                    audio: false,
                });

                if (cancelado) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                streamRef.current = stream;

                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play();
                }
            } catch (error: any) {
                console.error("Error accediendo a la cámara:", error);
                message.error(error?.message || "No se pudo acceder a la cámara del PC");
                setCamaraAbierta(false);
            }
        };

        iniciarCamara();

        return () => {
            cancelado = true;
            detenerCamara();
        };
    }, [camaraAbierta, detenerCamara]);

    const cargarMatriculas = useCallback(async () => {
        if (!id) return;

        setLoadingMatriculas(true);
        const { data, error } = await supabaseBrowserClient
            .from("matriculas")
            .select(`
                id,
                curso_id,
                fecha_inicio,
                estado,
                modalidad_pago,
                valor_mensual_plan,
                valor_por_clase,
                porcentaje_productos,
                cursos(
                    nombre,
                    precio_mensualidad,
                    numero_cuotas,
                    duracion,
                    programas:programa_id(
                        nombre,
                        precio_por_clase,
                        precio_mensual_100,
                        precio_mensualidad,
                        numero_cuotas
                    )
                )
            `)
            .eq("estudiante_id", id)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("❌ Error cargando matrículas del estudiante:", error);
            message.warning("No se pudieron cargar las modalidades de pago de las matrículas.");
            setMatriculasEditable([]);
            setLoadingMatriculas(false);
            return;
        }

        const matriculas = (data as MatriculaEditable[] | null) ?? [];
        setMatriculasEditable(matriculas);

        const modalidadesIniciales = matriculas.reduce<Record<string, ModalidadPago>>((acc, matricula) => {
            acc[String(matricula.id)] = normalizeModalidadPago(matricula.modalidad_pago);
            return acc;
        }, {});

        formProps.form?.setFieldValue("modalidades_matricula", modalidadesIniciales);
        setLoadingMatriculas(false);
    }, [formProps.form, id]);

    const subirFotoPerfil = async (file: File) => {
        try {
            setSubiendoFoto(true);

            const identificacion = String(formProps.form?.getFieldValue("identificacion") || "").replace(/\D/g, "").trim() || String(id || "estudiante");
            const fileExt = file.name.split(".").pop() || "jpg";
            const filePath = `perfiles/${identificacion}_${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabaseBrowserClient.storage
                .from("avatars")
                .upload(filePath, file, { upsert: true, contentType: file.type });

            if (uploadError) throw uploadError;

            const { data: publicData } = supabaseBrowserClient.storage
                .from("avatars")
                .getPublicUrl(filePath);

            const publicUrl = publicData?.publicUrl || "";
            if (!publicUrl) throw new Error("No se pudo obtener la URL pública de la foto");

            const { error: updateError } = await supabaseBrowserClient
                .from("perfiles")
                .update({ foto_url: publicUrl })
                .eq("id", id);

            if (updateError) throw updateError;

            setFotoPreviewUrl(publicUrl);
            formProps.form?.setFieldValue("foto_url", publicUrl);
            message.success("Foto actualizada y guardada correctamente");
        } catch (error: any) {
            console.error("Error subiendo foto del perfil:", error);
            message.error(error?.message || "No se pudo subir la foto");
        } finally {
            setSubiendoFoto(false);
        }

        return false;
    };

    const capturarFotoDesdeCamara = async () => {
        try {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            if (!video || !canvas) {
                message.error("La cámara todavía no está lista");
                return;
            }

            setCapturandoFoto(true);

            const width = video.videoWidth || 1280;
            const height = video.videoHeight || 720;
            canvas.width = width;
            canvas.height = height;

            const context = canvas.getContext("2d");
            if (!context) throw new Error("No se pudo preparar la captura");

            context.drawImage(video, 0, 0, width, height);

            const blob = await new Promise<Blob | null>((resolve) => {
                canvas.toBlob(resolve, "image/jpeg", 0.92);
            });

            if (!blob) throw new Error("No se pudo capturar la imagen");

            const fileName = `foto_${String(id || "estudiante")}_${Date.now()}.jpg`;
            const file = new File([blob], fileName, { type: "image/jpeg" });

            await subirFotoPerfil(file);
            setCamaraAbierta(false);
        } catch (error: any) {
            console.error("Error capturando foto:", error);
            message.error(error?.message || "No se pudo capturar la foto");
        } finally {
            setCapturandoFoto(false);
        }
    };

    useEffect(() => {
        cargarMatriculas();
    }, [cargarMatriculas]);

    const sincronizarPagosPendientes = useCallback(async (matricula: MatriculaEditable, modalidadPago: ModalidadPago, montoMensualCalculado: number) => {
        const montos = { montoMensual: montoMensualCalculado };
        const numeroCuotas = parseNumeroCuotas(matricula);

        const { data: pagosExistentes, error: pagosError } = await supabaseBrowserClient
            .from("pagos")
            .select("id, numero_cuota, estado, periodo_pagado, tipo_cuota, fecha_pago")
            .eq("matricula_id", matricula.id)
            .order("numero_cuota", { ascending: true });

        if (pagosError) throw pagosError;

        const pagos = (pagosExistentes || []) as Array<{
            id: string;
            numero_cuota: number | null;
            estado: string | null;
            periodo_pagado: string | null;
            tipo_cuota?: string | null;
            fecha_pago?: string | null;
        }>;
        const esPagoPorClase = (pago: {
            tipo_cuota?: string | null;
            periodo_pagado?: string | null;
        }) => {
            const tipoCuota = String(pago?.tipo_cuota || "").toLowerCase().trim();
            const periodo = String(pago?.periodo_pagado || "").toLowerCase().trim();
            return tipoCuota === "por_clase" || /^clase\s*#?\s*\d+/i.test(periodo);
        };
        const cuotasPendientes = pagos.filter((pago) => {
            const estado = String(pago.estado || "").toLowerCase().trim();
            return (estado === "pendiente" || estado === "vencido") && Number(pago.numero_cuota || 0) > 0;
        });
        const cuotasPendientesPorClase = cuotasPendientes.filter((pago) => esPagoPorClase(pago));
        const cuotasPendientesMensuales = cuotasPendientes.filter((pago) => !esPagoPorClase(pago));

        if (modalidadPago === "POR_CLASE") {
            if (cuotasPendientes.length > 0) {
                const { error: deleteError } = await supabaseBrowserClient
                    .from("pagos")
                    .delete()
                    .in("id", cuotasPendientes.map((cuota) => cuota.id));
                if (deleteError) throw deleteError;
            }
            return;
        }

        if (cuotasPendientesPorClase.length > 0) {
            const { error: deletePendientesPorClaseError } = await supabaseBrowserClient
                .from("pagos")
                .delete()
                .in("id", cuotasPendientesPorClase.map((cuota) => cuota.id));
            if (deletePendientesPorClaseError) throw deletePendientesPorClaseError;
        }

        if (cuotasPendientesMensuales.length > 0) {
            const { error: updateError } = await supabaseBrowserClient
                .from("pagos")
                .update({
                    monto: montos.montoMensual,
                    monto_programado: montos.montoMensual,
                    tipo_cuota: "mensual",
                })
                .in("id", cuotasPendientesMensuales.map((cuota) => cuota.id));
            if (updateError) throw updateError;
        }

        const cuotasMensualesExistentes = pagos
            .filter((pago) => Number(pago.numero_cuota || 0) > 0)
            .filter((pago) => !esPagoPorClase(pago))
            .sort((a, b) => {
                const numeroA = Number(a.numero_cuota || 0);
                const numeroB = Number(b.numero_cuota || 0);
                if (numeroA !== numeroB) return numeroA - numeroB;
                const fechaA = a.fecha_pago ? dayjs(a.fecha_pago).valueOf() : Number.MAX_SAFE_INTEGER;
                const fechaB = b.fecha_pago ? dayjs(b.fecha_pago).valueOf() : Number.MAX_SAFE_INTEGER;
                return fechaA - fechaB;
            });

        for (const [index, pago] of cuotasMensualesExistentes.entries()) {
            const consecutivoEsperado = index + 1;
            const consecutivoActual = Number(pago.numero_cuota || 0);
            if (consecutivoActual === consecutivoEsperado) continue;

            const { error: updateConsecutivoError } = await supabaseBrowserClient
                .from("pagos")
                .update({
                    numero_cuota: consecutivoEsperado,
                    periodo_pagado: `Cuota ${consecutivoEsperado} de ${numeroCuotas}`,
                    tipo_cuota: "mensual",
                })
                .eq("id", pago.id);

            if (updateConsecutivoError) throw updateConsecutivoError;
        }

        const cuotasExistentes = new Set<number>();
        for (let i = 1; i <= cuotasMensualesExistentes.length; i += 1) {
            cuotasExistentes.add(i);
        }

        const nuevasCuotas = [] as Array<Record<string, unknown>>;
        for (let i = 1; i <= numeroCuotas; i += 1) {
            if (cuotasExistentes.has(i)) continue;
            nuevasCuotas.push({
                estudiante_id: id,
                matricula_id: matricula.id,
                numero_cuota: i,
                periodo_pagado: `Cuota ${i} de ${numeroCuotas}`,
                tipo_cuota: "mensual",
                monto: montos.montoMensual,
                estado: "pendiente",
                metodo_pago: null,
                fecha_vencimiento: calcularFechaVencimientoCuota(matricula.fecha_inicio, i),
            });
        }

        if (nuevasCuotas.length > 0) {
            const { error: insertError } = await supabaseBrowserClient.from("pagos").insert(nuevasCuotas);
            if (insertError) throw insertError;
        }
    }, [calcularFechaVencimientoCuota, id, parseNumeroCuotas]);

  console.log("🟣 [COMPONENTE] useForm retornó:");
  console.log("  - formProps:", formProps ? "OK" : "NULL");
  console.log("  - saveButtonProps:", saveButtonProps);
  console.log("  - formLoading:", formLoading);
  console.log("  - onFinish:", typeof onFinish);

  const handleOnFinish = async (values: any) => {
    console.log("═══════════════════════════════════════════════");
    console.log("🔵 [FORM] onFinish EJECUTADO");
    console.log("═══════════════════════════════════════════════");
    console.log("📌 ID del estudiante:", id);
    console.log("📌 Valores del formulario (completos):", values);
    console.log("📌 Tipo de valores:", typeof values);
    console.log("📌 Keys de valores:", Object.keys(values));
    
    // Verificar que hay datos
    if (!values || Object.keys(values).length === 0) {
      console.error("❌ [FORM] ERROR: Formulario vacío!");
      return;
    }
    
    const datosListos = {
      ...values,
      fecha_nacimiento: values.fecha_nacimiento ? dayjs(values.fecha_nacimiento).format("YYYY-MM-DD") : null,
    };
        const modalidadesMatricula = datosListos.modalidades_matricula || {};
    delete datosListos.created_at;
    delete datosListos.updated_at;
    delete datosListos.id;
        delete datosListos.modalidades_matricula;
    
    console.log("🟢 [FORM] Datos limpios para enviar:", datosListos);
    console.log("🟢 [FORM] Cantidad de campos:", Object.keys(datosListos).length);
    
    try {
      console.log("🟡 [FORM] Llamando a onFinish()...");
      const result = await onFinish(datosListos);
      console.log("✅ [FORM] onFinish retornó:", result);
      console.log("✅ [FORM] result?.data:", result?.data);

            let cambiosModalidad = 0;
            for (const matricula of matriculasEditable) {
                const nuevaModalidad = normalizeModalidadPago(modalidadesMatricula[String(matricula.id)] || matricula.modalidad_pago);
                const modalidadActual = normalizeModalidadPago(matricula.modalidad_pago);
                if (nuevaModalidad === modalidadActual) continue;
                cambiosModalidad += 1;

                const programaPricing: ProgramaPaymentConfig = {
                    precio_por_clase: matricula?.cursos?.programas?.precio_por_clase,
                    precio_mensual_100: matricula?.cursos?.programas?.precio_mensual_100,
                    precio_mensualidad: matricula?.cursos?.precio_mensualidad ?? matricula?.cursos?.programas?.precio_mensualidad,
                };

                const montos = resolvePaymentPlanAmounts(nuevaModalidad, programaPricing);

                const { error: matriculaError } = await supabaseBrowserClient
                    .from("matriculas")
                    .update({
                        modalidad_pago: nuevaModalidad,
                        valor_mensual_plan: montos.montoMensual,
                        valor_por_clase: montos.montoPorClase,
                        porcentaje_productos: montos.porcentajeProductos,
                    })
                    .eq("id", matricula.id);

                if (matriculaError) throw matriculaError;
                await sincronizarPagosPendientes(matricula, nuevaModalidad, montos.montoMensual);
            }

            if (cambiosModalidad > 0) {
                message.success("Modalidades de pago actualizadas en las matrículas del estudiante.");
            }

            const emailActualizado = String(datosListos?.email || "").trim().toLowerCase();
            if (emailActualizado) {
                try {
                    const syncResponse = await fetch("/api/auth/sync-user-email", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            userId: id,
                            email: emailActualizado,
                        }),
                    });

                    const syncResult = await syncResponse.json();
                    if (!syncResponse.ok) {
                        message.warning(
                            syncResult?.error ||
                                "El perfil se actualizó, pero no se pudo sincronizar el correo en Auth."
                        );
                    } else if (syncResult?.updated) {
                        message.success("Correo sincronizado en acceso (Auth).");
                    } else if (syncResult?.ok) {
                        message.info("El correo ya estaba sincronizado en acceso.");
                    }
                } catch (syncError: any) {
                    message.warning(
                        syncError?.message ||
                            "El perfil se actualizó, pero falló la sincronización del correo en Auth."
                    );
                }
            }
      
      // Aunque Supabase no devuelva datos, el UPDATE probablemente se guardó
      // Refine redirigirá a la lista de todas formas porque onFinish se completó
      console.log("✅ [FORM] UPDATE completado - Redirigiendo a lista...");
      console.log("═══════════════════════════════════════════════");
      return result;
    } catch (error) {
      console.error("❌ [FORM] ERROR en onFinish:", error);
      console.error("❌ [FORM] Error message:", (error as any)?.message);
      console.error("═══════════════════════════════════════════════");
      throw error;
    }
  };

  return (
    <Edit saveButtonProps={saveButtonProps} isLoading={formLoading} title="Editar Estudiante">
    <Form {...formProps} form={formProps.form} layout="vertical" onFinish={handleOnFinish}>
        
        {/* ROL OCULTO (Seguridad) */}
        <Form.Item name="rol" hidden><Input /></Form.Item>
        <Form.Item name="foto_url" hidden><Input /></Form.Item>

        <Alert message="Edita los datos personales y académicos del alumno aquí." type="info" showIcon style={{marginBottom: 20}} />

        <h3 style={{ color: '#722ed1' }}>Datos Personales</h3>

        <Row gutter={24} style={{ marginBottom: 16 }}>
            <Col xs={24} md={12}>
                <Card size="small" style={{ textAlign: "center" }}>
                    <Space direction="vertical" size={10} style={{ width: "100%" }}>
                        <Avatar size={96} src={fotoPreviewUrl || undefined} icon={<UserOutlined />} />
                        <Button icon={<CameraOutlined />} onClick={abrirCamara} loading={subiendoFoto}>
                            Abrir cámara y tomar foto
                        </Button>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Se abrirá la cámara del PC para capturar la foto.
                        </Text>
                    </Space>
                </Card>
            </Col>
        </Row>

        <Modal
            title="Tomar foto del estudiante"
            open={camaraAbierta}
            onCancel={() => setCamaraAbierta(false)}
            onOk={capturarFotoDesdeCamara}
            okText="Capturar y guardar"
            cancelText="Cerrar"
            confirmLoading={capturandoFoto}
            destroyOnClose
            afterClose={detenerCamara}
            styles={{ body: { maxHeight: "70vh", overflow: "auto" } }}
            style={{ top: 20 }}
            width="min(92vw, 720px)"
        >
            <Space direction="vertical" style={{ width: "100%" }} size={12}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: "100%", borderRadius: 12, background: "#111", maxHeight: "55vh", objectFit: "cover" }}
                />
                <canvas ref={canvasRef} style={{ display: "none" }} />
                <Text type="secondary">Autoriza el acceso a la cámara cuando el navegador lo solicite.</Text>
            </Space>
        </Modal>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item label="Nombre Completo" name="nombre_completo" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
            </Col>
            <Col xs={24} md={12}>
                <Form.Item label="Identificación / Cédula" name="identificacion" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
            </Col>
        </Row>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item 
                    label="Fecha de Nacimiento" 
                    name="fecha_nacimiento"
                    getValueProps={(value) => ({
                        value: value ? dayjs(value) : undefined,
                    })}
                >
                    <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                </Form.Item>
            </Col>
            <Col xs={24} md={12}>
                <Form.Item label="Género" name="genero">
                    <Select placeholder="Selecciona género">
                        <Select.Option value="Masculino">Masculino</Select.Option>
                        <Select.Option value="Femenino">Femenino</Select.Option>
                        <Select.Option value="Otro">Otro</Select.Option>
                    </Select>
                </Form.Item>
            </Col>
        </Row>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item label="Talla de camiseta" name="talla_camiseta" help="Para uniformes o dotación">
                    <Select placeholder="Selecciona talla">
                        <Select.Option value="XS">XS</Select.Option>
                        <Select.Option value="S">S</Select.Option>
                        <Select.Option value="M">M</Select.Option>
                        <Select.Option value="L">L</Select.Option>
                        <Select.Option value="XL">XL</Select.Option>
                        <Select.Option value="XXL">XXL</Select.Option>
                    </Select>
                </Form.Item>
            </Col>
        </Row>

        <Divider orientation="left" style={{color: '#722ed1'}}>Información de Contacto</Divider>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item label="Email" name="email" rules={[{ type: 'email' }]}>
                    <Input />
                </Form.Item>
            </Col>
            <Col xs={24} md={12}>
                <Form.Item label="Teléfono / WhatsApp" name="telefono" rules={[{ required: true }]}>
                    <Input />
                </Form.Item>
            </Col>
        </Row>

        <Form.Item label="Dirección de Residencia" name="direccion">
            <Input.TextArea rows={2} />
        </Form.Item>

        <Divider orientation="left" style={{color: '#722ed1'}}>Datos del Acudiente</Divider>

        <Row gutter={24}>
            <Col xs={24} md={12}>
                <Form.Item label="Nombre del Acudiente" name="acudiente_nombre">
                    <Input placeholder="Contacto de emergencia" />
                </Form.Item>
            </Col>
            <Col xs={24} md={12}>
                <Form.Item label="Teléfono del Acudiente" name="acudiente_telefono">
                    <Input />
                </Form.Item>
            </Col>
        </Row>

        <Form.Item label="Observaciones / Notas Especiales" name="observaciones">
            <Input.TextArea rows={3} placeholder="Alergias, condiciones, preferencias..." />
        </Form.Item>

                <Divider orientation="left" style={{color: '#722ed1'}}>Modalidad de Pago por Matrícula</Divider>

                <Alert
                    message="Estas modalidades se guardan en las matrículas"
                    description="Si corriges una modalidad aquí, el cambio se reflejará en listados, ficha del estudiante, portal y paneles que leen la información desde matrícula."
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                />

                {loadingMatriculas ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                        <Spin />
                    </div>
                ) : matriculasEditable.length === 0 ? (
                    <Alert
                        message="Este estudiante no tiene matrículas registradas"
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                    />
                ) : (
                    matriculasEditable.map((matricula) => {
                        const modalidadActual = normalizeModalidadPago(modalidadesMatriculaWatch[String(matricula.id)] || matricula.modalidad_pago || MODALIDAD_PAGO_DEFAULT);
                        const pricingPrograma: ProgramaPaymentConfig = {
                            precio_por_clase: matricula?.cursos?.programas?.precio_por_clase,
                            precio_mensual_100: matricula?.cursos?.programas?.precio_mensual_100,
                            precio_mensualidad: matricula?.cursos?.precio_mensualidad ?? matricula?.cursos?.programas?.precio_mensualidad,
                        };
                        const resumenPlan = resolvePaymentPlanAmounts(modalidadActual, pricingPrograma);

                        return (
                            <Card key={matricula.id} size="small" style={{ marginBottom: 12 }}>
                                <Row gutter={16} align="middle">
                                    <Col xs={24} md={8}>
                                        <Text strong>{matricula?.cursos?.nombre || "Curso sin nombre"}</Text>
                                        <br />
                                        <Text type="secondary">Estado: {matricula.estado || "Sin estado"}</Text>
                                    </Col>
                                    <Col xs={24} md={10}>
                                        <Form.Item
                                            label="Modalidad de pago"
                                            name={["modalidades_matricula", String(matricula.id)]}
                                            initialValue={normalizeModalidadPago(matricula.modalidad_pago)}
                                            style={{ marginBottom: 0 }}
                                        >
                                            <Select options={opcionesPlanPago} />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={6}>
                                        {modalidadActual === "POR_CLASE" ? (
                                            <Text>Cobro por clase: <strong>{formatoCOP(resumenPlan.montoPorClase)}</strong></Text>
                                        ) : (
                                            <Text>Mensualidad: <strong>{formatoCOP(resumenPlan.montoMensual)}</strong></Text>
                                        )}
                                    </Col>
                                </Row>
                            </Card>
                        );
                    })
                )}

      </Form>
    </Edit>
  );
}