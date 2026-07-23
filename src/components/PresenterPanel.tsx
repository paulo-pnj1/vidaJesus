import React, { useState, useEffect } from 'react';
import { GameState, Question, Team, Answer, AgeCategory, AGE_CATEGORIES, AGE_CATEGORY_LABELS } from '../types';
import { 
  updateGameState, 
  subscribeToTeams, 
  subscribeToQuestions, 
  subscribeToAnswers, 
  addTeam, 
  deleteTeam, 
  submitAnswer, 
  resetGame,
  seedQuestionsIfEmpty,
  groupTeamsByCategory
} from '../lib/gameService';
import { 
  Users, Play, RotateCcw, Plus, Trash2, Database, HelpCircle, 
  Check, X, ChevronRight, Shuffle, Timer, Eye, HelpCircle as HelpIcon, ShieldAlert, BookOpen,
  Trophy, GraduationCap
} from 'lucide-react';
import DatabaseAdmin from './DatabaseAdmin';

interface PresenterPanelProps {
  gameState: GameState;
}

export default function PresenterPanel({ gameState }: PresenterPanelProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [showDbAdmin, setShowDbAdmin] = useState(false);

  // Setup Form State — cada equipa do concurso final representa UM concorrente
  // (normalmente o vencedor do casting da turma), por isso o cadastro regista
  // sempre o nome do concorrente junto com a turma, o professor e a faixa etária.
  const [newCompetitorName, setNewCompetitorName] = useState('');
  const [newClassName, setNewClassName] = useState('');
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeamCategory, setNewTeamCategory] = useState<AgeCategory>('pleno');
  const [setupTotalQuestions, setSetupTotalQuestions] = useState(10);
  const [setupTimerDuration, setSetupTimerDuration] = useState(30);

  // Game Play State
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [filterLesson, setFilterLesson] = useState<string>('');

  // Subscribe to collections
  useEffect(() => {
    const unsubscribeTeams = subscribeToTeams(setTeams);
    const unsubscribeQuestions = subscribeToQuestions(setQuestions);
    const unsubscribeAnswers = subscribeToAnswers(setAnswers);

    // Initial seeding check
    seedQuestionsIfEmpty();

    return () => {
      unsubscribeTeams();
      unsubscribeQuestions();
      unsubscribeAnswers();
    };
  }, []);

  // Set default selected question when lesson filter or list updates.
  // Perguntas são sempre restritas à faixa etária da equipa da vez.
  useEffect(() => {
    const activeTeamCategory = teams.find(t => t.id === gameState.currentTeamId)?.ageCategory;
    const available = questions.filter(q =>
      !q.used &&
      (!filterLesson || q.lesson === filterLesson) &&
      (!activeTeamCategory || q.ageCategory === activeTeamCategory)
    );
    if (available.length > 0 && !selectedQuestionId) {
      setSelectedQuestionId(available[0].id);
    }
  }, [questions, filterLesson, selectedQuestionId, teams, gameState.currentTeamId]);

  // Add Team — regista sempre o concorrente junto com turma, professor e faixa
  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newCompetitorName.trim() && newClassName.trim()) {
      await addTeam(newClassName.trim(), 1, newTeamCategory, {
        teacherName: newTeacherName.trim() || undefined,
        className: newClassName.trim(),
        memberNames: [newCompetitorName.trim()]
      });
      setNewCompetitorName('');
      setNewClassName('');
      setNewTeacherName('');
    }
  };

  // Start Game
  const handleStartGame = async () => {
    if (teams.length < 2) {
      alert('Adicione pelo menos 2 equipas para competir!');
      return;
    }

    if (setupTotalQuestions % teams.length !== 0) {
      alert(
        `O número de perguntas (${setupTotalQuestions}) tem de ser divisível pelo número de equipas (${teams.length}), ` +
        `para que todas respondam à mesma quantidade. Ex.: com 2 equipas, use um número par de perguntas.`
      );
      return;
    }

    const availableQuestions = questions.filter(q => !q.used).length;
    if (setupTotalQuestions > availableQuestions) {
      alert(`Só existem ${availableQuestions} perguntas disponíveis no banco. Reduza o número de perguntas ou adicione mais ao banco.`);
      return;
    }

    const questionsPerTeam = setupTotalQuestions / teams.length;

    if (questionsPerTeam % 2 !== 0) {
      alert(
        `Cada concorrente responde a 2 perguntas por rodada antes de passar a vez. ` +
        `Por isso, o número de perguntas por equipa (${questionsPerTeam}) tem de ser par. ` +
        `Ajuste o número total de perguntas (ex.: múltiplo de ${teams.length * 2}).`
      );
      return;
    }

    // Cada equipa só recebe perguntas da sua própria faixa etária, por isso é
    // preciso garantir que há perguntas suficientes NAQUELA faixa específica.
    for (const category of AGE_CATEGORIES) {
      const teamsInCategory = teams.filter(t => t.ageCategory === category).length;
      if (teamsInCategory === 0) continue;
      const neededForCategory = teamsInCategory * questionsPerTeam;
      const availableInCategory = questions.filter(q => !q.used && q.ageCategory === category).length;
      if (neededForCategory > availableInCategory) {
        alert(
          `A faixa ${AGE_CATEGORY_LABELS[category]} tem ${teamsInCategory} equipa(s) e precisa de ${neededForCategory} perguntas, ` +
          `mas só há ${availableInCategory} disponíveis nessa faixa. Adicione mais perguntas dessa faixa no Banco de Perguntas ou reduza o número de perguntas.`
        );
        return;
      }
    }
    
    // Shuffle teams for the first turn order
    const shuffled = [...teams].sort(() => Math.random() - 0.5);

    await updateGameState({
      status: 'waiting',
      round: 1,
      totalRounds: questionsPerTeam / 2,
      timerDuration: setupTimerDuration,
      gameMode: 'teams',
      currentTeamId: shuffled[0].id,
      currentQuestionId: null,
      revealed: false,
      turnQuestionIndex: 0,
      eliminatedTeamIds: []
    });
  };

  // Auto pick next competitor: prefer another competitor of the SAME age category
  // that hasn't had a turn yet this round; only move to a different category once
  // everyone in the current one has already played this round.
  const handleDrawNextTeam = async () => {
    // In current round, which teams have already completed their turn (2 perguntas)?
    const answeredTeamIds = answers
      .filter(a => a.roundNumber === gameState.round)
      .map(a => a.teamId);

    const eligibleTeams = teams.filter(t => !answeredTeamIds.includes(t.id));

    if (eligibleTeams.length === 0) {
      // All teams have answered this round! Advance to next round or finish
      if (gameState.round >= gameState.totalRounds) {
        await updateGameState({ status: 'finished' });
      } else {
        // Next round — pick a team for the first turn
        const nextRound = gameState.round + 1;
        const firstTeam = teams[Math.floor(Math.random() * teams.length)];

        await updateGameState({
          round: nextRound,
          currentTeamId: firstTeam?.id || null,
          currentQuestionId: null,
          status: 'waiting',
          revealed: false,
          turnQuestionIndex: 0
        });
      }
      return;
    }

    // Prefer a competitor from the SAME age category as the one who just played
    const currentTeam = teams.find(t => t.id === gameState.currentTeamId);
    const sameCategoryPool = currentTeam
      ? eligibleTeams.filter(t => t.ageCategory === currentTeam.ageCategory)
      : [];
    const pool = sameCategoryPool.length > 0 ? sameCategoryPool : eligibleTeams;

    // Pick a random team from the preferred pool
    const nextTeam = pool[Math.floor(Math.random() * pool.length)];
    await updateGameState({
      currentTeamId: nextTeam.id,
      currentQuestionId: null,
      status: 'waiting',
      revealed: false,
      turnQuestionIndex: 0
    });
    setFilterLesson('');
    setSelectedQuestionId('');
  };

  // Launch selected question to projector
  const handleLaunchQuestion = async () => {
    if (!selectedQuestionId) {
      alert('Selecione uma pergunta primeiro!');
      return;
    }
    if (!gameState.currentTeamId) {
      alert('Selecione ou sorteie a equipa respondente!');
      return;
    }

    const question = questions.find(q => q.id === selectedQuestionId);
    if (!question) return;

    // Shuffle options to keep it interactive for public
    let shuffledOpts = [...question.options];
    if (question.type !== 'chronological' && question.type !== 'true_false') {
      shuffledOpts = [...question.options].sort(() => Math.random() - 0.5);
    }

    // Set countdown timestamps
    const now = Date.now();
    const durationMs = gameState.timerDuration * 1000;

    // O nome do concorrente é sempre o registado na equipa (concurso final = 1
    // concorrente por equipa), nunca é necessário digitar de novo a cada pergunta.
    const competitorName = activeTeam?.memberNames?.[0] || activeTeam?.name || 'Concorrente';

    await updateGameState({
      currentQuestionId: selectedQuestionId,
      status: 'running',
      timerStart: now,
      timerEnd: now + durationMs,
      revealed: false,
      currentMemberName: competitorName,
      shuffledOptions: shuffledOpts,
      selectedOptionIndex: null,
      chronologicalResult: null
    });
  };

  // Presenter/system selects which option the team answered (original, non-shuffled index)
  const handleSelectOption = async (originalIdx: number) => {
    await updateGameState({
      selectedOptionIndex: originalIdx
    });
  };

  // For 'chronological' questions there is no option list — the presenter simply
  // indicates whether the order the team gave out loud was correct or not.
  const handleSelectChronological = async (isCorrectOrder: boolean) => {
    await updateGameState({
      chronologicalResult: isCorrectOrder
    });
  };

  // Stop Timer
  const handleStopTimer = async () => {
    await updateGameState({
      timerStart: null,
      timerEnd: null
    });
  };

  // Reveal the correct answer AND automatically grade + record it.
  // Correctness is derived purely from what was selected above — no manual marking needed.
  const handleRevealAnswer = async () => {
    if (!gameState.currentTeamId || !gameState.currentQuestionId) return;
    const question = questions.find(q => q.id === gameState.currentQuestionId);
    if (!question) return;

    let isCorrect: boolean;
    if (question.type === 'chronological') {
      if (gameState.chronologicalResult === null || gameState.chronologicalResult === undefined) {
        alert('Indique primeiro se a equipa acertou a ordem antes de revelar a resposta!');
        return;
      }
      isCorrect = gameState.chronologicalResult;
    } else {
      if (gameState.selectedOptionIndex === null || gameState.selectedOptionIndex === undefined) {
        alert('Selecione primeiro a opção que a equipa escolheu antes de revelar a resposta!');
        return;
      }
      isCorrect = question.correctAnswer === gameState.selectedOptionIndex;
    }

    const answerTimeMs = gameState.timerStart ? Date.now() - gameState.timerStart : 0;

    await updateGameState({
      revealed: true,
      status: 'showing_answer'
    });

    await submitAnswer(
      gameState.currentTeamId,
      gameState.currentQuestionId,
      isCorrect,
      question.points,
      gameState.round,
      gameState.currentMemberName,
      answerTimeMs
    );
  };

  // Move on to the next question after the answer has been revealed & scored.
  // The competitor answers 2 perguntas per turn — turnQuestionIndex tracks how
  // many of those 2 have been completed so far in the current turn.
  const handleContinue = async () => {
    const nextTurnIndex = (gameState.turnQuestionIndex || 0) + 1;
    await updateGameState({
      currentQuestionId: null,
      status: 'waiting',
      revealed: false,
      timerStart: null,
      timerEnd: null,
      selectedOptionIndex: null,
      chronologicalResult: null,
      turnQuestionIndex: nextTurnIndex
    });

    setSelectedQuestionId('');
  };

  // Reset/Re-evaluate entire competition
  const handleResetCompetition = async () => {
    if (window.confirm('Aviso Crítico: Deseja reiniciar TODO o concurso? Isto apagará o histórico de respostas, scores e desbloqueará as perguntas.')) {
      await resetGame();
    }
  };

  const activeQuestion = questions.find(q => q.id === gameState.currentQuestionId);
  const activeTeam = teams.find(t => t.id === gameState.currentTeamId);
  const activeCompetitorName = activeTeam?.memberNames?.[0] || activeTeam?.name || '';
  const turnQuestionIndex = gameState.turnQuestionIndex || 0;
  const turnComplete = turnQuestionIndex >= 2; // concorrente já respondeu às 2 perguntas desta rodada

  // List lessons for filter — restrito à faixa etária da equipa da vez
  const lessonsWithUnusedQuestions = Array.from(new Set(
    questions
      .filter(q => !q.used && (!activeTeam || q.ageCategory === activeTeam.ageCategory))
      .map(q => q.lesson)
  ));

  return (
    <div className="bg-slate-50 min-h-screen text-slate-800 pb-12">
      
      {/* Admin Navbar */}
      <nav className="bg-slate-900 text-white px-6 py-4 shadow-md flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500 text-slate-950 rounded-xl shadow-inner">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-display tracking-tight flex items-center gap-2">
              Painel do Apresentador 
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono uppercase">
                AO VIVO
              </span>
            </h1>
            <p className="text-xs text-slate-400">Controle perguntas, cronómetros e rodadas em tempo real</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowDbAdmin(true)}
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold border border-emerald-900/40 px-3.5 py-2 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            <Database className="w-4 h-4" />
            Banco de Perguntas
          </button>
          
          <button
            onClick={handleResetCompetition}
            className="flex items-center gap-1.5 text-xs bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 font-bold border border-rose-900/40 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            Reiniciar Concurso
          </button>
        </div>
      </nav>

      {/* Main Layout Area */}
      <div className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* SETUP SCREEN */}
        {gameState.status === 'setup' ? (
          <div className="col-span-12 grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Config Form */}
            <div className="md:col-span-5 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
              <h3 className="text-lg font-bold text-slate-800 border-b pb-2 text-display">Configurações do Desafio</h3>
              
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 rounded-xl border border-blue-200 bg-blue-50/60 text-blue-700">
                  <Users className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold">Modo: Equipas Livres</p>
                    <p className="text-[10px] text-blue-600/80">Sem eliminação — todas as equipas competem por pontos até ao fim.</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Número de Perguntas</label>
                    <input
                      type="number"
                      value={setupTotalQuestions}
                      onChange={(e) => setSetupTotalQuestions(Number(e.target.value))}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:bg-white focus:border-slate-400"
                      min={teams.length || 2}
                      step={teams.length || 2}
                    />
                    <p className="text-[10px] text-slate-500 mt-1 italic">
                      {teams.length >= 2
                        ? `Tem de ser divisível por ${teams.length} (nº de equipas), para que todas respondam à mesma quantidade. Ex.: com 2 equipas, use um número par.`
                        : 'Adicione as equipas para calcular a divisão de perguntas.'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Tempo de Resposta (seg)</label>
                    <input
                      type="number"
                      value={setupTimerDuration}
                      onChange={(e) => setSetupTimerDuration(Number(e.target.value))}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:bg-white focus:border-slate-400"
                      min={10}
                      max={180}
                    />
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleStartGame}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold shadow-md hover:shadow-lg transition-all text-display flex items-center justify-center gap-2 text-base cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                Iniciar Grande Concurso!
              </button>
            </div>

            {/* Teams Management */}
            <div className="md:col-span-7 bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm space-y-6">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="text-lg font-bold text-slate-800 text-display">Gestão de Equipas</h3>
                <span className="text-xs font-semibold px-2 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">
                  {teams.length} Cadastradas
                </span>
              </div>

              {teams.length > 0 && (
                <div className="flex flex-wrap gap-2 -mt-2">
                  {AGE_CATEGORIES.map(c => {
                    const count = teams.filter(t => t.ageCategory === c).length;
                    if (count === 0) return null;
                    return (
                      <span key={c} className="text-[10px] font-bold px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-full text-slate-600">
                        {AGE_CATEGORY_LABELS[c]}: {count} equipa{count > 1 ? 's' : ''}
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-xl border border-indigo-200 bg-indigo-50/60 text-indigo-700 text-xs">
                <GraduationCap className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  Dica: envie aos professores o link com <code className="bg-indigo-100 px-1 py-0.5 rounded font-mono">#casting</code> para que cada um inscreva a sua turma diretamente (nome do professor, turma, categoria e os 5 concorrentes). As equipas inscritas aparecem aqui automaticamente. Também pode adicionar equipas manualmente abaixo.
                </p>
              </div>

              {/* Add Team form — regista o concorrente junto com turma, professor e faixa (idade) */}
              <form onSubmit={handleAddTeam} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="md:col-span-4">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Nome do Concorrente</label>
                  <input
                    type="text"
                    value={newCompetitorName}
                    onChange={(e) => setNewCompetitorName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-slate-400"
                    required
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Turma</label>
                  <input
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="Ex: Turma A"
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-slate-400"
                    required
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Professor(a)</label>
                  <input
                    type="text"
                    value={newTeacherName}
                    onChange={(e) => setNewTeacherName(e.target.value)}
                    placeholder="Ex: Prof. Ana"
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-slate-400"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Idade (Faixa)</label>
                  <select
                    value={newTeamCategory}
                    onChange={(e) => setNewTeamCategory(e.target.value as AgeCategory)}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-slate-400"
                  >
                    {AGE_CATEGORIES.map(c => (
                      <option key={c} value={c}>{AGE_CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-12">
                  <button
                    type="submit"
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all h-[38px] cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Inscrever Concorrente
                  </button>
                </div>
              </form>

              {/* Team list */}
              {teams.length === 0 ? (
                <div className="text-center py-12 text-slate-400 space-y-2">
                  <Users className="w-12 h-12 stroke-1 mx-auto" />
                  <p className="text-sm font-semibold">Nenhuma equipa registada</p>
                  <p className="text-xs">Por favor, adicione as equipas para iniciar a disputa.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {teams.map((t) => (
                    <div key={t.id} className="flex justify-between items-center border border-slate-100 bg-white p-3.5 rounded-xl shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-bold text-slate-600 text-display text-sm">
                          {(t.memberNames?.[0] || t.name).substr(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                            {t.memberNames?.[0] || t.name}
                            <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                              t.ageCategory === 'junior' ? 'bg-sky-100 text-sky-700' :
                              t.ageCategory === 'senior' ? 'bg-purple-100 text-purple-700' :
                              'bg-emerald-100 text-emerald-700'
                            }`}>
                              {AGE_CATEGORY_LABELS[t.ageCategory]}
                            </span>
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            Turma {t.className || t.name}
                            {t.teacherName && <span> • Prof. {t.teacherName}</span>}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteTeam(t.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : (
          /* LIVE GAME SCREEN */
          <>
            {/* Presenter Live Controls (full width — classification/stats live only in the Judge Panel) */}
            <div className="col-span-12 space-y-6">
              
              {/* Active Step status banner */}
              <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs uppercase font-bold text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg">
                      Rodada {gameState.round} de {gameState.totalRounds}
                    </span>
                    {activeTeam && gameState.status !== 'finished' && (
                      <span className="text-xs uppercase font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                        Pergunta {Math.min(turnQuestionIndex + 1, 2)} de 2
                      </span>
                    )}
                    <span className={`text-xs uppercase font-extrabold px-2.5 py-1 rounded-lg ${
                      gameState.status === 'running' ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 
                      gameState.status === 'showing_answer' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                      'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}>
                      {gameState.status === 'waiting' ? 'Aguardando Pergunta' : 
                       gameState.status === 'running' ? 'Tempo de Resposta Ativo' : 
                       gameState.status === 'showing_answer' ? 'Resposta Revelada' : 'Fim do Jogo'}
                    </span>
                  </div>

                  {/* Draw next competitor — só disponível quando o concorrente da vez já
                      respondeu às 2 perguntas da rodada (ou ainda não há concorrente ativo) */}
                  {gameState.status === 'waiting' && !gameState.currentQuestionId && (turnComplete || !activeTeam) && (
                    <button
                      onClick={handleDrawNextTeam}
                      className="flex items-center gap-1.5 text-xs bg-amber-500 text-slate-950 font-bold px-3 py-1.5 rounded-lg hover:bg-amber-400 transition-all cursor-pointer"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      Sortear/Próximo Concorrente
                    </button>
                  )}
                </div>

                {/* Active Competitor display — concorrente, turma, professor e idade juntos */}
                {activeTeam ? (
                  <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Concorrente da Vez</p>
                      <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-blue-950/50 border border-blue-900/50 text-blue-300">
                        Idade: {AGE_CATEGORY_LABELS[activeTeam.ageCategory]}
                      </span>
                    </div>
                    <h2 className="text-2xl font-black text-display text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-200">
                      {activeCompetitorName}
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Turma {activeTeam.className || activeTeam.name}
                      {activeTeam.teacherName && <span> • Prof. {activeTeam.teacherName}</span>}
                    </p>
                    {turnComplete && gameState.status === 'waiting' && (
                      <p className="text-[11px] text-amber-300 font-semibold pt-1">
                        Este concorrente já respondeu às 2 perguntas desta rodada. Sorteie o próximo concorrente da mesma categoria (ou de outra, se esta já terminou).
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-400 text-xs">
                    Nenhuma equipa ativa no momento. Sorteie a próxima equipa acima.
                  </div>
                )}
              </div>

              {/* RESULTADOS FINAIS — vencedores por categoria e por turma */}
              {gameState.status === 'finished' && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                  <h3 className="text-lg font-bold text-slate-800 text-display border-b pb-2 flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    Resultados Finais — Vencedores por Categoria
                  </h3>

                  {groupTeamsByCategory(teams).length === 0 ? (
                    <p className="text-sm text-slate-400 italic">Nenhuma equipa registada.</p>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                      {groupTeamsByCategory(teams).map(({ category, teams: catTeams }) => (
                        <div key={category} className="rounded-2xl border border-slate-200 overflow-hidden">
                          <div className={`px-4 py-3 font-black text-display text-sm uppercase tracking-wide ${
                            category === 'junior' ? 'bg-sky-50 text-sky-700' :
                            category === 'senior' ? 'bg-purple-50 text-purple-700' :
                            'bg-emerald-50 text-emerald-700'
                          }`}>
                            {AGE_CATEGORY_LABELS[category]}
                          </div>
                          <div className="divide-y divide-slate-100">
                            {catTeams.map((t, idx) => (
                              <div key={t.id} className={`p-3.5 flex items-center justify-between gap-3 ${idx === 0 ? 'bg-amber-50/60' : ''}`}>
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-black ${
                                    idx === 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-500'
                                  }`}>
                                    {idx === 0 ? <Trophy className="w-3.5 h-3.5" /> : idx + 1}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate flex items-center gap-1.5">
                                      {t.className || t.name}
                                      {idx === 0 && <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">Vencedor</span>}
                                    </p>
                                    {t.teacherName && (
                                      <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                                        <GraduationCap className="w-3 h-3" /> {t.teacherName}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <p className="text-sm font-black text-slate-800">{t.score} pts</p>
                                  <p className="text-[10px] text-slate-400">{t.correct} certas / {t.wrong} erradas</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* QUESTION SELECTOR & CONTROLS */}
              {gameState.status === 'waiting' && activeTeam && !turnComplete && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
                  <h3 className="text-lg font-bold text-slate-800 text-display border-b pb-2 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                    Selecione a Pergunta do Desafio
                    <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                      Faixa: {AGE_CATEGORY_LABELS[activeTeam.ageCategory]}
                    </span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Filtrar Lição</label>
                      <select
                        value={filterLesson}
                        onChange={(e) => { setFilterLesson(e.target.value); setSelectedQuestionId(''); }}
                        className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:bg-white focus:border-slate-400"
                      >
                        <option value="">Todas as Lições com Perguntas Não Usadas</option>
                        {lessonsWithUnusedQuestions.map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Selecionar Pergunta</label>
                      <select
                        value={selectedQuestionId}
                        onChange={(e) => setSelectedQuestionId(e.target.value)}
                        className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:bg-white focus:border-slate-400"
                      >
                        {questions
                          .filter(q => !q.used && (!filterLesson || q.lesson === filterLesson) && q.ageCategory === activeTeam.ageCategory)
                          .map(q => (
                            <option key={q.id} value={q.id}>
                              [{q.difficulty.toUpperCase()} - {q.points} pts] {q.question.substr(0, 50)}...
                            </option>
                          ))
                        }
                      </select>
                    </div>
                  </div>

                  {/* Question preview inside Presenter panel */}
                  {selectedQuestionId && (
                    (() => {
                      const q = questions.find(item => item.id === selectedQuestionId);
                      if (!q) return null;
                      return (
                        <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
                          <div className="flex justify-between items-center text-xs text-slate-500 font-bold">
                            <span className="uppercase">Dificuldade: {q.difficulty} • Pontos: {q.points}</span>
                            <span className="uppercase">Tipo: {q.type}</span>
                          </div>
                          <p className="font-bold text-slate-800 text-display text-sm">{q.question}</p>
                          
                          <div className="grid grid-cols-2 gap-2 pt-1.5">
                            {q.options.map((opt, oIdx) => {
                              const isCorrect = q.type === 'true_false' 
                                ? q.correctAnswer === oIdx 
                                : q.type === 'chronological' 
                                ? true 
                                : q.correctAnswer === oIdx;
                              return (
                                <div key={oIdx} className={`text-xs p-2 rounded border flex items-center gap-1.5 ${
                                  isCorrect ? 'border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold' : 'border-slate-100 bg-white text-slate-600'
                                }`}>
                                  <span className="font-bold opacity-60">{String.fromCharCode(65 + oIdx)})</span>
                                  <span className="truncate">{opt}</span>
                                </div>
                              );
                            })}
                          </div>
                          
                          {q.type === 'chronological' && (
                            <p className="text-[10px] text-slate-500 italic">As opções acima estão listadas no formato ordenado correto.</p>
                          )}
                        </div>
                      );
                    })()
                  )}

                  <button
                    onClick={handleLaunchQuestion}
                    disabled={!selectedQuestionId}
                    className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" />
                    Lançar Pergunta ao Projetor & Iniciar
                  </button>
                </div>
              )}

              {/* RUNNING / ANSWER CONTROLS */}
              {activeQuestion && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
                  <div className="flex justify-between items-center border-b pb-2">
                    <h3 className="text-lg font-bold text-slate-800 text-display flex items-center gap-2">
                      <Timer className="w-5 h-5 text-amber-500" />
                      Controlo da Pergunta Ativa
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={handleStopTimer}
                        className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-semibold text-slate-600 cursor-pointer"
                      >
                        Pausar Cronómetro
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 text-center space-y-2">
                    <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Pergunta Ativa</p>
                    <h2 className="text-xl font-bold text-slate-800 text-display">{activeQuestion.question}</h2>
                    <p className="text-xs text-slate-500">Respondente: <strong>{gameState.currentMemberName}</strong> ({activeTeam?.name})</p>
                  </div>

                  {/* Selection of the option the team answered - reflected live on the projector */}
                  {activeQuestion.type === 'chronological' ? (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <HelpIcon className="w-4 h-4 text-blue-500" />
                        A equipa acertou a ordem cronológica?
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => handleSelectChronological(true)}
                          className={`py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                            gameState.chronologicalResult === true
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <Check className="w-4 h-4" /> Ordem Correta
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSelectChronological(false)}
                          className={`py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                            gameState.chronologicalResult === false
                              ? 'border-rose-500 bg-rose-50 text-rose-800'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <X className="w-4 h-4" /> Ordem Errada
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <HelpIcon className="w-4 h-4 text-blue-500" />
                        Qual opção a equipa escolheu?
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {(gameState.shuffledOptions || activeQuestion.options).map((opt, idx) => {
                          const originalIdx = activeQuestion.options.indexOf(opt);
                          const isSelected = gameState.selectedOptionIndex === originalIdx;
                          const isCorrectOpt = activeQuestion.correctAnswer === originalIdx;
                          const isRevealed = gameState.revealed;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleSelectOption(originalIdx)}
                              className={`text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                isRevealed && isCorrectOpt
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                  : isRevealed && isSelected && !isCorrectOpt
                                  ? 'border-rose-500 bg-rose-50 text-rose-800'
                                  : isSelected
                                  ? 'border-blue-500 bg-blue-50 text-blue-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <span className="truncate">{String.fromCharCode(65 + idx)}) {opt}</span>
                              {isSelected && <span className="text-[9px] uppercase font-bold flex-shrink-0">Escolhida</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Action row — grading is now fully automatic based on the selection above */}
                  <div className="pt-4 border-t">
                    {!gameState.revealed ? (
                      <button
                        onClick={handleRevealAnswer}
                        className="w-full py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <Eye className="w-4 h-4" />
                        Mostrar Resposta (avalia e regista automaticamente)
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div className={`p-3 rounded-xl border text-center text-sm font-bold ${
                          (activeQuestion.type === 'chronological'
                            ? gameState.chronologicalResult
                            : gameState.selectedOptionIndex === activeQuestion.correctAnswer)
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-rose-50 border-rose-200 text-rose-700'
                        }`}>
                          {(activeQuestion.type === 'chronological'
                            ? gameState.chronologicalResult
                            : gameState.selectedOptionIndex === activeQuestion.correctAnswer)
                            ? 'Resposta CORRETA — pontos atribuídos automaticamente ✔'
                            : 'Resposta INCORRETA — registada automaticamente ✖'}
                        </div>
                        <button
                          onClick={handleContinue}
                          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                          Continuar / Próxima Pergunta
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </>
        )}

      </div>

      {/* DB Admin Modal */}
      {showDbAdmin && (
        <DatabaseAdmin 
          questions={questions} 
          onClose={() => setShowDbAdmin(false)} 
        />
      )}

    </div>
  );
}
