
import { DashboardData } from '../types';
import { cleanString, parseBrazilianNumber, getHeaderIndex } from './csvUtils';

const SHEET_ID = '1BjJHzmiunm8LESoB7gtEbfHz96udZqisNWRxrtEKwyM';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

export const fetchDashboardData = async (): Promise<DashboardData[]> => {
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error('Falha ao buscar dados');
    const text = await response.text();

    const rows = text.split(/\r?\n/);
    if (rows.length < 2) return [];

    const headers = (rows[0].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [])
      .map(h => cleanString(h).toUpperCase());

    const idxAno = getHeaderIndex(headers, 'ANO');
    const idxMes = getHeaderIndex(headers, 'MÊS') !== -1 ? getHeaderIndex(headers, 'MÊS') : getHeaderIndex(headers, 'MES');
    const idxOM = headers.findIndex(h => h === 'OM');
    const idxCodom = getHeaderIndex(headers, 'CODOM');
    const idxEnviados = getHeaderIndex(headers, 'ENVIADOS');
    const idxRejeitados = getHeaderIndex(headers, 'REJEITADOS');

    const data: DashboardData[] = rows.slice(1).map(rowLine => {
      const cells = (rowLine.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [])
        .map(cleanString);

      if (cells.length < 5) return null;

      return {
        ano: cells[idxAno] || '',
        mes: cells[idxMes] || '',
        om: idxOM !== -1 ? cells[idxOM] : '',
        codom: idxCodom !== -1 ? cells[idxCodom] : '',
        enviados: parseBrazilianNumber(cells[idxEnviados]),
        rejeitados: parseBrazilianNumber(cells[idxRejeitados]),
      };
    }).filter((item): item is DashboardData => item !== null && !!item.om);

    return data;
  } catch (error) {
    console.error('Erro no serviço SCCPP:', error);
    return [];
  }
};
