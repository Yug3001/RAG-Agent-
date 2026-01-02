
import { DocumentChunk } from '../types';

export const splitTextIntoChunks = (
  text: string, 
  sourceName: string, 
  chunkSize: number = 1000, 
  overlap: number = 200
): DocumentChunk[] => {
  const chunks: DocumentChunk[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunkText = text.substring(start, end);
    
    chunks.push({
      id: `${sourceName}-${start}-${Math.random().toString(36).substr(2, 5)}`,
      text: chunkText,
      source: sourceName,
      metadata: { start, end }
    });

    start += (chunkSize - overlap);
    if (chunkSize <= overlap) break;
  }

  return chunks;
};

export const parseFile = async (file: File): Promise<string> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  // 1. Plain Text / Markdown / YAML / XML / JSON / CSV
  if (['txt', 'md', 'yaml', 'yml', 'xml', 'json', 'csv'].includes(extension || '')) {
    const text = await file.text();
    if (extension === 'csv') {
      return `CSV Data (${file.name}):\n${text}`;
    }
    if (extension === 'json') {
      try {
        const obj = JSON.parse(text);
        return `JSON Structure (${file.name}):\n${JSON.stringify(obj, null, 2)}`;
      } catch (e) { return text; }
    }
    return text;
  }
  
  // 2. PDF Extraction
  if (extension === 'pdf') {
    const pdfjsLib = (window as any).pdfjsLib;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str);
      fullText += strings.join(' ') + '\n';
    }
    return fullText;
  }

  // 3. Word Document (.docx)
  if (extension === 'docx') {
    const mammoth = (window as any).mammoth;
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  // 4. HTML
  if (extension === 'html' || extension === 'htm') {
    const rawHtml = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    // Remove scripts and styles
    const scripts = doc.querySelectorAll('script, style');
    scripts.forEach(s => s.remove());
    return doc.body.textContent || "";
  }

  throw new Error(`Format [${extension}] not supported by Bio-Neural parser.`);
};
