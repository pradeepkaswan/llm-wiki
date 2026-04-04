import { PDFParse } from 'pdf-parse';

export async function extractFromPdf(buffer: ArrayBuffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  // Convert to basic Markdown: preserve paragraph breaks
  return result.text
    .split(/\n{2,}/)
    .map((p: string) => p.trim())
    .filter(Boolean)
    .join('\n\n');
}
