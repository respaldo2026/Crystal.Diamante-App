
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
    Grid,
    Dropdown,
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
    EllipsisOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { useCurrentUser } from "@hooks/useCurrentUser";
import {
    listarMovimientos,
    crearMovimiento,
    eliminarMovimiento,
    sincronizarIngresosDesdePagos,
    type MovimientoFinanciero,
} from "@modules/finanzas/movimientos.service";
import { MOVIMIENTO_CATEGORIAS, MOVIMIENTO_TIPO, MOVIMIENTO_TIPO_COLOR, MOVIMIENTO_TIPO_LABEL } from "@constants/movimientos";

const { useBreakpoint } = Grid;

const { Text } = Typography;
const { RangePicker } = DatePicker;

const formatoCOP = (valor: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP" }).format(valor);

export default function TesoreriaPage() {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const isTablet = screens.md && !screens.lg;
    const { user } = useCurrentUser();
    const [movimientos, setMovimientos] = useState<MovimientoFinanciero[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busqueda, setBusqueda] = useState("");
    const [filtroRango, setFiltroRango] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [filtroMes, setFiltroMes] = useState<dayjs.Dayjs | null>(null);
    const [filtroPeriodo, setFiltroPeriodo] = useState<string | null>(null);
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
            const role = (user?.rol || "").toLowerCase();
            const puedeVerTodo =
                role === "admin" ||
                role === "director" ||
                role === "administrador" ||
                role === "administrativo" ||
                role === "secretaria" ||
                role === "tesoreria" ||
                role === "tesorero" ||
                role === "caja" ||
                role === "cajero" ||
                role === "contador" ||
                role === "finanzas" ||
                role.includes("admin");

            try {
                await sincronizarIngresosDesdePagos(user?.id || null);
            } catch (syncError) {
                console.warn("No se pudo sincronizar ingresos desde pagos al cargar tesorería", syncError);
            }

            const data = await listarMovimientos({}, { userId: user?.id || null, esAdmin: puedeVerTodo });
            setMovimientos(data);
        } catch (err: any) {
            console.error("Error cargando movimientos", err);
            setError(err.message ?? "No se pudieron cargar los movimientos");
        } finally {
            setLoading(false);
        }
    }, [user?.id, user?.rol]);

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

            const fechaMov = dayjs(mov.fecha);

            if (filtroRango && filtroRango[0] && filtroRango[1]) {
                const inicio = filtroRango[0];
                const fin = filtroRango[1];
                if (!fechaMov.isBetween(inicio, fin.add(1, "day"), "day", "[)")) {
                    return false;
                }
            } else if (filtroMes) {
                if (!fechaMov.isSame(filtroMes, "month")) {
                    return false;
                }
            } else if (filtroPeriodo) {
                const hoy = dayjs();
                let inicio: dayjs.Dayjs | null = null;
                let fin: dayjs.Dayjs | null = null;

                if (filtroPeriodo === "hoy") {
                    inicio = hoy.startOf("day");
                    fin = hoy.endOf("day");
                } else if (filtroPeriodo === "semana_actual") {
                    inicio = hoy.startOf("week");
                    fin = hoy.endOf("week");
                } else if (filtroPeriodo === "mes_actual") {
                    inicio = hoy.startOf("month");
                    fin = hoy.endOf("month");
                } else if (filtroPeriodo === "mes_anterior") {
                    const mesAnterior = hoy.subtract(1, "month");
                    inicio = mesAnterior.startOf("month");
                    fin = mesAnterior.endOf("month");
                } else if (filtroPeriodo === "anio_actual") {
                    inicio = hoy.startOf("year");
                    fin = hoy.endOf("year");
                }

                if (inicio && fin && !fechaMov.isBetween(inicio, fin.add(1, "day"), "day", "[)")) {
                    return false;
                }
            }

            return true;
        });
    }, [busqueda, filtroCategoria, filtroConciliado, filtroMes, filtroMetodo, filtroPeriodo, filtroRango, filtroTipo, movimientos]);

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
                created_by: user?.id || null,
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
    }, [cargarMovimientos, form, user?.id]);

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
        setFiltroMes(null);
        setFiltroPeriodo(null);
        setFiltroTipo(null);
        setFiltroCategoria(null);
        setFiltroMetodo(null);
        setFiltroConciliado(null);
    };

    return (
        <List
            title={isMobile ? "💰 Tesorería" : "💰 Tesorería - Movimientos Financieros"}
            headerButtons={
                <Space direction={isMobile ? "vertical" : "horizontal"} style={{ width: isMobile ? "100%" : "auto" }}>
                    <Input
                        placeholder={isMobile ? "Buscar..." : "Buscar por concepto, referencia o persona"}
                        allowClear
                        prefix={<SearchOutlined />}
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        style={{ width: isMobile ? "100%" : 320 }}
                        size={isMobile ? "middle" : "large"}
                    />
                    <Button 
                        icon={<ReloadOutlined />} 
                        onClick={() => void cargarMovimientos()} 
                        disabled={loading}
                        size={isMobile ? "middle" : "large"}
                        block={isMobile}
                    >
                        {isMobile ? "Actualizar" : "Actualizar"}
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
                        size={isMobile ? "middle" : "large"}
                        block={isMobile}
                    >
                        {isMobile ? "Registrar" : "Registrar movimiento"}
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

            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={24} sm={8}>
                    <Card 
                        variant="borderless" 
                        style={{ background: "#f6ffed", borderColor: "#b7eb8f" }}
                        bodyStyle={{ padding: isMobile ? 12 : 24 }}
                    >
                        <Statistic
                            title={isMobile ? "Ingresos" : "Ingresos filtrados"}
                            value={formatoCOP(totalIngresos)}
                            valueStyle={{ color: "#3f8600", fontSize: isMobile ? 18 : 24 }}
                            prefix={<DollarCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card 
                        variant="borderless" 
                        style={{ background: "#fff1f0", borderColor: "#ffa39e" }}
                        bodyStyle={{ padding: isMobile ? 12 : 24 }}
                    >
                        <Statistic
                            title={isMobile ? "Egresos" : "Egresos filtrados"}
                            value={formatoCOP(totalEgresos)}
                            valueStyle={{ color: "#cf1322", fontSize: isMobile ? 18 : 24 }}
                            prefix={<DollarCircleOutlined />}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card 
                        variant="borderless" 
                        style={{ background: "#e6f7ff", borderColor: "#91d5ff" }}
                        bodyStyle={{ padding: isMobile ? 12 : 24 }}
                    >
                        <Statistic
                            title="Saldo neto"
                            value={formatoCOP(saldoNeto)}
                            valueStyle={{ color: saldoNeto >= 0 ? "#1890ff" : "#cf1322", fontSize: isMobile ? 18 : 24 }}
                            prefix={<BankOutlined />}
                        />
                    </Card>
                </Col>
            </Row>

            <Card 
                style={{ marginBottom: 16 }} 
                title={
                    <Space>
                        <FilterOutlined />
                        <span>{isMobile ? "Filtros" : "Filtros de búsqueda"}</span>
                    </Space>
                }
                bodyStyle={{ padding: isMobile ? 12 : 24 }}
            >
                <Row gutter={[12, 12]}>
                    <Col xs={24} md={12} lg={8}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Rango de fechas</label>
                        <RangePicker
                            style={{ width: "100%" }}
                            value={filtroRango as any}
                            onChange={(value) => {
                                setFiltroRango(value as any);
                                if (value && (value[0] || value[1])) {
                                    setFiltroMes(null);
                                    setFiltroPeriodo(null);
                                }
                            }}
                            size="middle"
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Mes</label>
                        <DatePicker
                            picker="month"
                            style={{ width: "100%" }}
                            value={filtroMes as any}
                            onChange={(value) => {
                                setFiltroMes(value);
                                if (value) {
                                    setFiltroRango(null);
                                    setFiltroPeriodo(null);
                                }
                            }}
                            allowClear
                            size="middle"
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Período</label>
                        <Select
                            allowClear
                            placeholder="Selecciona"
                            value={filtroPeriodo ?? undefined}
                            onChange={(val) => {
                                setFiltroPeriodo(val ?? null);
                                if (val) {
                                    setFiltroRango(null);
                                    setFiltroMes(null);
                                }
                            }}
                            style={{ width: "100%" }}
                            size="middle"
                            options={[
                                { label: "Hoy", value: "hoy" },
                                { label: "Semana actual", value: "semana_actual" },
                                { label: "Mes actual", value: "mes_actual" },
                                { label: "Mes anterior", value: "mes_anterior" },
                                { label: "Año actual", value: "anio_actual" },
                            ]}
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Tipo</label>
                        <Select
                            allowClear
                            placeholder="Todos"
                            value={filtroTipo ?? undefined}
                            onChange={(val) => setFiltroTipo(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={[
                                { label: MOVIMIENTO_TIPO_LABEL[MOVIMIENTO_TIPO.INGRESO], value: MOVIMIENTO_TIPO.INGRESO },
                                { label: MOVIMIENTO_TIPO_LABEL[MOVIMIENTO_TIPO.EGRESO], value: MOVIMIENTO_TIPO.EGRESO },
                            ]}
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Categoría</label>
                        <Select
                            allowClear
                            placeholder="Todas"
                            value={filtroCategoria ?? undefined}
                            onChange={(val) => setFiltroCategoria(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={categoriasDisponibles.map((cat) => ({ label: cat, value: cat }))}
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Método</label>
                        <Select
                            allowClear
                            placeholder="Todos"
                            value={filtroMetodo ?? undefined}
                            onChange={(val) => setFiltroMetodo(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={metodosDisponibles.map((met) => ({ label: met, value: met }))}
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Conciliación</label>
                        <Select
                            allowClear
                            placeholder="Todos"
                            value={filtroConciliado ?? undefined}
                            onChange={(val) => setFiltroConciliado(val ?? null)}
                            style={{ width: "100%" }}
                            size="middle"
                            options={[
                                { label: "Conciliados", value: "conciliado" },
                                { label: "Pendientes", value: "pendiente" },
                            ]}
                        />
                    </Col>
                    <Col xs={24} sm={12} md={12} lg={8}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4 }}>Buscar</label>
                        <Input
                            placeholder="Buscar por concepto..."
                            prefix={<SearchOutlined />}
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            allowClear
                            size="middle"
                        />
                    </Col>
                    <Col xs={12} sm={6} md={6} lg={4}>
                        <label style={{ fontSize: 12, fontWeight: "bold", display: "block", marginBottom: 4, opacity: 0 }}>.</label>
                        <Button onClick={resetFiltros} style={{ width: "100%" }} size="middle">
                            {isMobile ? "Limpiar" : "Limpiar filtros"}
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
                    scroll={{ x: isMobile ? 700 : 1000 }}
                    size={isMobile ? "small" : "middle"}
                    pagination={{ 
                      pageSize: isMobile ? 10 : 15,
                      simple: isMobile,
                      showSizeChanger: !isMobile,
                      position: ["bottomCenter"]
                    }}
                >
                    <Table.Column
                        title="Fecha"
                        dataIndex="fecha"
                        width={isMobile ? 100 : 140}
                        render={(value) => (
                            <Space size={4}>
                                {!isMobile && <CalendarOutlined style={{ color: "#999" }} />}
                                <span style={{ fontSize: isMobile ? 11 : 14 }}>
                                    {value ? dayjs(value).format(isMobile ? "DD/MM/YY" : "DD MMM YYYY") : "-"}
                                </span>
                            </Space>
                        )}
                    />
                    <Table.Column
                        title="Tipo"
                        dataIndex="tipo"
                        width={isMobile ? 70 : 100}
                        render={(tipo: MovimientoFinanciero["tipo"]) => (
                            <Tag color={MOVIMIENTO_TIPO_COLOR[tipo] || "default"}>
                                {isMobile ? (tipo === "ingreso" ? "+" : "-") : (MOVIMIENTO_TIPO_LABEL[tipo] || tipo)}
                            </Tag>
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
                    {!isMobile && (
                        <Table.Column
                            title="Método"
                            dataIndex="metodo_pago"
                            render={(value: string | null) => (
                                <Tag icon={<DollarCircleOutlined />}>
                                    {value || "Efectivo"}
                                </Tag>
                            )}
                        />
                    )}
                    <Table.Column
                        title="Monto"
                        dataIndex="monto"
                        align="right"
                        width={isMobile ? 90 : 140}
                        render={(monto: number, record: MovimientoFinanciero) => (
                            <Text 
                                strong 
                                style={{ 
                                    color: record.tipo === MOVIMIENTO_TIPO.INGRESO ? "#3f8600" : "#cf1322",
                                    fontSize: isMobile ? 11 : 14
                                }}
                            >
                                {record.tipo === MOVIMIENTO_TIPO.EGRESO ? "-" : "+"}
                                {isMobile ? `$${(monto/1000).toFixed(0)}k` : formatoCOP(monto)}
                            </Text>
                        )}
                    />
                    {!isMobile && (
                        <Table.Column
                            title="Referencia"
                            dataIndex="referencia"
                            render={(value: string | null) => value || "-"}
                        />
                    )}
                    {!isMobile && (
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
                    )}
                    {!isMobile && (
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
                    )}
                    {!isMobile && (
                        <Table.Column
                            title="Conciliado"
                            dataIndex="conciliado"
                            render={(value: boolean) => (
                                <Tag color={value ? "green" : "orange"}>{value ? "Conciliado" : "Pendiente"}</Tag>
                            )}
                        />
                    )}
                    <Table.Column
                        title={isMobile ? "Opciones" : "Acciones"}
                        fixed="right"
                        render={(_, record: MovimientoFinanciero) => (
                            user?.rol === "admin" ? (
                                isMobile ? (
                                    <Dropdown
                                        trigger={["click"]}
                                        menu={{
                                            items: [
                                                {
                                                    key: `ver-ticket-${record.id}`,
                                                    label: record.ticket_url ? "Ver comprobante" : "Sin comprobante",
                                                    disabled: !record.ticket_url,
                                                    onClick: () => record.ticket_url && window.open(record.ticket_url!, "_blank"),
                                                },
                                                { type: "divider" as const },
                                                {
                                                    key: `eliminar-${record.id}`,
                                                    label: "Eliminar",
                                                    danger: true,
                                                    onClick: () => void handleEliminar(record.id),
                                                },
                                            ],
                                        }}
                                    >
                                        <Button size="small" icon={<EllipsisOutlined />} />
                                    </Dropdown>
                                ) : (
                                    <Popconfirm
                                        title="Eliminar movimiento"
                                        description="Esta acción no se puede deshacer. ¿Deseas continuar?"
                                        okText="Sí, eliminar"
                                        cancelText="Cancelar"
                                        onConfirm={() => void handleEliminar(record.id)}
                                    >
                                        <Button size="small" danger icon={<DeleteOutlined />} />
                                    </Popconfirm>
                                )
                            ) : null
                        )}
                    />
                </Table>
            )}

            <Drawer
                title="Registrar movimiento"
                width={isMobile ? "100%" : isTablet ? 400 : 480}
                open={drawerVisible}
                onClose={() => {
                    if (registrando) return;
                    setDrawerVisible(false);
                }}
                destroyOnClose
                placement={isMobile ? "bottom" : "right"}
                height={isMobile ? "95%" : undefined}
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
                <Form form={form} layout="vertical" initialValues={{ tipo: MOVIMIENTO_TIPO.INGRESO, fecha: dayjs(), metodo_pago: "efectivo" }}>
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
                        <InputNumber<number>
                            min={0}
                            style={{ width: "100%" }}
                            formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}
                            parser={(value) => Number(value?.replace(/\./g, "")) || 0}
                            addonBefore={<DollarCircleOutlined />}
                        />
                    </Form.Item>
                    <Form.Item
                        label="Método de pago"
                        name="metodo_pago"
                        rules={[{ required: true, message: "Selecciona el método de pago" }]}
                    >
                        <Select
                            placeholder="Selecciona método de pago"
                            options={[
                                { label: "Efectivo", value: "efectivo" },
                                { label: "Transferencia", value: "transferencia" },
                                { label: "Tarjeta", value: "tarjeta" },
                                { label: "Nequi", value: "nequi" },
                                { label: "QR", value: "qr" },
                                { label: "Otro", value: "otro" },
                            ]}
                        />
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