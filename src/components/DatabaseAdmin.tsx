import React, { useState, useEffect } from 'react';
import { Question } from '../types';
import { 
  addQuestion, 
  updateQuestion, 
  deleteQuestion, 
  seedQuestionsIfEmpty, 
  batchImportQuestions 
} from '../lib/gameService';
import { Plus, Trash2, Edit2, Download, AlertCircle, CheckCircle, Database, HelpCircle, FileJson, X } from 'lucide-react';

interface DatabaseAdminProps {
  questions: Question[];
  onClose: () => void;
}

const LESSONS = [
  "Nascimento de Jesus e Anunciação",
  "Visita dos Reis Magos",
  "Apresentação no Templo",
  "Batismo de Jesus no Rio Jordão",
  "Tentação no Deserto",
  "O Primeiro Milagre: As Bodas de Caná",
  "Purificação do Templo",
  "Conversa com Nicodemos",
  "A Mulher Samaritana",
  "O Sermão da Montanha",
  "A Cura do Paralítico de Cafarnaum",
  "A Tempestade Acalmada",
  "Parábola do Semeador",
  "A Multiplicação dos Pães e Peixes",
  "Jesus Caminha Sobre as Águas",
  "A Transfiguração",
  "A Ressurreição de Lázaro",
  "A Entrada Triunfal em Jerusalém",
  "A Última Ceia",
  "A Agonia no Getsêmani",
  "O Julgamento e a Crucificação",
  "A Ressurreição",
  "A Ascensão ao Céu"
];

