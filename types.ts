// Using pdfjs-dist's types would be ideal, but for a CDN-based approach, we declare a minimal version.
// In a real project with npm, you would do: import { PDFDocumentProxy } from 'pdfjs-dist';
export declare class PDFDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<any>;
  destroy(): void;
  getOutline(): Promise<any[] | null>;
  getDestination(destination: string): Promise<any[] | null>;
  getPageIndex(ref: any): Promise<number>;
  [key: string]: any;
}

export interface Chunk {
  id: number;
  startPage: number;
  endPage: number;
  text?: string;
  contextTitle?: string;
}

export interface QAPair {
  input_text: string;
  output_text: string;
}