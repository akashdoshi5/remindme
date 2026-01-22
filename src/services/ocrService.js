import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
// Set worker source for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

import * as XLSX from 'xlsx';

export const ocrService = {
    extractText: async (file) => {
        const type = file.type;

        try {
            if (type.startsWith('image/')) {
                return await extractFromImage(file);
            } else if (type === 'application/pdf') {
                return await extractFromPDF(file);
            } else if (type.includes('sheet') || type.includes('excel') || type.includes('csv')) {
                return await extractFromExcel(file);
            } else if (type === 'text/plain') {
                return await file.text();
            }
            return '';
        } catch (e) {
            console.error("Extraction failed for", file.name, e);
            return ''; // Fail silently for search indexing, don't block upload
        }
    }
};

async function extractFromImage(file) {
    const worker = await Tesseract.createWorker('eng');
    const ret = await worker.recognize(file);
    await worker.terminate();
    return ret.data.text;
}

async function extractFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + ' ';
    }
    return fullText;
}

async function extractFromExcel(file) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);
    let fullText = '';

    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        fullText += jsonData.map(row => row.join(' ')).join(' ') + ' ';
    });
    return fullText;
}
