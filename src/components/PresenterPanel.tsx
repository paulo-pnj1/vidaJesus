import React, { useState, useEffect } from 'react';
import { GameState, Question, Team, Answer, JudgeVote } from '../types';
import { 
  updateGameState, 
  subscribeToTeams, 
  subscribeToQuestions, 
  subscribeToAnswers, 
  subscribeToJudgeVotes,
  clearJudgeVotes,
  addTeam, 
  deleteTeam, 
  submitAnswer, 
  resetGame,
  seedQuestionsIfEmpty
} from '../lib/gameService';
import { 
  Users, Play, RotateCcw, AlertTriangle, Plus, Trash2, Database, HelpCircle, 
  Check, X, Award, ChevronRight, Shuffle, Timer, Eye, HelpCircle as HelpIcon, ShieldAlert, BookOpen 
} from 'lucide-react';
import DatabaseAdmin from './DatabaseAdmin';

interface PresenterPanelProps {
  gameState: GameState;
}

export default function PresenterPanel({ gameState }: PresenterPanelProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [judgeVotes, setJudgeVotes] = useState<JudgeVote[]>([]);
  const [showDbAdmin, setShowDbAdmin] = useState(false);

  // Setup Form State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamMembers, setNewTeamMembers] = useState(4);
  const [setupRounds, setSetupRounds] = useState(3);
  const [setupTimerDuration, setSetupTimerDuration] = useState(30);
  const [setupMode, setSetupMode] = useState<GameState['gameMode']>('sunday_school');

  // Game Play State
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>('');
  const [filterLesson, setFilterLesson] = useState<string>('');
  const [memberName, setMemberName] = useState<string>('');
  const [showRotationWarning, setShowRotationWarning] = useState<string | null>(null);

  // Subscribe to collections
  useEffect(() => {
    const unsubscribeTeams = subscribeToTeams(setTeams);
    const unsubscribeQuestions = subscribeToQuestions(setQuestions);
    const unsubscribeAnswers = subscribeToAnswers(setAnswers);
    const unsubscribeVotes = subscribeToJudgeVotes(setJudgeVotes);

    // Initial seeding check
    seedQuestionsIfEmpty();

    return () => {
      unsubscribeTeams();
      unsubscribeQuestions();
      unsubscribeAnswers();
      unsubscribeVotes();
    };
  }, []);

  // Set default selected question when category or list updates
  useEffect(() => {
    const available = questions.filter(q => !q.used && (!filterLesson || q.lesson === filterLesson));
    if (available.length > 0 && !selectedQuestionId) {
      setSelectedQuestionId(available[0].id);
    }
  }, [questions, filterLesson, selectedQuestionId]);

  // Handle Respondent Name check against Rotation rule
  const handleMemberNameChange = (val: string) => {
    setMemberName(val);
    if (!gameState.currentTeamId || !val.trim()) {
      setShowRotationWarning(null);
      return;
    }
    const currentTeam = teams.find(t => t.id === gameState.currentTeamId);
    if (currentTeam && currentTeam.membersAnswered?.includes(val.trim())) {
      setShowRotationWarning(`Aviso: "${val.trim()}" já respondeu nesta rodada de rotação. Todos devem responder antes de repetir!`);
    } else {
      setShowRotationWarning(null);
    }
  };

  // Add Team
  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTeamName.trim()) {
      await addTeam(newTeamName.trim(), Number(newTeamMembers));
      setNewTeamName('');
    }
  };

  // Start Game
  const handleStartGame = async () => {
    if (teams.length < 2) {
      alert('Adicione pelo menos 2 equipas para competir!');
      return;
    }
    
    // Shuffle teams for the first turn order
    const shuffled = [...teams].sort(() => Math.random() - 0.5);

    await updateGameState({
      status: 'waiting',
      round: 1,
      totalRounds: setupRounds,
      timerDuration: setupTimerDuration,
      gameMode: setupMode,
      currentTeamId: shuffled[0].id,
      currentQuestionId: null,
      revealed: false,
      eliminatedTeamIds: []
    });
  };

  // Auto pick next team that has not answered in the current round
  const handleDrawNextTeam = async () => {
    // In current round, which teams have answered?
    const answeredTeamIds = answers
      .filter(a => a.roundNumber === gameState.round)
      .map(a => a.teamId);

    const eligibleTeams = teams.filter(t => !answeredTeamIds.includes(t.id) && !gameState.eliminatedTeamIds?.includes(t.id));

    if (eligibleTeams.length === 0) {
      // All teams have answered this round! Advance to next round or finish
      if (gameState.round >= gameState.totalRounds) {
        await updateGameState({ status: 'finished' });
      } else {
        // Next round
        const nextRound = gameState.round + 1;
        
        // If Competition mode, we eliminate the team with lowest score
        let updatedEliminated = [...(gameState.eliminatedTeamIds || [])];
        if (gameState.gameMode === 'competition') {
          // Find lowest score among active teams
          const activeTeams = teams.filter(t => !updatedEliminated.includes(t.id));
          if (activeTeams.length > 2) {
            const sortedByScore = [...activeTeams].sort((a, b) => a.score - b.score);
            const lowestTeam = sortedByScore[0];
            updatedEliminated.push(lowestTeam.id);
            alert(`Fim da Rodada! A equipa "${lowestTeam.name}" foi eliminada.`);
          }
        }

        // Pick a team for first turn of next round
        const activeTeams = teams.filter(t => !updatedEliminated.includes(t.id));
        const firstTeam = activeTeams[Math.floor(Math.random() * activeTeams.length)];

        await updateGameState({
          round: nextRound,
          currentTeamId: firstTeam?.id || null,
          currentQuestionId: null,
          status: 'waiting',
          revealed: false,
          eliminatedTeamIds: updatedEliminated
        });
      }
      return;
    }

    // Pick a random team from eligible
    const nextTeam = eligibleTeams[Math.floor(Math.random() * eligibleTeams.length)];
    await updateGameState({
      currentTeamId: nextTeam.id,
      currentQuestionId: null,
      status: 'waiting',
      revealed: false
    });
    setMemberName('');
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

    await clearJudgeVotes();

    await updateGameState({
      currentQuestionId: selectedQuestionId,
      status: 'running',
      timerStart: now,
      timerEnd: now + durationMs,
      revealed: false,
      currentMemberName: memberName.trim() || 'Membro da Equipa',
      shuffledOptions: shuffledOpts,
      selectedOptionIndex: null
    });
  };

  // Presenter/system selects which option the team answered (original, non-shuffled index)
  const handleSelectOption = async (originalIdx: number) => {
    await updateGameState({
      selectedOptionIndex: originalIdx
    });
  };

  // Reveal Correct Answer
  const handleRevealAnswer = async () => {
    await updateGameState({
      revealed: true,
      status: 'showing_answer'
    });
  };

  // Stop Timer
  const handleStopTimer = async () => {
    await updateGameState({
      timerStart: null,
      timerEnd: null
    });
  };

  // Handle Mark Correct/Incorrect
  const handleJudgeDecision = async (isCorrect: boolean) => {
    if (!gameState.currentTeamId || !gameState.currentQuestionId) return;
    const question = questions.find(q => q.id === gameState.currentQuestionId);
    if (!question) return;

    // Submit log & update scores
    await submitAnswer(
      gameState.currentTeamId,
      gameState.currentQuestionId,
      isCorrect,
      question.points,
      gameState.round,
      gameState.currentMemberName
    );

    // After answering, we can clear the current active question
    await updateGameState({
      currentQuestionId: null,
      status: 'waiting',
      revealed: false,
      timerStart: null,
      timerEnd: null,
      selectedOptionIndex: null
    });

    setMemberName('');
    setSelectedQuestionId('');
    await clearJudgeVotes();
  };

  // Reset/Re-evaluate entire competition
  const handleResetCompetition = async () => {
    if (window.confirm('Aviso Crítico: Deseja reiniciar TODO o concurso? Isto apagará o histórico de respostas, scores e desbloqueará as perguntas.')) {
      await resetGame();
    }
  };

  // List lessons for filter
  const lessonsWithUnusedQuestions = Array.from(new Set(
    questions.filter(q => !q.used).map(q => q.lesson)
  ));

  const activeQuestion = questions.find(q => q.id === gameState.currentQuestionId);
  const activeTeam = teams.find(t => t.id === gameState.currentTeamId);

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
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5">Modo de Concurso</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setSetupMode('sunday_school')}
                      className={`p-3 rounded-xl border text-center text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                        setupMode === 'sunday_school' 
                          ? 'bg-amber-500/10 border-amber-500 text-amber-700 font-bold' 
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <Award className="w-4 h-4" />
                      E. Dominical
                    </button>
                    <button
                      type="button"
                      onClick={() => setSetupMode('competition')}
                      className={`p-3 rounded-xl border text-center text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                        setupMode === 'competition' 
                          ? 'bg-red-500/10 border-red-500 text-red-700 font-bold' 
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <X className="w-4 h-4" />
                      Eliminação
                    </button>
                    <button
                      type="button"
                      onClick={() => setSetupMode('teams')}
                      className={`p-3 rounded-xl border text-center text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                        setupMode === 'teams' 
                          ? 'bg-blue-500/10 border-blue-500 text-blue-700 font-bold' 
                          : 'border-slate-200 hover:border-slate-300 text-slate-600'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      Equipas Livres
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5 italic">
                    {setupMode === 'sunday_school' ? 'Ninguém é eliminado. Ideal para participação integrada até ao fim.' : 
                     setupMode === 'competition' ? 'Eliminação progressiva da pior equipa ao final de cada rodada.' : 
                     'Competição padrão de pontos livre por equipa.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">Total de Rodadas</label>
                    <input
                      type="number"
                      value={setupRounds}
                      onChange={(e) => setSetupRounds(Number(e.target.value))}
                      className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:bg-white focus:border-slate-400"
                      min={1}
                      max={10}
                    />
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

              {/* Add Team form */}
              <form onSubmit={handleAddTeam} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="md:col-span-6">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Nome da Equipa</label>
                  <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Ex: Galileia / Betel / Caná"
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-slate-400"
                    required
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="block text-xs font-bold text-slate-600 mb-1">Nº Integrantes</label>
                  <input
                    type="number"
                    value={newTeamMembers}
                    onChange={(e) => setNewTeamMembers(Number(e.target.value))}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg p-2 outline-none focus:border-slate-400"
                    min={1}
                    max={20}
                    required
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all h-[38px] cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> Add
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
                          {t.name.substr(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm">{t.name}</h4>
                          <p className="text-[11px] text-slate-500">{t.membersCount} Integrantes</p>
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
            {/* Left/Middle Column (Presenter Live Controls) */}
            <div className="lg:col-span-8 space-y-6">
              
              {/* Active Step status banner */}
              <div className="bg-slate-900 text-white rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-bold text-slate-400 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-lg">
                      Rodada {gameState.round} de {gameState.totalRounds}
                    </span>
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

                  {/* Draw next team / Turn advancer */}
                  {gameState.status === 'waiting' && !gameState.currentQuestionId && (
                    <button
                      onClick={handleDrawNextTeam}
                      className="flex items-center gap-1.5 text-xs bg-amber-500 text-slate-950 font-bold px-3 py-1.5 rounded-lg hover:bg-amber-400 transition-all cursor-pointer"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      Sortear/Próxima Equipa
                    </button>
                  )}
                </div>

                {/* Active Team display */}
                {activeTeam ? (
                  <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Equipa da Vez</p>
                      <h2 className="text-2xl font-black text-display text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-200">
                        {activeTeam.name}
                      </h2>
                      <p className="text-[11px] text-slate-400">
                        Participação equilibrada: {activeTeam.membersAnswered?.length || 0} de {activeTeam.membersCount} responderam nesta rotação.
                      </p>
                    </div>

                    {/* Respondent field */}
                    {gameState.status === 'waiting' && (
                      <div className="w-full md:w-[250px] space-y-1.5">
                        <label className="block text-[11px] font-bold text-slate-300">Nome do Integrante que vai Responder</label>
                        <input
                          type="text"
                          value={memberName}
                          onChange={(e) => handleMemberNameChange(e.target.value)}
                          placeholder="Ex: João Silva / Maria"
                          className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 outline-none focus:border-amber-400 text-white"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-400 text-xs">
                    Nenhuma equipa ativa no momento. Sorteie a próxima equipa acima.
                  </div>
                )}

                {showRotationWarning && (
                  <div className="flex items-center gap-2 text-amber-400 bg-amber-400/10 border border-amber-500/20 p-3 rounded-lg text-xs font-medium">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
                    <span>{showRotationWarning}</span>
                  </div>
                )}
              </div>

              {/* QUESTION SELECTOR & CONTROLS */}
              {gameState.status === 'waiting' && activeTeam && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
                  <h3 className="text-lg font-bold text-slate-800 text-display border-b pb-2 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                    Selecione a Pergunta do Desafio
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
                          .filter(q => !q.used && (!filterLesson || q.lesson === filterLesson))
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
                  {activeQuestion.type !== 'chronological' && (
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

                  {/* Real-time Judge votes feed */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-blue-500" />
                      Avaliação dos Jurados ({judgeVotes.length})
                    </h4>
                    {judgeVotes.length === 0 ? (
                      <p className="text-xs text-slate-400 italic bg-slate-50 p-3 rounded-lg">Nenhum jurado enviou voto para esta pergunta ainda.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {judgeVotes.map((v, i) => (
                          <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border ${
                            v.isCorrect 
                              ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
                              : 'bg-rose-50 border-rose-100 text-rose-800'
                          }`}>
                            <span className="truncate">{v.judgeId}</span>
                            <span className="text-[10px] uppercase font-bold">
                              {v.isCorrect ? 'CERTO ✔' : 'ERRADO ✖'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t">
                    <button
                      onClick={handleRevealAnswer}
                      className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-4 h-4" />
                      Mostrar Resposta
                    </button>

                    <button
                      onClick={() => handleJudgeDecision(true)}
                      className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      Marcar Correta ✔
                    </button>

                    <button
                      onClick={() => handleJudgeDecision(false)}
                      className="py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                      Marcar Incorreta ✖
                    </button>
                  </div>
                </div>
              )}

            </div>

            {/* Right Column (Leaderboard & History) */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Leaderboard */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-800 text-display border-b pb-2 flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  Classificação Geral (Real-time)
                </h3>

                <div className="space-y-2">
                  {teams.map((t, idx) => {
                    const isEliminated = gameState.eliminatedTeamIds?.includes(t.id);
                    return (
                      <div key={t.id} className={`flex justify-between items-center p-3 rounded-xl border ${
                        isEliminated ? 'border-slate-200 bg-slate-100/60 opacity-60 text-slate-400' :
                        gameState.currentTeamId === t.id ? 'border-amber-400 bg-amber-50/50 text-slate-800 font-medium shadow-xs' : 'border-slate-100 bg-slate-50/50 text-slate-700'
                      }`}>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono text-xs font-bold text-slate-400 w-4 text-center">
                            {idx + 1}º
                          </span>
                          <div>
                            <h4 className="font-bold text-xs">{t.name} {isEliminated && '(Eliminada)'}</h4>
                            <p className="text-[10px] text-slate-400 font-medium">
                              Certas: {t.correct} | Erradas: {t.wrong} | Aproveitamento: {t.correct + t.wrong > 0 ? Math.round((t.correct / (t.correct + t.wrong)) * 100) : 0}%
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-sm text-display text-slate-800 block">
                            {t.score} pts
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Answers Log History */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-800 text-display border-b pb-2">
                  Histórico de Respostas
                </h3>

                {answers.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-6">Nenhuma resposta registada ainda.</p>
                ) : (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {answers.slice().reverse().map((ans) => {
                      const team = teams.find(t => t.id === ans.teamId);
                      const q = questions.find(question => question.id === ans.questionId);
                      return (
                        <div key={ans.id} className="border border-slate-100 p-2.5 rounded-lg text-xs space-y-1 bg-slate-50/50">
                          <div className="flex justify-between items-center">
                            <strong className="text-slate-700">{team?.name || 'Equipa'}</strong>
                            <span className={`text-[10px] font-bold ${ans.isCorrect ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {ans.isCorrect ? `+${ans.pointsEarned} pts` : 'Errado'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 italic">"{q?.question || 'Pergunta'}"</p>
                          <p className="text-[9px] text-slate-400">Respondido por: {ans.memberName} • Rodada {ans.roundNumber}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

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
