// Faixas etárias do concurso. Cada equipa pertence a uma faixa e só recebe
// perguntas cadastradas para essa mesma faixa (dificuldade adaptada).
export type AgeCategory = 'junior' | 'pleno' | 'senior';

export const AGE_CATEGORIES: AgeCategory[] = ['junior', 'pleno', 'senior'];

export const AGE_CATEGORY_LABELS: Record<AgeCategory, string> = {
  junior: 'Júnior',
  pleno: 'Pleno',
  senior: 'Sénior'
};

export interface Team {
  id: string;
  name: string;
  membersCount: number;
  ageCategory: AgeCategory;
  score: number;
  correct: number;
  wrong: number;
  totalAnswerTimeMs?: number; // Sum of ALL response times (correct + wrong), used to compute the average response time
  correctAnswerTimeMs?: number; // Sum of response times ONLY for correct answers ("Tempo Total de Acertos")
  lastAnsweredAt?: any; // Timestamp
  membersAnswered?: string[]; // Names of members who have answered in the current rotation
  // --- Casting / registration fields (filled in by the teacher during casting) ---
  teacherName?: string; // Nome do professor(a) responsável pela turma
  className?: string; // Nome da turma (ex: "Turma A"). Também usado como nome de exibição da equipa.
  memberNames?: string[]; // Nomes dos concorrentes escalados (normalmente 5)
  registeredAt?: any; // Timestamp do momento em que o casting foi feito
  castingWinnerName?: string; // Nome do concorrente que venceu a rodada de casting da turma (opcional)
}

export interface Question {
  id: string;
  lesson: string;
  type: 'multiple_choice' | 'true_false' | 'who_am_i' | 'incomplete_verse' | 'chronological';
  question: string;
  options: string[]; // Options or items to order
  correctAnswer: any; // index (number), boolean, or string, or ordered indexes
  points: number;
  difficulty: 'easy' | 'medium' | 'hard' | 'very_hard';
  ageCategory: AgeCategory; // Faixa etária a que esta pergunta se destina
  used: boolean;
}

export type GameStatus = 'setup' | 'waiting' | 'running' | 'showing_answer' | 'finished';
export type GameMode = 'teams';

// A single candidate's answer during a tie-break round. Only one of the two
// fields is used, depending on the tie-break question's type (same rule as
// the main quiz: chronological questions use `chronologicalResult`, every
// other type uses `selectedOptionIndex`).
export interface TiebreakAnswer {
  selectedOptionIndex: number | null;
  chronologicalResult: boolean | null;
}

// Live state for a "sudden death" tie-break: only run AFTER every category
// has finished all of its normal rounds (i.e. the whole contest reached
// `status === 'finished'`), and only for a category whose top spot is tied
// on number of correct answers. Candidates take turns answering the same
// question; whoever is the lone correct answer wins. If nobody (or more than
// one) gets it right, a new question is drawn among the still-tied
// candidates and `roundNum` increments.
export interface TiebreakState {
  category: AgeCategory;
  candidateTeamIds: string[]; // teams still competing in this tie-break round
  roundNum: number;
  questionId: string | null;
  shuffledOptions: string[];
  currentTeamId: string | null; // whose turn it is to answer now; null once everyone has answered (ready to reveal)
  answersByTeam: Record<string, TiebreakAnswer>;
  revealed: boolean;
  resolvedWinnerTeamId: string | null;
}

export interface GameState {
  id: string;
  currentQuestionId: string | null;
  currentTeamId: string | null;
  round: number;
  totalRounds: number;
  status: GameStatus;
  timerDuration: number; // e.g. 30
  timerStart: number | null; // epoch timestamp
  timerEnd: number | null; // epoch timestamp
  gameMode: GameMode;
  revealed: boolean;
  currentMemberName?: string;
  turnQuestionIndex?: number; // How many of the 2 questions in the current competitor's turn have been answered (0, 1 or 2)
  activeCategory?: AgeCategory | null; // Faixa etária que está a competir agora — as faixas jogam em sequência: Júnior → Pleno → Sénior
  completedCategories?: AgeCategory[]; // Faixas cujas rodadas normais já terminaram nesta partida
  eliminatedTeamIds?: string[]; // For competition mode
  shuffledOptions?: string[]; // Store shuffled options for the current question
  selectedOptionIndex?: number | null; // Original (non-shuffled) index of the option chosen by the presenter/system as the team's answer
  chronologicalResult?: boolean | null; // For 'chronological' questions: whether the team's spoken order was correct
  tiebreak?: TiebreakState | null; // Active sudden-death tie-break, if one is running
  categoryWinnerIds?: Partial<Record<AgeCategory, string>>; // Official winner (team id) per category, once decided — set directly when there's no tie, or after a tie-break is resolved
  resultsRevealed?: boolean; // Once the whole contest is 'finished', the projector shows a "júris a avaliar" holding screen until the presenter explicitly reveals the results with this flag
}

export interface Answer {
  id: string;
  teamId: string;
  questionId: string;
  isCorrect: boolean;
  pointsEarned: number;
  timestamp: any; // Timestamp
  roundNumber: number;
  memberName?: string;
  answerTimeMs?: number; // How long the team took to answer, in milliseconds
}