export default function DatabaseAdmin({ questions, onClose }: DatabaseAdminProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'import'>('list');
  const [filterLesson, setFilterLesson] = useState<string>('');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('');
  
  // Add/Edit Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lesson, setLesson] = useState(LESSONS[0]);
  const [customLesson, setCustomLesson] = useState('');
  const [useCustomLesson, setUseCustomLesson] = useState(false);
  const [type, setType] = useState<Question['type']>('multiple_choice');
  const [questionText, setQuestionText] = useState('');
  const [difficulty, setDifficulty] = useState<Question['difficulty']>('easy');
  const [points, setPoints] = useState(10);
  
  // Options state
  const [options, setOptions] = useState<string[]>(['', '', '', '']);
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState<number>(0);
  const [correctAnswerBool, setCorrectAnswerBool] = useState<boolean>(true);

  // Import State
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Handle type change
  useEffect(() => {
    if (type === 'true_false') {
      setOptions(['Verdadeiro', 'Falso']);
      setCorrectAnswerIndex(0);
    } else if (type === 'multiple_choice' || type === 'who_am_i' || type === 'incomplete_verse') {
      setOptions(['', '', '', '']);
      setCorrectAnswerIndex(0);
    } else if (type === 'chronological') {
      setOptions(['', '', '', '']);
    }
  }, [type]);

  const handleAddOption = () => {
    setOptions([...options, '']);
  };

  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    const newOptions = options.filter((_, i) => i !== index);
    setOptions(newOptions);
    if (correctAnswerIndex >= newOptions.length) {
      setCorrectAnswerIndex(newOptions.length - 1);
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const newOptions = [...options];
    newOptions[index] = val;
    setOptions(newOptions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!questionText.trim()) {
      alert('Escreva o texto da pergunta!');
      return;
    }

    const finalLesson = useCustomLesson ? customLesson.trim() : lesson;
    if (!finalLesson) {
      alert('Selecione ou escreva uma lição!');
      return;
    }

    // Validate options
    const filteredOptions = options.map(o => o.trim()).filter(Boolean);
    if (filteredOptions.length < 2) {
      alert('Adicione pelo menos 2 opções válidas!');
      return;
    }

    let finalCorrectAnswer: any = correctAnswerIndex;
    if (type === 'true_false') {
      finalCorrectAnswer = correctAnswerBool ? 0 : 1;
    } else if (type === 'chronological') {
      // In chronological mode, the correct order matches the indexes in order of creation,
      // but to store it we can use [0, 1, 2, 3] as correct sequence, meaning the input is written in correct order
      // and we randomise options at runtime.
      finalCorrectAnswer = filteredOptions.map((_, i) => i);
    }

    const questionData = {
      lesson: finalLesson,
      type,
      question: questionText.trim(),
      options: filteredOptions,
      correctAnswer: finalCorrectAnswer,
      points: Number(points),
      difficulty,
    };

    try {
      if (editingId) {
        await updateQuestion(editingId, questionData);
        alert('Pergunta atualizada com sucesso!');
      } else {
        await addQuestion(questionData);
        alert('Pergunta adicionada com sucesso!');
      }
      
      // Reset Form
      setEditingId(null);
      setQuestionText('');
      setOptions(['', '', '', '']);
      setCorrectAnswerIndex(0);
      setActiveTab('list');
    } catch (err: any) {
      alert('Erro ao salvar pergunta: ' + err.message);
    }
  };

  const handleEdit = (q: Question) => {
    setEditingId(q.id);
    if (LESSONS.includes(q.lesson)) {
      setLesson(q.lesson);
      setUseCustomLesson(false);
    } else {
      setCustomLesson(q.lesson);
      setUseCustomLesson(true);
    }
    setType(q.type);
    setQuestionText(q.question);
    setDifficulty(q.difficulty);
    setPoints(q.points);
    setOptions(q.options);
    
    if (q.type === 'true_false') {
      setCorrectAnswerBool(q.correctAnswer === 0);
    } else if (q.type === 'chronological') {
      // No single answer index
    } else {
      setCorrectAnswerIndex(Number(q.correctAnswer) || 0);
    }
    
    setActiveTab('add');
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem a certeza que deseja eliminar esta pergunta?')) {
      try {
        await deleteQuestion(id);
      } catch (err: any) {
        alert('Erro ao eliminar pergunta: ' + err.message);
      }
    }
  };

  const handleSeedDefaults = async () => {
    if (window.confirm('Deseja carregar as 23 perguntas padrão sobre a Vida de Jesus?')) {
      try {
        const total = await seedQuestionsIfEmpty();
        alert(`Sucesso! Agora o banco contém ${total} perguntas.`);
      } catch (err: any) {
        alert('Erro ao semear: ' + err.message);
      }
    }
  };

  const handleImportJson = async () => {
    setImportError(null);
    setImportSuccess(null);
    try {
      const parsed = JSON.parse(importJson);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      
      // Validate structure
      const validated = list.map((q: any, index) => {
        if (!q.lesson || !q.type || !q.question || !Array.isArray(q.options)) {
          throw new Error(`Item nº ${index + 1} inválido. Certifique-se de que possui lesson, type, question e options.`);
        }
        return {
          lesson: String(q.lesson),
          type: q.type as Question['type'],
          question: String(q.question),
          options: q.options.map(String),
          correctAnswer: q.correctAnswer,
          points: Number(q.points) || 10,
          difficulty: (q.difficulty || 'easy') as Question['difficulty']
        };
      });

      await batchImportQuestions(validated);
      setImportSuccess(`Sucesso! ${validated.length} perguntas importadas.`);
      setImportJson('');
    } catch (err: any) {
      setImportError(err.message);
    }
  };

  // Filtered Questions
  const filteredQuestions = questions.filter(q => {
    const matchLesson = !filterLesson || q.lesson === filterLesson;
    const matchDifficulty = !filterDifficulty || q.difficulty === filterDifficulty;
    return matchLesson && matchDifficulty;
  });

  // Unique lessons in current questions
  const uniqueLessons = Array.from(new Set(questions.map(q => q.lesson)));

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-800 text-white p-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-emerald-400" />
            <div>
              <h2 className="text-xl font-bold text-display">Gestor do Banco de Perguntas</h2>
              <p className="text-xs text-slate-400">Adicione, edite ou importe perguntas sobre a Vida de Jesus</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 p-2 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="bg-slate-100 px-6 py-2 flex justify-between items-center border-b border-slate-200">
          <div className="flex gap-2">
            <button
              onClick={() => { setActiveTab('list'); setEditingId(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'list' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Lista ({filteredQuestions.length} de {questions.length})
            </button>
            <button
              onClick={() => setActiveTab('add')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'add' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {editingId ? 'Editar Pergunta' : 'Nova Pergunta'}
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'import' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Importar JSON
            </button>
          </div>
          
          {questions.length === 0 && (
            <button
              onClick={handleSeedDefaults}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Carregar Perguntas Padrão (23 Lições)
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {activeTab === 'list' && (
            <div className="space-y-4 h-full flex flex-col">
              {/* Filters */}
              <div className="flex flex-wrap gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Filtrar por Lição</label>
                  <select
                    value={filterLesson}
                    onChange={(e) => setFilterLesson(e.target.value)}
                    className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2 outline-none focus:border-slate-500"
                  >
                    <option value="">Todas as Lições</option>
                    {uniqueLessons.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
                
                <div className="w-[180px]">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Filtrar por Dificuldade</label>
                  <select
                    value={filterDifficulty}
                    onChange={(e) => setFilterDifficulty(e.target.value)}
                    className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2 outline-none focus:border-slate-500"
                  >
                    <option value="">Todas</option>
                    <option value="easy">Fácil</option>
                    <option value="medium">Médio</option>
                    <option value="hard">Difícil</option>
                    <option value="very_hard">Muito Difícil</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => { setFilterLesson(''); setFilterDifficulty(''); }}
                    className="text-xs text-slate-500 hover:text-slate-800 underline pb-2"
                  >
                    Limpar Filtros
                  </button>
                </div>
              </div>

              {/* Grid / List of questions */}
              {filteredQuestions.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400 py-12">
                  <HelpCircle className="w-12 h-12 stroke-1 mb-2" />
                  <p className="font-medium">Nenhuma pergunta encontrada</p>
                  <p className="text-xs">Altere os filtros ou adicione novas perguntas.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                  {filteredQuestions.map((q) => (
                    <div key={q.id} className="border border-slate-200 bg-white p-4 rounded-xl hover:shadow-sm hover:border-slate-300 transition-all flex justify-between items-start gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-600 uppercase">
                            {q.lesson}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                            q.difficulty === 'easy' ? 'bg-emerald-100 text-emerald-700' :
                            q.difficulty === 'medium' ? 'bg-amber-100 text-amber-700' :
                            q.difficulty === 'hard' ? 'bg-orange-100 text-orange-700' :
                            'bg-rose-100 text-rose-700'
                          }`}>
                            {q.difficulty === 'easy' ? 'Fácil' : q.difficulty === 'medium' ? 'Médio' : q.difficulty === 'hard' ? 'Difícil' : 'Muito Difícil'} • {q.points} pts
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            Tipo: {q.type}
                          </span>
                        </div>
                        <h4 className="font-semibold text-slate-800 text-sm">{q.question}</h4>
                        
                        {/* Options preview */}
                        <div className="grid grid-cols-2 gap-1.5 pt-1.5 max-w-2xl">
                          {q.options.map((opt, oIdx) => {
                            let isCorrect = false;
                            if (q.type === 'true_false') {
                              isCorrect = q.correctAnswer === oIdx;
                            } else if (q.type === 'chronological') {
                              isCorrect = true; // All are sequence items
                            } else {
                              isCorrect = q.correctAnswer === oIdx;
                            }
                            return (
                              <div key={oIdx} className={`text-xs px-2.5 py-1 rounded border flex items-center gap-1.5 ${
                                isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-800 font-medium' : 'border-slate-100 bg-slate-50 text-slate-600'
                              }`}>
                                <span className="font-bold opacity-60">{String.fromCharCode(65 + oIdx)})</span>
                                <span className="truncate">{opt}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleEdit(q)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(q.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'add' && (
            <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
              <h3 className="text-lg font-bold text-slate-800 border-b pb-2 mb-4">
                {editingId ? 'Editar Pergunta Existente' : 'Cadastrar Nova Pergunta'}
              </h3>

              {/* Lesson selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">Lição da Vida de Jesus</label>
                    <button
                      type="button"
                      onClick={() => setUseCustomLesson(!useCustomLesson)}
                      className="text-[10px] text-blue-600 hover:underline font-semibold"
                    >
                      {useCustomLesson ? 'Usar lição predefinida' : 'Criar lição personalizada'}
                    </button>
                  </div>

                  {useCustomLesson ? (
                    <input
                      type="text"
                      value={customLesson}
                      onChange={(e) => setCustomLesson(e.target.value)}
                      placeholder="Ex: Vida de Jesus em Nazaré"
                      className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 outline-none focus:border-slate-500"
                      required
                    />
                  ) : (
                    <select
                      value={lesson}
                      onChange={(e) => setLesson(e.target.value)}
                      className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 outline-none focus:border-slate-500"
                    >
                      {LESSONS.map(l => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Question Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de Pergunta</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as Question['type'])}
                    className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 outline-none focus:border-slate-500"
                  >
                    <option value="multiple_choice">Múltipla Escolha</option>
                    <option value="true_false">Verdadeiro ou Falso</option>
                    <option value="who_am_i">"Quem sou eu?"</option>
                    <option value="incomplete_verse">Versículo Incompleto</option>
                    <option value="chronological">Ordem Cronológica</option>
                  </select>
                </div>
              </div>

              {/* Question Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Enunciado da Pergunta</label>
                <textarea
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="Ex: Como se chamava o jardim onde Jesus orou antes de ser preso?"
                  className="w-full min-h-[80px] text-sm bg-white border border-slate-300 rounded-lg p-2.5 outline-none focus:border-slate-500"
                  required
                />
              </div>

              {/* Difficulty & Points */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dificuldade</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Question['difficulty'])}
                    className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 outline-none focus:border-slate-500"
                  >
                    <option value="easy">Fácil</option>
                    <option value="medium">Médio</option>
                    <option value="hard">Difícil</option>
                    <option value="very_hard">Muito Difícil</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pontuação atribuída</label>
                  <input
                    type="number"
                    value={points}
                    onChange={(e) => setPoints(Number(e.target.value))}
                    className="w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 outline-none focus:border-slate-500"
                    required
                    min={5}
                    max={200}
                  />
                </div>
              </div>

              {/* Options & Answer Selection */}
              <div className="space-y-3 bg-slate-50 p-5 rounded-xl border border-slate-200">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    {type === 'chronological' ? 'Eventos para ordenar' : 'Alternativas'}
                  </h4>
                  {type !== 'true_false' && type !== 'chronological' && (
                    <button
                      type="button"
                      onClick={handleAddOption}
                      className="text-xs text-blue-600 hover:text-blue-500 font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar Alternativa
                    </button>
                  )}
                </div>

                {type === 'true_false' ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => setCorrectAnswerBool(true)}
                        className={`flex-1 py-3 px-4 rounded-lg border text-sm font-semibold transition-all ${
                          correctAnswerBool ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm' : 'border-slate-300 bg-white text-slate-600'
                        }`}
                      >
                        Verdadeiro é a correta
                      </button>
                      <button
                        type="button"
                        onClick={() => setCorrectAnswerBool(false)}
                        className={`flex-1 py-3 px-4 rounded-lg border text-sm font-semibold transition-all ${
                          !correctAnswerBool ? 'border-emerald-600 bg-emerald-50 text-emerald-800 shadow-sm' : 'border-slate-300 bg-white text-slate-600'
                        }`}
                      >
                        Falso é a correta
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {options.map((opt, oIdx) => (
                      <div key={oIdx} className="flex items-center gap-3">
                        {type !== 'chronological' && (
                          <input
                            type="radio"
                            name="correct_answer_radio"
                            checked={correctAnswerIndex === oIdx}
                            onChange={() => setCorrectAnswerIndex(oIdx)}
                            className="w-4 h-4 text-emerald-600 border-slate-300 focus:ring-emerald-500"
                            title="Marcar como correta"
                          />
                        )}
                        <span className="text-sm font-bold text-slate-500 w-6">
                          {type === 'chronological' ? `${oIdx + 1}º` : `${String.fromCharCode(65 + oIdx)})`}
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => handleOptionChange(oIdx, e.target.value)}
                          placeholder={
                            type === 'chronological' 
                              ? `Escreva o evento na ordem correta (Ex: Passo ${oIdx + 1})`
                              : `Escreva a alternativa ${String.fromCharCode(65 + oIdx)}`
                          }
                          className="flex-1 text-sm bg-white border border-slate-300 rounded-lg p-2 outline-none focus:border-slate-500"
                          required
                        />
                        {type !== 'true_false' && options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(oIdx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                            title="Remover"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}

                    {type !== 'chronological' && (
                      <p className="text-[11px] text-slate-500 italic pt-1 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 inline" />
                        O botão circular à esquerda define qual alternativa é a resposta correta.
                      </p>
                    )}
                    {type === 'chronological' && (
                      <p className="text-[11px] text-slate-500 italic pt-1 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 inline" />
                        Escreva os eventos na ordem cronológica correta de cima para baixo. O sistema irá embaralhá-los para o público e reordená-los.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 justify-end pt-4 border-t">
                <button
                  type="button"
                  onClick={() => { setActiveTab('list'); setEditingId(null); }}
                  className="px-5 py-2 rounded-lg text-sm font-semibold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-white shadow-sm transition-all"
                >
                  {editingId ? 'Salvar Alterações' : 'Cadastrar Pergunta'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'import' && (
            <div className="space-y-4 max-w-3xl">
              <div className="flex items-start gap-3 bg-blue-50 p-4 rounded-xl border border-blue-200 text-blue-800 mb-2">
                <FileJson className="w-5 h-5 mt-0.5 text-blue-600 flex-shrink-0" />
                <div className="text-xs space-y-1">
                  <p className="font-bold">Importação em lote de Perguntas</p>
                  <p>Cole um array JSON contendo perguntas estruturadas. Veja o formato exigido abaixo:</p>
                  <pre className="bg-slate-900 text-slate-300 p-2.5 rounded-lg text-[10px] overflow-x-auto mt-2 font-mono">
{`[
  {
    "lesson": "Nascimento de Jesus",
    "type": "multiple_choice",
    "question": "Quem anunciou o nascimento de Jesus?",
    "options": ["Anjo Miguel", "Anjo Gabriel", "Anjo Rafael", "Moisés"],
    "correctAnswer": 1,
    "points": 20,
    "difficulty": "easy"
  }
]`}
                  </pre>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cole aqui o JSON das perguntas</label>
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder="[ ... ]"
                  className="w-full min-h-[220px] font-mono text-xs bg-slate-50 border border-slate-300 rounded-xl p-3 outline-none focus:border-slate-500"
                />
              </div>

              {importError && (
                <div className="flex items-center gap-2 text-rose-700 bg-rose-50 border border-rose-200 p-3 rounded-lg text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccess && (
                <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 border border-emerald-200 p-3 rounded-lg text-xs">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{importSuccess}</span>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={handleImportJson}
                  className="px-6 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
                >
                  Confirmar Importação
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
