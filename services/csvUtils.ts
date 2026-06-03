
/**
 * Utilitários para processamento de dados vindos de Google Sheets via CSV
 */

export const cleanString = (value: string): string => {
  if (!value) return '';
  return value.replace(/^"|"$/g, '').trim();
};

export const parseBrazilianNumber = (value: string): number => {
  if (!value) return 0;
  // Remove R$, espaços e converte formato 1.000,00 para 1000.00
  const cleanValue = value.replace(/[R$\s.]/g, '').replace(',', '.');
  const number = parseFloat(cleanValue);
  return isNaN(number) ? 0 : number;
};

export const parseCSVLine = (line: string): string[] => {
  const pattern = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
  return (line.match(pattern) || []).map(val => cleanString(val));
};

export const getHeaderIndex = (headers: string[], term: string): number => {
  return headers.findIndex(h => h.toUpperCase().includes(term.toUpperCase()));
};
