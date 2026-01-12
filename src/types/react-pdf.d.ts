declare module "@react-pdf/renderer" {
  import * as React from "react";

  interface PDFDownloadLinkRenderProps {
    blob?: Blob;
    url?: string;
    loading: boolean;
    error?: Error;
  }

  interface PDFDownloadLinkProps {
    document: React.ReactElement;
    fileName?: string;
    className?: string;
    children?: (props: PDFDownloadLinkRenderProps) => React.ReactNode;
  }

  export class PDFDownloadLink extends React.Component<PDFDownloadLinkProps> {}
}
