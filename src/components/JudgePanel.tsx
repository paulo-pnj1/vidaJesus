import React, { useState, useEffect, useMemo } from 'react';
import { GameState, Team, Answer, Question, AGE_CATEGORY_LABELS } from '../types';
import { subscribeToGameState, subscribeToTeams, subscribeToAnswers, subscribeToQuestions, compareTeams, groupTeamsByCategory } from '../lib/gameService';
import { Trophy, Scale, HelpCircle, CheckCircle, Flame } from 'lucide-react';

// Returns the human-readable text of a question's correct option(s), regardless of type.
// - multiple_choice / true_false / who_am_i / incomplete_verse: correctAnswer is an index into options.
// - chronological: correctAnswer is an array of indexes representing the correct order.
function getCorrectAnswerText(q: Question): string {
  if (q.type === 'chronological' && Array.isArray(q.correctAnswer)) {
    return q.correctAnswer
      .map((idx: number) => q.options[idx])
      .filter(Boolean)
      .join('  →  ');
  }
  const idx = Number(q.correctAnswer);
  return q.options?.[idx] ?? '—';
}

export default function JudgePanel() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);

  useEffect(() => {
    const unsubscribeState = subscribeToGameState(setGameState);
    const unsubscribeTeams = subscribeToTeams(setTeams);
    const unsubscribeAnswers = subscribeToAnswers(setAnswers);
    const unsubscribeQuestions = subscribeToQuestions(setQuestions);
    return () => {
      unsubscribeState();
      unsubscribeTeams();
      unsubscribeAnswers();
      unsubscribeQuestions();
    };
  }, []);

  // Pergunta e equipa atualmente em jogo — exatamente a mesma que está a ser
  // mostrada no painel do projetor, mas aqui a resposta certa aparece já destacada.
  const activeQuestion = useMemo(
    () => questions.find((q) => q.id === gameState?.currentQuestionId) || null,
    [questions, gameState?.currentQuestionId]
  );
  const activeTeam = useMemo(
    () => teams.find((t) => t.id === gameState?.currentTeamId) || null,
    [teams, gameState?.currentTeamId]
  );
  const showActiveQuestionStage = !!gameState && gameState.status !== 'setup' && gameState.status !== 'finished';

  // Classificação separada por faixa etária — ver compareTeams() em gameService.ts
  // para a ordem de critérios/desempates dentro de cada faixa.
  const groups = groupTeamsByCategory(teams);
  const gameFinished = gameState?.status === 'finished';

  const formatAvgTime = (t: Team) => {
    const total = t.correct + t.wrong;
    if (!total || !t.totalAnswerTimeMs) return '—';
    return `${(t.totalAnswerTimeMs / total / 1000).toFixed(1)}s`;
  };

  // Sum response time of CORRECT answers only, computed straight from the answer log
  // (more reliable than the incremental team field, since it also covers answers
  // recorded before that field existed).
  const getCorrectAnswerTimeMs = (teamId: string) => {
    return answers
      .filter((a) => a.teamId === teamId && a.isCorrect)
      .reduce((sum, a) => sum + (a.answerTimeMs || 0), 0);
  };

  const hasCorrectAnswers = (teamId: string) => answers.some((a) => a.teamId === teamId && a.isCorrect);

  // Total (sum) time spent on CORRECT answers only, formatted as m:ss when it reaches 60s+
  const formatTotalCorrectTime = (t: Team) => {
    if (!hasCorrectAnswers(t.id)) return '—';
    const totalSeconds = getCorrectAnswerTimeMs(t.id) / 1000;
    if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.round(totalSeconds % 60);
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-3">
        <Scale className="w-6 h-6 text-blue-400" />
        <h1 className="text-lg font-bold text-display tracking-tight">Tabela de Classificação em Tempo Real</h1>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Ao vivo
        </span>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full space-y-6">

        {/* PERGUNTA ATUAL — espelha o painel do projetor, com a resposta certa já destacada */}
        {showActiveQuestionStage && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider px-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Pergunta Atual (Ronda {gameState?.round} de {gameState?.totalRounds})
              {gameState?.activeCategory && (
                <span className="text-blue-400 bg-blue-950/50 border border-blue-900/50 px-2 py-0.5 rounded-full normal-case font-bold tracking-normal text-[10px]">
                  Faixa {AGE_CATEGORY_LABELS[gameState.activeCategory]} em disputa
                </span>
              )}
            </h2>

            {activeTeam && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl px-5 py-3 flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl flex items-center justify-center font-black text-sm text-display flex-shrink-0">
                  {(activeTeam.memberNames?.[0] || activeTeam.name).substr(0, 2).toUpperCase()}
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1">
                    <Flame className="w-3 h-3 fill-current" /> Concorrente a responder agora
                  </span>
                  <p className="text-sm font-bold text-white">
                    {gameState?.currentMemberName || activeTeam.memberNames?.[0] || activeTeam.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Turma {activeTeam.className || activeTeam.name}
                    {activeTeam.teacherName && <span> • Prof. {activeTeam.teacherName}</span>}
                  </p>
                </div>
                <span className="ml-auto text-[10px] font-black uppercase tracking-wider bg-blue-950/50 border border-blue-900/50 text-blue-400 px-2.5 py-1 rounded-full">
                  {AGE_CATEGORY_LABELS[activeTeam.ageCategory]}
                </span>
              </div>
            )}

            {activeQuestion ? (
              <div className="space-y-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <span className="text-xs font-black uppercase tracking-widest text-blue-400 bg-blue-950/50 border border-blue-900/50 px-3 py-1 rounded-full">
                      Lição: {activeQuestion.lesson}
                    </span>
                    <span className="text-xs font-bold text-amber-400 font-mono">
                      VALE {activeQuestion.points} PONTOS
                    </span>
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-100 text-display leading-tight">
                    {activeQuestion.question}
                  </h3>
                </div>

                {activeQuestion.type === 'chronological' ? (
                  <div className="bg-emerald-950/30 border border-emerald-800 rounded-2xl p-5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-2">Ordem Correta</p>
                    <p className="text-base font-bold text-emerald-200">{getCorrectAnswerText(activeQuestion)}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(gameState?.shuffledOptions || activeQuestion.options).map((opt, idx) => {
                      const originalIdx = activeQuestion.options.indexOf(opt);
                      const isCorrectOption = Number(activeQuestion.correctAnswer) === originalIdx;
                      return (
                        <div
                          key={idx}
                          className={`p-4 rounded-xl border-2 flex items-center gap-3 ${
                            isCorrectOption
                              ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200'
                              : 'border-slate-800 bg-slate-900 text-slate-300'
                          }`}
                        >
                          <span
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs flex-shrink-0 ${
                              isCorrectOption ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {String.fromCharCode(65 + idx)}
                          </span>
                          <span className="text-sm font-bold">{opt}</span>
                          {isCorrectOption && <CheckCircle className="w-5 h-5 text-emerald-400 ml-auto flex-shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
                <HelpCircle className="w-8 h-8 text-amber-500 mx-auto animate-pulse" />
                <p className="text-sm text-slate-400">Aguardando a próxima pergunta ser lançada pelo apresentador...</p>
              </div>
            )}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="text-center py-24 space-y-3">
            <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto">
              <Trophy className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-300">Aguardando registo das equipas...</h3>
            <p className="text-xs text-slate-500">A tabela aparece automaticamente assim que o apresentador criar as equipas.</p>
          </div>
        ) : (
          <div className="space-y-8 mt-4">
            {groups.map(({ category, teams: groupTeams }) => {
              const winner = groupTeams[0] || null;
              const categoryCompleted = gameState?.completedCategories?.includes(category) || gameFinished;
              const categoryIsActive = gameState?.activeCategory === category && !categoryCompleted;
              return (
                <div key={category} className="space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-widest text-blue-400 px-1 flex items-center gap-2">
                    Faixa {AGE_CATEGORY_LABELS[category]}
                    <span className="text-slate-500 font-mono font-normal normal-case">({groupTeams.length} equipa{groupTeams.length > 1 ? 's' : ''})</span>
                    {categoryIsActive && (
                      <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-2 py-0.5 rounded-full normal-case">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Em disputa agora
                      </span>
                    )}
                    {categoryCompleted && (
                      <span className="text-[10px] font-black uppercase tracking-wide text-amber-400 bg-amber-950/40 border border-amber-800 px-2 py-0.5 rounded-full normal-case">
                        Concluída
                      </span>
                    )}
                  </h3>

                  {categoryCompleted && winner && (
                    <div className="bg-gradient-to-r from-amber-500/20 to-amber-400/5 border border-amber-500/40 rounded-2xl p-5 flex items-center gap-4">
                      <Trophy className="w-10 h-10 text-amber-400 flex-shrink-0" />
                      <div>
                        <p className="text-xs uppercase font-bold tracking-wider text-amber-400">Vencedor — Faixa {AGE_CATEGORY_LABELS[category]}</p>
                        <h2 className="text-2xl font-black text-display">{winner.memberNames?.[0] || winner.name}</h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Turma {winner.className || winner.name}
                          {winner.teacherName && <span> • Prof. {winner.teacherName}</span>}
                        </p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          Melhor aproveitamento: {winner.correct + winner.wrong > 0 ? Math.round((winner.correct / (winner.correct + winner.wrong)) * 100) : 0}%
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                    <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      <div className="col-span-1">#</div>
                      <div className="col-span-3">Concorrente</div>
                      <div className="col-span-2 text-center text-amber-400">Aproveit. ★</div>
                      <div className="col-span-1 text-center">Acertos</div>
                      <div className="col-span-1 text-center">Erros</div>
                      <div className="col-span-2 text-center">Tempo Médio</div>
                      <div className="col-span-2 text-center">Total Acertos</div>
                    </div>

                    {groupTeams.map((t, idx) => {
                      const total = t.correct + t.wrong;
                      const rate = total > 0 ? Math.round((t.correct / total) * 100) : 0;
                      const isLeader = idx === 0;
                      const isEliminated = gameState?.eliminatedTeamIds?.includes(t.id);
                      return (
                        <div
                          key={t.id}
                          className={`grid grid-cols-12 gap-2 px-5 py-4 items-center border-b border-slate-800/60 last:border-b-0 ${
                            isEliminated ? 'opacity-40 line-through' :
                            isLeader ? 'bg-amber-400/5' : ''
                          }`}
                        >
                          <div className="col-span-1 font-mono text-sm font-bold text-slate-500">
                            {idx + 1}º
                          </div>
                          <div className="col-span-3 flex items-center gap-2 min-w-0">
                            {isLeader && !isEliminated && <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                            <span className="font-bold text-sm truncate">{t.memberNames?.[0] || t.name}</span>
                          </div>
                          <div className="col-span-2 text-center">
                            <span className={`font-mono text-base font-black ${isLeader && !isEliminated ? 'text-amber-400' : 'text-white'}`}>
                              {rate}%
                            </span>
                          </div>
                          <div className="col-span-1 text-center font-mono text-sm text-emerald-400 font-bold">{t.correct}</div>
                          <div className="col-span-1 text-center font-mono text-sm text-rose-400 font-bold">{t.wrong}</div>
                          <div className="col-span-2 text-center font-mono text-xs text-slate-300">{formatAvgTime(t)}</div>
                          <div className="col-span-2 text-center font-mono text-xs text-sky-300 font-bold">{formatTotalCorrectTime(t)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="text-center pt-2">
              <span className="text-[10px] text-slate-500 font-mono">
                ★ Classificação por Aproveitamento (%) • Desempate: Pontuação → Acertos → Menos Erros → Tempo Médio • Sincronizado automaticamente
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
