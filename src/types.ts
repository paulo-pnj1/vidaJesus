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
  eliminatedTeamIds?: string[]; // For competition mode
  shuffledOptions?: string[]; // Store shuffled options for the current question
  selectedOptionIndex?: number | null; // Original (non-shuffled) index of the option chosen by the presenter/system as the team's answer
  chronologicalResult?: boolean | null; // For 'chronological' questions: whether the team's spoken order was correct
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
