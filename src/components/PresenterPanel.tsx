import React, { useState, useEffect } from 'react';
import { GameState, Question, Team, Answer, AgeCategory, AGE_CATEGORIES, AGE_CATEGORY_LABELS, TiebreakState, TiebreakAnswer } from '../types';
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
  groupTeamsByCategory,
  getCategoryWinner,
  getTiedTopTeams,
  updateQuestion
} from '../lib/gameService';
import { 
  Users, Play, RotateCcw, Plus, Trash2, Database, HelpCircle, 
  Check, X, ChevronRight, Shuffle, Timer, Eye, HelpCircle as HelpIcon, ShieldAlert, BookOpen,
  Trophy, GraduationCap, Swords
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

  // Tie-break State — pending (not yet confirmed) answer for whichever
  // candidate is currently up during a sudden-death tie-break round
  const [tiebreakSelectedOption, setTiebreakSelectedOption] = useState<number | null>(null);
  const [tiebreakChronoResult, setTiebreakChronoResult] = useState<boolean | null>(null);

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
    
    // As faixas etárias competem em sequência: Júnior primeiro, depois Pleno,
    // depois Sénior. Começamos pela primeira faixa que tiver equipas inscritas.
    const categoriesInPlay = AGE_CATEGORIES.filter(c => teams.some(t => t.ageCategory === c));
    const firstCategory = categoriesInPlay[0];
    const firstCategoryTeams = teams.filter(t => t.ageCategory === firstCategory);
    const shuffledFirstCategory = [...firstCategoryTeams].sort(() => Math.random() - 0.5);

    await updateGameState({
      status: 'waiting',
      round: 1,
      totalRounds: questionsPerTeam / 2,
      timerDuration: setupTimerDuration,
      gameMode: 'teams',
      currentTeamId: shuffledFirstCategory[0].id,
      currentQuestionId: null,
      revealed: false,
      turnQuestionIndex: 0,
      activeCategory: firstCategory,
      completedCategories: [],
      eliminatedTeamIds: [],
      tiebreak: null,
      categoryWinnerIds: {}
    });
  };

  // Picks the next competitor, always from the CURRENT active category
  // (gameState.activeCategory). Once every competitor in that category has
  // played all the rounds, that faixa's winner is settled and the game moves
  // on to the next faixa in order: Júnior → Pleno → Sénior. The game only
  // finishes once all 3 (or however many have teams) have a winner.
  // Used both by the manual "Sortear" button and automatically as soon as a
  // competitor finishes their 2 perguntas, so the projector already shows who
  // is up next without the presenter having to click anything.
  const advanceToNextCompetitor = async () => {
    const activeCategory = gameState.activeCategory;
    if (!activeCategory) return;

    const categoryTeams = teams.filter(t => t.ageCategory === activeCategory);

    // In current round, which competitors of THIS category have already
    // completed their turn (2 perguntas)?
    const answeredTeamIds = answers
      .filter(a => a.roundNumber === gameState.round)
      .map(a => a.teamId);

    const eligibleTeams = categoryTeams.filter(t => !answeredTeamIds.includes(t.id));

    if (eligibleTeams.length === 0) {
      // Everyone in this category has played this round.
      if (gameState.round >= gameState.totalRounds) {
        // Faixa concluída — o vencedor já está decidido (melhor colocado na
        // tabela); avança para a próxima faixa em jogo, ou termina o concurso
        // se esta era a última.
        const newCompletedCategories = [...(gameState.completedCategories || []), activeCategory];
        const categoriesInPlay = AGE_CATEGORIES.filter(c => teams.some(t => t.ageCategory === c));
        const remainingCategories = categoriesInPlay.filter(c => !newCompletedCategories.includes(c));

        if (remainingCategories.length === 0) {
          await updateGameState({
            status: 'finished',
            completedCategories: newCompletedCategories,
            currentQuestionId: null,
            revealed: false
          });
        } else {
          const nextCategory = remainingCategories[0];
          const nextCategoryTeams = teams.filter(t => t.ageCategory === nextCategory);
          const firstTeam = nextCategoryTeams[Math.floor(Math.random() * nextCategoryTeams.length)];

          await updateGameState({
            activeCategory: nextCategory,
            completedCategories: newCompletedCategories,
            round: 1,
            currentTeamId: firstTeam?.id || null,
            currentQuestionId: null,
            status: 'waiting',
            revealed: false,
            turnQuestionIndex: 0
          });
        }
      } else {
        // Next round — still within the same category
        const nextRound = gameState.round + 1;
        const firstTeam = categoryTeams[Math.floor(Math.random() * categoryTeams.length)];

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

    // Pick a random competitor still to play this round, within the same category
    const nextTeam = eligibleTeams[Math.floor(Math.random() * eligibleTeams.length)];
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

  // Manual override button — same logic as the automatic advance above.
  const handleDrawNextTeam = async () => {
    await advanceToNextCompetitor();
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

  // Move on after the answer has been revealed & scored. The competitor
  // answers 2 perguntas per turn — turnQuestionIndex tracks how many of those
  // 2 have been completed. As soon as the 2nd one is done, automatically draw
  // the next competitor (same category) so the projector already shows who's
  // up next, instead of waiting for the presenter to click a button.
  const handleContinue = async () => {
    const nextTurnIndex = (gameState.turnQuestionIndex || 0) + 1;

    if (nextTurnIndex >= 2) {
      await advanceToNextCompetitor();
    } else {
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
    }

    setSelectedQuestionId('');
  };

  // Reset/Re-evaluate entire competition
  const handleResetCompetition = async () => {
    if (window.confirm('Aviso Crítico: Deseja reiniciar TODO o concurso? Isto apagará o histórico de respostas, scores e desbloqueará as perguntas.')) {
      await resetGame();
    }
  };

  // --- TIE-BREAK FLOW ---
  // Only runs once the WHOLE contest has finished (every category has played
  // all its normal rounds), and only for a category whose 1st place is tied
  // on number of correct answers. Candidates take turns answering the same
  // question live; whoever is the lone correct answer wins the category. If
  // nobody (or more than one) gets it right, a fresh question is drawn among
  // the still-tied candidates and play continues.

  // Picks a random unused question from the category's bank. Already-used
  // questions (including ones used earlier in this same tie-break) are
  // naturally excluded since submitAnswer/updateQuestion always marks a used
  // question as `used: true`.
  const pickTiebreakQuestion = (category: AgeCategory): Question | null => {
    const pool = questions.filter(q => !q.used && q.ageCategory === category);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const handleStartTiebreak = async (category: AgeCategory, candidates: Team[]) => {
    const question = pickTiebreakQuestion(category);
    if (!question) {
      alert('Não há mais perguntas disponíveis nesta faixa etária para o desempate. Adicione perguntas ao Banco de Perguntas ou decida o vencedor manualmente com a organização.');
      return;
    }
    let shuffledOpts = [...question.options];
    if (question.type !== 'chronological' && question.type !== 'true_false') {
      shuffledOpts = [...question.options].sort(() => Math.random() - 0.5);
    }
    const tiebreak: TiebreakState = {
      category,
      candidateTeamIds: candidates.map(c => c.id),
      roundNum: 1,
      questionId: question.id,
      shuffledOptions: shuffledOpts,
      currentTeamId: candidates[0]?.id || null,
      answersByTeam: {},
      revealed: false,
      resolvedWinnerTeamId: null
    };
    await updateQuestion(question.id, { used: true });
    await updateGameState({ tiebreak });
    setTiebreakSelectedOption(null);
    setTiebreakChronoResult(null);
  };

  // Confirms the currently-up candidate's answer and passes the turn to the
  // next candidate who hasn't answered yet (or clears currentTeamId once
  // everyone has, so the presenter can reveal the result).
  const handleTiebreakConfirmAnswer = async () => {
    const tb = gameState.tiebreak;
    if (!tb || !tb.currentTeamId) return;
    const question = questions.find(q => q.id === tb.questionId);
    if (!question) return;

    if (question.type === 'chronological' && tiebreakChronoResult === null) {
      alert('Indique se a equipa acertou a ordem antes de confirmar!');
      return;
    }
    if (question.type !== 'chronological' && tiebreakSelectedOption === null) {
      alert('Selecione a opção respondida antes de confirmar!');
      return;
    }

    const answer: TiebreakAnswer = {
      selectedOptionIndex: question.type === 'chronological' ? null : tiebreakSelectedOption,
      chronologicalResult: question.type === 'chronological' ? tiebreakChronoResult : null
    };
    const newAnswers = { ...tb.answersByTeam, [tb.currentTeamId]: answer };
    const remaining = tb.candidateTeamIds.filter(id => !newAnswers[id]);

    await updateGameState({
      tiebreak: { ...tb, answersByTeam: newAnswers, currentTeamId: remaining[0] || null }
    });
    setTiebreakSelectedOption(null);
    setTiebreakChronoResult(null);
  };

  const handleTiebreakReveal = async () => {
    const tb = gameState.tiebreak;
    if (!tb) return;
    const question = questions.find(q => q.id === tb.questionId);

    // O desempate também conta para o total de respostas certas/erradas de
    // cada equipa (visível na tabela de jurados e nos resultados finais),
    // mas NÃO altera a pontuação — o desempate serve para decidir o
    // vencedor, não para somar pontos extra.
    if (question) {
      for (const teamId of tb.candidateTeamIds) {
        const ans = tb.answersByTeam[teamId];
        if (!ans) continue;
        const isCorrect = question.type === 'chronological'
          ? ans.chronologicalResult === true
          : ans.selectedOptionIndex === question.correctAnswer;
        const team = teams.find(t => t.id === teamId);
        await submitAnswer(
          teamId,
          question.id,
          isCorrect,
          0,
          9000 + tb.roundNum, // marcador distinto para não interferir na contagem das rodadas normais
          team?.memberNames?.[0] || team?.name,
          0
        );
      }
    }

    await updateGameState({ tiebreak: { ...tb, revealed: true } });
  };

  // Which candidates (still in the running) answered this round's question correctly
  const getTiebreakCorrectCandidates = (tb: TiebreakState, question: Question | undefined): string[] => {
    if (!question) return [];
    return tb.candidateTeamIds.filter(id => {
      const ans = tb.answersByTeam[id];
      if (!ans) return false;
      if (question.type === 'chronological') return ans.chronologicalResult === true;
      return ans.selectedOptionIndex === question.correctAnswer;
    });
  };

  // Exactly one correct candidate this round -> that's the category's official winner.
  const handleTiebreakConfirmWinner = async (category: AgeCategory, winnerTeamId: string) => {
    await updateGameState({
      categoryWinnerIds: { ...(gameState.categoryWinnerIds || {}), [category]: winnerTeamId },
      tiebreak: null
    });
  };

  // Nobody (or more than one) got it right -> draw a new question and try again
  // among whoever is still eligible (the correct ones, if any; otherwise everyone).
  const handleTiebreakNextRound = async () => {
    const tb = gameState.tiebreak;
    if (!tb) return;
    const question = questions.find(q => q.id === tb.questionId);
    const correctIds = getTiebreakCorrectCandidates(tb, question);
    const nextCandidateIds = correctIds.length > 0 ? correctIds : tb.candidateTeamIds;

    const nextQuestion = pickTiebreakQuestion(tb.category);
    if (!nextQuestion) {
      alert('Não há mais perguntas disponíveis nesta faixa etária para continuar o desempate. Escolha o vencedor manualmente combinando com a organização.');
      return;
    }
    let shuffledOpts = [...nextQuestion.options];
    if (nextQuestion.type !== 'chronological' && nextQuestion.type !== 'true_false') {
      shuffledOpts = [...nextQuestion.options].sort(() => Math.random() - 0.5);
    }

    await updateQuestion(nextQuestion.id, { used: true });
    await updateGameState({
      tiebreak: {
        category: tb.category,
        candidateTeamIds: nextCandidateIds,
        roundNum: tb.roundNum + 1,
        questionId: nextQuestion.id,
        shuffledOptions: shuffledOpts,
        currentTeamId: nextCandidateIds[0] || null,
        answersByTeam: {},
        revealed: false,
        resolvedWinnerTeamId: null
      }
    });
    setTiebreakSelectedOption(null);
    setTiebreakChronoResult(null);
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
                    {gameState.activeCategory && gameState.status !== 'finished' && (
                      <span className={`text-xs uppercase font-black px-2.5 py-1 rounded-lg border ${
                        gameState.activeCategory === 'junior' ? 'bg-sky-500/10 text-sky-300 border-sky-500/30' :
                        gameState.activeCategory === 'senior' ? 'bg-purple-500/10 text-purple-300 border-purple-500/30' :
                        'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      }`}>
                        Faixa em Disputa: {AGE_CATEGORY_LABELS[gameState.activeCategory]}
                      </span>
                    )}
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

                  {/* Sortear/Saltar concorrente — normalmente não é preciso: assim que o
                      concorrente da vez responde às 2 perguntas, o sistema avança
                      automaticamente. Este botão fica disponível como opção manual
                      (ex.: saltar um concorrente ausente). */}
                  {gameState.status === 'waiting' && !gameState.currentQuestionId && (
                    <button
                      onClick={handleDrawNextTeam}
                      className="flex items-center gap-1.5 text-xs bg-amber-500 text-slate-950 font-bold px-3 py-1.5 rounded-lg hover:bg-amber-400 transition-all cursor-pointer"
                    >
                      <Shuffle className="w-3.5 h-3.5" />
                      {activeTeam ? 'Saltar/Sortear Outro Concorrente' : 'Sortear Concorrente'}
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
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-400 text-xs">
                    Nenhuma equipa ativa no momento. Sorteie a próxima equipa acima.
                  </div>
                )}
              </div>

              {/* RESULTADOS FINAIS — vencedores por categoria e por turma. Só aparece
                  quando TODAS as categorias já jogaram todas as rodadas normais
                  (status === 'finished'). O vencedor é sempre quem tiver mais
                  respostas certas; havendo empate nesse critério, é preciso
                  resolver com uma pergunta de desempate antes de a categoria
                  ter um vencedor oficial. */}
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
                      {groupTeamsByCategory(teams).map(({ category, teams: catTeams }) => {
                        const winner = getCategoryWinner(category, catTeams, gameState.categoryWinnerIds);
                        const tiedTeams = getTiedTopTeams(catTeams);
                        const hasUnresolvedTie = !winner && tiedTeams.length > 1;
                        const tb = gameState.tiebreak;
                        const tbActiveForThisCategory = tb?.category === category;
                        const tbQuestion = tbActiveForThisCategory ? questions.find(q => q.id === tb!.questionId) : undefined;
                        const tbCorrectIds = tbActiveForThisCategory && tb ? getTiebreakCorrectCandidates(tb, tbQuestion) : [];
                        const tbTeamById = (id: string) => teams.find(t => t.id === id);
                        const tbCurrentTeam = tbActiveForThisCategory && tb?.currentTeamId ? tbTeamById(tb.currentTeamId) : null;
                        const tbEveryoneAnswered = tbActiveForThisCategory && tb ? tb.candidateTeamIds.every(id => !!tb.answersByTeam[id]) : false;

                        return (
                          <div key={category} className="rounded-2xl border border-slate-200 overflow-hidden">
                            <div className={`px-4 py-3 font-black text-display text-sm uppercase tracking-wide ${
                              category === 'junior' ? 'bg-sky-50 text-sky-700' :
                              category === 'senior' ? 'bg-purple-50 text-purple-700' :
                              'bg-emerald-50 text-emerald-700'
                            }`}>
                              {AGE_CATEGORY_LABELS[category]}
                            </div>
                            <div className="divide-y divide-slate-100">
                              {catTeams.map((t) => {
                                const isWinner = winner?.id === t.id;
                                const isTiedCandidate = hasUnresolvedTie && tiedTeams.some(tt => tt.id === t.id);
                                return (
                                  <div key={t.id} className={`p-3.5 flex items-center justify-between gap-3 ${isWinner ? 'bg-amber-50/60' : isTiedCandidate ? 'bg-rose-50/50' : ''}`}>
                                    <div className="flex items-center gap-3 min-w-0">
                                      <div className={`w-7 h-7 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-black ${
                                        isWinner ? 'bg-amber-400 text-slate-950' : 'bg-slate-100 text-slate-500'
                                      }`}>
                                        {isWinner ? <Trophy className="w-3.5 h-3.5" /> : isTiedCandidate ? <Swords className="w-3.5 h-3.5" /> : ''}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800 truncate flex items-center gap-1.5">
                                          {t.className || t.name}
                                          {isWinner && <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">Vencedor</span>}
                                          {isTiedCandidate && <span className="text-[9px] font-black uppercase text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded-full">Empatado</span>}
                                        </p>
                                        {t.teacherName && (
                                          <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                                            <GraduationCap className="w-3 h-3" /> {t.teacherName}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                      <p className="text-sm font-black text-slate-800">{t.correct} certa{t.correct === 1 ? '' : 's'}</p>
                                      <p className="text-[10px] text-slate-400">{t.score} pts • {t.wrong} erradas</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Aviso de empate + botão para iniciar o desempate */}
                            {hasUnresolvedTie && !tbActiveForThisCategory && (
                              <div className="p-3.5 bg-rose-50 border-t border-rose-200 space-y-2">
                                <p className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  Empate com {tiedTeams[0].correct} resposta{tiedTeams[0].correct === 1 ? '' : 's'} certa{tiedTeams[0].correct === 1 ? '' : 's'} entre {tiedTeams.length} equipas
                                </p>
                                <button
                                  onClick={() => handleStartTiebreak(category, tiedTeams)}
                                  className="w-full text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white py-2 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <Swords className="w-3.5 h-3.5" />
                                  Iniciar Pergunta de Desempate
                                </button>
                              </div>
                            )}

                            {/* Pergunta de desempate em curso */}
                            {tbActiveForThisCategory && tb && (
                              <div className="p-4 bg-slate-900 text-white space-y-3">
                                <p className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                                  <Swords className="w-3.5 h-3.5" />
                                  Desempate {tb.roundNum > 1 ? `— Rodada ${tb.roundNum}` : ''} • {tb.candidateTeamIds.length} equipa{tb.candidateTeamIds.length === 1 ? '' : 's'}
                                </p>

                                {tbQuestion && (
                                  <div className="bg-slate-800 rounded-xl p-3 space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-slate-400">{tbQuestion.lesson}</p>
                                    <p className="text-sm font-bold">{tbQuestion.question}</p>
                                  </div>
                                )}

                                {!tb.revealed ? (
                                  tbCurrentTeam ? (
                                    <div className="space-y-2">
                                      <p className="text-xs text-amber-300 font-bold">Vez de: {tbCurrentTeam.memberNames?.[0] || tbCurrentTeam.name}</p>
                                      {tbQuestion?.type === 'chronological' ? (
                                        <div className="flex gap-2">
                                          <button onClick={() => setTiebreakChronoResult(true)} className={`flex-1 text-xs font-bold py-2 rounded-lg cursor-pointer ${tiebreakChronoResult === true ? 'bg-emerald-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}>
                                            Ordem Correta
                                          </button>
                                          <button onClick={() => setTiebreakChronoResult(false)} className={`flex-1 text-xs font-bold py-2 rounded-lg cursor-pointer ${tiebreakChronoResult === false ? 'bg-rose-500 text-slate-950' : 'bg-slate-700 text-slate-200'}`}>
                                            Ordem Errada
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="grid grid-cols-1 gap-1.5">
                                          {tb.shuffledOptions.map((opt, idx) => {
                                            const originalIdx = tbQuestion?.options.indexOf(opt) ?? -1;
                                            return (
                                              <button
                                                key={idx}
                                                onClick={() => setTiebreakSelectedOption(originalIdx)}
                                                className={`text-left text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer ${tiebreakSelectedOption === originalIdx ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-200'}`}
                                              >
                                                {String.fromCharCode(65 + idx)}. {opt}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                      <button
                                        onClick={handleTiebreakConfirmAnswer}
                                        className="w-full text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 py-2 rounded-lg cursor-pointer"
                                      >
                                        Confirmar Resposta
                                      </button>
                                    </div>
                                  ) : tbEveryoneAnswered ? (
                                    <button
                                      onClick={handleTiebreakReveal}
                                      className="w-full text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-2.5 rounded-lg cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Revelar Resultado do Desempate
                                    </button>
                                  ) : null
                                ) : (
                                  <div className="space-y-2">
                                    <p className="text-[11px] text-slate-400">
                                      Resposta correta: {tbQuestion?.type === 'chronological'
                                        ? 'ordem apresentada corretamente'
                                        : tbQuestion?.options[Number(tbQuestion?.correctAnswer)]}
                                    </p>
                                    <div className="space-y-1">
                                      {tb.candidateTeamIds.map(id => {
                                        const t = tbTeamById(id);
                                        const wasCorrect = tbCorrectIds.includes(id);
                                        return (
                                          <p key={id} className={`text-xs font-semibold flex items-center gap-1.5 ${wasCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {wasCorrect ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                                            {t?.memberNames?.[0] || t?.name}
                                          </p>
                                        );
                                      })}
                                    </div>
                                    {tbCorrectIds.length === 1 ? (
                                      <button
                                        onClick={() => handleTiebreakConfirmWinner(category, tbCorrectIds[0])}
                                        className="w-full text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 py-2.5 rounded-lg cursor-pointer flex items-center justify-center gap-1.5"
                                      >
                                        <Trophy className="w-3.5 h-3.5" />
                                        Confirmar {tbTeamById(tbCorrectIds[0])?.memberNames?.[0] || tbTeamById(tbCorrectIds[0])?.name} como Vencedor(a)
                                      </button>
                                    ) : (
                                      <button
                                        onClick={handleTiebreakNextRound}
                                        className="w-full text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-lg cursor-pointer flex items-center justify-center gap-1.5"
                                      >
                                        <Swords className="w-3.5 h-3.5" />
                                        {tbCorrectIds.length === 0 ? 'Ninguém acertou — Nova Pergunta' : 'Ainda empatados — Nova Pergunta'}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
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
                          <div className="flex flex-wrap justify-between items-center gap-1 text-xs text-slate-500 font-bold">
                            <span className="uppercase">Dificuldade: {q.difficulty} • Pontos: {q.points}</span>
                            <span className="uppercase">Tipo: {q.type}</span>
                          </div>
                          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5" /> Lição: {q.lesson}
                          </p>
                          <p className="font-bold text-slate-800 text-display text-sm">{q.question}</p>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5">
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
                                  <span className="font-bold opacity-60 flex-shrink-0">{String.fromCharCode(65 + oIdx)})</span>
                                  <span className="break-words">{opt}</span>
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
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 flex items-center justify-center gap-1">
                      <BookOpen className="w-3.5 h-3.5" /> Lição: {activeQuestion.lesson}
                    </p>
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
                              className={`text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-start justify-between gap-2 transition-all cursor-pointer ${
                                isRevealed && isCorrectOpt
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                  : isRevealed && isSelected && !isCorrectOpt
                                  ? 'border-rose-500 bg-rose-50 text-rose-800'
                                  : isSelected
                                  ? 'border-blue-500 bg-blue-50 text-blue-800'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              <span className="break-words">{String.fromCharCode(65 + idx)}) {opt}</span>
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
