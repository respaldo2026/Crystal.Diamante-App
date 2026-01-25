
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { List } from "@refinedev/antd";
import {
    Alert,
    Button,
    Card,
    Col,
    DatePicker,
    Drawer,
    Form,
    Input,
    InputNumber,
    Row,
    Select,
    Space,
    Spin,
    Statistic,
    Table,
    Tag,
    Typography,
    Popconfirm,
    message,
} from "antd";
import {
    BankOutlined,
    CalendarOutlined,
    DeleteOutlined,
    DollarCircleOutlined,
    FileAddOutlined,
    FilterOutlined,
    ReloadOutlined,
    SaveOutlined,
    SearchOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useCurrentUser } from "@hooks/useCurrentUser";
import {
    listarMovimientos,
    crearMovimiento,
    eliminarMovimiento,
    type MovimientoFinanciero,
} from "@modules/finanzas/movimientos.service";
import { MOVIMIENTO_CATEGORIAS, MOVIMIENTO_TIPO, MOVIMIENTO_TIPO_COLOR, MOVIMIENTO_TIPO_LABEL } from "@constants/movimientos";

const { Text } = Typography;
const { RangePicker } = DatePicker;

const formatoCOP = (valor: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(valor);

export default function TesoreriaPage() {
    const { user } = useCurrentUser();
    const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState("");
    const [filtroRango, setFiltroRango] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
    const [filtroCategoria, setFiltroCategoria] = useState<string | null>(null);
    const [filtroMetodo, setFiltroMetodo] = useState<string | null>(null);
    const [filtroConciliado, setFiltroConciliado] = useState<string | null>(null);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [registrando, setRegistrando] = useState(false);
    const [form] = Form.useForm();

    const cargarMovimientos = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await listarMovimientos();
            setMovimientos(data);
        } catch (err: any) {
            console.error("Error cargando movimientos", err);
            setError(err.message ?? "No se pudieron cargar los movimientos");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void cargarMovimientos();
    }, [cargarMovimientos]);

    const metodosDisponibles = useMemo(() => {
        const set = new Set<string>();
        movimientos.forEach((mov) => {
            if (mov.metodo_pago) set.add(mov.metodo_pago);
        });
        return Array.from(set).sort();
    }, [movimientos]);

    const categoriasDisponibles = useMemo(() => {
        const set = new Set<string>();
        movimientos.forEach((mov) => {
            if (mov.categoria) set.add(mov.categoria);
        });
        return Array.from(set).sort();
    }, [movimientos]);

    const movimientosFiltrados = useMemo(() => {
        return movimientos.filter((mov) => {
            const matchTexto = (() => {
                if (!busqueda) return true;
                const term = busqueda.toLowerCase();
                return [
                    mov.concepto,
                    mov.categoria ?? "",
                    mov.metodo_pago ?? "",
                    mov.referencia ?? "",
                    mov.descripcion ?? "",
                    mov.perfiles?.nombre_completo ?? "",
                    mov.proveedores?.nombre_completo ?? "",
                ]
                    .join(" ")
                    .toLowerCase()
                    .includes(term);
            })();

            if (!matchTexto) return false;

            if (filtroTipo && mov.tipo !== filtroTipo) return false;

            if (filtroCategoria && (mov.categoria ?? "") !== filtroCategoria) return false;

            if (filtroMetodo && (mov.metodo_pago ?? "") !== filtroMetodo) return false;

            if (filtroConciliado) {
                const valor = filtroConciliado === "conciliado";
                if (mov.conciliado !== valor) return false;
            }

            if (filtroRango && filtroRango[0] && filtroRango[1]) {
                const fechaMov = dayjs(mov.fecha);
                const inicio = filtroRango[0];
                const fin = filtroRango[1];
                if (!fechaMov.isBetween(inicio, fin.add(1, "day"), "day", "[)")) {
                    return false;
                }
            }

            return true;
        });
    }, [busqueda, filtroCategoria, filtroConciliado, filtroMetodo, filtroRango, filtroTipo, movimientos]);

    const totalIngresos = useMemo(
        () => movimientosFiltrados.filter((m) => m.tipo === MOVIMIENTO_TIPO.INGRESO).reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosFiltrados]
    );

    const totalEgresos = useMemo(
        () => movimientosFiltrados.filter((m) => m.tipo === MOVIMIENTO_TIPO.EGRESO).reduce((acc, mov) => acc + Number(mov.monto || 0), 0),
        [movimientosFiltrados]
    );

    const saldoNeto = useMemo(() => totalIngresos - totalEgresos, [totalIngresos, totalEgresos]);

    const handleRegistrarMovimiento = useCallback(async () => {
        try {
            const values = await form.validateFields();
            setRegistrando(true);

            await crearMovimiento({
                fecha: (values.fecha as dayjs.Dayjs).format("YYYY-MM-DD"),
                tipo: values.tipo,
                monto: Number(values.monto),
                concepto: values.concepto,
                categoria: values.categoria || null,
                metodo_pago: values.metodo_pago || null,
                referencia: values.referencia || null,
                descripcion: values.descripcion || null,
            });

            message.success("Movimiento registrado correctamente");
            setDrawerVisible(false);
            form.resetFields();
            await cargarMovimientos();
        } catch (err: any) {
            if (err?.errorFields) {
                return;
            }
            console.error("Error registrando movimiento", err);
            message.error(err?.message ?? "No se pudo registrar el movimiento");
        } finally {
            setRegistrando(false);
        }
    }, [cargarMovimientos, form]);

    const handleEliminar = useCallback(
        async (movimientoId: string) => {
            try {
                await eliminarMovimiento(movimientoId);
                message.success("Movimiento eliminado");
                await cargarMovimientos();
            } catch (err: any) {
                console.error("Error eliminando movimiento", err);
                message.error(err?.message ?? "No se pudo eliminar el movimiento");
            }
        },
        [cargarMovimientos]
    );

    const resetFiltros = () => {
        setBusqueda("");
        setFiltroRango(null);
        setFiltroTipo(null);
        setFiltroCategoria(null);
        setFiltroMetodo(null);
        setFiltroConciliado(null);
    };

    return (
        <List
            title="💰 Tesorería - Movimientos Financieros"
            headerButtons={
                <Space>
                    <Input
                        placeholder="Buscar por concepto, referencia o persona"
                        allowClear
                        prefix={<SearchOutlined />}
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        style={{ width: 320 }}
                    />
                    <Button icon={<ReloadOutlined />} onClick={() => void cargarMovimientos()} disabled={loading}>
                        Actualizar
                    </Button>
                    <Button
                        type="primary"
                        icon={<FileAddOutlined />}
                        onClick={() => {
                            form.resetFields();
                            form.setFieldValue("tipo", MOVIMIENTO_TIPO.INGRESO);
                            form.setFieldValue("fecha", dayjs());
                            setDrawerVisible(true);
                        }}
                    >
                        Registrar movimiento
                    </Button>
                </Space>
            }
        >
            {user?.rol === "admin" && (
                <Alert
                    message="🔓 Modo Administrador"
                    description="Puedes eliminar movimientos. Hazlo solo si hay un error, ya que afecta los reportes contables."
                    type="warning"
                    showIcon
                    closable
                    style={{ marginBottom: 20 }}
                />
            )}

            <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col xs={24} md={8}>
                    <Card variant="borderless" style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}>
                        <Statistic
                            title="Ingresos filtrados"
                            value={formatoCOP(totalIngresos)}
                            valueStyle={{ color: "#3f8600" }}
                            prefix={<DollarCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card variant="borderless" style={{ background: "#fff1f0", borderColor: "#ffa39e" }}>
                        <Statistic
                            title="Egresos filtrados"
                            value={formatoCOP(totalEgresos)}
                            valueStyle={{ color: "#cf1322" }}
                            prefix={<DollarCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} md={8}>
                    <Card variant="borderless" style={{ background: "#e6f7ff", borderColor: "#91d5ff" }}>
                        <Statistic
                            title="Saldo neto"
                            value={formatoCOP(saldoNeto)}
                            valueStyle={{ color: saldoNeto >= 0 ? "#1890ff" : "#cf1322" }}
                            prefix={<BankOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            <Card style={{ marginBottom: 20 }} title={<Space><FilterOutlined />Filtros</Space>}>
                <Row gutter={16}>
                    <Col xs={24} md={8}>
                        <label style={{ fontSize: 12, fontWeight: "bold" }}>Rango de fechas</label>
                        <RangePicker
                            style={{ width: "100%" }}
                            value={filtroRango as any}
                            onChange={(value) => setFiltroRango(value as any)}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold" }}>Tipo</label>
                        <Select
                            allowClear
                            placeholder="Todos"
                            value={filtroTipo ?? undefined}
                            onChange={(val) => setFiltroTipo(val ?? null)}
                            options={[
                                { label: MOVIMIENTO_TIPO_LABEL[MOVIMIENTO_TIPO.INGRESO], value: MOVIMIENTO_TIPO.INGRESO },
                                { label: MOVIMIENTO_TIPO_LABEL[MOVIMIENTO_TIPO.EGRESO], value: MOVIMIENTO_TIPO.EGRESO },
                            ]}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold" }}>Categoría</label>
                        <Select
                            allowClear
                            placeholder="Todas"
                            value={filtroCategoria ?? undefined}
                            onChange={(val) => setFiltroCategoria(val ?? null)}
                            options={categoriasDisponibles.map((cat) => ({ label: cat, value: cat }))}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold" }}>Método</label>
                        <Select
                            allowClear
                            placeholder="Todos"
                            value={filtroMetodo ?? undefined}
                            onChange={(val) => setFiltroMetodo(val ?? null)}
                            options={metodosDisponibles.map((met) => ({ label: met, value: met }))}
                        />
                    </Col>
                    <Col xs={24} md={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold" }}>Conciliación</label>
                        <Select
                            allowClear
                            placeholder="Todos"
                            value={filtroConciliado ?? undefined}
                            onChange={(val) => setFiltroConciliado(val ?? null)}
                            options={[
                                { label: "Conciliados", value: "conciliado" },
                                { label: "Pendientes", value: "pendiente" },
                            ]}
                        />
                    </Col>
                    <Col xs={24} md={4} style={{ display: "flex", alignItems: "flex-end" }}>
                        <Button onClick={resetFiltros} style={{ width: "100%" }}>
                            Limpiar filtros
                        </Button>
                    </Col>
                </Row>
            </Card>

            {loading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 40 }}>
                    <Spin size="large" />
                </div>
            ) : error ? (
                <Alert type="error" message={error} showIcon closable />
            ) : (
                <Table
                    rowKey="id"
                    dataSource={movimientosFiltrados}
                    pagination={{ pageSize: 15 }}
                    scroll={{ x: true }}
                >
                    <Table.Column
                        title="Fecha"
                        dataIndex="fecha"
                        render={(value) => (
                            <Space>
                                <CalendarOutlined style={{ color: "#999" }} />
                                <span>{value ? dayjs(value).format("DD MMM YYYY") : "-"}</span>
                            </Space>
                        )}
                    />
                    <Table.Column
                        title="Tipo"
                        dataIndex="tipo"
                        render={(tipo: MovimientoFinanciero["tipo"]) => (
                            <Tag color={MOVIMIENTO_TIPO_COLOR[tipo] || "default"}>{MOVIMIENTO_TIPO_LABEL[tipo] || tipo}</Tag>
                        )}
                    />
                    <Table.Column
                        title="Concepto"
                        dataIndex="concepto"
                        render={(concepto: string, record: MovimientoFinanciero) => (
                            <Space direction="vertical" size={0}>
                                <Text strong>{concepto}</Text>
                                {record.categoria ? <Text type="secondary">{record.categoria}</Text> : null}
                            </Space>
                        )}
                    />
                    <Table.Column
                        title="Método"
                        dataIndex="metodo_pago"
                        render={(value: string | null) => (
                            <Tag icon={<DollarCircleOutlined />}>
                                {value || "Efectivo"}
                            </Tag>
                        )}
                    />
                    <Table.Column
                        title="Monto"
                        dataIndex="monto"
                        align="right"
                        render={(monto: number, record: MovimientoFinanciero) => (
                            <Text strong style={{ color: record.tipo === MOVIMIENTO_TIPO.INGRESO ? "#3f8600" : "#cf1322" }}>
                                {record.tipo === MOVIMIENTO_TIPO.EGRESO ? "-" : "+"}
                                {formatoCOP(monto)}
                            </Text>
                        )}
                    />
                    <Table.Column
                        title="Referencia"
                        dataIndex="referencia"
                        render={(value: string | null) => value || "-"}
                    />
                    <Table.Column
                        title="Persona"
                        render={(_, record: MovimientoFinanciero) => (
                            <Space direction="vertical" size={0}>
                                {record.perfiles?.nombre_completo ? (
                                    <Text>{record.perfiles.nombre_completo}</Text>
                                ) : null}
                                {record.proveedores?.nombre_completo ? (
                                    <Text type="secondary">Proveedor: {record.proveedores.nombre_completo}</Text>
                                ) : null}
                                {!record.perfiles?.nombre_completo && !record.proveedores?.nombre_completo ? (
                                    <Text type="secondary">No asignado</Text>
                                ) : null}
                            </Space>
                        )}
                    />
                    <Table.Column
                        title="Ticket"
                        render={(_, record: MovimientoFinanciero) =>
                            record.ticket_url ? (
                                <Button size="small" onClick={() => window.open(record.ticket_url!, "_blank")}>Ver comprobante</Button>
                            ) : (
                                <Tag color="default">Sin comprobante</Tag>
                            )
                        }
                    />
                    <Table.Column
                        title="Conciliado"
                        dataIndex="conciliado"
                        render={(value: boolean) => (
                            <Tag color={value ? "green" : "orange"}>{value ? "Conciliado" : "Pendiente"}</Tag>
                        )}
                    />
                    <Table.Column
                        title="Acciones"
                        fixed="right"
                        render={(_, record: MovimientoFinanciero) => (
                            user?.rol === "admin" ? (
                                <Popconfirm
                                    title="Eliminar movimiento"
                                    description="Esta acción no se puede deshacer. ¿Deseas continuar?"
                                    okText="Sí, eliminar"
                                    cancelText="Cancelar"
                                    onConfirm={() => void handleEliminar(record.id)}
                                >
                                    <Button size="small" danger icon={<DeleteOutlined />} />
                                </Popconfirm>
                            ) : null
                        )}
                    />
                </Table>
            )}

            <Drawer
                title="Registrar movimiento"
                width={420}
                open={drawerVisible}
                onClose={() => {
                    if (registrando) return;
                    setDrawerVisible(false);
                }}
                destroyOnClose
                extra={
                    <Space>
                        <Button onClick={() => setDrawerVisible(false)} disabled={registrando}>
                            Cerrar
                        </Button>
                        <Button type="primary" icon={<SaveOutlined />} loading={registrando} onClick={() => void handleRegistrarMovimiento()}>
                            Guardar
                        </Button>
                    </Space>
                }
            >
                <Form form={form} layout="vertical" initialValues={{ tipo: MOVIMIENTO_TIPO.INGRESO, fecha: dayjs() }}>
                    <Form.Item
                        label="Tipo de movimiento"
                        name="tipo"
                        rules={[{ required: true, message: "Selecciona el tipo" }]}
                    >
                        <Select
                            options={[
                                { label: MOVIMIENTO_TIPO_LABEL[MOVIMIENTO_TIPO.INGRESO], value: MOVIMIENTO_TIPO.INGRESO },
                                { label: MOVIMIENTO_TIPO_LABEL[MOVIMIENTO_TIPO.EGRESO], value: MOVIMIENTO_TIPO.EGRESO },
                            ]}
                        />
                    </Form.Item>
                    <Form.Item
                        label="Fecha"
                        name="fecha"
                        rules={[{ required: true, message: "Selecciona la fecha" }]}
                    >
                        <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                    </Form.Item>
                    <Form.Item
                        label="Concepto"
                        name="concepto"
                        rules={[{ required: true, message: "Ingresa el concepto" }]}
                    >
                        <Input placeholder="Descripción del movimiento" />
                    </Form.Item>
                    <Form.Item label="Categoría" name="categoria">
                        <Select
                            allowClear
                            placeholder="Selecciona una categoría"
                            options={MOVIMIENTO_CATEGORIAS.map((cat) => ({ label: cat, value: cat }))}
                        />
                    </Form.Item>
                    <Form.Item
                        label="Monto"
                        name="monto"
                        rules={[{ required: true, message: "Ingresa el monto" }]}
                    >
                        <InputNumber
                            min={0}
                            style={{ width: "100%" }}
                            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                            parser={(value) => Number(value?.replace(/\./g, ""))}
                            addonBefore={<DollarCircleOutlined />}
                        />
                    </Form.Item>
                    <Form.Item label="Método de pago" name="metodo_pago">
                        <Input placeholder="Efectivo, Transferencia, etc." />
                    </Form.Item>
                    <Form.Item label="Referencia" name="referencia">
                        <Input placeholder="Número de recibo, comprobante, etc." />
                    </Form.Item>
                    <Form.Item label="Descripción" name="descripcion">
                        <Input.TextArea rows={3} placeholder="Detalle adicional" />
                    </Form.Item>
                </Form>
            </Drawer>
        </List>
    );
}