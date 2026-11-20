import PDFDocument from 'pdfkit';

export function textReportToPdf(title: string, body: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.fontSize(18).text(title, { underline: true });
    doc.moveDown();
    doc.fontSize(9).text(body, { lineGap: 3 });
    doc.end();
  });
}