"use client";

import React, { useMemo, useState } from "react";
import { List, useTable, CreateButton, EditButton, DeleteButton } from "@refinedev/antd";
import { Table, Space, Tag, Typography, Card, Statistic, Row, Col, Input, Button, DatePicker, Select, Alert } from "antd";
import { 
    DollarCircleOutlined, 
    UserOutlined, 
    BankOutlined, 
    CalendarOutlined,
    SearchOutlined,
    DeleteOutlined
} from "@ant-design/icons";
import { useCurrentUser } from "@hooks/useCurrentUser";
import dayjs from "dayjs";

const { Text } = Typography;
const { Search } = Input;

export default function TesoreriaList() {
    const { user } = useCurrentUser();

    // Construcción de filtros según rol
    const permanentFilters = () => {
        const filters: any[] = [];
        
        // COMENTADO: Profesor solo ve sus pagos - DESACTIVADO para debug
        // if (user?.rol === "profesor") {
        //     filters.push({ field: "perfiles.id", operator: "eq", value: user.id });
        // }
        
        // MOSTRAR TODOS LOS PAGOS: tanto pendientes como pagados
        // Ajuste: solo mostrar pagos confirmados (estado = pagado)
        filters.push({ field: "estado", operator: "eq", value: "pagado" });
        
        return filters;
    };

    // Traemos los pagos junto con el nombre del estudiante y el curso
    const { tableProps, tableQuery } = useTable({
        resource: "pagos",
        meta: {
            // Desambiguamos las relaciones usando el nombre exacto del FK
            select: "*, perfiles!pagos_estudiante_id_fkey(nombre_completo,id), matriculas!pagos_matricula_id_fkey(cursos(nombre))"
        },
        sorters: { initial: [{ field: "created_at", order: "desc" }] },
        filters: {
            permanent: permanentFilters()
        }
    });

    console.log("🔍 Tesorería - tableQuery:", tableQuery);
    console.log("🔍 Tesorería - data:", tableQuery?.data);
    console.log("🔍 Tesorería - error:", tableQuery?.error);

    const [busqueda, setBusqueda] = useState("");
    const [filtroFecha, setFiltroFecha] = useState<[any, any] | null>(null);
    const [filtroMetodo, setFiltroMetodo] = useState<string | null>(null);
    const [filtroConcepto, setFiltroConcepto] = useState<string | null>(null);

    // Calcular el total de lo que se ve en pantalla
    const pagos = tableProps.dataSource || [];
    console.log("🔍 Tesorería - Pagos en tabla:", pagos.length, "registros", pagos);

    // Métodos únicos para el filtro
    const metodosUnicos = useMemo(() => {
        const metodos = new Set(pagos.map((p: any) => p.metodo_pago).filter(Boolean));
        return Array.from(metodos).sort();
    }, [pagos]);

    // Conceptos únicos para el filtro
    const conceptosUnicos = useMemo(() => {
        const conceptos = new Set(pagos.map((p: any) => p.matriculas?.cursos?.nombre).filter(Boolean));
        return Array.from(conceptos).sort();
    }, [pagos]);

    const dataFiltrada = useMemo(() => {
        let resultado = pagos;

        // Filtro por búsqueda
        if (busqueda) {
            const term = busqueda.toLowerCase();
            resultado = resultado.filter((p: any) => {
                const estudiante = (p.perfiles?.nombre_completo || "").toLowerCase();
                const curso = (p.matriculas?.cursos?.nombre || "").toLowerCase();
                const ref = (p.referencia || "").toLowerCase();
                return estudiante.includes(term) || curso.includes(term) || ref.includes(term);
            });
        }

        // Filtro por fecha
        if (filtroFecha && filtroFecha[0] && filtroFecha[1]) {
            const start = filtroFecha[0];
            const end = filtroFecha[1];
            resultado = resultado.filter((p: any) => {
                const pFecha = dayjs(p.fecha_pago);
                return pFecha.isAfter(start) && pFecha.isBefore(end.add(1, 'day'));
            });
        }

        // Filtro por método
        if (filtroMetodo) {
            resultado = resultado.filter((p: any) => p.metodo_pago === filtroMetodo);
        }

        // Filtro por concepto
        if (filtroConcepto) {
            resultado = resultado.filter((p: any) => p.matriculas?.cursos?.nombre === filtroConcepto);
        }

        return resultado;
    }, [busqueda, pagos, filtroFecha, filtroMetodo, filtroConcepto]);

    const totalPagadoEnPantalla = useMemo(() => {
        return dataFiltrada
            .filter((p: any) => (p.estado || "").toLowerCase() === "pagado")
            .reduce((acc: number, curr: any) => acc + Number(curr.monto || 0), 0);
    }, [dataFiltrada]);

    return (
        <List
            title="💰 Tesorería y Recaudo"
            headerButtons={
                <Space>
                    <Search
                        placeholder="Buscar por estudiante, curso o referencia"
                        allowClear
                        enterButton={<Button icon={<SearchOutlined />} type="primary">Buscar</Button>}
                        onSearch={(val) => setBusqueda(val)}
                        onChange={(e) => setBusqueda(e.target.value)}
                        style={{ width: 380 }}
                    />
                    <CreateButton type="primary" size="large">Registrar Pago</CreateButton>
                </Space>
            }
        >
            {/* AVISO PARA ADMINISTRADOR */}
            {user?.rol === "admin" && (
                <Alert
                    message="🔓 Modo Administrador"
                    description="Tienes permisos para eliminar pagos. Recuerda que esta acción es irreversible. Los pagos eliminados permitirán borrar estudiantes y su historial completo."
                    type="warning"
                    showIcon
                    closable
                    style={{ marginBottom: 20 }}
                />
            )}
            {/* Tarjeta de Resumen de Dinero */}
            <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col xs={24} sm={8}>
                    <Card variant="borderless" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                        <Statistic
                            title="Total pagado en esta página"
                            value={totalPagadoEnPantalla}
                            precision={0}
                            valueStyle={{ color: '#3f8600' }}
                            prefix={<DollarCircleOutlined />}
                            suffix="COP"
                        />
                    </Card>
                </Col>
            </Row>

            {/* FILTROS */}
            <Card style={{ marginBottom: 20 }}>
                <Row gutter={16}>
                    <Col xs={24} md={6}>
                        <label style={{ fontSize: 12, fontWeight: 'bold' }}>Rango Fecha</label>
                        <DatePicker.RangePicker
                            style={{ width: '100%' }}
                            onChange={(dates) => setFiltroFecha(dates as any)}
                            allowClear
                        />
                    </Col>
                    <Col xs={24} md={6}>
                        <label style={{ fontSize: 12, fontWeight: 'bold' }}>Método de Pago</label>
                        <Select
                            style={{ width: '100%' }}
                            placeholder="Todos"
                            allowClear
                            onChange={(val) => setFiltroMetodo(val || null)}
                            options={metodosUnicos.map((m) => ({ label: m, value: m }))}
                        />
                    </Col>
                    <Col xs={24} md={6}>
                        <label style={{ fontSize: 12, fontWeight: 'bold' }}>Concepto (Curso)</label>
                        <Select
                            style={{ width: '100%' }}
                            placeholder="Todos"
                            allowClear
                            onChange={(val) => setFiltroConcepto(val || null)}
                            options={conceptosUnicos.map((c) => ({ label: c, value: c }))}
                        />
                    </Col>
                    <Col xs={24} md={6} style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <Button
                            onClick={() => {
                                setBusqueda("");
                                setFiltroFecha(null);
                                setFiltroMetodo(null);
                                setFiltroConcepto(null);
                            }}
                            style={{ width: '100%' }}
                        >
                            Limpiar Filtros
                        </Button>
                    </Col>
                </Row>
            </Card>

            <Table {...tableProps} rowKey="id" dataSource={dataFiltrada}>
                
                {/* FECHA */}
                <Table.Column 
                    dataIndex="fecha_pago" 
                    title="Fecha"
                    render={(value) => (
                        <Space>
                            <CalendarOutlined style={{ color: '#999' }} />
                            <span>{value ? dayjs(value).format("DD MMM YYYY") : "-"}</span>
                        </Space>
                    )}
                />

                {/* ESTUDIANTE */}
                <Table.Column 
                    title="Estudiante"
                    render={(_, record: any) => (
                        <Space>
                            <UserOutlined style={{ color: '#1890ff' }} />
                            <Text strong>{record.perfiles?.nombre_completo || "Desconocido"}</Text>
                        </Space>
                    )}
                />

                {/* CURSO QUE PAGA */}
                <Table.Column 
                    title="Concepto"
                    render={(_, record: any) => {
                        const curso = record.matriculas?.cursos?.nombre;
                        return curso ? <Tag color="purple">{curso}</Tag> : <Tag>Otro</Tag>;
                    }}
                />

                {/* MÉTODO */}
                <Table.Column 
                    dataIndex="metodo_pago" 
                    title="Método"
                    render={(value) => {
                        const esBanco = ['nequi', 'daviplata', 'bancolombia'].some(x => String(value).toLowerCase().includes(x));
                        return <Tag icon={esBanco ? <BankOutlined /> : <DollarCircleOutlined />}>{value || "Efectivo"}</Tag>;
                    }}
                />

                {/* MONTO */}
                <Table.Column 
                    dataIndex="monto" 
                    title="Valor Pagado"
                    render={(value) => (
                        <Text strong style={{ color: '#3f8600', fontSize: '15px' }}>
                            $ {Number(value).toLocaleString()}
                        </Text>
                    )}
                />

                {/* ESTADO */}
                <Table.Column 
                    dataIndex="estado" 
                    title="Estado"
                    render={(value) => {
                        const estado = (value || 'pendiente').toLowerCase();
                        const colorMap: Record<string, string> = {
                            'pagado': 'green',
                            'pendiente': 'orange',
                            'vencido': 'red',
                            'cancelado': 'red'
                        };
                        return <Tag color={colorMap[estado] || 'blue'}>{estado.toUpperCase()}</Tag>;
                    }}
                />

                <Table.Column 
                    title="Acciones"
                    render={(_, record: any) => (
                        <Space>
                            {user?.rol === "admin" && (
                                <DeleteButton 
                                    hideText 
                                    size="small" 
                                    recordItemId={record.id} 
                                    resource="pagos"
                                    confirmTitle="¿Eliminar este pago?"
                                    confirmOkText="Sí, eliminar"
                                    confirmCancelText="Cancelar"
                                />
                            )}
                        </Space>
                    )}
                />
            </Table>
        </List>
    );
}