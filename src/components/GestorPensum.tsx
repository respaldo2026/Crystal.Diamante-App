"use client";

import React, { useState, useEffect } from "react";
import {
  Modal,
  Form,
  Input,
  InputNumber,
  Table,
  Button,
  Space,
  Card,
  Tag,
  Tabs,
  App,
  Divider,
  message as antMessage,
  Upload,
  Select,
  Drawer,
  Empty,
  Progress,
  Tooltip,
  List,
  Alert,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  DownloadOutlined,
  FileOutlined,
  GiftOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import type { UploadFile } from "antd";

const { Title, Text } = require("antd").Typography;

interface Pensum {
  id: string;
  programa_id: number;
  numero_ciclo: number;
  nombre_ciclo: string;
  descripcion: string;
  duracion_semanas: number;
  total_horas: number;
  orden: number;
  activo: boolean;
}

interface PensumCurso {
  id: string;
  nombre_curso: string;
  descripcion: string;
  horas: number;
  creditos: number;
  tipo_curso: string;
  orden: number;
}

interface MaterialDidactico {
  id: string;
  titulo: string;
  descripcion: string;
  tipo_material: string;
  nombre_archivo: string;
  url_archivo: string;
  tamano_bytes: number;
  mime_type: string;
  subido_por_nombre: string;
  created_at: string;
}

interface GestorPensumProps {
  programaId: number;
  programaNombre: string;
  onClose: () => void;
}

export default function GestorPensum({
  programaId,
  programaNombre,
  onClose,
}: GestorPensumProps) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [formCurso] = Form.useForm();
  const [formMaterial] = Form.useForm();

  // Estados para pensum
  const [pensums, setPensums] = useState<Pensum[]>([]);
  const [loadingPensums, setLoadingPensums] = useState(false);
  const [modalPensumVisible, setModalPensumVisible] = useState(false);
  const [editingPensum, setEditingPensum] = useState<Pensum | null>(null);

  // Estados para cursos del pensum
  const [cursosPensum, setCursosPensum] = useState<PensumCurso[]>([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [modalCursoVisible, setModalCursoVisible] = useState(false);
  const [selectedPensum, setSelectedPensum] = useState<Pensum | null>(null);
  const [editingCurso, setEditingCurso] = useState<PensumCurso | null>(null);

  // Estados para material didáctico
  const [materiales, setMateriales] = useState<MaterialDidactico[]>([]);
  const [loadingMateriales, setLoadingMateriales] = useState(false);
  const [drawerMaterialesVisible, setDrawerMaterialesVisible] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  // Tab activo
  const [activeTab, setActiveTab] = useState("1");

  useEffect(() => {
    cargarPensums();
    cargarMateriales();
  }, []);

  // ==================== PENSUM ====================

  const cargarPensums = async () => {
    setLoadingPensums(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("pensum")
        .select("*")
        .eq("programa_id", programaId)
        .order("numero_ciclo", { ascending: true });

      if (error) throw error;
      setPensums(data || []);
    } catch (error) {
      message.error("Error al cargar pensum");
      console.error(error);
    } finally {
      setLoadingPensums(false);
    }
  };

  const handleGuardarPensum = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        programa_id: programaId,
      };

      if (editingPensum) {
        const { error } = await supabaseBrowserClient
          .from("pensum")
          .update(payload)
          .eq("id", editingPensum.id);
        if (error) throw error;
        message.success("Ciclo actualizado");
      } else {
        const { error } = await supabaseBrowserClient
          .from("pensum")
          .insert([payload]);
        if (error) throw error;
        message.success("Ciclo creado");
      }

      setModalPensumVisible(false);
      form.resetFields();
      setEditingPensum(null);
      cargarPensums();
    } catch (error: any) {
      message.error(error?.message || "Error al guardar");
    }
  };

  const handleEditarPensum = (pensum: Pensum) => {
    setEditingPensum(pensum);
    form.setFieldsValue(pensum);
    setModalPensumVisible(true);
  };

  const handleEliminarPensum = (pensumId: string) => {
    modal.confirm({
      title: "Eliminar ciclo",
      content: "¿Estás seguro? Se eliminarán también todos sus cursos.",
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("pensum")
            .delete()
            .eq("id", pensumId);
          if (error) throw error;
          message.success("Ciclo eliminado");
          cargarPensums();
        } catch (error: any) {
          message.error(error?.message || "Error");
        }
      },
    });
  };

  // ==================== CURSOS DEL PENSUM ====================

  const cargarCursosPensum = async (pensumId: string) => {
    setLoadingCursos(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("pensum_cursos")
        .select("*")
        .eq("pensum_id", pensumId)
        .order("orden", { ascending: true });

      if (error) throw error;
      setCursosPensum(data || []);
    } catch (error) {
      message.error("Error al cargar cursos");
    } finally {
      setLoadingCursos(false);
    }
  };

  const handleAbrirEditarCursos = (pensum: Pensum) => {
    setSelectedPensum(pensum);
    cargarCursosPensum(pensum.id);
    setModalCursoVisible(true);
  };

  const handleGuardarCurso = async () => {
    try {
      const values = await formCurso.validateFields();
      if (!selectedPensum) return;

      const payload = {
        ...values,
        pensum_id: selectedPensum.id,
      };

      if (editingCurso) {
        const { error } = await supabaseBrowserClient
          .from("pensum_cursos")
          .update(payload)
          .eq("id", editingCurso.id);
        if (error) throw error;
        message.success("Curso actualizado");
      } else {
        const { error } = await supabaseBrowserClient
          .from("pensum_cursos")
          .insert([payload]);
        if (error) throw error;
        message.success("Curso agregado");
      }

      formCurso.resetFields();
      setEditingCurso(null);
      cargarCursosPensum(selectedPensum.id);
    } catch (error: any) {
      message.error(error?.message || "Error");
    }
  };

  const handleEliminarCurso = (cursoId: string) => {
    modal.confirm({
      title: "Eliminar curso",
      content: "¿Estás seguro?",
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("pensum_cursos")
            .delete()
            .eq("id", cursoId);
          if (error) throw error;
          message.success("Curso eliminado");
          if (selectedPensum) cargarCursosPensum(selectedPensum.id);
        } catch (error: any) {
          message.error(error?.message || "Error");
        }
      },
    });
  };

  // ==================== MATERIAL DIDÁCTICO ====================

  const cargarMateriales = async () => {
    setLoadingMateriales(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("v_material_completo")
        .select("*")
        .eq("programa_id", programaId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setMateriales(data || []);
    } catch (error) {
      message.error("Error al cargar materiales");
      console.error(error);
    } finally {
      setLoadingMateriales(false);
    }
  };

  const handleSubirMaterial = async () => {
    try {
      const values = await formMaterial.validateFields();

      if (fileList.length === 0) {
        message.error("Debes seleccionar un archivo");
        return;
      }

      setUploadingMaterial(true);
      const file = fileList[0].originFileObj as File;

      // Subir archivo a Supabase Storage
      const fileName = `${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } =
        await supabaseBrowserClient.storage
          .from("material_didactico")
          .upload(`${programaId}/${fileName}`, file);

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: urlData } =
        supabaseBrowserClient.storage
          .from("material_didactico")
          .getPublicUrl(`${programaId}/${fileName}`);

      // Obtener usuario actual
      const { data: { user } } = await supabaseBrowserClient.auth.getUser();

      // Guardar metadata en BD
      const payload = {
        programa_id: programaId,
        pensum_id: values.pensum_id || null,
        titulo: values.titulo,
        descripcion: values.descripcion,
        tipo_material: values.tipo_material,
        nombre_archivo: file.name,
        url_archivo: urlData.publicUrl,
        tamano_bytes: file.size,
        mime_type: file.type,
        subido_por: user?.id,
        visible: true,
      };

      const { error: insertError } = await supabaseBrowserClient
        .from("material_didactico")
        .insert([payload]);

      if (insertError) throw insertError;

      message.success("Material subido correctamente");
      formMaterial.resetFields();
      setFileList([]);
      cargarMateriales();
    } catch (error: any) {
      message.error(error?.message || "Error al subir material");
    } finally {
      setUploadingMaterial(false);
    }
  };

  const handleEliminarMaterial = (materialId: string) => {
    modal.confirm({
      title: "Eliminar material",
      content: "¿Estás seguro?",
      okText: "Eliminar",
      okType: "danger",
      onOk: async () => {
        try {
          const { error } = await supabaseBrowserClient
            .from("material_didactico")
            .delete()
            .eq("id", materialId);
          if (error) throw error;
          message.success("Material eliminado");
          cargarMateriales();
        } catch (error: any) {
          message.error(error?.message || "Error");
        }
      },
    });
  };

  const formatearTamano = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <Drawer
      title={`Gestión: ${programaNombre}`}
      placement="right"
      onClose={onClose}
      width={1000}
      destroyOnClose
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: "1",
            label: "📚 Pensum",
            children: (
              <div>
                <div style={{ marginBottom: 24 }}>
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                      setEditingPensum(null);
                      form.resetFields();
                      setModalPensumVisible(true);
                    }}
                  >
                    Nuevo Ciclo
                  </Button>
                </div>

                {pensums.length === 0 ? (
                  <Empty description="No hay ciclos creados" />
                ) : (
                  <Table
                    dataSource={pensums}
                    rowKey="id"
                    columns={[
                      {
                        title: "Ciclo",
                        render: (_: any, record: Pensum) => (
                          <div>
                            <Text strong>Ciclo {record.numero_ciclo}</Text>
                            {record.nombre_ciclo && (
                              <div style={{ fontSize: 12, color: "#999" }}>
                                {record.nombre_ciclo}
                              </div>
                            )}
                          </div>
                        ),
                      },
                      {
                        title: "Duración",
                        render: (_: any, record: Pensum) => (
                          <div>
                            {record.duracion_semanas} semanas
                            {record.total_horas && (
                              <div style={{ fontSize: 12, color: "#999" }}>
                                {record.total_horas} horas
                              </div>
                            )}
                          </div>
                        ),
                      },
                      {
                        title: "Cursos",
                        render: (
                          _: any,
                          record: Pensum
                        ) => (
                          <Button
                            type="link"
                            size="small"
                            onClick={() => handleAbrirEditarCursos(record)}
                          >
                            Ver Cursos
                          </Button>
                        ),
                      },
                      {
                        title: "Acciones",
                        width: 150,
                        render: (_: any, record: Pensum) => (
                          <Space>
                            <Button
                              icon={<EditOutlined />}
                              size="small"
                              onClick={() => handleEditarPensum(record)}
                            />
                            <Button
                              icon={<DeleteOutlined />}
                              danger
                              size="small"
                              onClick={() => handleEliminarPensum(record.id)}
                            />
                          </Space>
                        ),
                      },
                    ]}
                    pagination={false}
                  />
                )}
              </div>
            ),
          },
          {
            key: "2",
            label: "📎 Material Didáctico",
            children: (
              <div>
                <div style={{ marginBottom: 24 }}>
                  <Button
                    type="primary"
                    icon={<UploadOutlined />}
                    onClick={() => setDrawerMaterialesVisible(true)}
                  >
                    Subir Material
                  </Button>
                </div>

                {materiales.length === 0 ? (
                  <Empty description="No hay materiales subidos" />
                ) : (
                  <List
                    dataSource={materiales}
                    renderItem={(material: MaterialDidactico) => (
                      <List.Item
                        actions={[
                          <a
                            href={material.url_archivo}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <DownloadOutlined /> Descargar
                          </a>,
                          <Button
                            icon={<DeleteOutlined />}
                            danger
                            size="small"
                            type="text"
                            onClick={() =>
                              handleEliminarMaterial(material.id)
                            }
                          />,
                        ]}
                      >
                        <List.Item.Meta
                          avatar={
                            <div
                              style={{
                                fontSize: 24,
                                width: 32,
                                textAlign: "center",
                              }}
                            >
                              {material.tipo_material === "documento" &&
                                "📄"}
                              {material.tipo_material === "video" && "🎥"}
                              {material.tipo_material === "imagen" && "🖼️"}
                              {material.tipo_material === "presentacion" &&
                                "📊"}
                              {material.tipo_material === "recurso" && "🔧"}
                              {material.tipo_material === "otro" && "📎"}
                            </div>
                          }
                          title={
                            <div>
                              <Text strong>{material.titulo}</Text>
                              {material.nombre_ciclo && (
                                <Tag style={{ marginLeft: 8 }}>
                                  {material.nombre_ciclo}
                                </Tag>
                              )}
                            </div>
                          }
                          description={
                            <div>
                              <p style={{ margin: "4px 0" }}>
                                {material.descripcion}
                              </p>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                📦 {formatearTamano(material.tamano_bytes || 0)}{" "}
                                • 👤 {material.subido_por_nombre}
                              </Text>
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </div>
            ),
          },
        ]}
      />

      {/* MODAL: Crear/Editar Pensum */}
      <Modal
        title={
          editingPensum
            ? `Editar Ciclo ${editingPensum.numero_ciclo}`
            : "Nuevo Ciclo"
        }
        open={modalPensumVisible}
        onOk={handleGuardarPensum}
        onCancel={() => {
          setModalPensumVisible(false);
          setEditingPensum(null);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="numero_ciclo"
            label="Número de Ciclo"
            rules={[{ required: true, message: "Requerido" }]}
          >
            <InputNumber min={1} placeholder="1, 2, 3..." />
          </Form.Item>

          <Form.Item name="nombre_ciclo" label="Nombre del Ciclo (opcional)">
            <Input placeholder="Ej: Ciclo Introductorio" />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={3} placeholder="Descripción del ciclo" />
          </Form.Item>

          <Form.Item
            name="duracion_semanas"
            label="Duración (semanas)"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} />
          </Form.Item>

          <Form.Item name="total_horas" label="Total de Horas">
            <InputNumber min={0} />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL: Editar Cursos del Pensum */}
      <Modal
        title={
          selectedPensum
            ? `Cursos - Ciclo ${selectedPensum.numero_ciclo}`
            : "Cursos"
        }
        open={modalCursoVisible}
        width={800}
        footer={null}
        onCancel={() => {
          setModalCursoVisible(false);
          setSelectedPensum(null);
          setCursosPensum([]);
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingCurso(null);
              formCurso.resetFields();
            }}
          >
            Agregar Curso
          </Button>
        </div>

        {editingCurso || formCurso.getFieldValue("nombre_curso") !== undefined ? (
          <Card style={{ marginBottom: 16 }}>
            <Form form={formCurso} layout="vertical">
              <Form.Item
                name="nombre_curso"
                label="Nombre del Curso"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>

              <Form.Item name="descripcion" label="Descripción">
                <Input.TextArea rows={2} />
              </Form.Item>

              <Form.Item name="horas" label="Horas">
                <InputNumber min={0} />
              </Form.Item>

              <Form.Item name="creditos" label="Créditos">
                <InputNumber min={0} />
              </Form.Item>

              <Form.Item
                name="tipo_curso"
                label="Tipo de Curso"
                rules={[{ required: true }]}
              >
                <Select
                  options={[
                    { label: "Obligatorio", value: "obligatorio" },
                    { label: "Electivo", value: "electivo" },
                    { label: "Complementario", value: "complementario" },
                  ]}
                />
              </Form.Item>

              <Space>
                <Button type="primary" onClick={handleGuardarCurso}>
                  Guardar
                </Button>
                <Button
                  onClick={() => {
                    setEditingCurso(null);
                    formCurso.resetFields();
                  }}
                >
                  Cancelar
                </Button>
              </Space>
            </Form>
          </Card>
        ) : null}

        {cursosPensum.length === 0 ? (
          <Empty description="Sin cursos" />
        ) : (
          <Table
            dataSource={cursosPensum}
            rowKey="id"
            pagination={false}
            columns={[
              {
                title: "Curso",
                dataIndex: "nombre_curso",
                render: (text: string, record: PensumCurso) => (
                  <div>
                    <Text strong>{text}</Text>
                    <Tag style={{ marginLeft: 8 }}>
                      {record.tipo_curso}
                    </Tag>
                  </div>
                ),
              },
              {
                title: "Horas / Créditos",
                render: (_: any, record: PensumCurso) => (
                  <div>
                    {record.horas}h / {record.creditos || "-"} créditos
                  </div>
                ),
              },
              {
                title: "Acciones",
                width: 100,
                render: (_: any, record: PensumCurso) => (
                  <Space>
                    <Button
                      icon={<EditOutlined />}
                      size="small"
                      onClick={() => {
                        setEditingCurso(record);
                        formCurso.setFieldsValue(record);
                      }}
                    />
                    <Button
                      icon={<DeleteOutlined />}
                      danger
                      size="small"
                      onClick={() => handleEliminarCurso(record.id)}
                    />
                  </Space>
                ),
              },
            ]}
          />
        )}
      </Modal>

      {/* DRAWER: Subir Material Didáctico */}
      <Drawer
        title="Subir Material Didáctico"
        placement="right"
        onClose={() => setDrawerMaterialesVisible(false)}
        open={drawerMaterialesVisible}
        width={500}
      >
        <Form form={formMaterial} layout="vertical">
          <Form.Item
            name="titulo"
            label="Título del Material"
            rules={[{ required: true }]}
          >
            <Input placeholder="Ej: Guía de Práctica 1" />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea
              rows={3}
              placeholder="Descripción breve del material"
            />
          </Form.Item>

          <Form.Item
            name="tipo_material"
            label="Tipo de Material"
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { label: "📄 Documento", value: "documento" },
                { label: "🎥 Video", value: "video" },
                { label: "🖼️ Imagen", value: "imagen" },
                { label: "📊 Presentación", value: "presentacion" },
                { label: "🔧 Recurso", value: "recurso" },
                { label: "📎 Otro", value: "otro" },
              ]}
            />
          </Form.Item>

          <Form.Item name="pensum_id" label="Ciclo (opcional)">
            <Select
              placeholder="Selecciona un ciclo (opcional)"
              allowClear
              options={pensums.map((p) => ({
                label: `Ciclo ${p.numero_ciclo} ${p.nombre_ciclo ? `- ${p.nombre_ciclo}` : ""}`,
                value: p.id,
              }))}
            />
          </Form.Item>

          <Form.Item
            name="archivo"
            label="Archivo"
            rules={[{ required: true, message: "Debes seleccionar un archivo" }]}
          >
            <Upload
              beforeUpload={() => false}
              fileList={fileList}
              onChange={(info) => setFileList(info.fileList)}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>Seleccionar Archivo</Button>
            </Upload>
          </Form.Item>

          <Space style={{ width: "100%" }}>
            <Button
              type="primary"
              loading={uploadingMaterial}
              onClick={handleSubirMaterial}
              block
            >
              Subir Material
            </Button>
            <Button onClick={() => setDrawerMaterialesVisible(false)}>
              Cancelar
            </Button>
          </Space>
        </Form>
      </Drawer>
    </Drawer>
  );
}
