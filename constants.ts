
import { BarChart3, Search, FileText, GitCompare, Activity, Calculator, Library } from 'lucide-react';
import { SystemLink } from './types';

// Símbolos Oficiais
// Brasão servido do próprio site: sem depender do Google Drive nem de reserva externa.
export const LOGO_URL = "/brasao.png";
export const PLANILHA_BIZURADA_LOGO = "https://lh3.googleusercontent.com/d/1Qq4nhmU87T2PALVyaGjyDEROlWyZZgXb=s240";
export const DAP_LOGO = "/Logo_DAP.png";

export const SYSTEM_LINKS: SystemLink[] = [
  {
    id: 'pesquisas',
    title: 'Sistema *ANDRECITO*',
    description: 'Portarias, Decretos, DIEx e Pareceres',
    url: '#',
    icon: Search,
    variant: 'accent',
    internalRoute: 'andrecito-app'
  },
  {
    id: 'comparar-relacoes',
    title: 'Comparar relações',
    description: 'Relação CPEx X SiCaPEx',
    url: '#',
    icon: GitCompare,
    variant: 'accent',
    internalRoute: 'comparison-app'
  },
  {
    id: 'dea',
    title: 'Exercícios Anteriores',
    description: 'Dados estatísticos e análise',
    url: '#',
    icon: BarChart3,
    variant: 'accent',
    isRestricted: true,
    internalRoute: 'dea-dashboard'
  },
  {
    id: 'planilha-calculos',
    title: 'Planilha de cálculos',
    description: 'Holerite, diárias e Grat Rep',
    url: 'https://planilhabizurada.web.app/app.html',
    icon: Calculator,
    iconImage: PLANILHA_BIZURADA_LOGO,
    variant: 'accent'
  },
  {
    id: 'eb-calc',
    title: 'EB#Calc',
    description: 'Pecuniária, diárias e Grat Rep',
    url: 'https://ebcalc.net/',
    icon: Calculator,
    variant: 'accent'
  },
  {
    id: 'repositorio-dap',
    title: 'Repositório DAP',
    description: 'Consulte a biblioteca da DAP (Intranet)',
    url: 'http://a3e7.infra.7cta.eb.mil.br/rcdap/menu/',
    icon: Library,
    iconImage: DAP_LOGO,
    variant: 'accent'
  }
];
