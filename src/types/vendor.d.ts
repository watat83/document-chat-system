declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFResult { numpages: number; numrender: number; info: Record<string, unknown>; metadata: unknown; text: string; version: string; }
  function parse(data: Buffer, options?: { max?: number; version?: string; pagerender?: (page: unknown) => Promise<string> }): Promise<PDFResult>;
  export default parse;
}
declare module 'swagger-jsdoc' {
  function swaggerJSDoc(options: { definition: Record<string, unknown>; apis: string[] }): Record<string, unknown>;
  export default swaggerJSDoc;
}
declare module 'lodash/debounce.js' {
  function debounce<T extends (...args: never[]) => unknown>(func: T, wait?: number, options?: { leading?: boolean; trailing?: boolean; maxWait?: number }): T & { cancel(): void; flush(): ReturnType<T> | undefined };
  export default debounce;
}
