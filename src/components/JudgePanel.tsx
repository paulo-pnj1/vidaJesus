import React, { useState, useEffect } from 'react';
import { GameState, Question, Team } from '../types';
import { subscribeToGameState, subscribeToTeams, subscribeToQuestions, submitJudgeVote } from '../lib/gameService';
import { Check, X, ShieldAlert, User, Scale, Activity, Star } from 'lucide-react';

export default function JudgePanel() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [judgeName, setJudgeName] = useState<string>('');
  const [isNameSaved, setIsNameSaved] = useState<boolean>(false);
  const [voted, setVoted] = useState<'correct' | 'incorrect' | null>(null);

  // Load judge name from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('bible_judge_name');
    if (saved) {
      setJudgeName(saved);
      setIsNameSaved(true);
    }
  }, []);

  // Listen to game state
  useEffect(() => {
    const unsubscribeState = subscribeToGameState((state) => {
      setGameState(state);
    });

    const unsubscribeTeams = subscribeToTeams((loadedTeams) => {
      setTeams(loadedTeams);
    });

    const unsubscribeQuestions = subscribeToQuestions((loadedQuestions) => {
      setQuestions(loadedQuestions);
    });

    return () => {
      unsubscribeState();
      unsubscribeTeams();
      unsubscribeQuestions();
    };
  }, []);

  // Reset vote when current question or team changes
  useEffect(() => {
    setVoted(null);
  }, [gameState?.currentQuestionId, gameState?.currentTeamId]);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (judgeName.trim()) {
      localStorage.setItem('bible_judge_name', judgeName.trim());
      setIsNameSaved(true);
    }
  };

  const handleVote = async (isCorrect: boolean) => {
    if (!isNameSaved || !judgeName.trim()) return;
    try {
      await submitJudgeVote(judgeName.trim(), isCorrect);
      setVoted(isCorrect ? 'correct' : 'incorrect');
    } catch (err: any) {
      alert('Erro ao enviar voto: ' + err.message);
    }
  };

  if (!isNameSaved) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Scale className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-slate-800 text-display">Painel de Jurados</h2>
            <p className="text-sm text-slate-500">Identifique-se para validar as respostas do concurso ao vivo.</p>
          </div>
          
          <form onSubmit={handleSaveName} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Seu Nome de Jurado</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={judgeName}
                  onChange={(e) => setJudgeName(e.target.value)}
                  placeholder="Ex: Pastor Carlos / Profª Sandra"
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:bg-white focus:border-blue-500 transition-all"
                  required
                />
              </div>
            </div>
            
            <button
              type="submit"
              className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all text-display"
            >
              Entrar como Jurado
            </button>
          </form>
        </div>
      </div>
    );
  }

  const activeQuestion = questions.find(q => q.id === gameState?.currentQuestionId);
  const activeTeam = teams.find(t => t.id === gameState?.currentTeamId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Scale className="w-6 h-6 text-blue-400" />
          <div>
            <h1 className="text-lg font-bold text-display tracking-tight">Painel de Decisão</h1>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Conectado como: <strong className="text-blue-400">{judgeName}</strong>
            </div>
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('bible_judge_name');
            setIsNameSaved(false);
          }}
          className="text-xs text-slate-400 hover:text-white underline"
        >
          Sair
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-2xl mx-auto w-full">
        {!gameState || gameState.status === 'setup' || gameState.status === 'finished' || !activeQuestion || !activeTeam ? (
          <div className="text-center space-y-4 py-12">
            <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto">
              <Activity className="w-8 h-8 text-slate-500 animate-pulse" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-300">Aguardando início do jogo...</h3>
              <p className="text-xs text-slate-500 max-w-md">O apresentador do concurso precisa iniciar o jogo e selecionar uma pergunta para ser julgada.</p>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-6">
            
            {/* Active Info */}
            <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800 text-center space-y-3">
              <p className="text-xs uppercase font-bold tracking-wider text-slate-400">Equipa a Responder Agora</p>
              <h2 className="text-3xl font-black text-display text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">
                {activeTeam.name}
              </h2>
              {gameState.currentMemberName && (
                <p className="text-sm text-slate-300">
                  Respondente: <strong className="text-white font-semibold">{gameState.currentMemberName}</strong>
                </p>
              )}
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800 text-slate-300 text-[11px] rounded-full">
                <span>Rodada {gameState.round} de {gameState.totalRounds}</span>
                <span>•</span>
                <span className="text-amber-400 font-bold">{activeQuestion.points} Pontos em disputa</span>
              </div>
            </div>

            {/* Question Details */}
            <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800/80 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-950/80 text-blue-400 border border-blue-900/50 rounded uppercase">
                  {activeQuestion.lesson}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Tipo: {activeQuestion.type === 'multiple_choice' ? 'Múltipla Escolha' : 
                         activeQuestion.type === 'true_false' ? 'Verdadeiro ou Falso' :
                         activeQuestion.type === 'who_am_i' ? 'Quem sou eu?' :
                         activeQuestion.type === 'incomplete_verse' ? 'Versículo Incompleto' : 'Ordem Cronológica'}
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-200 text-display">
                {activeQuestion.question}
              </h3>

              {/* Show correct answer to Judge! */}
              <div className="bg-blue-950/40 border border-blue-900/50 p-4 rounded-xl space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-blue-400 font-bold">
                  <ShieldAlert className="w-4 h-4" />
                  <span>RESPOSTA CORRETA (Visível apenas para Jurados/Apresentador)</span>
                </div>
                <p className="text-sm text-white font-semibold pl-5">
                  {activeQuestion.type === 'true_false' ? (
                    activeQuestion.correctAnswer === 0 ? 'Verdadeiro' : 'Falso'
                  ) : activeQuestion.type === 'chronological' ? (
                    <span className="space-y-1 block">
                      {activeQuestion.options.map((opt: string, idx: number) => (
                        <span key={idx} className="block text-xs text-slate-300">
                          {idx + 1}º) {opt}
                        </span>
                      ))}
                    </span>
                  ) : (
                    activeQuestion.options[activeQuestion.correctAnswer] || '---'
                  )}
                </p>
              </div>
            </div>

            {/* Voting buttons */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-center text-slate-400 uppercase tracking-wider">A sua validação</h4>
              
              {voted ? (
                <div className={`p-4 rounded-xl border text-center font-bold ${
                  voted === 'correct' 
                    ? 'bg-emerald-950/50 border-emerald-800 text-emerald-400' 
                    : 'bg-rose-950/50 border-rose-800 text-rose-400'
                }`}>
                  {voted === 'correct' ? 'Votou: CORRETO (✔)' : 'Votou: INCORRETO (✖)'}
                  <p className="text-xs font-medium text-slate-400 mt-1">Pode alterar o seu voto clicando nos botões abaixo se necessário.</p>
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center italic">Aguardando a resposta da equipa para votar...</p>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  onClick={() => handleVote(true)}
                  className={`py-4 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all shadow-md cursor-pointer ${
                    voted === 'correct'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-800/80'
                  }`}
                >
                  <Check className="w-8 h-8" />
                  <span className="font-bold text-sm text-display">CORRETO</span>
                </button>

                <button
                  onClick={() => handleVote(false)}
                  className={`py-4 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all shadow-md cursor-pointer ${
                    voted === 'incorrect'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 border border-rose-800/80'
                  }`}
                >
                  <X className="w-8 h-8" />
                  <span className="font-bold text-sm text-display">ERRADO</span>
                </button>
              </div>
            </div>

          </div>
        )}
      </main>

      {/* FOOTER / REAL-TIME LEADERBOARD */}
      {gameState && teams.length > 0 && (
        <footer className="bg-slate-900/60 border-t border-slate-800/80 backdrop-blur-md p-4 space-y-2">
          <div className="max-w-2xl mx-auto w-full space-y-2">
            <div className="flex justify-between items-center border-b border-slate-800/80 pb-2">
              <span className="text-[10px] uppercase font-black tracking-widest text-slate-400 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-current" /> Tabela de Classificação em Tempo Real
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Sincronizado automaticamente</span>
            </div>

            <div className="flex flex-wrap gap-3">
              {teams.map((t, idx) => {
                const isEliminated = gameState.eliminatedTeamIds?.includes(t.id);
                const isActive = gameState.currentTeamId === t.id;
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border transition-all ${
                      isEliminated ? 'bg-slate-950 border-slate-900 text-slate-600 opacity-40 line-through' :
                      isActive
                        ? 'bg-amber-400/10 border-amber-500/30 text-amber-400 shadow-sm shadow-amber-500/5'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300'
                    }`}
                  >
                    <span className="font-mono text-[10px] font-bold opacity-60">
                      {idx + 1}º
                    </span>
                    <strong className="text-xs font-semibold">{t.name}</strong>
                    <span className="text-[10px] opacity-80 font-bold bg-slate-800 px-1.5 py-0.5 rounded text-white font-mono">
                      {t.score} pts
                    </span>
                    {!isEliminated && t.correct + t.wrong > 0 && (
                      <span className="text-[9px] text-slate-400">
                        ({Math.round((t.correct / (t.correct + t.wrong)) * 100)}%)
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </footer>
      )}
    </div>
  );
}
