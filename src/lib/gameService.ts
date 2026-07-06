import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  onSnapshot, 
  updateDoc, 
  addDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where, 
  writeBatch,
  Timestamp,
  getDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { Team, Question, GameState, Answer, GameStatus, GameMode } from '../types';
import { defaultQuestions } from '../data/defaultQuestions';

const GAME_STATE_ID = 'current_game';

// 1. Seed Questions If Empty
export async function seedQuestionsIfEmpty(): Promise<number> {
  const qCol = collection(db, 'questions');
  const snapshot = await getDocs(qCol);
  
  if (snapshot.empty) {
    const batch = writeBatch(db);
    defaultQuestions.forEach((q) => {
      const docRef = doc(qCol, q.id);
      batch.set(docRef, q);
    });
    await batch.commit();
    return defaultQuestions.length;
  }
  return snapshot.size;
}

// 2. Subscribe to Game State
export function subscribeToGameState(onUpdate: (state: GameState | null) => void) {
  const docRef = doc(db, 'game_state', GAME_STATE_ID);
  return onSnapshot(docRef, (snapshot) => {
    if (snapshot.exists()) {
      onUpdate(snapshot.data() as GameState);
    } else {
      // Create initial state if not exists
      const initialState: GameState = {
        id: GAME_STATE_ID,
        currentQuestionId: null,
        currentTeamId: null,
        round: 1,
        totalRounds: 3,
        status: 'setup',
        timerDuration: 30,
        timerStart: null,
        timerEnd: null,
        gameMode: 'sunday_school',
        revealed: false,
        eliminatedTeamIds: [],
        shuffledOptions: [],
        selectedOptionIndex: null,
        chronologicalResult: null
      };
      setDoc(docRef, initialState);
      onUpdate(initialState);
    }
  });
}

// 3. Update Game State
export async function updateGameState(updates: Partial<GameState>) {
  const docRef = doc(db, 'game_state', GAME_STATE_ID);
  await updateDoc(docRef, updates);
}

// 4. Subscribe to Teams
export function subscribeToTeams(onUpdate: (teams: Team[]) => void) {
  const q = query(collection(db, 'teams'), orderBy('score', 'desc'), orderBy('correct', 'desc'));
  return onSnapshot(q, (snapshot) => {
    const teams: Team[] = [];
    snapshot.forEach((doc) => {
      teams.push({ id: doc.id, ...doc.data() } as Team);
    });
    onUpdate(teams);
  });
}

// 5. Subscribe to All Questions
export function subscribeToQuestions(onUpdate: (questions: Question[]) => void) {
  return onSnapshot(collection(db, 'questions'), (snapshot) => {
    const questions: Question[] = [];
    snapshot.forEach((doc) => {
      questions.push({ id: doc.id, ...doc.data() } as Question);
    });
    onUpdate(questions);
  });
}

// 6. Subscribe to Answers
export function subscribeToAnswers(onUpdate: (answers: Answer[]) => void) {
  const q = query(collection(db, 'answers'), orderBy('timestamp', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const answers: Answer[] = [];
    snapshot.forEach((doc) => {
      answers.push({ id: doc.id, ...doc.data() } as Answer);
    });
    onUpdate(answers);
  });
}

// 10. Add Team
export async function addTeam(name: string, membersCount: number) {
  const id = `team_${Date.now()}`;
  const teamRef = doc(db, 'teams', id);
  const newTeam: Team = {
    id,
    name,
    membersCount,
    score: 0,
    correct: 0,
    wrong: 0,
    totalAnswerTimeMs: 0,
    membersAnswered: []
  };
  await setDoc(teamRef, newTeam);
}

// 11. Delete Team
export async function deleteTeam(id: string) {
  await deleteDoc(doc(db, 'teams', id));
}

// 12. Add Single Question
export async function addQuestion(q: Omit<Question, 'id' | 'used'>) {
  const id = `q_${Date.now()}`;
  const qRef = doc(db, 'questions', id);
  await setDoc(qRef, {
    ...q,
    id,
    used: false
  });
}

// 13. Update Single Question
export async function updateQuestion(id: string, q: Partial<Question>) {
  await updateDoc(doc(db, 'questions', id), q);
}

