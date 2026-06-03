
import { LucideIcon } from 'lucide-react';

export interface SystemLink {
  id: string;
  title: string;
  description: string;
  url: string;
  icon: LucideIcon;
  iconImage?: string;
  variant: 'primary' | 'secondary' | 'accent';
  isUnderConstruction?: boolean;
  internalRoute?: string;
}

export interface KPIMetrics {
  mesesAnalisados: number;
  totalOmAnalisadas: number;
  totalEnviados: number;
  mediaEnviados: number;
  totalRejeitados: number;
  mediaRejeitados: number;
}

// Tipos para o Dashboard FIP/FAP (SCCPP)
export interface DashboardData {
  ano: string;
  mes: string;
  om: string;
  codom: string;
  enviados: number;
  rejeitados: number;
}

// Tipos para o Dashboard DEA
export interface DeaProtocol {
  protocolo: string;
  unidade: string;
  valor: number;
  situacao: string;
  parecer: string;
  nome: string;
  dataImplantacao: string;
}

// Tipos para o Repositório de Notas (DivPag)
export interface GeneralSubject {
  id: string;
  name: string;
}

export interface SpecificSubject {
  id: string;
  general_subject_id: string;
  name: string;
}

export interface Note {
  id: string;
  general_subject_id: string;
  specific_subject_id: string;
  main_text: string;
  closing_text: string;
  last_edited: string;
}

// --- ANDRECITO SYSTEM TYPES ---
export interface AndrecitoCategory {
  id: string;
  name: string;
}

export interface AndrecitoSubcategory {
  id: string;
  category_id: string;
  name: string;
}

export interface AndrecitoDocument {
  id: string;
  category_id: string;
  subcategory_id: string | null;
  name: string;
  url: string;
  size: number;
  mime_type: string;
  created_at: string;
}

export interface AndrecitoSettings {
  coat_of_arms_url: string;
  login_bg_url: string;
  unit_name: string;
}

// --- COMPARISON MODULE TYPES ---
export interface PersonRecord {
  id: string; // generated uuid for react keys
  precCp: string;
  nome: string;
  cpf: string;
  valorLiquido: number;
  postoGraduacao?: string; // Coluna P/G
  sourceLine: number;
}

export interface ComparisonResult {
  samePrecDifferentName: Array<{ t1: PersonRecord; t2: PersonRecord }>;
  sameCpfDifferentPrec: Array<{ t1: PersonRecord; t2: PersonRecord }>;
  sameCpfDifferentName: Array<{ t1: PersonRecord; t2: PersonRecord }>;
  sameNameDifferentCpf: Array<{ t1: PersonRecord; t2: PersonRecord }>;
  samePrecDifferentCpf: Array<{ t1: PersonRecord; t2: PersonRecord }>; // Nova comparação
  missingInT2: PersonRecord[]; // Prec-CP in T1 not in T2
  missingInT1: PersonRecord[]; // Prec-CP in T2 not in T1
  missingNameInT2: PersonRecord[]; // Name in T1 not in T2
  missingNameInT1: PersonRecord[]; // Name in T2 not in T1
  zeroValueInT1: PersonRecord[]; // Pagamento Zerado
}
