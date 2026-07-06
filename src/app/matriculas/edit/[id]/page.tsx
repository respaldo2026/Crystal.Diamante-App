"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Edit, useForm, useSelect } from "@refinedev/antd";
import { Form, Input, Select, DatePicker, Card, Alert, Typography, message } from "antd";
import { 
    UserOutlined, 
    BookOutlined, 
    CheckCircleOutlined, 
    SyncOutlined,
    CloseCircleOutlined
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { MODALIDAD_PAGO_DEFAULT, PLANES_PAGO, getPaymentPlan, normalizeModalidadPago, resolvePaymentPlanAmounts, type ProgramaPaymentConfig } from "@/types/payment-plans";

const formatoCOP = (valor: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(valor);

export default function MatriculaEdit() {
    const params = useParams();
    const matriculaId = params?.id ? String(params.id) : null;

    const { formProps, saveButtonProps, onFinish } = useForm();
    const [programaId, setProgramaId] = useState<string | undefined>(undefined);
    const [programaPricing, setProgramaPricing] = useState<ProgramaPaymentConfig | null>(null);
    const [originalModalidad, setOriginalModalidad] = useState(MODALIDAD_PAGO_DEFAULT);
    const [originalCursoId, setOriginalCursoId] = useState<string>("");
    const planSeleccionado = normalizeModalidadPago(Form.useWatch("modalidad_pago", formProps.form));
    const infoPlanSeleccionado = {
        ...getPaymentPlan(planSeleccionado),
        ...resolvePaymentPlanAmounts(planSeleccionado, programaPricing),
    };

    useEffect(() => {
        const cargarDatosOriginales = async () => {
            if (!matriculaId) return;

            const { data, error } = await supabaseBrowserClient
                .from("matriculas")
                .select("modalidad_pago, curso_id")
                .eq("id", matriculaId)
                .maybeSingle();

            if (error) {
                console.warn("No se pudieron cargar los datos originales de la matrícula", error);
                return;
            }

            setOriginalModalidad(normalizeModalidadPago(data?.modalidad_pago ?? null));
            setOriginalCursoId(String(data?.curso_id || ""));
        };

        cargarDatosOriginales();
    }, [matriculaId]);
    // Obtenemos datos de las tablas relacionadas para los selectores
    const { selectProps: studentSelectProps } = useSelect({
        resource: "perfiles",
        optionLabel: "nombre_completo",
        optionValue: "id",
        pagination: {
            mode: "off",
        },
        sorters: [{ field: "nombre_completo", order: "asc" }],
    });

    const { selectProps: courseSelectProps } = useSelect({
        resource: "cursos",
        optionLabel: "nombre",
        optionValue: "id",
        pagination: {
            mode: "off",
        },
        sorters: [{ field: "nombre", order: "asc" }],
    });

    const { selectProps: programaSelectProps } = useSelect({
        resource: "programas",
        optionLabel: "nombre",
        optionValue: "id",
    });

    const supabaseFetchPrograma = useCallback(async (cursoId: string) => {
        try {
            const { data } = await supabaseBrowserClient
                .from('cursos')
                .select('programa_id')
                .eq('id', cursoId)
                .maybeSingle();
            if (data?.programa_id) {
                setProgramaId(String(data.programa_id));
                formProps.form?.setFieldValue('programa_id', data.programa_id);
            }
        } catch (e) {
            console.warn('No se pudo cargar el programa del curso', e);
        }
    }, [formProps.form]);

    useEffect(() => {
        const cursoId = formProps.form?.getFieldValue('curso_id');
        if (cursoId) {
            supabaseFetchPrograma(cursoId);
        }
    }, [formProps.form, supabaseFetchPrograma]);

    useEffect(() => {
        const cargarPricingPrograma = async () => {
            if (!programaId) return;
            const { data } = await supabaseBrowserClient
                .from("programas")
                .select("precio_por_clase, precio_mensual_100, precio_mensualidad")
                .eq("id", programaId)
                .maybeSingle();

            setProgramaPricing(data || null);
        };

        cargarPricingPrograma();
    }, [programaId]);

    useEffect(() => {
        formProps.form?.setFieldValue("valor_mensual_plan", infoPlanSeleccionado.montoMensual);
        formProps.form?.setFieldValue("valor_por_clase", infoPlanSeleccionado.montoPorClase);
        formProps.form?.setFieldValue("porcentaje_productos", infoPlanSeleccionado.porcentajeProductos);
    }, [formProps.form, infoPlanSeleccionado.montoMensual, infoPlanSeleccionado.montoPorClase, infoPlanSeleccionado.porcentajeProductos]);

    const sincronizarPagosAlCambiarPlan = useCallback(async (nuevaModalidad: string, montoMensual: number) => {
        if (!matriculaId) return;

        const { data: pagosExistentes, error: pagosError } = await supabaseBrowserClient
            .from("pagos")
            .select("id, tipo_cuota, periodo_pagado, estado")
            .eq("matricula_id", matriculaId)
            .in("estado", ["pendiente", "vencido"]);

        if (pagosError) throw pagosError;

        const pagos = pagosExistentes || [];
        const esPagoPorClase = (p: { tipo_cuota?: string | null; periodo_pagado?: string | null }) => {
            const tipoCuota = String(p?.tipo_cuota || "").toLowerCase().trim();
            const periodo = String(p?.periodo_pagado || "").toLowerCase().trim();
            return tipoCuota === "por_clase" || /^clase\s*#?\s*\d+/i.test(periodo);
        };

        if (nuevaModalidad === "POR_CLASE") {
            // Eliminar cuotas mensuales pendientes al pasar a cobro por clase
            const pendientesMensuales = pagos.filter((p) => !esPagoPorClase(p));
            if (pendientesMensuales.length > 0) {
                await supabaseBrowserClient
                    .from("pagos")
                    .delete()
                    .in("id", pendientesMensuales.map((p) => p.id));
            }
            return;
        }

        // Al pasar a plan mensual: eliminar pendientes por clase y actualizar monto de mensuales
        const pendientesPorClase = pagos.filter(esPagoPorClase);
        if (pendientesPorClase.length > 0) {
            await supabaseBrowserClient
                .from("pagos")
                .delete()
                .in("id", pendientesPorClase.map((p) => p.id));
        }

        const pendientesMensuales = pagos.filter((p) => !esPagoPorClase(p));
        if (pendientesMensuales.length > 0) {
            await supabaseBrowserClient
                .from("pagos")
                .update({
                    monto: montoMensual,
                    monto_programado: montoMensual,
                    tipo_cuota: "mensual",
                })
                .in("id", pendientesMensuales.map((p) => p.id));
        }
    }, [matriculaId]);

    const adaptarFechasCobroAlNuevoGrupo = useCallback(async (nuevoCursoId: string, modalidadPagoActual: string) => {
        if (!matriculaId) return;

        const modalidadNormalizada = normalizeModalidadPago(modalidadPagoActual);
        if (modalidadNormalizada === "POR_CLASE") return;

        const { data: matriculasGrupo, error: errMatriculasGrupo } = await supabaseBrowserClient
            .from("matriculas")
            .select("id")
            .eq("curso_id", Number(nuevoCursoId))
            .neq("id", matriculaId);

        if (errMatriculasGrupo) throw errMatriculasGrupo;

        const matriculasReferencia = (matriculasGrupo || []).map((m: any) => String(m.id || "")).filter(Boolean);
        if (matriculasReferencia.length === 0) return;

        const { data: pagosReferenciaRaw, error: errPagosReferencia } = await supabaseBrowserClient
            .from("pagos")
            .select("numero_cuota, fecha_vencimiento, tipo_cuota, periodo_pagado")
            .in("matricula_id", matriculasReferencia)
            .not("fecha_vencimiento", "is", null)
            .gt("numero_cuota", 0)
            .order("numero_cuota", { ascending: true });

        if (errPagosReferencia) throw errPagosReferencia;

        const esPagoPorClase = (pago: { tipo_cuota?: string | null; periodo_pagado?: string | null }) => {
            const tipoCuota = String(pago?.tipo_cuota || "").toLowerCase().trim();
            const periodo = String(pago?.periodo_pagado || "").toLowerCase().trim();
            return tipoCuota === "por_clase" || /^clase\s*#?\s*\d+/i.test(periodo);
        };

        const pagosReferencia = (pagosReferenciaRaw || []).filter((pago: any) => !esPagoPorClase(pago));
        if (pagosReferencia.length === 0) return;

        const conteoDia = new Map<number, number>();
        const referenciaPorCuota = new Map<number, string>();

        pagosReferencia.forEach((pago: any) => {
            const numeroCuota = Number(pago?.numero_cuota || 0);
            const fecha = String(pago?.fecha_vencimiento || "");
            if (!numeroCuota || !fecha) return;

            if (!referenciaPorCuota.has(numeroCuota)) {
                referenciaPorCuota.set(numeroCuota, fecha);
            }

            const dia = dayjs(fecha).date();
            if (!Number.isFinite(dia) || dia <= 0) return;
            conteoDia.set(dia, (conteoDia.get(dia) || 0) + 1);
        });

        const diaAnclaGrupo = Array.from(conteoDia.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        if (!diaAnclaGrupo) return;

        const { data: pagosPropiosRaw, error: errPagosPropios } = await supabaseBrowserClient
            .from("pagos")
            .select("id, numero_cuota, fecha_vencimiento, estado, tipo_cuota, periodo_pagado")
            .eq("matricula_id", matriculaId)
            .in("estado", ["pendiente", "vencido"])
            .gt("numero_cuota", 0)
            .order("numero_cuota", { ascending: true });

        if (errPagosPropios) throw errPagosPropios;

        const pagosPropios = (pagosPropiosRaw || []).filter((pago: any) => !esPagoPorClase(pago));
        if (pagosPropios.length === 0) return;

        for (const pago of pagosPropios) {
            const numeroCuota = Number(pago?.numero_cuota || 0);
            if (!numeroCuota) continue;

            const referenciaExacta = referenciaPorCuota.get(numeroCuota);
            let nuevaFecha = referenciaExacta || null;

            if (!nuevaFecha) {
                const base = dayjs(String(pago?.fecha_vencimiento || ""));
                const baseValida = base.isValid() ? base : dayjs();
                const diaMes = Math.min(diaAnclaGrupo, baseValida.daysInMonth());
                nuevaFecha = baseValida.date(diaMes).format("YYYY-MM-DD");
            }

            if (!nuevaFecha || nuevaFecha === String(pago?.fecha_vencimiento || "")) continue;

            const { error: errUpdatePago } = await supabaseBrowserClient
                .from("pagos")
                .update({ fecha_vencimiento: nuevaFecha })
                .eq("id", pago.id);

            if (errUpdatePago) throw errUpdatePago;
        }
    }, [matriculaId]);

    const handleOnFinish = useCallback(async (values: any) => {
        const result = await onFinish(values);
        const cursoNuevo = String(values?.curso_id || "");
        const nuevaModalidad = normalizeModalidadPago(values.modalidad_pago);

        if (cursoNuevo && originalCursoId && cursoNuevo !== originalCursoId) {
            try {
                await adaptarFechasCobroAlNuevoGrupo(cursoNuevo, nuevaModalidad);
                message.success("Grupo actualizado. Las fechas de cobro pendientes se ajustaron al calendario del nuevo grupo.");
            } catch (err: any) {
                message.warning("El grupo se guardó, pero no se pudieron ajustar automáticamente las fechas de cobro.");
                console.error("Error adaptando fechas de cobro al nuevo grupo:", err);
            }
        }

        if (nuevaModalidad !== originalModalidad) {
            try {
                const montos = resolvePaymentPlanAmounts(nuevaModalidad, programaPricing);
                await sincronizarPagosAlCambiarPlan(nuevaModalidad, montos.montoMensual);
                message.success("Plan de pago actualizado. Los cobros pendientes fueron ajustados.");
            } catch (err: any) {
                message.warning("El plan se guardó, pero no se pudieron ajustar los pagos pendientes automáticamente.");
                console.error("Error sincronizando pagos al cambiar plan:", err);
            }
        }
        return result;
    }, [
        onFinish,
        originalCursoId,
        originalModalidad,
        programaPricing,
        sincronizarPagosAlCambiarPlan,
        adaptarFechasCobroAlNuevoGrupo,
    ]);

    return (
        <Edit saveButtonProps={saveButtonProps} title="Actualizar Matrícula">
            
            {/* Aviso importante */}
            <Alert 
                message="Gestión de Diplomas" 
                description="Para que el estudiante pueda descargar su Diploma, debes cambiar el estado a 'Aprobado'."
                type="info" 
                showIcon 
                style={{ marginBottom: 20 }}
            />

            <Form {...formProps} form={formProps.form} layout="vertical" onFinish={handleOnFinish}>
                <Form.Item name="valor_mensual_plan" hidden>
                    <Input />
                </Form.Item>
                <Form.Item name="valor_por_clase" hidden>
                    <Input />
                </Form.Item>
                <Form.Item name="porcentaje_productos" hidden>
                    <Input />
                </Form.Item>
                
                <Card title="Datos de la Matrícula" variant="borderless">
                    
                    {/* ESTUDIANTE */}
                    <Form.Item label="Estudiante" name="estudiante_id">
                        <Select
                            {...studentSelectProps}
                            suffixIcon={<UserOutlined />}
                            showSearch
                            optionFilterProp="label"
                            placeholder="Selecciona el estudiante"
                        />
                    </Form.Item>

                    {/* PROGRAMA (solo lectura) */}
                    <Form.Item label="Programa" name="programa_id">
                        <Select {...programaSelectProps} disabled placeholder="Programa del curso" />
                    </Form.Item>

                    {/* CURSO / GRUPO */}
                    <Form.Item label="Curso" name="curso_id">
                        <Select
                            {...courseSelectProps}
                            suffixIcon={<BookOutlined />}
                            showSearch
                            optionFilterProp="label"
                            placeholder="Selecciona el grupo"
                            onChange={(value) => {
                                const cursoSeleccionado = String(value || "");
                                if (!cursoSeleccionado) return;
                                supabaseFetchPrograma(cursoSeleccionado);
                            }}
                        />
                    </Form.Item>

                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="Cambio de grupo"
                        description="Si cambias de grupo, al guardar se ajustarán automáticamente las fechas de cobro pendientes al calendario del nuevo grupo."
                    />

                    <Form.Item
                        label="Modalidad de Pago"
                        name="modalidad_pago"
                        initialValue={MODALIDAD_PAGO_DEFAULT}
                        rules={[{ required: true, message: "Selecciona una modalidad de pago" }]}
                    >
                        <Select
                            options={Object.values(PLANES_PAGO).map((plan) => ({
                                value: plan.modalidad,
                                label: `${plan.label} · ${plan.descripcion}`,
                            }))}
                        />
                    </Form.Item>

                    <Form.Item label="Resumen del Plan">
                        <Card size="small" styles={{ body: { padding: 12 } }}>
                            {planSeleccionado === "POR_CLASE" ? (
                                <Typography.Text>
                                    Cobro por clase: <strong>{formatoCOP(infoPlanSeleccionado.montoPorClase)}</strong>
                                </Typography.Text>
                            ) : (
                                <Typography.Text>
                                    Mensualidad fija: <strong>{formatoCOP(infoPlanSeleccionado.montoMensual)}</strong> · Incluye <strong>{infoPlanSeleccionado.porcentajeProductos}%</strong> de productos.
                                </Typography.Text>
                            )}
                        </Card>
                    </Form.Item>

                    {/* ESTADO - ¡AQUÍ ESTÁ LA MAGIA! ✨ */}
                    <Form.Item 
                        label="Estado Académico" 
                        name="estado"
                        rules={[{ required: true, message: "Por favor define el estado" }]}
                        help="Selecciona 'Aprobado' cuando termine el curso."
                    >
                        <Select 
                            placeholder="Selecciona el estado..."
                            options={[
                                { label: 'En Curso / Activo', value: 'activo', icon: <SyncOutlined spin /> },
                                { label: 'Aprobado (Genera Diploma)', value: 'aprobado', icon: <CheckCircleOutlined style={{color:'green'}}/> },
                                { label: 'Cancelado / Retirado', value: 'cancelado', icon: <CloseCircleOutlined style={{color:'red'}}/> },
                            ]}
                        />
                    </Form.Item>

                    {/* NOTAS O COMENTARIOS */}
                    <Form.Item label="Observaciones / Nota Final" name="observaciones">
                        <Input.TextArea rows={3} placeholder="Ej: Nota final 4.8 - Excelente desempeño" />
                    </Form.Item>

                </Card>
            </Form>
        </Edit>
    );
}