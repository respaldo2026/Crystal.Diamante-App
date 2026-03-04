"use client";

import React from "react";
import Image from "next/image";
import { Dropdown, Modal } from "antd";
import { WhatsAppOutlined } from "@ant-design/icons";

type IframePreviewState = {
  open: boolean;
  title: string;
  src: string;
};

type IframeMaterialModalProps = {
  iframePreview: IframePreviewState;
  logoAcademia?: string | null;
  iframePromptVisible: boolean;
  iframeTrackingSupported: boolean;
  quizDirectoIframe: any;
  whatsappSoporteItems: Array<{ key: string; label: string; disabled?: boolean }>;
  iframeEmbedRef: React.RefObject<HTMLIFrameElement | null>;
  onCancelAction: () => void;
  onShowPromptAction: () => void;
  onSupportMenuClickAction: (key: string) => void;
  onGoQuizAction: () => void;
  onIframeLoadAction: () => void;
};

export const IframeMaterialModal = ({
  iframePreview,
  logoAcademia,
  iframePromptVisible,
  iframeTrackingSupported,
  quizDirectoIframe,
  whatsappSoporteItems,
  iframeEmbedRef,
  onCancelAction,
  onShowPromptAction,
  onSupportMenuClickAction,
  onGoQuizAction,
  onIframeLoadAction,
}: IframeMaterialModalProps) => {
  return (
    <Modal
      title={null}
      open={iframePreview.open}
      onCancel={onCancelAction}
      footer={null}
      width="100%"
      centered
      closable={false}
      style={{ top: 0, padding: 0 }}
      styles={{
        body: { padding: 0, height: "100vh", overflow: "hidden" },
        content: { padding: 0, borderRadius: 0, height: "100vh", overflow: "hidden" },
      }}
      destroyOnClose
      className="gamma-fullscreen-modal"
    >
      <div className="gamma-iframe-topbar">
        <button
          type="button"
          className="gamma-iframe-menu"
          onClick={onCancelAction}
          aria-label="Cerrar y volver a pensum"
        >
          Cerrar
        </button>

        <div className="gamma-iframe-center-logo" aria-hidden="true">
          {logoAcademia ? (
            <Image
              src={logoAcademia}
              alt="Logo academia"
              className="gamma-iframe-logo"
              width={116}
              height={34}
              unoptimized
            />
          ) : (
            <div className="gamma-iframe-logo-fallback">CD</div>
          )}
        </div>

        <div className="gamma-iframe-actions">
          {!iframeTrackingSupported && !iframePromptVisible && (
            <button
              type="button"
              className="gamma-iframe-finish"
              onClick={onShowPromptAction}
            >
              Finalicé lectura
            </button>
          )}

          <Dropdown
            trigger={["click"]}
            menu={{
              items: whatsappSoporteItems,
              onClick: ({ key }) => onSupportMenuClickAction(String(key)),
            }}
          >
            <button
              type="button"
              className="gamma-iframe-whatsapp"
              aria-label="WhatsApp"
            >
              <WhatsAppOutlined />
            </button>
          </Dropdown>
        </div>
      </div>

      {iframePromptVisible && (
        <div className="gamma-iframe-quiz-cta">
          <div className="gamma-iframe-quiz-text">
            ¿Terminaste la lectura? Valida tu conocimiento con el quiz del tema.
          </div>
          <button
            type="button"
            className="gamma-iframe-quiz-btn"
            onClick={onGoQuizAction}
          >
            {quizDirectoIframe ? "Ir directo al Quiz" : "Ir a Pensum"}
          </button>
        </div>
      )}

      <iframe
        ref={iframeEmbedRef}
        src={iframePreview.src}
        title={iframePreview.title || "Presentación"}
        onLoad={onIframeLoadAction}
        style={{ width: "100%", height: "calc(100vh - 56px)", border: 0, marginTop: "56px" }}
        allow="fullscreen; clipboard-read; clipboard-write"
        allowFullScreen
        loading="lazy"
      />
    </Modal>
  );
};
