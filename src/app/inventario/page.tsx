"use client";

import React, { useState } from "react";
import { 
    List, 
    useTable, 
    useModalForm 
} from "@refinedev/antd";
import { 
    Table, 
    Space, 
    Tag, 
    Button, 
    Modal, 
    Form, 
    Input, 
    InputNumber, 
    message, 
    Statistic, 
    Typography,
    Card,
    Row,
    Col
} from "antd";
import { 
    PlusOutlined, 
    ArrowUpOutlined, 
    ArrowDownOutlined, 
    WarningOutlined, // <--- CORREGIDO (Mayúscula)
    ShopOutlined
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";

const { Title, Text } = Typography;

export default function InventarioList() {
    const { tableProps, tableQueryResult } = useTable({
        resource: "inventario",
        sorters: { initial: [{ field: "nombre", order: "asc" }] },
        syncWithLocation: true,
    });

    const productos = tableQueryResult?.data?.data || [];
    // CORRECCIÓN DE SEGURIDAD: Añadimos '|| 0' para evitar errores si viene nulo
    const stockBajo = productos.filter((p: any) => (p.stock || 0) <= (p.stock_minimo || 5)).length;
    const totalItems = productos.length;

    const { 
        modalProps: createModalProps, 
        formProps: createFormProps, 
        show: showCreate 
    } = useModalForm({
        resource: "inventario",
        action: "create",
        redirect: false,
        onMutationSuccess: () => {
            message.success("Producto creado correctamente");
        }
    });

    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [moveType, setMoveType] = useState<'entrada' | 'salida'>('entrada');
    const [cantidad, setCantidad] = useState<number | null>(1);
    const [motivo, setMotivo] = useState("");
    const [loadingMove, setLoadingMove] = useState(false);

    const openMoveModal = (producto: any, tipo: 'entrada' | 'salida') => {
        setSelectedProduct(producto);
        setMoveType(tipo);
        setCantidad(1);
        setMotivo("");
        setIsMoveModalOpen(true);
    };

    const handleMovimiento = async () => {
        if (!selectedProduct || !cantidad) return;
        setLoadingMove(true);

        try {
            const stockActual = selectedProduct.stock || 0;
            const nuevoStock = moveType === 'entrada' 
                ? stockActual + cantidad 
                : stockActual - cantidad;
            
            if (nuevoStock < 0) {
                message.error("⛔ Error: No puedes sacar más de lo que tienes.");
                setLoadingMove(false);
                return;
            }

            const supabase = supabaseBrowserClient;

            const { error: moveError } = await supabase.from("movimientos_inventario").insert({
                producto_id: selectedProduct.id,
                tipo: moveType,
                cantidad: cantidad,
                motivo: motivo || (moveType === 'entrada' ? 'Compra material' : 'Consumo interno')
            });

            if (moveError) throw moveError;

            const { error: stockError } = await supabase
                .from("inventario")
                .update({ stock: nuevoStock })
                .eq("id", selectedProduct.id);

            if (stockError) throw stockError;
            
            message.success(`✅ ${moveType === 'entrada' ? 'Entrada' : 'Salida'} registrada`);
            setIsMoveModalOpen(false);
            tableQueryResult.refetch(); 

        } catch (error: any) {
            console.error(error);
            message.error("Error al guardar: " + error.message);
        } finally {
            setLoadingMove(false);
        }
    };

    return (
        <List
            title={<Title level={3}>📦 Gestión de Inventario</Title>}
            headerButtons={
                <Button type="primary" icon={<PlusOutlined />} onClick={() => showCreate()}>
                    Nuevo Producto
                </Button>
            }
        >
            <Row gutter={16} style={{ marginBottom: 24 }}>
                <Col span={12}>
                    <Card variant="borderless" style={{ background: '#f0f5ff' }}>
                        <Statistic 
                            title="Total Productos" 
                            value={totalItems} 
                            prefix={<ShopOutlined />} 
                        />
                    </Card>
                </Col>
                <Col span={12}>
                    <Card variant="borderless" style={{ background: '#fff1f0' }}>
                        <Statistic 
                            title="Stock Bajo" 
                            value={stockBajo} 
                            valueStyle={{ color: stockBajo > 0 ? '#cf1322' : '#3f8600' }}
                            // CORRECCIÓN: Aquí estaba el error del icono
                            prefix={<WarningOutlined />} 
                        />
                        {stockBajo > 0 && <Text type="danger" style={{fontSize: 12}}>Requiere atención</Text>}
                    </Card>
                </Col>
            </Row>

            <Table {...tableProps} rowKey="id">
                <Table.Column 
                    dataIndex="nombre" 
                    title="Producto" 
                    render={(val, record: any) => (
                        <div>
                            <strong>{val}</strong>
                            <div style={{ fontSize: '12px', color: '#888' }}>{record.descripcion}</div>
                        </div>
                    )}
                />
                
                <Table.Column 
                    dataIndex="stock" 
                    title="Stock" 
                    render={(val, record: any) => {
                        const valor = val || 0;
                        const min = record.stock_minimo || 5;
                        const isLow = valor <= min;
                        return (
                            <Tag color={isLow ? "red" : "green"}>
                                {valor} {record.unidad}
                            </Tag>
                        );
                    }}
                />

                <Table.Column 
                    title="Acciones"
                    width={200}
                    render={(_, record: any) => (
                        <Space>
                            <Button 
                                size="small" 
                                icon={<ArrowUpOutlined />} 
                                onClick={() => openMoveModal(record, 'entrada')}
                                style={{ color: '#389e0d', borderColor: '#b7eb8f' }}
                            >
                                Entrar
                            </Button>
                            <Button 
                                size="small" 
                                danger 
                                icon={<ArrowDownOutlined />} 
                                onClick={() => openMoveModal(record, 'salida')}
                            >
                                Sacar
                            </Button>
                        </Space>
                    )}
                />
            </Table>

            <Modal {...createModalProps} title="Nuevo Material">
                <Form {...createFormProps} layout="vertical">
                    <Form.Item label="Nombre" name="nombre" rules={[{ required: true }]}><Input /></Form.Item>
                    <Row gutter={16}>
                        <Col span={12}><Form.Item label="Unidad" name="unidad" initialValue="und"><Input /></Form.Item></Col>
                        <Col span={12}><Form.Item label="Stock Inicial" name="stock" initialValue={0}><InputNumber min={0} style={{width:'100%'}}/></Form.Item></Col>
                    </Row>
                    <Form.Item label="Alerta Mínimo" name="stock_minimo" initialValue={5}><InputNumber min={1} style={{width:'100%'}}/></Form.Item>
                </Form>
            </Modal>

            <Modal 
                open={isMoveModalOpen} 
                onCancel={() => setIsMoveModalOpen(false)}
                onOk={handleMovimiento}
                confirmLoading={loadingMove}
                title={`Registrar ${moveType.toUpperCase()}`}
            >
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <Title level={5}>{selectedProduct?.nombre}</Title>
                    <Text>Stock actual: {selectedProduct?.stock}</Text>
                </div>
                <Form layout="vertical">
                    <Form.Item label="Cantidad">
                        <InputNumber min={1} value={cantidad} onChange={setCantidad} style={{ width: '100%' }} autoFocus />
                    </Form.Item>
                    <Form.Item label="Motivo">
                        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional" />
                    </Form.Item>
                </Form>
            </Modal>
        </List>
    );
}