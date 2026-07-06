import React, { useState, useEffect } from 'react';
import { GameState, Team, Answer } from '../types';
import { subscribeToGameState, subscribeToTeams, subscribeToAnswers } from '../lib/gameService';
import { Trophy, Scale } from 'lucide-react';

export default function JudgePanel() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);

  useEffect(() => {
    const unsubscribeState = subscribeToGameState(setGameState);
    const unsubscribeTeams = subscribeToTeams(setTeams);
    const unsubscribeAnswers = subscribeToAnswers(setAnswers);
    return () => {
      unsubscribeState();
      unsubscribeTeams();
      unsubscribeAnswers();
    };
  }, []);

  // Ranking: by score, then by % aproveitamento, then by number of correct answers
  const ranked = [...teams].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTotal = a.correct + a.wrong;
    const bTotal = b.correct + b.wrong;
    const aRate = aTotal > 0 ? a.correct / aTotal : 0;
    const bRate = bTotal > 0 ? b.correct / bTotal : 0;
    if (bRate !== aRate) return bRate - aRate;
    return b.correct - a.correct;
  });

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
                </div>
              </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-slate-900/80 border-b border-slate-800 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                <div className="col-span-1">#</div>
                <div className="col-span-3">Grupo</div>
                <div className="col-span-1 text-center">Acertos</div>
                <div className="col-span-1 text-center">Erros</div>
                <div className="col-span-2 text-center">Tempo Médio</div>
                <div className="col-span-2 text-center">Total Acertos</div>
                <div className="col-span-2 text-center">Aproveit.</div>
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
                    <div className="col-span-1 text-center font-mono text-sm text-emerald-400 font-bold">{t.correct}</div>
                    <div className="col-span-1 text-center font-mono text-sm text-rose-400 font-bold">{t.wrong}</div>
                    <div className="col-span-2 text-center font-mono text-xs text-slate-300">{formatAvgTime(t)}</div>
                    <div className="col-span-2 text-center font-mono text-xs text-sky-300 font-bold">{formatTotalCorrectTime(t)}</div>
                    <div className="col-span-2 text-center">
                      <span className="font-mono text-sm font-bold">{rate}%</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="text-center pt-2">
              <span className="text-[10px] text-slate-500 font-mono">Pontuação total: score acumulado por respostas certas • Sincronizado automaticamente</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
