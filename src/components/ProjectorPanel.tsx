import React, { useState, useEffect, useRef } from 'react';
import { GameState, Question, Team, Answer, AGE_CATEGORY_LABELS } from '../types';
import { subscribeToTeams, subscribeToQuestions, subscribeToAnswers, compareTeams, groupTeamsByCategory, getCategoryWinner, getTiedTopTeams } from '../lib/gameService';
import { Award, Timer, Trophy, CheckCircle, XCircle, Users, HelpCircle, ArrowUpRight, Flame, Swords } from 'lucide-react';
import confetti from 'canvas-confetti';

interface ProjectorPanelProps {
  gameState: GameState;
}

export default function ProjectorPanel({ gameState }: ProjectorPanelProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [timeLeft, setTimeLeft] = useState<number>(gameState.timerDuration);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Audio refs or dynamic sound generator (using Web Audio API to avoid external asset dependency - ultra stable!)
  const playBeep = (freq: number, duration: number) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Ignored if browser blocks audio
    }
  };

  // Audio files for correct/wrong answer feedback, placed in /public/audio
  const correctSoundRef = useRef<HTMLAudioElement | null>(null);
  const wrongSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    correctSoundRef.current = new Audio('/audio/resposta-certa.mp3');
    wrongSoundRef.current = new Audio('/audio/resposta-errada.mp3');
    correctSoundRef.current.preload = 'auto';
    wrongSoundRef.current.preload = 'auto';
  }, []);

  const playResultSound = (isCorrect: boolean) => {
    // Stop the main "pergunta lançada" music as soon as the result is known;
    // it will only play again when the next question is launched.
    try {
      const mainAudio = questionLaunchSoundRef.current;
      if (mainAudio) {
        mainAudio.pause();
        mainAudio.currentTime = 0;
      }
    } catch (e) {
      // Ignored if browser blocks audio
    }

    try {
      const audio = isCorrect ? correctSoundRef.current : wrongSoundRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {
          // Autoplay blocked or file missing - silently ignore
        });
      }
    } catch (e) {
      // Ignored if browser blocks audio
    }
  };

  // Audio played on the projector the moment a new question is launched
  const questionLaunchSoundRef = useRef<HTMLAudioElement | null>(null);
  const lastLaunchedQuestionIdRef = useRef<string | null>(null);

  useEffect(() => {
    questionLaunchSoundRef.current = new Audio('/audio/pergunta-lancada.mp3');
    questionLaunchSoundRef.current.preload = 'auto';
  }, []);

  // Play it whenever a new question starts running (i.e. currentQuestionId changes while status is 'running')
  useEffect(() => {
    if (
      gameState.status === 'running' &&
      gameState.currentQuestionId &&
      gameState.currentQuestionId !== lastLaunchedQuestionIdRef.current
    ) {
      lastLaunchedQuestionIdRef.current = gameState.currentQuestionId;
      try {
        const audio = questionLaunchSoundRef.current;
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {
            // Autoplay blocked or file missing - silently ignore
          });
        }
      } catch (e) {
        // Ignored if browser blocks audio
      }
    }
  }, [gameState.status, gameState.currentQuestionId]);

  // Same "pergunta lançada" cue when a new tie-break question is drawn
  // (either the first one, or a follow-up round after a tie persists).
  const lastTiebreakQuestionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const tb = gameState.tiebreak;
    if (tb && tb.questionId && tb.questionId !== lastTiebreakQuestionIdRef.current) {
      lastTiebreakQuestionIdRef.current = tb.questionId;
      try {
        const audio = questionLaunchSoundRef.current;
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {
            // Autoplay blocked or file missing - silently ignore
          });
        }
      } catch (e) {
        // Ignored if browser blocks audio
      }
    }
    if (!tb) {
      lastTiebreakQuestionIdRef.current = null;
    }
  }, [gameState.tiebreak?.questionId]);

  // Correct/wrong cue when the tie-break round is revealed: the "correct"
  // sound plays only if a single candidate got it right (a winner emerged),
  // otherwise the "wrong" buzzer plays (nobody, or more than one, got it right).
  const lastTiebreakRevealedQuestionRef = useRef<string | null>(null);
  useEffect(() => {
    const tb = gameState.tiebreak;
    if (tb && tb.revealed && tb.questionId && tb.questionId !== lastTiebreakRevealedQuestionRef.current) {
      lastTiebreakRevealedQuestionRef.current = tb.questionId;
      const question = questions.find(q => q.id === tb.questionId);
      const correctIds = tb.candidateTeamIds.filter(id => {
        const ans = tb.answersByTeam[id];
        if (!ans || !question) return false;
        return question.type === 'chronological'
          ? ans.chronologicalResult === true
          : ans.selectedOptionIndex === question.correctAnswer;
      });
      const winnerEmerged = correctIds.length === 1;
      playResultSound(winnerEmerged);
      if (winnerEmerged) {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      }
    }
    if (!tb) {
      lastTiebreakRevealedQuestionRef.current = null;
    }
  }, [gameState.tiebreak?.revealed, gameState.tiebreak?.questionId, questions]);

  // Subscribe to collections
  useEffect(() => {
    const unsubscribeTeams = subscribeToTeams(setTeams);
    const unsubscribeQuestions = subscribeToQuestions(setQuestions);
    const unsubscribeAnswers = subscribeToAnswers(setAnswers);

    return () => {
      unsubscribeTeams();
      unsubscribeQuestions();
      unsubscribeAnswers();
    };
  }, []);

  // Sync / Run Local Timer
  useEffect(() => {
    if (gameState.timerStart && gameState.timerEnd && gameState.status === 'running') {
      const runTimer = () => {
        const now = Date.now();
        const diffSec = Math.ceil((gameState.timerEnd! - now) / 1000);
        const remaining = Math.max(0, diffSec);
        
        setTimeLeft(remaining);

        // Sound effects for low time
        if (remaining <= 5 && remaining > 0) {
          playBeep(880, 0.15); // High warning beep
        } else if (remaining === 0) {
          playBeep(440, 0.6); // End buzzer
        }
      };

      runTimer();
      timerIntervalRef.current = setInterval(runTimer, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setTimeLeft(gameState.timerDuration);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [gameState.timerStart, gameState.timerEnd, gameState.status]);

  // Sound + confetti triggering on answer reveal or finished state
  useEffect(() => {
    if (gameState.status === 'showing_answer' && gameState.revealed) {
      // The answers array is ordered by timestamp ascending, so the last
      // entry is the one that was just submitted for this reveal.
      const lastAnswer = answers[answers.length - 1];
      const matchesCurrentReveal =
        lastAnswer &&
        lastAnswer.teamId === gameState.currentTeamId &&
        lastAnswer.questionId === gameState.currentQuestionId;

      if (matchesCurrentReveal) {
        playResultSound(lastAnswer.isCorrect);
        if (lastAnswer.isCorrect) {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      } else {
        // Fallback: correctness unknown, keep the old neutral beep + confetti
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
        playBeep(523.25, 0.3);
      }
    } else if (gameState.status === 'finished') {
      // Massive continuous confetti
      const end = Date.now() + 5 * 1000;
      const interval = setInterval(() => {
        if (Date.now() > end) {
          clearInterval(interval);
          return;
        }
        confetti({
          startVelocity: 30,
          spread: 360,
          ticks: 60,
          origin: { x: Math.random(), y: Math.random() - 0.2 }
        });
      }, 200);

      playBeep(587.33, 0.2); // D5
      setTimeout(() => playBeep(659.25, 0.2), 200); // E5
      setTimeout(() => playBeep(698.46, 0.5), 400); // F5

      return () => clearInterval(interval);
    }
  }, [gameState.status, gameState.revealed, answers, gameState.currentTeamId, gameState.currentQuestionId]);

  const activeQuestion = questions.find(q => q.id === gameState.currentQuestionId);
  const activeTeam = teams.find(t => t.id === gameState.currentTeamId);

  // Vencedores por faixa etária para o ecrã de campeões. O vencedor oficial é
  // quem tiver mais respostas certas; se houver empate nesse critério, fica
  // pendente de uma pergunta de desempate (ver getCategoryWinner em gameService.ts).
  const categoryGroups = groupTeamsByCategory(teams);
  const categoryWinners = categoryGroups.map(g => ({
    category: g.category,
    winner: getCategoryWinner(g.category, g.teams, gameState.categoryWinnerIds),
    tiedTeams: getTiedTopTeams(g.teams)
  }));

  const activeTiebreak = gameState.tiebreak;
  const tiebreakQuestion = activeTiebreak ? questions.find(q => q.id === activeTiebreak.questionId) : undefined;
  const tiebreakCurrentTeam = activeTiebreak?.currentTeamId ? teams.find(t => t.id === activeTiebreak.currentTeamId) : null;
  const tiebreakCorrectIds = activeTiebreak && tiebreakQuestion
    ? activeTiebreak.candidateTeamIds.filter(id => {
        const ans = activeTiebreak.answersByTeam[id];
        if (!ans) return false;
        return tiebreakQuestion.type === 'chronological'
          ? ans.chronologicalResult === true
          : ans.selectedOptionIndex === tiebreakQuestion.correctAnswer;
      })
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between p-6 overflow-hidden relative font-sans select-none">
      
      {/* Decorative subtle background glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-amber-500/10 blur-[120px] pointer-events-none"></div>

      {/* TOP BAR / HEADER */}
      <header className="flex justify-between items-center bg-slate-900/60 border border-slate-800/80 backdrop-blur-md px-6 py-4 rounded-2xl z-10">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl text-slate-950 shadow-md">
            <Trophy className="w-6 h-6 stroke-[2]" />
          </div>
          <div>
            <h1 className="text-xl font-black text-display uppercase tracking-wider bg-gradient-to-r from-amber-400 to-yellow-200 bg-clip-text text-transparent">
              Desafio Bíblico
            </h1>
            <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Vida de Jesus • Escola Dominical</p>
          </div>
        </div>

        {gameState.status !== 'setup' && gameState.status !== 'finished' && (
          <div className="flex items-center gap-6">
            <div className="text-center">
              <span className="text-[10px] text-slate-400 uppercase font-black block">Rodada</span>
              <strong className="text-xl text-display text-white">{gameState.round} de {gameState.totalRounds}</strong>
            </div>
            
            <div className="h-8 w-px bg-slate-800"></div>

            <div className="text-center">
              <span className="text-[10px] text-slate-400 uppercase font-black block">Modo</span>
              <strong className="text-xs uppercase px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-amber-400 font-mono">
                Equipas Livres
              </strong>
            </div>
          </div>
        )}
      </header>

      {/* CENTER / MAIN CONTENT STAGE */}
      <main className="flex-1 my-6 flex items-center justify-center z-10">

        {/* SETUP SCREEN */}
        {gameState.status === 'setup' && (
          <div className="text-center space-y-6 max-w-2xl py-12">
            <div className="w-24 h-24 bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 rounded-3xl flex items-center justify-center mx-auto shadow-xl ring-4 ring-amber-400/20 animate-pulse">
              <Trophy className="w-12 h-12 text-slate-950 stroke-[1.5]" />
            </div>
            <div className="space-y-2">
              <h2 className="text-4xl font-extrabold text-display tracking-tight text-white">
                Grande Concurso Bíblico
              </h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Preparem as vossas Bíblias! O apresentador está a configurar as equipas e as rodadas. O show começará em instantes no ecrã principal.
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-full text-xs text-slate-400 font-semibold font-mono">
                <Users className="w-3.5 h-3.5 text-blue-400" />
                Sincronizado via Cloud
              </span>
            </div>
          </div>
        )}

        {/* FINISHED / CHAMPIONS PODIUM SCREEN */}
        {gameState.status === 'finished' && categoryWinners.length > 0 && (
          <div className="text-center space-y-10 max-w-5xl py-8 w-full">
            <p className="text-xs uppercase font-extrabold tracking-widest text-amber-400">Vencedores do Concurso</p>
            <div className={`grid gap-6 ${categoryWinners.length === 1 ? 'grid-cols-1 max-w-md mx-auto' : categoryWinners.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3'}`}>
              {categoryWinners.map(({ category, winner, tiedTeams }) => (
                <div key={category} className="space-y-4">
                  <div className="relative inline-block">
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto shadow-2xl ring-8 ${
                      winner ? 'bg-gradient-to-br from-amber-400 to-yellow-500 ring-amber-400/10' : 'bg-gradient-to-br from-rose-500 to-rose-700 ring-rose-500/10'
                    }`}>
                      {winner ? (
                        <Trophy className="w-12 h-12 text-slate-950 stroke-[1.5]" />
                      ) : (
                        <Swords className="w-12 h-12 text-white stroke-[1.5]" />
                      )}
                    </div>
                    <div className={`absolute bottom-0 right-0 border-4 border-slate-950 px-2 py-0.5 rounded-full text-[10px] font-black uppercase text-white shadow-md ${winner ? 'bg-blue-600' : 'bg-rose-600'}`}>
                      {winner ? 'Campeão' : 'Empate'}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase font-extrabold tracking-widest text-blue-400">Faixa {AGE_CATEGORY_LABELS[category]}</p>
                    {winner ? (
                      <>
                        <h2 className="text-3xl font-black tracking-tight text-display text-white">
                          {winner.memberNames?.[0] || winner.name}
                        </h2>
                        <p className="text-sm font-bold text-amber-200">
                          Turma {winner.className || winner.name}
                        </p>
                        {winner.teacherName && (
                          <p className="text-xs text-slate-400">Prof. {winner.teacherName}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <h2 className="text-xl font-black tracking-tight text-display text-rose-300">
                          Aguardando Desempate
                        </h2>
                        <p className="text-xs text-slate-400">
                          {tiedTeams.map(t => t.memberNames?.[0] || t.name).join(' vs ')}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-400 max-w-lg mx-auto">
              Parabéns às equipas vencedoras pelo excelente aproveitamento no estudo da Vida de Jesus!
            </p>

            {/* PAINEL DE DESEMPATE AO VIVO */}
            {activeTiebreak && (
              <div className="bg-slate-900 border-2 border-rose-500/40 rounded-3xl p-8 max-w-3xl mx-auto text-left space-y-4 shadow-2xl">
                <p className="text-xs font-black uppercase tracking-widest text-rose-400 flex items-center gap-2">
                  <Swords className="w-4 h-4" />
                  Desempate — Faixa {AGE_CATEGORY_LABELS[activeTiebreak.category]}
                  {activeTiebreak.roundNum > 1 && <span> • Rodada {activeTiebreak.roundNum}</span>}
                </p>
                {tiebreakQuestion && (
                  <h3 className="text-xl font-extrabold text-white text-display leading-tight">
                    {tiebreakQuestion.question}
                  </h3>
                )}

                {!activeTiebreak.revealed && tiebreakCurrentTeam && (
                  <p className="text-sm text-amber-300 font-bold">
                    Vez de: {tiebreakCurrentTeam.memberNames?.[0] || tiebreakCurrentTeam.name}
                  </p>
                )}

                {tiebreakQuestion && tiebreakQuestion.type !== 'chronological' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {activeTiebreak.shuffledOptions.map((opt, idx) => {
                      const originalIdx = tiebreakQuestion.options.indexOf(opt);
                      const isRevealed = activeTiebreak.revealed;
                      const isCorrectOption = Number(tiebreakQuestion.correctAnswer) === originalIdx;

                      // Which candidates picked this specific option
                      const pickers = activeTiebreak.candidateTeamIds
                        .filter(id => activeTiebreak.answersByTeam[id]?.selectedOptionIndex === originalIdx)
                        .map(id => teams.find(t => t.id === id))
                        .filter((t): t is Team => !!t);

                      return (
                        <div
                          key={idx}
                          className={`p-4 rounded-2xl border-2 flex flex-col gap-2 shadow-sm transition-all duration-300 ${
                            isRevealed && isCorrectOption
                              ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200'
                              : isRevealed && !isCorrectOption
                              ? 'border-slate-800 bg-slate-950/40 opacity-40 text-slate-500'
                              : pickers.length > 0
                              ? 'border-blue-500 bg-blue-950/30 text-blue-200'
                              : 'border-slate-800 bg-slate-900 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs flex-shrink-0 ${
                              isRevealed && isCorrectOption ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="text-sm font-bold flex-1">{opt}</span>
                            {isRevealed && isCorrectOption && <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />}
                          </div>

                          {pickers.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pl-11">
                              {pickers.map(t => {
                                const wasCorrect = isRevealed && isCorrectOption;
                                return (
                                  <span
                                    key={t.id}
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                      isRevealed
                                        ? wasCorrect
                                          ? 'bg-emerald-500/20 text-emerald-300'
                                          : 'bg-rose-500/20 text-rose-300'
                                        : 'bg-blue-500/20 text-blue-300'
                                    }`}
                                  >
                                    {isRevealed && (wasCorrect ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />)}
                                    {t.memberNames?.[0] || t.name}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  activeTiebreak.revealed && (
                    <div className="space-y-1.5">
                      {activeTiebreak.candidateTeamIds.map(id => {
                        const t = teams.find(tm => tm.id === id);
                        const wasCorrect = tiebreakCorrectIds.includes(id);
                        return (
                          <p key={id} className={`text-sm font-bold flex items-center gap-2 ${wasCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {wasCorrect ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                            {t?.memberNames?.[0] || t?.name}
                          </p>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* ACTIVE QUESTION GAME STAGE */}
        {gameState.status !== 'setup' && gameState.status !== 'finished' && (
          <div className="w-full max-w-5xl space-y-6">

            {/* Active Team Highlight Banner */}
            {activeTeam && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row justify-between items-center gap-4 relative overflow-hidden shadow-lg">
                <div className="absolute top-0 right-0 h-full w-[20%] bg-gradient-to-l from-amber-500/5 to-transparent pointer-events-none"></div>
                <div className="flex items-center gap-4 text-center md:text-left">
                  <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center font-black text-xl text-display">
                    {(activeTeam.memberNames?.[0] || activeTeam.name).substr(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-1 justify-center md:justify-start">
                      <Flame className="w-3.5 h-3.5 fill-current" /> Concorrente a responder agora
                      <span className="ml-1 text-blue-400 bg-blue-950/50 border border-blue-900/50 px-2 py-0.5 rounded-full normal-case font-bold tracking-normal">
                        {AGE_CATEGORY_LABELS[activeTeam.ageCategory]}
                      </span>
                    </span>
                    <h2 className="text-3xl font-extrabold text-display text-white">
                      {gameState.currentMemberName || activeTeam.memberNames?.[0] || activeTeam.name}
                    </h2>
                    <p className="text-xs text-slate-400">
                      Turma {activeTeam.className || activeTeam.name}
                      {activeTeam.teacherName && <span> • Prof. {activeTeam.teacherName}</span>}
                    </p>
                  </div>
                </div>

                {/* TIMER DISPLAY */}
                <div className="flex items-center gap-4">
                  {gameState.status === 'running' ? (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-[9px] uppercase tracking-wider font-extrabold text-slate-400 block">Tempo Restante</span>
                        <span className="text-sm font-mono text-slate-300 font-bold">segundos</span>
                      </div>
                      
                      <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center font-mono font-bold text-2xl transition-all shadow-inner ${
                        timeLeft <= 5 
                          ? 'border-rose-500 text-rose-500 bg-rose-500/5 animate-ping' 
                          : timeLeft <= 15 
                          ? 'border-amber-400 text-amber-400 bg-amber-400/5' 
                          : 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                      }`}>
                        {timeLeft}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-slate-800/80 border border-slate-700/50 px-4 py-2.5 rounded-2xl flex items-center gap-2">
                      <Timer className="w-5 h-5 text-slate-400" />
                      <span className="text-xs font-mono text-slate-300 font-bold">Cronómetro Pausado</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Active Question Box */}
            {activeQuestion ? (
              <div className="space-y-6">
                
                {/* Question Statement */}
                <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-8 space-y-4 shadow-xl">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-3">
                    <span className="text-xs font-black uppercase tracking-widest text-blue-400 bg-blue-950/50 border border-blue-900/50 px-3 py-1 rounded-full">
                      Lição: {activeQuestion.lesson}
                    </span>
                    <span className="text-xs font-bold text-amber-400 font-mono">
                      VALE {activeQuestion.points} PONTOS
                    </span>
                  </div>
                  
                  <h3 className="text-2xl md:text-3xl font-extrabold text-slate-100 text-display leading-tight">
                    {activeQuestion.question}
                  </h3>
                </div>

                {/* Alternatives Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(gameState.shuffledOptions || activeQuestion.options).map((opt, idx) => {
                    // Match option index back to original question options array
                    const originalIdx = activeQuestion.options.indexOf(opt);
                    
                    const isRevealed = gameState.status === 'showing_answer' && gameState.revealed;
                    
                    let isCorrectOption = false;
                    if (activeQuestion.type === 'true_false') {
                      isCorrectOption = activeQuestion.correctAnswer === originalIdx;
                    } else if (activeQuestion.type === 'chronological') {
                      isCorrectOption = true; // All ordered correctly are shown as success in reveal
                    } else {
                      isCorrectOption = activeQuestion.correctAnswer === originalIdx;
                    }

                    // The option selected by the presenter/system as the team's answer
                    const isSelectedOption = gameState.selectedOptionIndex === originalIdx;
                    const isWrongSelectedOption = isRevealed && isSelectedOption && !isCorrectOption;

                    return (
                      <div 
                        key={idx} 
                        className={`p-5 rounded-2xl border-2 transition-all duration-300 flex items-center justify-between gap-4 shadow-sm ${
                          isRevealed && isCorrectOption
                            ? 'border-emerald-500 bg-emerald-950/40 text-emerald-200 ring-4 ring-emerald-500/10'
                            : isWrongSelectedOption
                            ? 'border-rose-500 bg-rose-950/40 text-rose-200 ring-4 ring-rose-500/10'
                            : isRevealed && !isCorrectOption
                            ? 'border-slate-800 bg-slate-950/40 opacity-40 text-slate-500'
                            : !isRevealed && isSelectedOption
                            ? 'border-blue-500 bg-blue-950/30 text-blue-200'
                            : 'border-slate-800 bg-slate-900 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <span className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm text-display ${
                            isRevealed && isCorrectOption
                              ? 'bg-emerald-500 text-slate-950'
                              : isWrongSelectedOption
                              ? 'bg-rose-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            {activeQuestion.type === 'chronological' ? `${originalIdx + 1}º` : String.fromCharCode(65 + idx)}
                          </span>
                          <span className="text-lg font-bold text-display">{opt}</span>
                        </div>

                        {isRevealed && isCorrectOption && (
                          <CheckCircle className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                        )}
                        {isWrongSelectedOption && (
                          <XCircle className="w-6 h-6 text-rose-400 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>

              </div>
            ) : (
              /* Awaiting Question */
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center space-y-4 shadow-lg">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto">
                  <HelpCircle className="w-8 h-8 text-amber-500 animate-pulse" />
                </div>
                <h3 className="text-2xl font-bold text-display text-white">Preparando Próxima Pergunta</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  O apresentador está a selecionar a pergunta perfeita para a vossa equipa. Preparem-se!
                </p>
              </div>
            )}

          </div>
        )}
      </main>

    </div>
  );
}
