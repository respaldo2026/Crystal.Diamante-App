"use client";

import React, { useState, useEffect } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Upload,
  message,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  Popconfirm,
  Tooltip,
  Switch,
  Image,
} from "antd";
import {
  PlusOutlined,
  UploadOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileOutlined,
  ReloadOutlined,
  RobotOutlined,
} from "@ant-design/icons";
import type { UploadFile, UploadProps } from "antd/es/upload/interface";
import { supabaseBrowserClient } from "@utils/supabase/client";
import dayjs from "dayjs";

const { Title, Text } = Typography;
const { TextArea } = Input;

interface MarketingAsset {
  id: string;
  titulo: string;
  descripcion?: string;
  tipo_asset: string;
  url_archivo: string;
  nombre_archivo: string;
  tamano_bytes?: number;
  mime_type?: string;
  descripcion_ia: string;
  keywords?: string[];
  programa_id?: number;
  curso_id?: number;
  estado: string;
  visible_para_ia: boolean;
  categoria?: string;
  created_at: string;
  updated_at: string;
}

interface Programa {
  id: number;
  nombre: string;
}

const tipoAssetOptions = [
  { value: "flyer", label: "Flyer", icon: <FileImageOutlined /> },
  { value: "pdf", label: "PDF", icon: <FilePdfOutlined /> },
  { value: "imagen", label: "Imagen", icon: <FileImageOutlined /> },
  { value: "video", label: "Video" },
  { value: "documento", label: "Documento", icon: <FileOutlined /> },
  { value: "otro", label: "Otro" },
];

const categoriaOptions = [
  "promocional",
  "informativo",
  "legal",
  "inscripción",
  "horarios",
  "precios",
];

const estadoColors: Record<string, string> = {
  activo: "green",
  inactivo: "orange",
  archivado: "default",
};

