export interface Team {
  id: string;
  name: string;
  membersCount: number;
  score: number;
  correct: number;
  wrong: number;
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
  used: boolean;
}

export type GameStatus = 'setup' | 'waiting' | 'running' | 'showing_answer' | 'finished';
export type GameMode = 'sunday_school' | 'competition' | 'teams';

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
}

export interface JudgeDecision {
  judgeId: string;
  status: 'approved' | 'rejected';
  timestamp: any;
}

export interface JudgeVote {
  judgeId: string;
  isCorrect: boolean;
  timestamp: any;
}
