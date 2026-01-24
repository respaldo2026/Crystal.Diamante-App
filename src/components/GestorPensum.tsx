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
  Radio,
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
  LinkOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { supabaseBrowserClient } from "@utils/supabase/client";
import { logger } from "@utils/logger";
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
  pensum_id?: string;
}

interface GestorPensumProps {
  programaId: string;
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
  const [formCiclo] = Form.useForm();

  // Estados para pensum
  const [pensums, setPensums] = useState<Pensum[]>([]);
  const [loadingPensums, setLoadingPensums] = useState(false);
  interface ProgramaData {
    id: number;
    nombre: string;
    duracion: string;
    [key: string]: unknown;
  }
  const [programaData, setProgramaData] = useState<ProgramaData | null>(null);

  // Estados para cursos del pensum
  const [cursosPensum, setCursosPensum] = useState<PensumCurso[]>([]);
  const [loadingCursos, setLoadingCursos] = useState(false);
  const [modalCursoVisible, setModalCursoVisible] = useState(false);
  const [editingCurso, setEditingCurso] = useState<PensumCurso | null>(null);

  // Estados para editar ciclo
  const [modalCicloVisible, setModalCicloVisible] = useState(false);
  const [editingCiclo, setEditingCiclo] = useState<Pensum | null>(null);

  // Estados para material didáctico
  const [materiales, setMateriales] = useState<MaterialDidactico[]>([]);
  const [loadingMateriales, setLoadingMateriales] = useState(false);
  const [drawerMaterialesVisible, setDrawerMaterialesVisible] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [tipoOrigen, setTipoOrigen] = useState<'archivo' | 'enlace'>('archivo');

  // Estados para navegación
  const [selectedCicloId, setSelectedCicloId] = useState<string | null>(null);
  const [selectedCursoId, setSelectedCursoId] = useState<string | null>(null);

  useEffect(() => {
    cargarPrograma();
  }, []);

  useEffect(() => {
    if (programaData) {
      verificarYCrearCiclos();
    }
  }, [programaData]);

  useEffect(() => {
    cargarPensums();
  }, []);

  useEffect(() => {
    if (selectedCicloId) {
      const cicloSeleccionado = pensums.find(p => p.id === selectedCicloId);
      if (cicloSeleccionado) {
        cargarCursosPensum(selectedCicloId);
      }
    }
  }, [selectedCicloId]);

  useEffect(() => {
    cargarMateriales();
  }, []);

  // Cargar información del programa
  const cargarPrograma = async () => {
    try {
      const { data, error } = await supabaseBrowserClient
        .from("programas")
        .select("*")
        .eq("id", programaId)
        .single();

      if (error) throw error;
      setProgramaData(data);
    } catch (error) {
      message.error("Error al cargar programa");
      logger.error(error);
    }
  };

