// Declarar tipo Pago
type Pago = {
    id: string;
    monto: number;
    fecha_pago: string;
    metodo_pago: string;
    referencia?: string;
    perfiles?: { nombre_completo: string };
    matriculas?: { cursos?: { nombre: string } };
};

// Declarar tableProps como objeto vacío si no está definido
const tableProps = {};
"use client";

import React, { useMemo, useState, useEffect } from "react";
import { List, CreateButton, EditButton, DeleteButton } from "@refinedev/antd";
import { Table, Space, Tag, Typography, Card, Statistic, Row, Col, Input, Button, DatePicker, Select, Alert, Spin } from "antd";
import { 
    DollarCircleOutlined, 
    UserOutlined, 
    BankOutlined, 
    CalendarOutlined,
    SearchOutlined,
    DeleteOutlined
} from "@ant-design/icons";
import { useCurrentUser } from "@hooks/useCurrentUser";
import { obtenerPagosPorEstudiante } from "../../modules/finanzas/pagos.service";
import dayjs from "dayjs";

const { Text } = Typography;
const { Search } = Input;

export default function TesoreriaList() {
    const { user } = useCurrentUser();
    const [pagos, setPagos] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState("");
    const [filtroFecha, setFiltroFecha] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [filtroMetodo, setFiltroMetodo] = useState<string | null>(null);
    const [filtroConcepto, setFiltroConcepto] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        // Si el usuario es profesor, filtrar por su id; si no, traer todos los pagos
        const estudianteId = user?.rol === "profesor" ? user.id : undefined;
        obtenerPagosPorEstudiante(estudianteId || "")
            .then(setPagos)
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [user]);

    // Métodos únicos para el filtro
    const metodosUnicos = useMemo(() => {
        const metodos = new Set(pagos.map((p) => p.metodo_pago).filter(Boolean));
        return Array.from(metodos).sort();
    }, [pagos]);

    // Conceptos únicos para el filtro
    const conceptosUnicos = useMemo(() => {
        const conceptos = new Set(pagos.map((p) => p.matriculas?.cursos?.nombre).filter(Boolean));
        return Array.from(conceptos).sort();
    }, [pagos]);

    const dataFiltrada = useMemo(() => {
        let resultado = pagos;

        // Filtro por búsqueda
        if (busqueda) {
            const term = busqueda.toLowerCase();
            resultado = resultado.filter((p) => {
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
            resultado = resultado.filter((p) => {
                const pFecha = dayjs(p.fecha_pago);
                return start && end && pFecha.isAfter(start) && pFecha.isBefore(end.add(1, 'day'));
            });
        }

        // Filtro por método
        if (filtroMetodo) {
            resultado = resultado.filter((p) => p.metodo_pago === filtroMetodo);
        }

        // Filtro por concepto
        if (filtroConcepto) {
            resultado = resultado.filter((p) => p.matriculas?.cursos?.nombre === filtroConcepto);
        }

        return resultado;
    }, [busqueda, pagos, filtroFecha, filtroMetodo, filtroConcepto, dayjs]);

    const totalPagadoEnPantalla = useMemo(() => {
        return dataFiltrada
            .filter((p) => (p.estado || "").toLowerCase() === "pagado")
            .reduce((acc: number, curr) => acc + Number(curr.monto || 0), 0);
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
                    render={(_, record: Pago) => (
                        <Space>
                            <UserOutlined style={{ color: '#1890ff' }} />
                            <Text strong>{record.perfiles?.nombre_completo || "Desconocido"}</Text>
                        </Space>
                    )}
                />

                {/* CURSO QUE PAGA */}
                <Table.Column 
                    title="Concepto"
                    render={(_, record: Pago) => {
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
                    render={(_, record: Pago) => (
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