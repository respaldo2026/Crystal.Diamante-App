"use client";

import { Modal, message } from "antd";
import type { FormInstance } from "antd";

type UsePromptEditorOptions = {
  form: FormInstance;
  defaultPrompt: string;
  textAreaId?: string;
};

export const usePromptEditor = ({
  form,
  defaultPrompt,
  textAreaId = "agent-system-prompt",
}: UsePromptEditorOptions) => {
  const getPromptTextArea = () => {
    if (typeof document === "undefined") return null;
    return document.getElementById(textAreaId) as HTMLTextAreaElement | null;
  };

  const applyWhatsappFormatToPrompt = (prefix: string, suffix = prefix, placeholder = "texto") => {
    const currentValue = (form.getFieldValue("system_prompt") as string) || "";
    const textArea = getPromptTextArea();
    const selectionStart = textArea?.selectionStart ?? currentValue.length;
    const selectionEnd = textArea?.selectionEnd ?? currentValue.length;
    const hasSelection = selectionEnd > selectionStart;
    const selectedText = hasSelection ? currentValue.slice(selectionStart, selectionEnd) : placeholder;
    const formattedText = `${prefix}${selectedText}${suffix}`;

    const nextValue =
      currentValue.slice(0, selectionStart) +
      formattedText +
      currentValue.slice(selectionEnd);

    form.setFieldsValue({ system_prompt: nextValue });

    requestAnimationFrame(() => {
      const nextTextArea = getPromptTextArea();
      if (!nextTextArea) return;
      nextTextArea.focus();
      const nextSelectionStart = selectionStart + prefix.length;
      const nextSelectionEnd = nextSelectionStart + selectedText.length;
      nextTextArea.setSelectionRange(nextSelectionStart, nextSelectionEnd);
    });
  };

  const insertIntoPrompt = (text: string) => {
    const currentValue = (form.getFieldValue("system_prompt") as string) || "";
    const textArea = getPromptTextArea();
    const selectionStart = textArea?.selectionStart ?? currentValue.length;
    const selectionEnd = textArea?.selectionEnd ?? currentValue.length;

    const nextValue =
      currentValue.slice(0, selectionStart) +
      text +
      currentValue.slice(selectionEnd);

    form.setFieldsValue({ system_prompt: nextValue });

    requestAnimationFrame(() => {
      const nextTextArea = getPromptTextArea();
      if (!nextTextArea) return;
      const nextCursorPosition = selectionStart + text.length;
      nextTextArea.focus();
      nextTextArea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  };

  const restoreDefaultPrompt = () => {
    Modal.confirm({
      title: "¿Restaurar prompt por defecto?",
      content: "Esto reemplazará el contenido actual del prompt en el formulario.",
      okText: "Restaurar",
      cancelText: "Cancelar",
      onOk: () => {
        form.setFieldsValue({ system_prompt: defaultPrompt });
        message.success("Prompt por defecto cargado. Pulsa Guardar para aplicarlo.");
      },
    });
  };

  return {
    applyWhatsappFormatToPrompt,
    insertIntoPrompt,
    restoreDefaultPrompt,
  };
};