export default function MarketingCenterPage() {
  const [assets, setAssets] = useState<MarketingAsset[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAsset, setEditingAsset] = useState<MarketingAsset | null>(null);
  const [form] = Form.useForm();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    await Promise.all([cargarAssets(), cargarProgramas()]);
  };

  const cargarAssets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabaseBrowserClient
        .from("marketing_assets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAssets((data as MarketingAsset[]) || []);
    } catch (error: any) {
      console.error("Error cargando assets:", error);
      message.error("No se pudieron cargar los assets de marketing");
    } finally {
      setLoading(false);
    }
  };

  const cargarProgramas = async () => {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("programas")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");

      if (error) throw error;
      setProgramas((data as Programa[]) || []);
    } catch (error) {
      console.error("Error cargando programas:", error);
    }
  };

  const handleUpload = async (values: any) => {
    console.log("[MARKETING] Iniciando subida con valores:", values);
    console.log("[MARKETING] FileList length:", fileList.length);
    console.log("[MARKETING] EditingAsset:", editingAsset);

    if (fileList.length === 0 && !editingAsset) {
      message.error("Debes seleccionar un archivo");
      return;
    }

    setUploading(true);

    try {
      let urlArchivo = editingAsset?.url_archivo;
      let nombreArchivo = editingAsset?.nombre_archivo;
      let tamanoBytes = editingAsset?.tamano_bytes;
      let mimeType = editingAsset?.mime_type;

      // Si hay un archivo nuevo, subirlo
      if (fileList.length > 0) {
        const fileItem = fileList[0];
        console.log("[MARKETING] FileItem:", fileItem);
        
        // El fileItem puede ser un File directamente o un UploadFile con originFileObj
        const file = (fileItem instanceof File) 
          ? fileItem 
          : (fileItem as any)?.originFileObj as File | undefined;
        
        if (!file) {
          console.error("[MARKETING] No se pudo extraer el archivo");
          message.error("No se pudo leer el archivo seleccionado");
          setUploading(false);
          return;
        }

        console.log("[MARKETING] Archivo a subir:", {
          name: file.name,
          size: file.size,
          type: file.type
        });

        const fileExt = file.name.split(".").pop() || "bin";
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        console.log("[MARKETING] Subiendo a Storage, path:", filePath);

        // Subir a Supabase Storage (bucket 'marketing')
        const { data: uploadData, error: uploadError } = await supabaseBrowserClient.storage
          .from("marketing")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
          });

        console.log("[MARKETING] Resultado de upload:", { uploadData, uploadError });

        if (uploadError) throw uploadError;

        // Obtener URL pública
        const {
          data: { publicUrl },
        } = supabaseBrowserClient.storage.from("marketing").getPublicUrl(filePath);

        console.log("[MARKETING] URL pública obtenida:", publicUrl);

        urlArchivo = publicUrl;
        nombreArchivo = file.name;
        tamanoBytes = file.size;
        mimeType = file.type;
      }

      // Preparar datos para guardar
      const payload = {
        titulo: values.titulo,
        descripcion: values.descripcion || null,
        tipo_asset: values.tipo_asset,
        url_archivo: urlArchivo,
        nombre_archivo: nombreArchivo,
        tamano_bytes: tamanoBytes,
        mime_type: mimeType,
        descripcion_ia: values.descripcion_ia,
        keywords: values.keywords ? values.keywords.split(",").map((k: string) => k.trim()) : [],
        programa_id: values.programa_id || null,
        curso_id: values.curso_id || null,
        estado: values.estado || "activo",
        visible_para_ia: values.visible_para_ia !== false,
        categoria: values.categoria || null,
      };

      if (editingAsset) {
        // Actualizar
        const { error } = await supabaseBrowserClient
          .from("marketing_assets")
          .update(payload)
          .eq("id", editingAsset.id);

        if (error) throw error;
        message.success("Asset actualizado correctamente");
      } else {
        // Crear
        const { error } = await supabaseBrowserClient.from("marketing_assets").insert(payload);

        if (error) throw error;
        message.success("Asset creado correctamente");
      }

      setModalVisible(false);
      form.resetFields();
      setFileList([]);
      setEditingAsset(null);
      cargarAssets();
    } catch (error: any) {
      console.error("Error guardando asset:", error);
      message.error(error.message || "Error al guardar el asset");
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (record: MarketingAsset) => {
    setEditingAsset(record);
    form.setFieldsValue({
      ...record,
      keywords: record.keywords?.join(", ") || "",
    });
    setModalVisible(true);
  };

  const handleDelete = async (record: MarketingAsset) => {
    try {
      const marker = "/storage/v1/object/public/marketing/";
      const url = record.url_archivo || "";
      const rawPath = url.includes(marker) ? url.split(marker)[1] : undefined;
      const path = rawPath ? decodeURIComponent(rawPath) : "";

      if (!path) {
        message.error("No se pudo identificar el archivo en Storage");
        return;
      }

      const { error: storageError } = await supabaseBrowserClient.storage
        .from("marketing")
        .remove([path]);

      if (storageError) {
        console.error("Error eliminando archivo en Storage:", storageError);
        message.error("No se pudo eliminar el archivo en Storage");
        return;
      }

      const { error } = await supabaseBrowserClient
        .from("marketing_assets")
        .delete()
        .eq("id", record.id);

      if (error) throw error;
      message.success("Asset eliminado de la base de datos y Storage");
      cargarAssets();
    } catch (error: any) {
      console.error("Error eliminando asset:", error);
      message.error("No se pudo eliminar el asset");
    }
  };

  const handleToggleVisibilidadIA = async (record: MarketingAsset) => {
    try {
      const { error } = await supabaseBrowserClient
        .from("marketing_assets")
        .update({ visible_para_ia: !record.visible_para_ia })
        .eq("id", record.id);

      if (error) throw error;
      message.success(
        record.visible_para_ia ? "Ocultado para la IA" : "Visible para la IA"
      );
      cargarAssets();
    } catch (error: any) {
      console.error("Error actualizando visibilidad:", error);
      message.error("No se pudo actualizar");
    }
  };

  const uploadProps: UploadProps = {
    maxCount: 1,
    fileList,
    beforeUpload: (file) => {
      const isLt10M = file.size / 1024 / 1024 < 10;
      if (!isLt10M) {
        message.error("El archivo debe ser menor a 10MB");
        return Upload.LIST_IGNORE;
      }
      setFileList([file as any]);
      return false;
    },
    onRemove: () => {
      setFileList([]);
    },
  };

  const stats = {
    total: assets.length,
    activos: assets.filter((a) => a.estado === "activo").length,
    visiblesIA: assets.filter((a) => a.visible_para_ia).length,
    flyers: assets.filter((a) => a.tipo_asset === "flyer").length,
  };

  const columns = [
    {
      title: "Archivo",
      dataIndex: "titulo",
      key: "titulo",
      render: (_: any, record: MarketingAsset) => (
        <Space>
          {record.tipo_asset === "imagen" || record.tipo_asset === "flyer" ? (
            <FileImageOutlined style={{ fontSize: 20, color: "#1890ff" }} />
          ) : record.tipo_asset === "pdf" ? (
            <FilePdfOutlined style={{ fontSize: 20, color: "#ff4d4f" }} />
          ) : (
            <FileOutlined style={{ fontSize: 20 }} />
          )}
          <div>
            <Text strong>{record.titulo}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.nombre_archivo}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: "Descripción IA",
      dataIndex: "descripcion_ia",
      key: "descripcion_ia",
      ellipsis: true,
      width: 300,
      render: (text: string) => (
        <Tooltip title={text}>
          <Text ellipsis>{text}</Text>
        </Tooltip>
      ),
    },
    {
      title: "Tipo",
      dataIndex: "tipo_asset",
      key: "tipo_asset",
      render: (tipo: string) => <Tag>{tipo}</Tag>,
    },
    {
      title: "IA",
      dataIndex: "visible_para_ia",
      key: "visible_para_ia",
      align: "center" as const,
      render: (visible: boolean, record: MarketingAsset) => (
        <Switch
          checked={visible}
          checkedChildren={<RobotOutlined />}
          unCheckedChildren="Off"
          onChange={() => handleToggleVisibilidadIA(record)}
        />
      ),
    },
    {
      title: "Estado",
      dataIndex: "estado",
      key: "estado",
      render: (estado: string) => <Tag color={estadoColors[estado]}>{estado}</Tag>,
    },
    {
      title: "Fecha",
      dataIndex: "created_at",
      key: "created_at",
      render: (fecha: string) => dayjs(fecha).format("DD/MM/YY"),
    },
    {
      title: "Acciones",
      key: "acciones",
      render: (_: any, record: MarketingAsset) => (
        <Space>
          <Tooltip title="Ver archivo">
            <Button
              icon={<EyeOutlined />}
              size="small"
              onClick={() => {
                setPreviewUrl(record.url_archivo);
                setPreviewVisible(true);
              }}
            />
          </Tooltip>
          <Tooltip title="Editar">
            <Button icon={<EditOutlined />} size="small" onClick={() => handleEdit(record)} />
          </Tooltip>
          <Popconfirm
            title="¿Eliminar este asset?"
            onConfirm={() => handleDelete(record)}
            okText="Sí"
            cancelText="No"
          >
            <Button icon={<DeleteOutlined />} size="small" danger />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ width: "100%", padding: "24px" }}>
      {/* Header */}
      <Card
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          border: "none",
        }}
      >
        <Space direction="vertical" size="small">
          <Space align="center">
            <RobotOutlined style={{ fontSize: 32, color: "#fff" }} />
            <Title level={2} style={{ margin: 0, color: "#fff" }}>
              Marketing Center
            </Title>
          </Space>
          <Text style={{ color: "#e6e6fa", fontSize: 16 }}>
            Material publicitario para el Agente de IA (Dany)
          </Text>
        </Space>
      </Card>

      {/* Estadísticas */}
      <Row gutter={16}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="Total Assets" value={stats.total} prefix={<FileOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Activos"
              value={stats.activos}
              valueStyle={{ color: "#3f8600" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="Visibles para IA"
              value={stats.visiblesIA}
              prefix={<RobotOutlined />}
              valueStyle={{ color: "#1890ff" }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="Flyers" value={stats.flyers} prefix={<FileImageOutlined />} />
          </Card>
        </Col>
      </Row>

      {/* Tabla */}
      <Card
        title="Assets de Marketing"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={cargarAssets}>
              Recargar
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingAsset(null);
                form.resetFields();
                setFileList([]);
                setModalVisible(true);
              }}
            >
              Nuevo Asset
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={assets}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Modal de Crear/Editar */}
      <Modal
        title={editingAsset ? "Editar Asset" : "Nuevo Asset de Marketing"}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          form.resetFields();
          setFileList([]);
          setEditingAsset(null);
        }}
        onOk={() => form.submit()}
        okText={editingAsset ? "Actualizar" : "Crear"}
        cancelText="Cancelar"
        width={700}
        confirmLoading={uploading}
      >
        <Form form={form} layout="vertical" onFinish={handleUpload}>
          <Form.Item
            name="titulo"
            label="Título"
            rules={[{ required: true, message: "Ingresa un título" }]}
          >
            <Input placeholder="Ej: Flyer Promoción Manicure Febrero 2026" />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción (opcional)">
            <TextArea rows={2} placeholder="Descripción general del material" />
          </Form.Item>

          <Form.Item
            name="descripcion_ia"
            label="Descripción para la IA (Crucial)"
            rules={[
              {
                required: true,
                message: "Describe el contenido para que la IA lo entienda",
              },
            ]}
            tooltip="La IA usará esto para saber cuándo compartir este material"
          >
            <TextArea
              rows={3}
              placeholder="Ej: Promoción de manicure con 20% descuento válida hasta fin de mes. Incluye imagen de diseño de uñas francesas y precio especial de $45.000"
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="tipo_asset"
                label="Tipo de archivo"
                rules={[{ required: true, message: "Selecciona el tipo" }]}
              >
                <Select placeholder="Selecciona tipo" options={tipoAssetOptions} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="categoria" label="Categoría">
                <Select
                  placeholder="Selecciona categoría"
                  options={categoriaOptions.map((c) => ({ value: c, label: c }))}
                  allowClear
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="keywords" label="Keywords (separadas por coma)" tooltip="Para búsqueda">
            <Input placeholder="manicure, promoción, febrero, descuento" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="programa_id" label="Programa relacionado">
                <Select
                  placeholder="Selecciona programa"
                  options={programas.map((p) => ({ value: p.id, label: p.nombre }))}
                  allowClear
                  showSearch
                  filterOption={(input, option) =>
                    (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="estado" label="Estado" initialValue="activo">
                <Select
                  options={[
                    { value: "activo", label: "Activo" },
                    { value: "inactivo", label: "Inactivo" },
                    { value: "archivado", label: "Archivado" },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="visible_para_ia"
            label="Visible para la IA"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch checkedChildren="Sí" unCheckedChildren="No" />
          </Form.Item>

          <Form.Item label="Archivo" tooltip="Max 10MB">
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />}>
                {editingAsset ? "Cambiar archivo (opcional)" : "Seleccionar archivo"}
              </Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal de Preview */}
      <Modal
        open={previewVisible}
        footer={null}
        onCancel={() => setPreviewVisible(false)}
        width={800}
      >
        {previewUrl.endsWith(".pdf") ? (
          <iframe src={previewUrl} width="100%" height="600px" style={{ border: "none" }} />
        ) : (
          <Image src={previewUrl} alt="Preview" style={{ width: "100%" }} />
        )}
      </Modal>
    </Space>
  );
}
