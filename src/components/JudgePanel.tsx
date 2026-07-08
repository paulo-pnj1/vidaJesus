import React, { useState, useEffect, useMemo } from 'react';
import { GameState, Team, Answer, Question } from '../types';
import { subscribeToGameState, subscribeToTeams, subscribeToAnswers, subscribeToQuestions, compareTeams } from '../lib/gameService';
import { Trophy, Scale, ChevronDown, CheckCircle2, XCircle } from 'lucide-react';

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
  const [openRounds, setOpenRounds] = useState<Set<number>>(new Set());

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

  const teamsById = useMemo(() => {
    const map = new Map<string, Team>();
    teams.forEach((t) => map.set(t.id, t));
    return map;
  }, [teams]);

  const questionsById = useMemo(() => {
    const map = new Map<string, Question>();
    questions.forEach((q) => map.set(q.id, q));
    return map;
  }, [questions]);

  // Group answers by round, keeping only the first occurrence of each question per round
  // (answers arrive already sorted by timestamp asc from subscribeToAnswers).
  const roundsBreakdown = useMemo(() => {
    const byRound = new Map<number, { questionId: string; answers: Answer[] }[]>();
    answers.forEach((a) => {
      const list = byRound.get(a.roundNumber) || [];
      let entry = list.find((e) => e.questionId === a.questionId);
      if (!entry) {
        entry = { questionId: a.questionId, answers: [] };
        list.push(entry);
      }
      entry.answers.push(a);
      byRound.set(a.roundNumber, list);
    });
    return Array.from(byRound.entries()).sort((a, b) => a[0] - b[0]);
  }, [answers]);

  const toggleRound = (round: number) => {
    setOpenRounds((prev) => {
      const next = new Set(prev);
      if (next.has(round)) next.delete(round);
      else next.add(round);
      return next;
    });
  };

  // Ranking: ver compareTeams() em gameService.ts para a ordem de critérios/desempates
  const ranked = [...teams].sort(compareTeams);

  const winner = ranked.length > 0 ? ranked[0] : null;
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
      <main className="flex-1 p-6 max-w-6xl mx-auto w-full">
        {ranked.length === 0 ? (
          <div className="text-center py-24 space-y-3">
            <div className="w-16 h-16 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto">
              <Trophy className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-300">Aguardando registo das equipas...</h3>
            <p className="text-xs text-slate-500">A tabela aparece automaticamente assim que o apresentador criar as equipas.</p>
          </div>
        ) : (
          <div className="space-y-3 mt-4">
            {gameFinished && winner && (
              <div className="bg-gradient-to-r from-amber-500/20 to-amber-400/5 border border-amber-500/40 rounded-2xl p-5 flex items-center gap-4">
                <Trophy className="w-10 h-10 text-amber-400 flex-shrink-0" />
                <div>
                  <p className="text-xs uppercase font-bold tracking-wider text-amber-400">Grupo Vencedor</p>
                  <h2 className="text-2xl font-black text-display">{winner.name}</h2>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Melhor aproveitamento: {winner.correct + winner.wrong > 0 ? Math.round((winner.correct / (winner.correct + winner.wrong)) * 100) : 0}%
                  </p>
                </div>
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <div className="col-span-1">#</div>
                <div className="col-span-3">Grupo</div>
                <div className="col-span-2 text-center text-amber-400">Aproveit. ★</div>
                <div className="col-span-1 text-center">Acertos</div>
                <div className="col-span-1 text-center">Erros</div>
                <div className="col-span-2 text-center">Tempo Médio</div>
                <div className="col-span-2 text-center">Total Acertos</div>
              </div>

              {ranked.map((t, idx) => {
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
                    <div className="col-span-3 flex items-center gap-2">
                      {isLeader && !isEliminated && <Trophy className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                      <span className="font-bold text-sm truncate">{t.name}</span>
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

            <div className="text-center pt-2">
              <span className="text-[10px] text-slate-500 font-mono">
                ★ Classificação por Aproveitamento (%) • Desempate: Pontuação → Acertos → Menos Erros → Tempo Médio • Sincronizado automaticamente
              </span>
            </div>

            {/* Respostas Certas por Ronda */}
            {roundsBreakdown.length > 0 && (
              <div className="space-y-2 pt-4">
                <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider px-1">
                  Respostas Certas por Ronda
                </h2>
                {roundsBreakdown.map(([round, entries]) => {
                  const isOpen = openRounds.has(round);
                  return (
                    <div key={round} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                      <button
                        onClick={() => toggleRound(round)}
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-800/50 transition-colors"
                      >
                        <span className="font-bold text-sm text-slate-200">Ronda {round}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-500 font-mono">
                            {entries.length} pergunta{entries.length !== 1 ? 's' : ''}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </span>
                      </button>

                      {isOpen && (
                        <div className="border-t border-slate-800 divide-y divide-slate-800/60">
                          {entries.map(({ questionId, answers: qAnswers }, qIdx) => {
                            const question = questionsById.get(questionId);
                            if (!question) return null;
                            return (
                              <div key={questionId} className="px-5 py-4">
                                <p className="text-[11px] text-slate-500 font-mono mb-1">
                                  Pergunta {qIdx + 1} • {question.lesson} • {question.points} pts
                                </p>
                                <p className="text-sm text-slate-200 font-medium mb-2">{question.question}</p>
                                <p className="text-sm text-emerald-400 font-bold mb-2">
                                  ✓ {getCorrectAnswerText(question)}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {qAnswers.map((a) => {
                                    const team = teamsById.get(a.teamId);
                                    return (
                                      <span
                                        key={a.id}
                                        className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-lg border ${
                                          a.isCorrect
                                            ? 'border-emerald-800 bg-emerald-500/10 text-emerald-300'
                                            : 'border-rose-800 bg-rose-500/10 text-rose-300'
                                        }`}
                                      >
                                        {a.isCorrect ? (
                                          <CheckCircle2 className="w-3 h-3" />
                                        ) : (
                                          <XCircle className="w-3 h-3" />
                                        )}
                                        {team?.name || a.teamId}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
