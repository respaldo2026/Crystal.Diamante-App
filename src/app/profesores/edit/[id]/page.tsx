"use client";

import React, { useEffect } from "react";
import { Edit, useForm } from "@refinedev/antd";
import { Form, Input, Select, DatePicker, Row, Col, Divider, message, Alert, InputNumber, Spin } from "antd";
import dayjs from "dayjs";
import { useParams } from "next/navigation";
import { 
    UserOutlined, PhoneOutlined, MailOutlined, HomeOutlined, 
    IdcardOutlined, FileTextOutlined
} from "@ant-design/icons";

export default function ProfesorEdit() {
    const params = useParams();
    const id = params?.id as string;

    const { formProps, saveButtonProps, onFinish, formLoading } = useForm({
        resource: "perfiles",
        action: "edit",
        id: id,
        redirect: "list",
        onMutationError: (error: any) => {
            console.error("Error al guardar:", error);
            message.error(error?.message || "No se pudo guardar los cambios");
        }
    });

    const handleOnFinish = (values: any) => {
        try {
            const datosListos = {
                ...values,
                fecha_nacimiento: values.fecha_nacimiento ? dayjs(values.fecha_nacimiento).format("YYYY-MM-DD") : null,
            };
            // Remover campos que no deben actualizarse
            delete datosListos.created_at;
            delete datosListos.updated_at;
            onFinish(datosListos);
        } catch (err) {
            message.error("Error procesando el formulario");
        }
    };

    return (
        <Edit saveButtonProps={saveButtonProps} title="Editar Profesor" isLoading={formLoading}>
            
            {/* Mensaje de error amigable si falla la carga */}
            {formLoading && (
                <div style={{ textAlign: 'center', padding: '50px 0' }}>
                    <Spin size="large" />
                </div>
            )}

            {!formLoading && (
            <Form 
                {...formProps} 
                layout="vertical" 
                onFinish={handleOnFinish}
            >
                <Divider orientation="left" style={{ borderColor: '#722ed1', color: '#722ed1' }}><UserOutlined /> Información Personal</Divider>
                <Row gutter={24}>
                    <Col span={12}>
                        <Form.Item label="Nombre Completo" name="nombre_completo" rules={[{ required: true }]}>
                            <Input prefix={<UserOutlined style={{color:'rgba(0,0,0,.25)'}}/>} />
                        </Form.Item>
                    </Col>
                    <Col span={6}>
                        <Form.Item label="Identificación" name="identificacion">
                            <Input prefix={<IdcardOutlined style={{color:'rgba(0,0,0,.25)'}}/>} />
                        </Form.Item>
                    </Col>
                    <Col span={6}>
                        <Form.Item 
                            label="Cumpleaños" 
                            name="fecha_nacimiento"
                            getValueProps={(value) => ({ value: value ? dayjs(value) : "" })}
                        >
                            <DatePicker style={{ width: "100%" }} format="YYYY-MM-DD" />
                        </Form.Item>
                    </Col>
                </Row>

                <Divider orientation="left" style={{ borderColor: '#722ed1', color: '#722ed1' }}><PhoneOutlined /> Contacto</Divider>
                <Row gutter={24}>
                    <Col span={8}>
                        <Form.Item label="Email" name="email">
                            <Input prefix={<MailOutlined style={{color:'rgba(0,0,0,.25)'}}/>} />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item label="Teléfono 1" name="telefono" rules={[{ required: true }]}>
                            <Input prefix={<PhoneOutlined style={{color:'rgba(0,0,0,.25)'}}/>} />
                        </Form.Item>
                    </Col>
                    <Col span={8}>
                        <Form.Item label="Teléfono 2 (Opcional)" name="telefono_2">
                            <Input prefix={<PhoneOutlined style={{color:'rgba(0,0,0,.25)'}}/>} />
                        </Form.Item>
                    </Col>
                </Row>
                <Row>
                    <Col span={24}>
                        <Form.Item label="Dirección" name="direccion">
                            <Input prefix={<HomeOutlined style={{color:'rgba(0,0,0,.25)'}}/>} />
                        </Form.Item>
                    </Col>
                </Row>

                <Divider orientation="left" style={{ borderColor: '#722ed1', color: '#722ed1' }}>💸 Valor Hora</Divider>
                <Row gutter={24}>
                    <Col span={12}>
                        <Form.Item
                            label="Valor por Hora Dictada"
                            name="valor_hora"
                            tooltip="Este valor se usa para calcular la nómina (Horas dictadas x Valor hora)."
                        >
                            <InputNumber
                                min={0}
                                style={{ width: '100%' }}
                                formatter={(value: any) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={((value: string | undefined): number => {
                                    const parsed = value?.replace(/\$\s?|(,*)/g, '');
                                    return parsed ? parseInt(parsed, 10) : 0;
                                }) as any}
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Divider orientation="left" style={{ borderColor: '#722ed1', color: '#722ed1' }}><FileTextOutlined /> Notas</Divider>
                <Row gutter={24}>
                    <Col span={24}>
                        <Form.Item label="Observaciones" name="observaciones">
                            <Input.TextArea rows={3} />
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
            )}
        </Edit>
    );
}