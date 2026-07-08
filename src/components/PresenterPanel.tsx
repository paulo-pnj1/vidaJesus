import React, { useState, useEffect } from 'react';
import { GameState, Question, Team, Answer } from '../types';
import { 
  updateGameState, 
  subscribeToTeams, 
  subscribeToQuestions, 
  subscribeToAnswers, 
  addTeam, 
  deleteTeam, 
  submitAnswer, 
  resetGame,
  seedQuestionsIfEmpty
} from '../lib/gameService';
import { 
  Users, Play, RotateCcw, Plus, Trash2, Database, HelpCircle, 
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
  const [showDbAdmin, setShowDbAdmin] = useState(false);

  // Setup Form State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamMembers, setNewTeamMembers] = useState(4);
  const [setupTotalQuestions, setSetupTotalQuestions] = useState(10);
  const [setupTimerDuration, setSetupTimerDuration] = useState(30);

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
    
    // Shuffle teams for the first turn order
    const shuffled = [...teams].sort(() => Math.random() - 0.5);

    await updateGameState({
      status: 'waiting',
      round: 1,
      totalRounds: questionsPerTeam,
      timerDuration: setupTimerDuration,
      gameMode: 'teams',
      currentTeamId: shuffled[0].id,
      currentQuestionId: null,
      revealed: false,
      eliminatedTeamIds: []
    });
  };

  // Launch a random unused question to the projector for the currently active team
  const handleLaunchQuestion = async () => {
    if (!gameState.currentTeamId) {
      alert('Nenhuma equipa ativa para responder!');
      return;
    }

    // Only questions never used before are eligible — this guarantees a question
    // is never repeated, whether for the same team, a different team, or a later round.
    const availableQuestions = questions.filter(q => !q.used);
    if (availableQuestions.length === 0) {
      alert('Não há mais perguntas disponíveis no banco!');
      return;
    }

    const question = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];

    // Shuffle options to keep it interactive for public
    let shuffledOpts = [...question.options];
    if (question.type !== 'chronological' && question.type !== 'true_false') {
      shuffledOpts = [...question.options].sort(() => Math.random() - 0.5);
    }

    // Set countdown timestamps
    const now = Date.now();
    const durationMs = gameState.timerDuration * 1000;

    await updateGameState({
      currentQuestionId: question.id,
      status: 'running',
      timerStart: now,
      timerEnd: now + durationMs,
      revealed: false,
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
      undefined,
      answerTimeMs
    );
  };

  // Move on after the answer has been revealed & scored.
  // Automatically advances the turn: picks the next team that hasn't answered yet in this
  // round; once every team has answered, moves to the next round (or finishes the game).
  const handleContinue = async () => {
    const justAnsweredTeamId = gameState.currentTeamId;

    // Which teams have already answered in the current round? (include the team that just
    // answered explicitly, in case the local `answers` list hasn't synced from Firestore yet)
    const answeredTeamIds = new Set(
      answers.filter(a => a.roundNumber === gameState.round).map(a => a.teamId)
    );
    if (justAnsweredTeamId) answeredTeamIds.add(justAnsweredTeamId);

    const eligibleTeams = teams.filter(t => !answeredTeamIds.has(t.id));

    const baseReset = {
      currentQuestionId: null,
      revealed: false,
      timerStart: null,
      timerEnd: null,
      selectedOptionIndex: null,
      chronologicalResult: null
    };

    if (eligibleTeams.length === 0) {
      // Every team has had its turn this round
      if (gameState.round >= gameState.totalRounds) {
        await updateGameState({ ...baseReset, status: 'finished' });
      } else {
        const nextRound = gameState.round + 1;
        const firstTeam = teams[Math.floor(Math.random() * teams.length)];
        await updateGameState({
          ...baseReset,
          round: nextRound,
          currentTeamId: firstTeam?.id || null,
          status: 'waiting'
        });
      }
      return;
    }

    // Randomly pick the next team still pending in this round
    const nextTeam = eligibleTeams[Math.floor(Math.random() * eligibleTeams.length)];
    await updateGameState({
      ...baseReset,
      currentTeamId: nextTeam.id,
      status: 'waiting'
    });
  };

  // Reset/Re-evaluate entire competition
  const handleResetCompetition = async () => {
    if (window.confirm('Aviso Crítico: Deseja reiniciar TODO o concurso? Isto apagará o histórico de respostas, scores e desbloqueará as perguntas.')) {
      await resetGame();
    }
  };

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
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-400 text-xs">
                    Nenhuma equipa ativa no momento. Sorteie a próxima equipa acima.
                  </div>
                )}
              </div>

              {/* QUESTION SELECTOR & CONTROLS */}
              {gameState.status === 'waiting' && activeTeam && (
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
                  <h3 className="text-lg font-bold text-slate-800 text-display border-b pb-2 flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-amber-500" />
                    Pergunta do Desafio
                  </h3>

                  <p className="text-xs text-slate-500">
                    A pergunta é sorteada automaticamente entre as que ainda não foram usadas —
                    garantindo que nenhuma pergunta se repete, nem para a mesma equipa nem para outra.
                    Restam <strong>{questions.filter(q => !q.used).length}</strong> pergunta(s) no banco.
                  </p>

                  <button
                    onClick={handleLaunchQuestion}
                    disabled={questions.filter(q => !q.used).length === 0}
                    className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl font-bold transition-all text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                  >
                    <Shuffle className="w-5 h-5" />
                    Sortear e Lançar Pergunta ao Projetor
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
                    <p className="text-xs text-slate-500">Equipa: <strong>{activeTeam?.name}</strong></p>
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
                          Continuar / Passar à Próxima Equipa
                        </button>
                      </div>
                    )}
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
                          <p className="text-[9px] text-slate-400">Rodada {ans.roundNumber}</p>
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