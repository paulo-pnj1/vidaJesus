import React, { useState, useEffect, useRef } from 'react';
import { AgeCategory, AGE_CATEGORIES, AGE_CATEGORY_LABELS, Team, Question } from '../types';
import { subscribeToTeams, subscribeToQuestions, registerCastingTeam } from '../lib/gameService';
import {
  Users, GraduationCap, CheckCircle2, Lock, ClipboardList, Trophy, Sparkles,
  Play, Eye, ChevronRight, RotateCcw, Medal, Check, X as XIcon, ArrowLeft, ListChecks, Save
} from 'lucide-react';

// Simple front-end gate so a stray link doesn't get spammed by strangers.
// Like the presenter/judge login, this is NOT a real security boundary —
// just a shared word the teachers are given verbally/on a poster on casting day.
const CASTING_ACCESS_CODE = 'elenco2026';
const CASTING_AUTH_KEY = 'bible_game_casting_auth';

// Key used to persist an in-progress casting session to localStorage, so an
// accidental refresh/back button/tab close doesn't wipe out live progress
// (round, scores, etc). localStorage (not sessionStorage) is used on purpose:
// it survives the tab being closed entirely, not just a reload.
const CASTING_SESSION_KEY = 'bible_game_casting_session_v1';

const CATEGORY_INFO: Record<AgeCategory, { range: string; level: string; color: string; ring: string; bg: string }> = {
  junior: { range: '6 a 9 anos', level: 'Perguntas fáceis', color: 'text-sky-600', ring: 'ring-sky-400', bg: 'bg-sky-50 border-sky-200' },
  pleno: { range: '10 a 13 anos', level: 'Perguntas médias', color: 'text-emerald-600', ring: 'ring-emerald-400', bg: 'bg-emerald-50 border-emerald-200' },
  senior: { range: '14 a 20 anos', level: 'Perguntas avançadas', color: 'text-purple-600', ring: 'ring-purple-400', bg: 'bg-purple-50 border-purple-200' },
};

const COMPETITOR_COUNT = 5;
const DEFAULT_CASTING_QUESTIONS = 10;

type CastingStage = 'form' | 'running' | 'results';

interface StudentScore {
  points: number;
  correct: number;
  wrong: number;
}

interface PersistedCastingSession {
  category: AgeCategory | null;
  teacherName: string;
  className: string;
  members: string[];
  questionCount: number;
  stage: CastingStage;
  sessionQuestions: Question[];
  roundIndex: number;
  currentOptions: string[];
  selectedOptionIdx: number | null;
  chronoResult: boolean | null;
  revealed: boolean;
  scores: Record<string, StudentScore>;
  savedAt: number;
}

