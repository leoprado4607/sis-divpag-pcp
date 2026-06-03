import { supabase } from './supabaseClient';
import { GeneralSubject, SpecificSubject, Note } from '../types';

// DADOS MOCK (FALLBACK) - Mutáveis para Demo
let MOCK_GENERAL: GeneralSubject[] = [
  { id: '1', name: 'Administrativo' },
  { id: '2', name: 'Financeiro' },
  { id: '3', name: 'Jurídico' }
];

let MOCK_SPECIFIC: SpecificSubject[] = [
  { id: 's1', general_subject_id: '1', name: 'Punição Disciplinar' },
  { id: 's2', general_subject_id: '1', name: 'Elogio Individual' },
  { id: 's3', general_subject_id: '2', name: 'Desconto em Folha' }
];

let MOCK_NOTES: Note[] = [
  {
    id: 'n1',
    general_subject_id: '1',
    specific_subject_id: 's1',
    main_text: '<p>Publico, para conhecimento desta Unidade e devidos fins, que o Militar <strong>Fulano de Tal</strong> cometeu transgressão disciplinar.</p><br><p>Referência: RDE Art. 14.</p>',
    closing_text: '', // Iniciando vazio como solicitado
    last_edited: new Date().toISOString()
  }
];

// SERVIÇOS
export const notesService = {
  // --- ASSUNTOS GERAIS ---
  async getGeneralSubjects(): Promise<GeneralSubject[]> {
    if (!supabase) return MOCK_GENERAL;
    const { data, error } = await supabase.from('general_subjects').select('*').order('name');
    if (error) {
      console.warn("Supabase offline/error, using mock data");
      return MOCK_GENERAL;
    }
    return data || [];
  },

  async addGeneralSubject(name: string): Promise<boolean> {
    if (!supabase) {
      MOCK_GENERAL = [...MOCK_GENERAL, { id: crypto.randomUUID(), name }];
      return true;
    }
    const { error } = await supabase.from('general_subjects').insert({ name });
    return !error;
  },

  async updateGeneralSubject(id: string, name: string): Promise<boolean> {
    if (!supabase) {
      MOCK_GENERAL = MOCK_GENERAL.map(g => g.id === id ? { ...g, name } : g);
      return true;
    }
    const { error } = await supabase.from('general_subjects').update({ name }).eq('id', id);
    return !error;
  },

  async deleteGeneralSubject(id: string): Promise<{ success: boolean; message?: string }> {
    // Validação: Verificar se há filhos
    const specifics = await this.getSpecificSubjects(id);
    if (specifics.length > 0) {
      return { success: false, message: 'Não é possível excluir: Existem Assuntos Específicos vinculados.' };
    }

    if (!supabase) {
      MOCK_GENERAL = MOCK_GENERAL.filter(g => g.id !== id);
      return { success: true };
    }

    const { error } = await supabase.from('general_subjects').delete().eq('id', id);
    if (error) return { success: false, message: error.message };
    return { success: true };
  },

  // --- ASSUNTOS ESPECÍFICOS ---
  async getSpecificSubjects(genId: string): Promise<SpecificSubject[]> {
    if (!supabase) return MOCK_SPECIFIC.filter(s => s.general_subject_id === genId);
    const { data, error } = await supabase
      .from('specific_subjects')
      .select('*')
      .eq('general_subject_id', genId)
      .order('name');
    if (error) return MOCK_SPECIFIC.filter(s => s.general_subject_id === genId);
    return data || [];
  },

  async addSpecificSubject(genId: string, name: string): Promise<boolean> {
    if (!supabase) {
      MOCK_SPECIFIC = [...MOCK_SPECIFIC, { id: crypto.randomUUID(), general_subject_id: genId, name }];
      return true;
    }
    const { error } = await supabase.from('specific_subjects').insert({ general_subject_id: genId, name });
    return !error;
  },

  async updateSpecificSubject(id: string, name: string): Promise<boolean> {
    if (!supabase) {
      MOCK_SPECIFIC = MOCK_SPECIFIC.map(s => s.id === id ? { ...s, name } : s);
      return true;
    }
    const { error } = await supabase.from('specific_subjects').update({ name }).eq('id', id);
    return !error;
  },

  async deleteSpecificSubject(id: string): Promise<boolean> {
    if (!supabase) {
      MOCK_SPECIFIC = MOCK_SPECIFIC.filter(s => s.id !== id);
      return true;
    }
    const { error } = await supabase.from('specific_subjects').delete().eq('id', id);
    return !error;
  },

  // --- NOTAS ---
  async getNote(genId: string, specId: string): Promise<Note | null> {
    if (!supabase) {
      return MOCK_NOTES.find(n => n.general_subject_id === genId && n.specific_subject_id === specId) || null;
    }
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('general_subject_id', genId)
      .eq('specific_subject_id', specId)
      .single();
    
    if (error) {
      // Se não achar, não é erro crítico, apenas retorna null para criar nova
      return null;
    }
    return data;
  },

  async saveNote(note: Partial<Note>): Promise<boolean> {
    if (!supabase) {
      const existingIndex = MOCK_NOTES.findIndex(n => 
        n.general_subject_id === note.general_subject_id && 
        n.specific_subject_id === note.specific_subject_id
      );
      
      const newNote = {
        id: existingIndex >= 0 ? MOCK_NOTES[existingIndex].id : crypto.randomUUID(),
        general_subject_id: note.general_subject_id!,
        specific_subject_id: note.specific_subject_id!,
        main_text: note.main_text || '',
        closing_text: note.closing_text || '',
        last_edited: new Date().toISOString()
      };

      if (existingIndex >= 0) {
        MOCK_NOTES[existingIndex] = newNote;
      } else {
        MOCK_NOTES.push(newNote);
      }
      return true;
    }
    
    // UPSERT: Atualiza se existir o par (general_id, specific_id), insere se não.
    // Importante: Requer que a UNIQUE CONSTRAINT esteja criada no SQL.
    const { error } = await supabase.from('notes').upsert(note, { 
      onConflict: 'general_subject_id, specific_subject_id' 
    });
    
    if (error) {
      console.error("Erro ao salvar nota:", error);
      return false;
    }
    return true;
  }
};