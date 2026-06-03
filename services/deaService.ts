
import { DeaProtocol } from '../types';
import { cleanString, parseBrazilianNumber, getHeaderIndex } from './csvUtils';

const CSV_URL = 'https://docs.google.com/spreadsheets/d/1mL_wHtnTRbA4Ng6M0exe-wNULVPfNfPLcJJCjxF1tlk/export?format=csv';

export const fetchDeaData = async (): Promise<DeaProtocol[]> => {
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error('Falha ao buscar dados DEA');
    const text = await response.text();

    const rows = text.split(/\r?\n/);
    if (rows.length < 2) return [];

    const headers = (rows[0].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [])
      .map(h => cleanString(h).toUpperCase());

    const idxProtocolo = getHeaderIndex(headers, 'PROTOCOLO');
    const idxUnidade = getHeaderIndex(headers, 'UNIDADE') !== -1 ? getHeaderIndex(headers, 'UNIDADE') : getHeaderIndex(headers, 'CODOM');
    const idxValor = getHeaderIndex(headers, 'VALOR') !== -1 ? getHeaderIndex(headers, 'VALOR') : getHeaderIndex(headers, 'MONTANTE');
    const idxSituacao = getHeaderIndex(headers, 'SITUAÇÃO');
    const idxParecer = getHeaderIndex(headers, 'PARECER');
    const idxNome = getHeaderIndex(headers, 'NOME') !== -1 ? getHeaderIndex(headers, 'NOME') : getHeaderIndex(headers, 'INTERESSADO');
    const idxData = getHeaderIndex(headers, 'DATA') !== -1 ? getHeaderIndex(headers, 'DATA') : getHeaderIndex(headers, 'IMPLANTAÇÃO');

    const data: DeaProtocol[] = rows.slice(1).map(rowLine => {
      const cells = (rowLine.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [])
        .map(cleanString);

      if (cells.length < 4) return null;

      return {
        protocolo: idxProtocolo !== -1 ? cells[idxProtocolo] : '',
        unidade: idxUnidade !== -1 ? cells[idxUnidade] : '',
        valor: idxValor !== -1 ? parseBrazilianNumber(cells[idxValor]) : 0,
        situacao: idxSituacao !== -1 ? cells[idxSituacao] : '',
        parecer: idxParecer !== -1 ? cells[idxParecer] : '',
        nome: idxNome !== -1 ? cells[idxNome] : '',
        dataImplantacao: idxData !== -1 ? cells[idxData] : '',
      };
    }).filter((item): item is DeaProtocol => item !== null && !!item.protocolo);

    return data;
  } catch (error) {
    console.error('Erro no serviço DEA:', error);
    return [];
  }
};
