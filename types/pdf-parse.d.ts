declare module 'pdf-parse' {
  interface PdfParseResult {
    numpages?: number
    numrender?: number
    text?: string
    info?: Record<string, unknown>
    metadata?: Record<string, unknown>
    version?: string
  }
  type PdfParseFn = (
    dataBuffer: Buffer,
    options?: { pagerender?: (pageData: unknown) => string; max?: number }
  ) => Promise<PdfParseResult>
  const pdfParse: PdfParseFn
  export default pdfParse
}