// 14. Delete Single Question
export async function deleteQuestion(id: string) {
  await deleteDoc(doc(db, 'questions', id));
}

// 15. Submit Answer (And update Team statistics)
export async function submitAnswer(
  teamId: string,
  questionId: string,
  isCorrect: boolean,
  pointsEarned: number,
  roundNumber: number,
  memberName?: string,
  answerTimeMs?: number
) {
  // Create Answer log entry
  const answerId = `ans_${Date.now()}`;
  const answerRef = doc(db, 'answers', answerId);
  const answerData: Answer = {
    id: answerId,
    teamId,
    questionId,
    isCorrect,
    pointsEarned: isCorrect ? pointsEarned : 0,
    timestamp: Timestamp.now(),
    roundNumber,
    memberName: memberName || 'Membro da Equipa',
    answerTimeMs: answerTimeMs || 0
  };
  await setDoc(answerRef, answerData);

  // Mark question as used
  await updateDoc(doc(db, 'questions', questionId), { used: true });

  // Update team stats
  const teamRef = doc(db, 'teams', teamId);
  const teamSnap = await getDoc(teamRef);
  if (teamSnap.exists()) {
    const team = teamSnap.data() as Team;
    const currentCorrect = team.correct + (isCorrect ? 1 : 0);
    const currentWrong = team.wrong + (isCorrect ? 0 : 1);
    const currentScore = team.score + (isCorrect ? pointsEarned : 0);
    
    // Rotation logic
    let updatedMembersAnswered = [...(team.membersAnswered || [])];
    if (memberName) {
      if (!updatedMembersAnswered.includes(memberName)) {
        updatedMembersAnswered.push(memberName);
      }
      // Reset rotation if all members have answered
      if (updatedMembersAnswered.length >= team.membersCount) {
        updatedMembersAnswered = [];
      }
    }

    const currentTotalTime = (team.totalAnswerTimeMs || 0) + (answerTimeMs || 0);

    await updateDoc(teamRef, {
      correct: currentCorrect,
      wrong: currentWrong,
      score: currentScore,
      totalAnswerTimeMs: currentTotalTime,
      lastAnsweredAt: Timestamp.now(),
      membersAnswered: updatedMembersAnswered
    });
  }
}

// 16. Reset Game
export async function resetGame() {
  const batch = writeBatch(db);

  // 1. Reset all teams scores & statistics
  const teamsCol = collection(db, 'teams');
  const teamsSnap = await getDocs(teamsCol);
  teamsSnap.forEach((doc) => {
    batch.update(doc.ref, {
      score: 0,
      correct: 0,
      wrong: 0,
      totalAnswerTimeMs: 0,
      lastAnsweredAt: null,
      membersAnswered: []
    });
  });

  // 2. Mark all questions as unused
  const questionsCol = collection(db, 'questions');
  const questionsSnap = await getDocs(questionsCol);
  questionsSnap.forEach((doc) => {
    batch.update(doc.ref, { used: false });
  });

  // 3. Delete all answers
  const answersCol = collection(db, 'answers');
  const answersSnap = await getDocs(answersCol);
  answersSnap.forEach((doc) => {
    batch.delete(doc.ref);
  });

  // 4. Reset Game State to setup
  const stateDoc = doc(db, 'game_state', GAME_STATE_ID);
  batch.set(stateDoc, {
    id: GAME_STATE_ID,
    currentQuestionId: null,
    currentTeamId: null,
    round: 1,
    totalRounds: 3,
    status: 'setup',
    timerDuration: 30,
    timerStart: null,
    timerEnd: null,
    gameMode: 'sunday_school',
    revealed: false,
    eliminatedTeamIds: [],
    shuffledOptions: [],
    selectedOptionIndex: null,
    chronologicalResult: null
  });

  await batch.commit();
}

// 17. Batch Import Questions
export async function batchImportQuestions(questions: Omit<Question, 'id' | 'used'>[]) {
  const batch = writeBatch(db);
  const qCol = collection(db, 'questions');
  questions.forEach((q) => {
    const id = `q_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const qRef = doc(qCol, id);
    batch.set(qRef, {
      ...q,
      id,
      used: false
    });
  });
  await batch.commit();
}
