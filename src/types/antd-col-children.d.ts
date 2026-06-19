import type { ReactNode } from "react";

declare module "antd/es/grid/col" {
  interface ColProps {
    children?: ReactNode;
    [key: string]: any;
  }
}

declare module "antd/lib/grid/col" {
  interface ColProps {
    children?: ReactNode;
    [key: string]: any;
  }
}
