import React, { useState, useEffect, useRef } from 'react';
import { AgeCategory, AGE_CATEGORIES, AGE_CATEGORY_LABELS, Team, Question } from '../types';
import { subscribeToTeams, subscribeToQuestions, registerCastingTeam } from '../lib/gameService';
import {
  Users, GraduationCap, CheckCircle2, Lock, ClipboardList, Trophy, Sparkles,
  Play, Eye, ChevronRight, RotateCcw, Medal, Check, X as XIcon, ArrowLeft, ListChecks, Save,
  AlertTriangle
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

// One "sudden death" tie-break round: a single extra question asked only to
// the students who are tied for 1st place. Whoever answers correctly (and is
// the only one to do so) wins; if 0 or 2+ get it right, another round runs
// among the relevant subset until a single winner emerges.
interface TiebreakAnswer {
  idx: number | null;
  chrono: boolean | null;
}

interface TiebreakState {
  question: Question;
  options: string[]; // shuffled display options (empty for chronological)
  candidates: string[]; // student names still competing in this round
  turnIdx: number; // index into candidates for whose turn it is; === candidates.length once everyone answered
  answers: Record<string, TiebreakAnswer>;
  revealed: boolean;
  roundNum: number;
  resolvedWinner: string | null;
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
  const [tiebreak, setTiebreak] = useState<TiebreakState | null>(null);
  const tiebreakUsedIdsRef = useRef<string[]>([]);

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
    setTiebreak(null);
    tiebreakUsedIdsRef.current = [];
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

  // Builds a fresh casting session. `questionCount` means questions PER
  // STUDENT: every one of the COMPETITOR_COUNT students answers that many
  // rounds, and every question used in the whole session is unique (no
  // repeats for any student, and no student ever hears a question a
  // teammate already got). Students take turns round-robin: round 1 goes
  // student 1 → student 2 → ... → student 5, then round 2 repeats, etc.
  // Casting never touches the `used` flag — it doesn't affect the pool
  // available for the final contest.
  const buildAndStartSession = () => {
    setError(null);
    setSuccess(null);
    const validationError = validateBasics();
    if (validationError) {
      setError(validationError);
      return;
    }
    const pool = questions.filter((q) => q.ageCategory === category);
    if (pool.length < COMPETITOR_COUNT) {
      setError(`É preciso pelo menos ${COMPETITOR_COUNT} perguntas cadastradas na categoria ${AGE_CATEGORY_LABELS[category as AgeCategory]} (uma para cada concorrente por rodada). Atualmente há ${pool.length}. Adicione mais perguntas no Banco de Perguntas.`);
      return;
    }

    const desiredPerStudent = Math.max(1, Math.floor(questionCount) || DEFAULT_CASTING_QUESTIONS);
    const maxPerStudent = Math.floor(pool.length / COMPETITOR_COUNT);
    const actualPerStudent = Math.min(desiredPerStudent, maxPerStudent);
    const totalNeeded = actualPerStudent * COMPETITOR_COUNT;

    const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
    const picked = shuffledPool.slice(0, totalNeeded);

    resetCastingSession();
    setSessionQuestions(picked);
    setRoundIndex(0);
    setStage('running');
    prepareRound(0, picked);

    if (actualPerStudent < desiredPerStudent) {
      // Doesn't block the flow — just lets the teacher know fewer rounds were used,
      // so that every student still answers the same number of unique questions.
      window.setTimeout(() => {
        alert(`Só havia perguntas suficientes na categoria ${AGE_CATEGORY_LABELS[category as AgeCategory]} para ${actualPerStudent} pergunta(s) por aluno (em vez das ${desiredPerStudent} pedidas), garantindo que nenhuma pergunta se repete.`);
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

  // Picks a question for a tie-break round: prefers one that hasn't been
  // used yet in this session (main rounds or earlier tie-break rounds), but
  // falls back to reusing one if the category's pool has been exhausted.
  const pickTiebreakQuestion = (): Question | null => {
    const pool = questions.filter((q) => q.ageCategory === category);
    if (pool.length === 0) return null;
    const excludeIds = [...sessionQuestions.map((q) => q.id), ...tiebreakUsedIdsRef.current];
    const fresh = pool.filter((q) => !excludeIds.includes(q.id));
    const source = fresh.length > 0 ? fresh : pool;
    return source[Math.floor(Math.random() * source.length)];
  };

  const startTiebreakRound = (candidates: string[], roundNum: number) => {
    const q = pickTiebreakQuestion();
    if (!q) {
      alert('Não há perguntas cadastradas nesta categoria para gerar uma pergunta de desempate. Escolha o vencedor manualmente combinando com a organização.');
      return;
    }
    tiebreakUsedIdsRef.current.push(q.id);
    const opts = q.type !== 'chronological' ? [...q.options].sort(() => Math.random() - 0.5) : [];
    setTiebreak({
      question: q,
      options: opts,
      candidates,
      turnIdx: 0,
      answers: {},
      revealed: false,
      roundNum,
      resolvedWinner: null,
    });
    playQuestionLaunchSound();
  };

  const handleTiebreakSelect = (idx: number) => {
    if (!tiebreak || tiebreak.revealed || tiebreak.turnIdx >= tiebreak.candidates.length) return;
    const current = tiebreak.candidates[tiebreak.turnIdx];
    setTiebreak((prev) => prev && ({ ...prev, answers: { ...prev.answers, [current]: { idx, chrono: null } } }));
  };

  const handleTiebreakChrono = (val: boolean) => {
    if (!tiebreak || tiebreak.revealed || tiebreak.turnIdx >= tiebreak.candidates.length) return;
    const current = tiebreak.candidates[tiebreak.turnIdx];
    setTiebreak((prev) => prev && ({ ...prev, answers: { ...prev.answers, [current]: { idx: null, chrono: val } } }));
  };

  const handleTiebreakConfirmTurn = () => {
    if (!tiebreak) return;
    const current = tiebreak.candidates[tiebreak.turnIdx];
    const ans = tiebreak.answers[current];
    const answered = tiebreak.question.type === 'chronological'
      ? ans?.chrono !== null && ans?.chrono !== undefined
      : ans?.idx !== null && ans?.idx !== undefined;
    if (!answered) {
      alert(`Indique a resposta de ${current} antes de avançar.`);
      return;
    }
    setTiebreak((prev) => prev && ({ ...prev, turnIdx: prev.turnIdx + 1 }));
  };

  const handleTiebreakReveal = () => {
    if (!tiebreak) return;
    const q = tiebreak.question;
    const correctCandidates = tiebreak.candidates.filter((name) => {
      const ans = tiebreak.answers[name];
      return q.type === 'chronological' ? ans?.chrono === true : ans?.idx === q.correctAnswer;
    });
    const resolvedWinner = correctCandidates.length === 1 ? correctCandidates[0] : null;
    playResultSound(!!resolvedWinner);
    setTiebreak((prev) => prev && ({ ...prev, revealed: true, resolvedWinner }));
  };

  const handleNextTiebreakRound = () => {
    if (!tiebreak) return;
    const q = tiebreak.question;
    const correctCandidates = tiebreak.candidates.filter((name) => {
      const ans = tiebreak.answers[name];
      return q.type === 'chronological' ? ans?.chrono === true : ans?.idx === q.correctAnswer;
    });
    // Nobody got it right → everyone stays in and tries a new question.
    // Two or more got it right → only they compete in the next round.
    const nextCandidates = correctCandidates.length > 0 ? correctCandidates : tiebreak.candidates;
    startTiebreakRound(nextCandidates, tiebreak.roundNum + 1);
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

  // Ranking criteria (in order): 1) mais pontos, 2) mais acertos, 3) menos erros.
  // If those three are still tied for 1st place, a sudden-death tie-break
  // question (below) decides the final winner.
  const ranking = members
    .map((name) => ({ name, ...(scores[name] || { points: 0, correct: 0, wrong: 0 }) }))
    .sort((a, b) => b.points - a.points || b.correct - a.correct || a.wrong - b.wrong);
  const topEntry = ranking[0];
  const tiedForFirst = topEntry
    ? ranking
        .filter((r) => r.points === topEntry.points && r.correct === topEntry.correct && r.wrong === topEntry.wrong)
        .map((r) => r.name)
    : [];
  const hasUnresolvedTie = tiedForFirst.length > 1 && !tiebreak?.resolvedWinner;
  const championName = tiebreak?.resolvedWinner || (tiedForFirst.length > 1 ? null : topEntry?.name) || null;
  const winner = championName ? ranking.find((r) => r.name === championName) : topEntry;

  const handleRegisterAfterCasting = async () => {
    setError(null);
    setSuccess(null);
    if (!championName) {
      if (hasUnresolvedTie) {
        setError('Ainda há um empate em 1º lugar por resolver. Complete a pergunta de desempate antes de inscrever a turma.');
      }
      return;
    }
    setSubmitting(true);
    try {
      // Only the casting winner advances to the final contest — the turma's
      // team is registered with a single competitor, not all 5 candidates.
      await registerCastingTeam(
        teacherName.trim(),
        className.trim(),
        category as AgeCategory,
        [championName],
        championName
      );
      setSuccess(`Turma "${className.trim()}" inscrita no concurso final com "${championName}" como representante (vencedor(a) do casting).`);
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
    const roundsPerStudent = Math.floor(sessionQuestions.length / COMPETITOR_COUNT) || 1;
    const currentRoundNumber = Math.floor(roundIndex / COMPETITOR_COUNT) + 1;
    const studentPosInRound = (roundIndex % COMPETITOR_COUNT) + 1;
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
                Rodada {currentRoundNumber} / {roundsPerStudent} • Aluno {studentPosInRound} / {COMPETITOR_COUNT}
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
            {championName ? (
              <>
                <h2 className="text-3xl font-black text-display">{championName}</h2>
                <p className="text-sm text-slate-400">
                  venceu o casting com {winner?.points} pontos ({winner?.correct} acerto{winner?.correct === 1 ? '' : 's'})
                  {tiebreak?.resolvedWinner && ' — decidido na pergunta de desempate'}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-black text-display text-amber-400">Empate em 1º lugar!</h2>
                <p className="text-sm text-slate-400">Resolva a pergunta de desempate abaixo para definir o(a) representante da turma.</p>
              </>
            )}
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
            <p className="text-[10px] text-slate-400 pt-1 text-center">
              Critério de desempate: 1º mais pontos, 2º mais acertos, 3º menos erros, 4º pergunta de desempate.
            </p>
          </div>

          {hasUnresolvedTie && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 text-slate-800">
              <p className="text-sm font-bold text-amber-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Empate entre: {tiedForFirst.join(', ')}
              </p>

              {!tiebreak ? (
                <button
                  onClick={() => startTiebreakRound(tiedForFirst, 1)}
                  className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-sm font-bold cursor-pointer"
                >
                  Iniciar Pergunta de Desempate
                </button>
              ) : (
                <div className="space-y-3 pt-1">
                  <p className="text-[11px] font-black uppercase tracking-widest text-amber-700">
                    Desempate{tiebreak.roundNum > 1 ? ` — Rodada ${tiebreak.roundNum}` : ''} • {tiebreak.candidates.length} concorrente{tiebreak.candidates.length !== 1 ? 's' : ''} disputando
                  </p>
                  <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-3">
                    <p className="text-[11px] font-bold uppercase text-slate-400">{tiebreak.question.lesson}</p>
                    <p className="text-sm font-bold text-slate-800">{tiebreak.question.question}</p>

                    {tiebreak.turnIdx < tiebreak.candidates.length ? (
                      <>
                        <p className="text-xs text-indigo-600 font-bold">Vez de: {tiebreak.candidates[tiebreak.turnIdx]}</p>
                        {tiebreak.question.type === 'chronological' ? (
                          <div className="space-y-2">
                            <ol className="list-decimal list-inside text-xs text-slate-600 bg-slate-50 rounded-lg p-3">
                              {tiebreak.question.options.map((opt, idx) => (
                                <li key={idx}>{opt}</li>
                              ))}
                            </ol>
                            <p className="text-[11px] text-slate-400 italic">O aluno disse a ordem em voz alta — indique se acertou:</p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleTiebreakChrono(true)}
                                className={`py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                                  tiebreak.answers[tiebreak.candidates[tiebreak.turnIdx]]?.chrono === true
                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                Ordem Correta
                              </button>
                              <button
                                onClick={() => handleTiebreakChrono(false)}
                                className={`py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                                  tiebreak.answers[tiebreak.candidates[tiebreak.turnIdx]]?.chrono === false
                                    ? 'border-rose-500 bg-rose-50 text-rose-800'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                }`}
                              >
                                Ordem Errada
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[11px] text-slate-400 italic">Clique na opção que o aluno respondeu em voz alta:</p>
                            <div className="grid grid-cols-1 gap-2">
                              {tiebreak.options.map((opt, idx) => {
                                const originalIdx = tiebreak.question.options.indexOf(opt);
                                const currentAns = tiebreak.answers[tiebreak.candidates[tiebreak.turnIdx]];
                                const isSelected = currentAns?.idx === originalIdx;
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => handleTiebreakSelect(originalIdx)}
                                    className={`text-left px-3 py-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                                      isSelected
                                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                    }`}
                                  >
                                    {String.fromCharCode(65 + idx)}) {opt}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <button
                          onClick={handleTiebreakConfirmTurn}
                          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold cursor-pointer"
                        >
                          Confirmar resposta e avançar
                        </button>
                      </>
                    ) : !tiebreak.revealed ? (
                      <button
                        onClick={handleTiebreakReveal}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                      >
                        Revelar Resultado do Desempate
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[11px] text-slate-500">
                          {tiebreak.question.type === 'chronological'
                            ? 'A ordem apresentada acima era a correta.'
                            : `Resposta correta: ${tiebreak.question.options[tiebreak.question.correctAnswer]}`}
                        </p>
                        {tiebreak.candidates.map((name) => {
                          const ans = tiebreak.answers[name];
                          const correct = tiebreak.question.type === 'chronological'
                            ? ans?.chrono === true
                            : ans?.idx === tiebreak.question.correctAnswer;
                          return (
                            <div key={name} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${correct ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                              <span className="font-bold">{name}</span>
                              <span>{correct ? 'Acertou ✔' : 'Errou ✖'}</span>
                            </div>
                          );
                        })}
                        {tiebreak.resolvedWinner ? (
                          <p className="text-sm font-black text-emerald-700 text-center pt-1">🏆 {tiebreak.resolvedWinner} venceu o desempate!</p>
                        ) : (
                          <button
                            onClick={handleNextTiebreakRound}
                            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-xs font-bold cursor-pointer"
                          >
                            Ainda empatado — Nova Pergunta de Desempate
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-300 font-semibold bg-rose-950/40 border border-rose-900/40 rounded-lg p-3">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={handleRegisterAfterCasting}
              disabled={submitting || !championName}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl font-bold shadow-md transition-all text-display flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              <GraduationCap className="w-4 h-4" />
              {submitting ? 'A inscrever...' : `Inscrever ${championName || 'Vencedor(a)'} no Concurso Final`}
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
            As perguntas e opções aparecem aqui mesmo. Cada um dos {COMPETITOR_COUNT} concorrentes responde ao mesmo número de perguntas
            — todas diferentes entre si, sem nenhuma repetição — passando a vez entre os alunos a cada rodada (aluno 1, aluno 2, ... até o último, e recomeça).
            No final, o concorrente com mais pontos é o vencedor do casting (havendo empate, uma pergunta de desempate decide) —
            e é <strong>só ele(a)</strong> que fica inscrito(a) para representar a turma no concurso final.
            Não é preciso ir à tela do apresentador — essa é só para o concurso final.
          </p>

          <div className="max-w-xs">
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5" /> Perguntas por aluno
            </label>
            <input
              type="number"
              value={questionCount}
              onChange={(e) => setQuestionCount(Number(e.target.value))}
              min={1}
              max={50}
              className="w-full text-sm bg-slate-50 border border-slate-200 rounded-lg p-2.5 outline-none focus:bg-white focus:border-slate-400"
            />
            <p className="text-[10px] text-slate-400 mt-1 italic">
              Cada um dos {COMPETITOR_COUNT} concorrentes vai responder a {Math.max(1, Math.floor(questionCount) || DEFAULT_CASTING_QUESTIONS)} pergunta(s) diferente(s),
              num total de {Math.max(1, Math.floor(questionCount) || DEFAULT_CASTING_QUESTIONS) * COMPETITOR_COUNT} rodadas.
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
