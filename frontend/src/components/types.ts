export type Client = {
  id: string;
  name: string;
  fiscal: number;
  role: "main" | "sub";
  groupLabels?: string[];
  relationLabels?: string[];
};

export type Staff = {
  id: string;
  name: string;
  clients: Client[];
};

export type PdfInfoResponse = {
  pageCount?: number;
  page_count?: number;
  fileId?: string;
  id?: string;
};
