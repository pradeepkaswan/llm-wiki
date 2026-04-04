import { PDFParse } from 'pdf-parse';

export async function extractFromPdf(buffer: ArrayBuffer): Promise<string> {
  const parser = new PDFParse();
  const result = await parser.parse(Buffer.from(buffer));
  // Convert to basic Markdown: preserve paragraph breaks
  return result.text
    .split(/\n{2,}/)
    .map((p: string) => p.trim())
    .filter(Boolean)
    .join('\n\n');
}