export default function CastingPanel() {
  const [authed, setAuthed] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [category, setCategory] = useState<AgeCategory | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [className, setClassName] = useState('');
  const [members, setMembers] = useState<string[]>(Array(COMPETITOR_COUNT).fill(''));
  const [questionCount, setQuestionCount] = useState(DEFAULT_CASTING_QUESTIONS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // --- Live casting quiz state ---
  const [stage, setStage] = useState<CastingStage>('form');
  const [sessionQuestions, setSessionQuestions] = useState<Question[]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [currentOptions, setCurrentOptions] = useState<string[]>([]);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState<number | null>(null);
  const [chronoResult, setChronoResult] = useState<boolean | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [scores, setScores] = useState<Record<string, StudentScore>>({});
  const [restoredNotice, setRestoredNotice] = useState(false);

  // Guards the save-effect below from firing (and overwriting a saved session
  // with blank initial state) before we've had a chance to try restoring it.
  const hydratedRef = useRef(false);

  // --- Same audio cues used on the Projector: question launched + correct/wrong answer ---
  const questionLaunchSoundRef = useRef<HTMLAudioElement | null>(null);
  const correctSoundRef = useRef<HTMLAudioElement | null>(null);
  const wrongSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    questionLaunchSoundRef.current = new Audio('/audio/pergunta-lancada.mp3');
    correctSoundRef.current = new Audio('/audio/resposta-certa.mp3');
    wrongSoundRef.current = new Audio('/audio/resposta-errada.mp3');
    questionLaunchSoundRef.current.preload = 'auto';
    correctSoundRef.current.preload = 'auto';
    wrongSoundRef.current.preload = 'auto';
  }, []);

  const playQuestionLaunchSound = () => {
    try {
      const audio = questionLaunchSoundRef.current;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => {
          // Autoplay blocked (needs a user gesture) or file missing - silently ignore
        });
      }
    } catch (e) {
      // Ignored if browser blocks audio
    }
  };

  const playResultSound = (isCorrect: boolean) => {
    // Stop the "pergunta lançada" music as soon as the result is known.
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

  useEffect(() => {
    if (sessionStorage.getItem(CASTING_AUTH_KEY) === 'true') {
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToTeams(setTeams);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToQuestions(setQuestions);
    return () => unsubscribe();
  }, []);

  // Try to restore an in-progress casting session that never finished
  // (e.g. the page was refreshed or closed by accident mid-round).
  useEffect(() => {
    if (!authed) return;
    try {
      const raw = localStorage.getItem(CASTING_SESSION_KEY);
      if (raw) {
        const saved: PersistedCastingSession = JSON.parse(raw);
        const hasProgress =
          saved.stage !== 'form' ||
          !!saved.teacherName ||
          !!saved.className ||
          (saved.members || []).some((m) => m);
        if (hasProgress) {
          const label = saved.className ? `da turma "${saved.className}"` : '';
          const wantsToResume = window.confirm(
            `Encontrámos um casting ${label} que ficou em aberto (a tela deve ter fechado ou recarregado sem terminar). Deseja continuar de onde parou?`
          );
          if (wantsToResume) {
            setCategory(saved.category);
            setTeacherName(saved.teacherName || '');
            setClassName(saved.className || '');
            setMembers(saved.members?.length === COMPETITOR_COUNT ? saved.members : Array(COMPETITOR_COUNT).fill(''));
            setQuestionCount(saved.questionCount || DEFAULT_CASTING_QUESTIONS);
            setSessionQuestions(saved.sessionQuestions || []);
            setRoundIndex(saved.roundIndex || 0);
            setCurrentOptions(saved.currentOptions || []);
            setSelectedOptionIdx(saved.selectedOptionIdx ?? null);
            setChronoResult(saved.chronoResult ?? null);
            setRevealed(saved.revealed || false);
            setScores(saved.scores || {});
            setStage(saved.stage || 'form');
            setRestoredNotice(true);
          } else {
            localStorage.removeItem(CASTING_SESSION_KEY);
          }
        }
      }
    } catch (err) {
      console.error('Erro ao restaurar sessão de casting salva:', err);
    } finally {
      hydratedRef.current = true;
    }
    // Only runs once, right after the teacher unlocks the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // Auto-save the in-progress casting session to this browser after every
  // change, so an accidental refresh/close doesn't lose the teacher's work.
  useEffect(() => {
    if (!authed || !hydratedRef.current) return;
    const isEmpty = stage === 'form' && !teacherName && !className && !category && members.every((m) => !m);
    if (isEmpty) {
      localStorage.removeItem(CASTING_SESSION_KEY);
      return;
    }
    const payload: PersistedCastingSession = {
      category, teacherName, className, members, questionCount,
      stage, sessionQuestions, roundIndex, currentOptions, selectedOptionIdx, chronoResult, revealed, scores,
      savedAt: Date.now()
    };
    try {
      localStorage.setItem(CASTING_SESSION_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error('Erro ao gravar progresso do casting:', err);
    }
  }, [
    authed, category, teacherName, className, members, questionCount,
    stage, sessionQuestions, roundIndex, currentOptions, selectedOptionIdx, chronoResult, revealed, scores
  ]);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (codeInput.trim().toLowerCase() === CASTING_ACCESS_CODE) {
      sessionStorage.setItem(CASTING_AUTH_KEY, 'true');
      setAuthed(true);
      setCodeError(null);
    } else {
      setCodeError('Código de acesso incorreto. Peça o código à organização.');
    }
  };

  const resetForm = () => {
    setCategory(null);
    setTeacherName('');
    setClassName('');
    setMembers(Array(COMPETITOR_COUNT).fill(''));
    setQuestionCount(DEFAULT_CASTING_QUESTIONS);
  };

  const resetCastingSession = () => {
    setSessionQuestions([]);
    setRoundIndex(0);
    setCurrentOptions([]);
    setSelectedOptionIdx(null);
    setChronoResult(null);
    setRevealed(false);
    setScores({});
  };

  const handleMemberChange = (idx: number, value: string) => {
    const next = [...members];
    next[idx] = value;
    setMembers(next);
  };

  // Shared validation for both "inscrever diretamente" and "iniciar casting".
  // Returns an error message, or null if everything is valid.
  const validateBasics = (): string | null => {
    if (!category) return 'Escolha a categoria/faixa etária da turma.';
    if (!teacherName.trim()) return 'Indique o nome do professor(a).';
    if (!className.trim()) return 'Indique o nome da turma.';
    const cleanedMembers = members.map((m) => m.trim());
    if (cleanedMembers.some((m) => !m)) return `Preencha o nome dos ${COMPETITOR_COUNT} concorrentes.`;
    const namesLower = cleanedMembers.map((m) => m.toLowerCase());
    if (new Set(namesLower).size !== namesLower.length) {
      return 'Os nomes dos concorrentes devem ser diferentes entre si (para não haver confusão na pontuação).';
    }
    const duplicateInCategory = teams.some(
      (t) => t.ageCategory === category && t.className?.trim().toLowerCase() === className.trim().toLowerCase()
    );
    if (duplicateInCategory) {
      return 'Já existe uma turma com este nome inscrita nesta categoria. Use um nome diferente (ex: "Turma A - Manhã").';
    }
    return null;
  };

  const prepareRound = (idx: number, pool: Question[]) => {
    const q = pool[idx];
    if (!q) return;
    let opts: string[] = [];
    if (q.type !== 'chronological') {
      opts = [...q.options].sort(() => Math.random() - 0.5);
    }
    setCurrentOptions(opts);
    setSelectedOptionIdx(null);
    setChronoResult(null);
    setRevealed(false);
    playQuestionLaunchSound();
  };

  // Builds a fresh casting session: picks `questionCount` random, unique
  // questions from the chosen category (does NOT touch the `used` flag —
  // casting never affects the pool available for the final contest).
  const buildAndStartSession = () => {
    setError(null);
    setSuccess(null);
    const validationError = validateBasics();
    if (validationError) {
      setError(validationError);
      return;
    }
    const pool = questions.filter((q) => q.ageCategory === category);
    if (pool.length === 0) {
      setError(`Não há perguntas cadastradas para a categoria ${AGE_CATEGORY_LABELS[category as AgeCategory]}. Adicione perguntas no Banco de Perguntas antes de iniciar o casting.`);
      return;
    }
    const desired = Math.max(1, Math.floor(questionCount) || DEFAULT_CASTING_QUESTIONS);
    const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
    const n = Math.min(desired, shuffledPool.length);
    const picked = shuffledPool.slice(0, n);

    resetCastingSession();
    setSessionQuestions(picked);
    setRoundIndex(0);
    setStage('running');
    prepareRound(0, picked);

    if (n < desired) {
      // Doesn't block the flow — just lets the teacher know fewer questions were used.
      window.setTimeout(() => {
        alert(`Só havia ${n} pergunta(s) disponível(is) na categoria ${AGE_CATEGORY_LABELS[category as AgeCategory]}. O casting vai usar essa quantidade.`);
      }, 0);
    }
  };

  const currentStudent = members[roundIndex % members.length];
  const currentQuestion = sessionQuestions[roundIndex];

  const handleSelectOption = (idx: number) => {
    if (revealed) return;
    setSelectedOptionIdx(idx);
  };

  const handleSelectChrono = (isCorrectOrder: boolean) => {
    if (revealed) return;
    setChronoResult(isCorrectOrder);
  };

  const handleReveal = () => {
    if (!currentQuestion) return;
    let isCorrect: boolean;
    if (currentQuestion.type === 'chronological') {
      if (chronoResult === null) {
        alert('Indique primeiro se o aluno acertou a ordem antes de revelar a resposta!');
        return;
      }
      isCorrect = chronoResult;
    } else {
      if (selectedOptionIdx === null) {
        alert('Selecione primeiro a opção que o aluno respondeu antes de revelar a resposta!');
        return;
      }
      isCorrect = currentQuestion.correctAnswer === selectedOptionIdx;
    }

    setScores((prev) => {
      const prevScore = prev[currentStudent] || { points: 0, correct: 0, wrong: 0 };
      return {
        ...prev,
        [currentStudent]: {
          points: prevScore.points + (isCorrect ? currentQuestion.points : 0),
          correct: prevScore.correct + (isCorrect ? 1 : 0),
          wrong: prevScore.wrong + (isCorrect ? 0 : 1),
        }
      };
    });
    setRevealed(true);
    playResultSound(isCorrect);
  };

  const handleNextRound = () => {
    const next = roundIndex + 1;
    if (next >= sessionQuestions.length) {
      setStage('results');
      return;
    }
    setRoundIndex(next);
    prepareRound(next, sessionQuestions);
  };

  const handleCancelCasting = () => {
    if (window.confirm('Cancelar o casting em curso? O progresso desta sessão será perdido (os dados da turma preenchidos permanecem).')) {
      resetCastingSession();
      setStage('form');
      localStorage.removeItem(CASTING_SESSION_KEY);
    }
  };

  const handleRepeatCasting = () => {
    resetCastingSession();
    buildAndStartSession();
  };

  const ranking = members
    .map((name) => ({ name, ...(scores[name] || { points: 0, correct: 0, wrong: 0 }) }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct || a.wrong - b.wrong);
  const winner = ranking[0];

  const handleRegisterAfterCasting = async () => {
    setError(null);
    setSuccess(null);
    if (!winner) return;
    setSubmitting(true);
    try {
      // Only the casting winner advances to the final contest — the turma's
      // team is registered with a single competitor, not all 5 candidates.
      await registerCastingTeam(
        teacherName.trim(),
        className.trim(),
        category as AgeCategory,
        [winner.name],
        winner.name
      );
      setSuccess(`Turma "${className.trim()}" inscrita no concurso final com "${winner.name}" como representante (vencedor(a) do casting).`);
      resetForm();
      resetCastingSession();
      setStage('form');
      localStorage.removeItem(CASTING_SESSION_KEY);
    } catch (err) {
      console.error(err);
      setError('Ocorreu um erro ao gravar a inscrição. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDiscardResults = () => {
    resetCastingSession();
    setStage('form');
    localStorage.removeItem(CASTING_SESSION_KEY);
  };

  // Lock screen
  if (!authed) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative font-sans overflow-hidden">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full blur-[150px] pointer-events-none bg-indigo-500/10"></div>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 space-y-6 relative z-10">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-inner bg-indigo-50 text-indigo-600">
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 text-display">Painel de Casting</h2>
            <p className="text-sm text-slate-500">Insira o código de acesso fornecido pela organização para inscrever a sua turma.</p>
          </div>
          <form onSubmit={handleUnlock} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Código de Acesso</label>
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                autoFocus
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 outline-none focus:bg-white focus:border-slate-400 transition-all"
                required
              />
            </div>
            {codeError && (
              <p className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-100 rounded-lg p-2.5 text-center">
                {codeError}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all text-display cursor-pointer"
            >
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  const registeredInCategory = (c: AgeCategory) => teams.filter((t) => t.ageCategory === c);

  // ---------------------------------------------------------------------
  // RUNNING: the live casting quiz — question + options appear right here,
  // no need to go to the Presenter/Projector screens.
  // ---------------------------------------------------------------------
  if (stage === 'running' && currentQuestion) {
    const info = CATEGORY_INFO[category as AgeCategory];
    return (
      <div className="min-h-screen bg-slate-950 font-sans pb-16 text-white">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {restoredNotice && (
            <div className="flex items-center justify-between gap-3 bg-indigo-500/15 border border-indigo-400/30 rounded-xl px-4 py-2.5 text-xs text-indigo-200">
              <span>Sessão de casting restaurada de onde parou.</span>
              <button onClick={() => setRestoredNotice(false)} className="font-bold hover:text-white cursor-pointer">Ok</button>
            </div>
          )}
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleCancelCasting}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Cancelar Casting
            </button>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] text-slate-500" title="O progresso é gravado automaticamente neste navegador">
                <Save className="w-3 h-3" /> Salvo automaticamente
              </span>
              <span className="text-xs font-bold bg-white/10 px-3 py-1.5 rounded-full">
                Rodada {roundIndex + 1} / {sessionQuestions.length}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${((roundIndex + (revealed ? 1 : 0)) / sessionQuestions.length) * 100}%` }}
            />
          </div>

          {/* Turma / student header */}
          <div className={`rounded-2xl p-5 border text-center space-y-1 ${info.bg} !bg-opacity-95`}>
            <p className={`text-[11px] font-black uppercase tracking-widest ${info.color}`}>
              {className} • {AGE_CATEGORY_LABELS[category as AgeCategory]}
            </p>
            <p className="text-2xl font-black text-slate-900 text-display">Vez de: {currentStudent}</p>
          </div>

          {/* Question card */}
          <div className="bg-white text-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{currentQuestion.lesson}</p>
            <h2 className="text-xl font-bold text-display leading-snug">{currentQuestion.question}</h2>

            {currentQuestion.type === 'chronological' ? (
              <div className="space-y-3">
                <ol className="space-y-1.5 list-decimal list-inside text-sm text-slate-600 bg-slate-50 rounded-xl p-4 border border-slate-200">
                  {currentQuestion.options.map((opt, idx) => (
                    <li key={idx}>{opt}</li>
                  ))}
                </ol>
                <p className="text-xs text-slate-400 italic">O aluno disse a ordem em voz alta — indique se acertou:</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectChrono(true)}
                    disabled={revealed}
                    className={`py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      chronoResult === true ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <Check className="w-4 h-4" /> Ordem Correta
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectChrono(false)}
                    disabled={revealed}
                    className={`py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      chronoResult === false ? 'border-rose-500 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <XIcon className="w-4 h-4" /> Ordem Errada
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs text-slate-400 italic">Clique na opção que o aluno respondeu em voz alta:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {currentOptions.map((opt, idx) => {
                    const originalIdx = currentQuestion.options.indexOf(opt);
                    const isSelected = selectedOptionIdx === originalIdx;
                    const isCorrectOpt = currentQuestion.correctAnswer === originalIdx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectOption(originalIdx)}
                        disabled={revealed}
                        className={`text-left px-3.5 py-3 rounded-xl border text-sm font-semibold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                          revealed && isCorrectOpt
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                            : revealed && isSelected && !isCorrectOpt
                            ? 'border-rose-500 bg-rose-50 text-rose-800'
                            : isSelected
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <span className="truncate">{String.fromCharCode(65 + idx)}) {opt}</span>
                        {isSelected && !revealed && <span className="text-[9px] uppercase font-bold flex-shrink-0">Escolhida</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {revealed && (
              <div className={`p-3 rounded-xl border text-center text-sm font-bold ${
                (currentQuestion.type === 'chronological' ? chronoResult : selectedOptionIdx === currentQuestion.correctAnswer)
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}>
                {(currentQuestion.type === 'chronological' ? chronoResult : selectedOptionIdx === currentQuestion.correctAnswer)
                  ? `Resposta CORRETA — +${currentQuestion.points} pontos para ${currentStudent} ✔`
                  : `Resposta INCORRETA ✖`}
              </div>
            )}

            <div className="pt-1">
              {!revealed ? (
                <button
                  onClick={handleReveal}
                  className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Eye className="w-4 h-4" /> Mostrar Resposta
                </button>
              ) : (
                <button
                  onClick={handleNextRound}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                  {roundIndex + 1 >= sessionQuestions.length ? 'Ver Resultado Final' : 'Próximo Aluno'}
                </button>
              )}
            </div>
          </div>

          {/* Live scoreboard */}
          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">Pontuação ao vivo</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {members.map((m) => {
                const s = scores[m] || { points: 0, correct: 0, wrong: 0 };
                const isTurn = m === currentStudent;
                return (
                  <div key={m} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${isTurn ? 'bg-indigo-500/20 border border-indigo-400/40' : 'bg-white/5'}`}>
                    <span className="font-semibold truncate">{m}</span>
                    <span className="font-black text-indigo-300">{s.points} pts</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // RESULTS: winner of the turma's casting round.
  // ---------------------------------------------------------------------
  if (stage === 'results') {
    const info = CATEGORY_INFO[category as AgeCategory];
    return (
      <div className="min-h-screen bg-slate-950 font-sans pb-16 text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full space-y-6">
          {restoredNotice && (
            <div className="flex items-center justify-between gap-3 bg-indigo-500/15 border border-indigo-400/30 rounded-xl px-4 py-2.5 text-xs text-indigo-200">
              <span>Sessão de casting restaurada de onde parou.</span>
              <button onClick={() => setRestoredNotice(false)} className="font-bold hover:text-white cursor-pointer">Ok</button>
            </div>
          )}
          <div className="text-center space-y-2">
            <Trophy className="w-14 h-14 text-amber-400 mx-auto" />
            <p className={`text-xs font-black uppercase tracking-widest ${info.color}`}>
              {className} • {AGE_CATEGORY_LABELS[category as AgeCategory]}
            </p>
            <h2 className="text-3xl font-black text-display">{winner?.name}</h2>
            <p className="text-sm text-slate-400">venceu o casting com {winner?.points} pontos ({winner?.correct} acerto{winner?.correct === 1 ? '' : 's'})</p>
          </div>

          <div className="bg-white rounded-2xl p-5 text-slate-800 space-y-2 shadow-xl">
            {ranking.map((r, idx) => (
              <div key={r.name} className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${idx === 0 ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'}`}>
                <div className="flex items-center gap-2.5">
                  {idx === 0 ? (
                    <Trophy className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  ) : (
                    <span className="w-4 h-4 flex items-center justify-center text-[11px] font-black text-slate-400 flex-shrink-0">{idx + 1}º</span>
                  )}
                  <span className="text-sm font-bold truncate">{r.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 flex-shrink-0">
                  <span>{r.correct} certas</span>
                  <span>{r.wrong} erradas</span>
                  <span className="font-black text-slate-800">{r.points} pts</span>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-xs text-rose-300 font-semibold bg-rose-950/40 border border-rose-900/40 rounded-lg p-3">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={handleRegisterAfterCasting}
              disabled={submitting}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl font-bold shadow-md transition-all text-display flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <GraduationCap className="w-4 h-4" />
              {submitting ? 'A inscrever...' : `Inscrever ${winner?.name || 'Vencedor(a)'} no Concurso Final`}
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleRepeatCasting}
                className="py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Repetir Casting
              </button>
              <button
                onClick={handleDiscardResults}
                className="py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar sem Inscrever
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // FORM: category, teacher/turma data, competitors, question count.
  // ---------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-16">
      {/* Header */}
      <div className="bg-slate-900 text-white px-6 py-6">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500 rounded-xl shadow-inner">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-display tracking-tight">Painel de Casting</h1>
            <p className="text-xs text-slate-400">Inscrição das turmas para o Desafio Bíblico — Vida de Jesus</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-6">

        {restoredNotice && (
          <div className="flex items-center justify-between gap-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 text-xs text-indigo-700">
            <span>Dados restaurados de uma sessão anterior que não tinha sido terminada.</span>
            <button onClick={() => setRestoredNotice(false)} className="font-bold hover:text-indigo-900 cursor-pointer">Ok</button>
          </div>
        )}

        {/* Step 1: category */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 text-display flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] flex items-center justify-center font-black">1</span>
            Escolha a categoria da turma
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {AGE_CATEGORIES.map((c) => {
              const info = CATEGORY_INFO[c];
              const selected = category === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${info.bg} ${selected ? `ring-2 ${info.ring} border-transparent shadow-md` : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-black text-display text-lg ${info.color}`}>{AGE_CATEGORY_LABELS[c]}</span>
                    {selected && <CheckCircle2 className={`w-5 h-5 ${info.color}`} />}
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{info.range}</p>
                  <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{info.level}</p>
                  <p className="text-[10px] text-slate-400 mt-2">
                    {registeredInCategory(c).length} turma{registeredInCategory(c).length !== 1 ? 's' : ''} já inscrita{registeredInCategory(c).length !== 1 ? 's' : ''}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: form */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          <h3 className="text-sm font-bold text-slate-800 text-display flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] flex items-center justify-center font-black">2</span>
            Dados do professor(a) e da turma
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Nome do Professor(a)</label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="Ex: Prof. Ana Costa"
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:bg-white focus:border-slate-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Nome da Turma</label>
              <input
                type="text"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Ex: Turma A"
                className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:bg-white focus:border-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Os {COMPETITOR_COUNT} concorrentes desta turma
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {members.map((m, idx) => (
                <div key={idx} className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">
                    {idx + 1}
                  </span>
                  <input
                    type="text"
                    value={m}
                    onChange={(e) => handleMemberChange(idx, e.target.value)}
                    placeholder={`Nome do concorrente ${idx + 1}`}
                    className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 pl-7 outline-none focus:bg-white focus:border-slate-400"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Step 3: casting quiz settings + launch */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
          <h3 className="text-sm font-bold text-slate-800 text-display flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-[11px] flex items-center justify-center font-black">3</span>
            Casting ao vivo
          </h3>
          <p className="text-xs text-slate-500">
            As perguntas e opções aparecem aqui mesmo, uma pergunta por rodada, passando de aluno em aluno até acabar.
            No final, o concorrente com mais pontos é o vencedor do casting — e é <strong>só ele(a)</strong> que fica inscrito(a) para representar a turma no concurso final.
            Não é preciso ir à tela do apresentador — essa é só para o concurso final.
          </p>

          <div className="max-w-xs">
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5" /> Quantidade de perguntas do casting
            </label>
            <input
              type="number"
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              min={1}
              max={100}
              className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:bg-white focus:border-slate-400"
            />
            <p className="text-[10px] text-slate-400 mt-1 italic">
              Dica: um múltiplo de {COMPETITOR_COUNT} faz com que todos os concorrentes respondam o mesmo número de vezes.
            </p>
          </div>

          {error && (
            <p className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-100 rounded-lg p-3">
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs text-emerald-700 font-semibold bg-emerald-50 border border-emerald-100 rounded-lg p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {success}
            </p>
          )}

          <button
            type="button"
            onClick={buildAndStartSession}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-md transition-all text-display flex items-center justify-center gap-2 text-sm cursor-pointer"
          >
            <Play className="w-4 h-4" />
            Iniciar Casting ao Vivo
          </button>
        </div>

        {/* Already registered list, grouped by category */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-slate-800 text-display flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Turmas já inscritas ({teams.length})
          </h3>
          {teams.length === 0 ? (
            <p className="text-xs text-slate-400 italic">Ainda nenhuma turma inscrita. Seja a primeira!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {AGE_CATEGORIES.map((c) => {
                const list = registeredInCategory(c);
                if (list.length === 0) return null;
                const info = CATEGORY_INFO[c];
                return (
                  <div key={c} className={`rounded-xl border p-3 space-y-2 ${info.bg}`}>
                    <p className={`text-[11px] font-black uppercase tracking-wide ${info.color}`}>
                      {AGE_CATEGORY_LABELS[c]} ({list.length})
                    </p>
                    <ul className="space-y-1">
                      {list.map((t) => (
                        <li key={t.id} className="text-xs text-slate-700 bg-white/70 rounded-lg px-2.5 py-1.5">
                          <span className="font-bold">{t.className || t.name}</span>
                          {t.teacherName && <span className="text-slate-500"> — {t.teacherName}</span>}
                          {t.castingWinnerName && (
                            <span className="block text-[10px] text-amber-600 font-semibold mt-0.5 flex items-center gap-1">
                              <Medal className="w-3 h-3" /> Vencedor(a) do casting: {t.castingWinnerName}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> As perguntas de cada categoria são sorteadas aleatoriamente conforme o nível de dificuldade.
        </p>
      </div>
    </div>
  );
}