  // Verificar y crear ciclos automáticamente según la duración del programa
  const verificarYCrearCiclos = async () => {
    if (!programaData?.duracion) {
      await cargarPensums();
      return;
    }

    // Extraer número de ciclos/meses de la duración (ej: "4 meses" -> 4)
    const duracionStr = String(programaData.duracion);
    const numeroCiclos = parseInt(duracionStr.match(/\d+/)?.[0] || "0", 10);

    if (numeroCiclos === 0) {
      await cargarPensums();
      return;
    }

    // Verificar ciclos existentes
    const { data: ciclosExistentes, error } = await supabaseBrowserClient
      .from("pensum")
      .select("numero_ciclo")
      .eq("programa_id", programaId);

    if (error) {
      logger.error("Error verificando ciclos:", error);
      await cargarPensums();
      return;
    }

    const ciclosQueExisten = new Set(ciclosExistentes?.map(c => c.numero_ciclo) || []);
    const ciclosFaltantes = [];

    // Crear los ciclos que faltan
    for (let i = 1; i <= numeroCiclos; i++) {
      if (!ciclosQueExisten.has(i)) {
        ciclosFaltantes.push({
          programa_id: programaId,
          numero_ciclo: i,
          nombre_ciclo: `Ciclo ${i}`,
          descripcion: `Contenido académico del ciclo ${i}`,
          duracion_semanas: 4,
          total_horas: 0,
          orden: i,
          activo: true,
        });
      }
    }

    if (ciclosFaltantes.length > 0) {
      try {
        // Usar API route que tiene permisos de service_role para bypasear RLS
        const response = await fetch("/api/pensum/create-ciclos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            programaId,
            ciclosFaltantes,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          logger.error("Error creando ciclos:", errorData);
          message.error("Error al crear ciclos automáticamente");
        }
      } catch (error) {
        logger.error("Error al llamar API crear ciclos:", error);
        message.error("Error de conexión al crear ciclos");
      }
    }

    await cargarPensums();
  };

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
      logger.error(error);
    } finally {
      setLoadingPensums(false);
    }
  };

  const handleEditarCiclo = (e: React.MouseEvent, pensum: Pensum) => {
    e.stopPropagation();
    setEditingCiclo(pensum);
    formCiclo.setFieldsValue({
      nombre_ciclo: pensum.nombre_ciclo,
      descripcion: pensum.descripcion
    });
    setModalCicloVisible(true);
  };

  const handleGuardarCiclo = async () => {
    try {
      const values = await formCiclo.validateFields();
      if (!editingCiclo) return;

      // Actualización optimista: Actualizar el estado local inmediatamente para ver el cambio
      setPensums(prev => prev.map(p => 
        p.id === editingCiclo.id 
          ? { ...p, nombre_ciclo: values.nombre_ciclo, descripcion: values.descripcion }
          : p
      ));

      const { data, error } = await supabaseBrowserClient
        .from("pensum")
        .update({
          nombre_ciclo: values.nombre_ciclo,
          descripcion: values.descripcion,
        })
        .eq("id", editingCiclo.id)
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error("No se pudieron guardar los cambios. Verifica permisos.");
      }

      message.success("Ciclo actualizado");
      setModalCicloVisible(false);
      setEditingCiclo(null);
      cargarPensums();
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message || "Error al actualizar ciclo");
      } else {
        message.error("Error al actualizar ciclo");
      }
      cargarPensums(); // Si falla, recargamos para revertir el cambio visual
    }
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

  const handleGuardarCurso = async () => {
    try {
      const values = await formCurso.validateFields();
      if (!selectedCicloId) return;

      const payload = {
        ...values,
        pensum_id: selectedCicloId,
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
      cargarCursosPensum(selectedCicloId);
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message || "Error");
      } else {
        message.error("Error");
      }
    }
  };

  const handleEliminarCurso = (cursoId: string) => {
    modal.confirm({
      title: "Eliminar tema",
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
          message.success("Tema eliminado");
          if (selectedCicloId) cargarCursosPensum(selectedCicloId);
        } catch (error) {
          if (error instanceof Error) {
            message.error(error.message || "Error");
          } else {
            message.error("Error");
          }
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
        } catch (error) {
          if (error instanceof Error) {
            message.error(error.message || "Error");
          } else {
            message.error("Error");
          }
        }
      },
    });
  };

  const formatearTamano = (bytes: number) => {
    if (bytes === 0) return "Enlace";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  // Actualizar pensum_id cuando se selecciona un ciclo para subir material
  const handleSubirMaterial = async () => {
    try {
      let urlArchivo = "";
      let nombreArchivo = "";
      let tamanoBytes = 0;
      let mimeType = "";

      if (tipoOrigen === 'archivo' && file && fileName) {
        // Subir archivo a Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseBrowserClient.storage
          .from("material_didactico")
          .upload(`${programaId}/${fileName}`, file);

        if (uploadError) {
          if (
            uploadError.message.includes("security policy") ||
            uploadError.message.includes("row-level security")
          ) {
            throw new Error(
              "Error de permisos: Falta configurar políticas RLS en el bucket 'material_didactico'. Ejecuta el script SQL de permisos."
            );
          }
          throw uploadError;
        }

        // Obtener URL pública
        const { data: urlData } = supabaseBrowserClient.storage
          .from("material_didactico")
          .getPublicUrl(`${programaId}/${fileName}`);

        urlArchivo = urlData.publicUrl;
        nombreArchivo = file.name;
        tamanoBytes = file.size;
        mimeType = file.type;
      } else if (tipoOrigen === 'enlace' && values.url_externa) {
        urlArchivo = values.url_externa;
        nombreArchivo = "Enlace Externo";
      }
    } catch (error) {
      // ...existing error handling...
    } finally {
      // ...existing finally block...
    }
  };

  const handleAbrirMaterial = (url: string) => {
    logger.debug("Intentando abrir URL:", url); // Debug para verificar qué llega
    if (!url) {
      message.error("Error: El material no tiene una URL válida");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Drawer
      title={`Gestión: ${programaNombre}`}
      placement="right"
      open={true}
      onClose={onClose}
      width={1200}
      destroyOnClose
    >
      {/* Vista Principal - Seleccionar Ciclo */}
      {!selectedCicloId ? (
        <div>
          {programaData && (
            <Alert
              message={`Ciclos generados automáticamente`}
              description={`Este programa tiene configurados ${pensums.length} ciclo(s) según la duración "${programaData.duracion}". Selecciona un ciclo para gestionar sus temas y materiales.`}
              type="info"
              showIcon
              style={{ marginBottom: 24 }}
            />
          )}

          <div style={{ marginBottom: 24 }}>
            <Text strong style={{ fontSize: 16 }}>
              Elige un ciclo para gestionar temas y subir materiales
            </Text>
          </div>

          {pensums.length === 0 ? (
            <Empty description="No hay ciclos creados" />
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              {pensums.map((pensum) => (
                <Card
                  key={pensum.id}
                  hoverable
                  onClick={() => setSelectedCicloId(pensum.id)}
                  style={{
                    cursor: "pointer",
                    textAlign: "center",
                    borderRadius: 8,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    position: "relative",
                  }}
                >
                  <Button 
                    type="text" 
                    icon={<EditOutlined />} 
                    style={{ position: 'absolute', top: 8, right: 8, zIndex: 1, color: '#1890ff' }}
                    onClick={(e) => handleEditarCiclo(e, pensum)}
                  />
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
                  <Text strong style={{ fontSize: 18, display: "block" }}>
                    {pensum.nombre_ciclo || `Ciclo ${pensum.numero_ciclo}`}
                  </Text>
                  {pensum.nombre_ciclo && (
                    <div style={{ fontSize: 13, color: "#666", marginTop: 4 }}>
                      Ciclo {pensum.numero_ciclo}
                    </div>
                  )}
                  {pensum.descripcion && (
                    <div style={{ fontSize: 12, color: "#888", marginTop: 8, fontStyle: 'italic', padding: '0 10px' }}>
                      {pensum.descripcion}
                    </div>
                  )}
                  <Divider style={{ margin: "12px 0" }} />
                  <div style={{ fontSize: 12, color: "#999" }}>
                    <div>⏱️ {pensum.duracion_semanas} semanas</div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Vista Ciclo Seleccionado - Ver Temas y Materiales */
        <div>
          <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12 }}>
            <Button onClick={() => setSelectedCicloId(null)}>← Volver</Button>
            <div>
              <Text strong style={{ fontSize: 18 }}>
                {pensums.find(p => p.id === selectedCicloId)?.nombre_ciclo || 
                 `Ciclo ${pensums.find(p => p.id === selectedCicloId)?.numero_ciclo}`}
              </Text>
            </div>
          </div>

          <Tabs
            defaultActiveKey="1"
            items={[
              {
                key: "1",
                label: "📖 Temas del Ciclo",
                children: (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          setEditingCurso(null);
                          formCurso.resetFields();
                          setModalCursoVisible(true);
                        }}
                      >
                        Agregar Tema
                      </Button>
                    </div>

                    {cursosPensum.length === 0 ? (
                      <Empty description="Sin temas en este ciclo" />
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                          gap: 16,
                        }}
                      >
                        {cursosPensum.map((curso) => (
                          <Card
                            key={curso.id}
                            style={{
                              borderRadius: 8,
                              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                            }}
                          >
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📝</div>
                            <Text strong style={{ fontSize: 15, display: "block" }}>
                              {curso.nombre_curso}
                            </Text>
                            {curso.descripcion && (
                              <p
                                style={{
                                  fontSize: 13,
                                  color: "#666",
                                  marginTop: 8,
                                  marginBottom: 8,
                                }}
                              >
                                {curso.descripcion}
                              </p>
                            )}
                            <Divider style={{ margin: "8px 0" }} />
                            <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
                              <div>⏱️ {curso.horas || 0} horas</div>
                              {curso.creditos && (
                                <div>⭐ {curso.creditos} créditos</div>
                              )}
                              <Tag style={{ marginTop: 8 }} color="blue">
                                {curso.tipo_curso}
                              </Tag>
                            </div>
                            <div style={{ display: "flex", gap: 8 }}>
                              <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => {
                                  setEditingCurso(curso);
                                  formCurso.setFieldsValue(curso);
                                  setModalCursoVisible(true);
                                }}
                              >
                                Editar
                              </Button>
                              <Button
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() => handleEliminarCurso(curso.id)}
                              />
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: "2",
                label: "📎 Materiales Didácticos",
                children: (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <Button
                        type="primary"
                        icon={<UploadOutlined />}
                        onClick={() => setDrawerMaterialesVisible(true)}
                      >
                        Subir Material
                      </Button>
                    </div>

                    {materiales.filter(m => m.pensum_id === selectedCicloId).length === 0 ? (
                      <Empty description="Sin materiales en este ciclo" />
                    ) : (
                      <List
                        dataSource={materiales.filter(m => m.pensum_id === selectedCicloId)}
                        renderItem={(material: MaterialDidactico) => (
                          <List.Item
                            actions={[
                              <Tooltip title="Clic para proyectar en clase o ver contenido">
                                <Button
                                  type="link"
                                  onClick={() => handleAbrirMaterial(material.url_archivo)}
                                  icon={material.mime_type === 'link' ? <LinkOutlined /> : <EyeOutlined />}
                                  style={{ fontWeight: 500, padding: 0, height: 'auto' }}
                                >
                                  {material.mime_type === 'link' ? " Abrir Enlace" : " Ver / Proyectar"}
                                </Button>
                              </Tooltip>,
                              <Button
                                icon={<DeleteOutlined />}
                                danger
                                size="small"
                                type="text"
                                onClick={() => handleEliminarMaterial(material.id)}
                              />,
                            ]}
                          >
                            <List.Item.Meta
                              avatar={
                                <div style={{ fontSize: 24, width: 32, textAlign: "center" }}>
                                  {material.tipo_material === "documento" && "📄"}
                                  {material.tipo_material === "video" && "🎥"}
                                  {material.tipo_material === "imagen" && "🖼️"}
                                  {material.tipo_material === "presentacion" && "📊"}
                                  {material.tipo_material === "recurso" && "🔧"}
                                  {material.tipo_material === "otro" && "📎"}
                                </div>
                              }
                              title={<Text strong>{material.titulo}</Text>}
                              description={
                                <div>
                                  <p style={{ margin: "4px 0", fontSize: 13 }}>
                                    {material.descripcion}
                                  </p>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    📦 {formatearTamano(material.tamano_bytes || 0)} • 👤{" "}
                                    {material.subido_por_nombre}
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
        </div>
      )}

      {/* MODAL: Crear/Editar Tema */}
      <Modal
        title={editingCurso ? `Editar: ${editingCurso.nombre_curso}` : "Agregar Nuevo Tema"}
        open={modalCursoVisible}
        onOk={handleGuardarCurso}
        onCancel={() => {
          setModalCursoVisible(false);
          setEditingCurso(null);
          formCurso.resetFields();
        }}
      >
        <Form form={formCurso} layout="vertical">
          <Form.Item
            name="nombre_curso"
            label="Nombre del Tema"
            rules={[{ required: true, message: "El nombre es requerido" }]}
          >
            <Input placeholder="Ej: Introducción a React" />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={2} placeholder="Descripción breve del tema" />
          </Form.Item>

          <Form.Item name="horas" label="Horas">
            <InputNumber min={0} placeholder="0" />
          </Form.Item>

          <Form.Item name="creditos" label="Créditos">
            <InputNumber min={0} placeholder="0" />
          </Form.Item>

          <Form.Item
            name="tipo_curso"
            label="Tipo"
            rules={[{ required: true, message: "Selecciona un tipo" }]}
          >
            <Select
              options={[
                { label: "Obligatorio", value: "obligatorio" },
                { label: "Electivo", value: "electivo" },
                { label: "Complementario", value: "complementario" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* MODAL: Editar Ciclo */}
      <Modal
        title={`Editar Ciclo ${editingCiclo?.numero_ciclo}`}
        open={modalCicloVisible}
        onOk={handleGuardarCiclo}
        onCancel={() => setModalCicloVisible(false)}
      >
        <Form form={formCiclo} layout="vertical">
          <Form.Item 
            name="nombre_ciclo" 
            label="Nombre del Ciclo / Título"
            help="Ej: Introducción, Técnicas Avanzadas, etc."
          >
            <Input placeholder="Nombre descriptivo del ciclo" />
          </Form.Item>
          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={3} placeholder="¿Qué se aprenderá en este ciclo?" />
          </Form.Item>
        </Form>
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
          <Alert
            message={`Material para: ${pensums.find(p => p.id === selectedCicloId)?.nombre_ciclo || `Ciclo ${pensums.find(p => p.id === selectedCicloId)?.numero_ciclo}`}`}
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            name="titulo"
            label="Título del Material"
            rules={[{ required: true, message: "El título es requerido" }]}
          >
            <Input placeholder="Ej: Guía de Práctica 1" />
          </Form.Item>

          <Form.Item name="descripcion" label="Descripción">
            <Input.TextArea rows={3} placeholder="Descripción breve del material" />
          </Form.Item>

          <Form.Item
            name="tipo_material"
            label="Tipo de Material"
            rules={[{ required: true, message: "Selecciona un tipo" }]}
          >
            <Select
              options={[
                { label: "📄 Documento (PDF, Word)", value: "documento" },
                { label: "🎥 Video", value: "video" },
                { label: "🖼️ Imagen", value: "imagen" },
                { label: "📊 Presentación", value: "presentacion" },
                { label: "🔧 Recurso", value: "recurso" },
                { label: "📎 Otro", value: "otro" },
              ]}
            />
          </Form.Item>

          <Form.Item label="Origen del Contenido" style={{ marginBottom: 12 }}>
             <Radio.Group 
               value={tipoOrigen} 
               onChange={(e) => setTipoOrigen(e.target.value)}
               buttonStyle="solid"
             >
               <Radio.Button value="archivo">Subir Archivo</Radio.Button>
               <Radio.Button value="enlace">Enlace (YouTube, Drive, etc.)</Radio.Button>
             </Radio.Group>
          </Form.Item>

          {tipoOrigen === 'archivo' ? (
            <Form.Item
              name="archivo"
              label="Archivo"
              rules={[{ required: true, message: "Selecciona un archivo" }]}
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
          ) : (
            <Form.Item
              name="url_externa"
              label="URL del Enlace"
              rules={[
                { required: true, message: "Ingresa la URL" },
                { type: 'url', message: "Ingresa una URL válida (https://...)" }
              ]}
            >
              <Input prefix={<LinkOutlined />} placeholder="https://youtube.com/..." />
            </Form.Item>
          )}

          <Space style={{ width: "100%" }}>
            <Button
              type="primary"
              loading={uploadingMaterial}
              onClick={handleSubirMaterial}
              block
            >
              Subir Material
            </Button>
            <Button
              onClick={() => {
                setDrawerMaterialesVisible(false);
                formMaterial.resetFields();
                setFileList([]);
                setTipoOrigen('archivo');
              }}
              block
            >
              Cancelar
            </Button>
          </Space>
        </Form>
      </Drawer>
    </Drawer>
  );
}
