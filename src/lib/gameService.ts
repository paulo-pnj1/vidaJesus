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
import { Team, Question, GameState, Answer, GameStatus, GameMode, AgeCategory, AGE_CATEGORIES } from '../types';
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
        gameMode: 'teams',
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

// Shared comparator used everywhere teams are ranked (leaderboard, judge panel, winner screen).
// Ranking order:
//   1. Aproveitamento % (acertos / total de respostas) — critério principal
//   2. Pontuação (score)
//   3. Número de respostas certas
//   4. Menos respostas erradas
//   5. Tempo médio de resposta (mais rápido primeiro)
// This chain ensures a deterministic result even when teams are fully tied on
// accuracy (e.g. everyone at 0% because no one has answered correctly yet) —
// previously that case fell back to arbitrary Firestore snapshot order.
export function compareTeams(a: Team, b: Team): number {
  const aTotal = a.correct + a.wrong;
  const bTotal = b.correct + b.wrong;
  const aRate = aTotal > 0 ? a.correct / aTotal : 0;
  const bRate = bTotal > 0 ? b.correct / bTotal : 0;
  if (bRate !== aRate) return bRate - aRate;
  if (b.score !== a.score) return b.score - a.score;
  if (b.correct !== a.correct) return b.correct - a.correct;
  if (a.wrong !== b.wrong) return a.wrong - b.wrong;
  const aAvg = aTotal > 0 && a.totalAnswerTimeMs ? a.totalAnswerTimeMs / aTotal : Infinity;
  const bAvg = bTotal > 0 && b.totalAnswerTimeMs ? b.totalAnswerTimeMs / bTotal : Infinity;
  return aAvg - bAvg;
}

// Groups already-sorted-or-not teams into the 3 age categories, sorting each
// group internally with compareTeams(). Empty categories are omitted.
export function groupTeamsByCategory(teams: Team[]): { category: AgeCategory; teams: Team[] }[] {
  return AGE_CATEGORIES
    .map((category) => ({
      category,
      teams: teams.filter((t) => t.ageCategory === category).sort(compareTeams)
    }))
    .filter((g) => g.teams.length > 0);
}

// 4. Subscribe to Teams
export function subscribeToTeams(onUpdate: (teams: Team[]) => void) {
  // NOTE: we intentionally do NOT use orderBy() with multiple fields here.
  // A Firestore query with two orderBy() clauses on different fields requires a
  // composite index; if that index doesn't exist in the project, onSnapshot()
  // fails silently (no live updates at all — new teams only showed up after a
  // manual refresh, once the local cache eventually got the data some other way).
  // Sorting client-side avoids the index requirement entirely and keeps updates instant.
  const q = query(collection(db, 'teams'));
  return onSnapshot(
    q,
    (snapshot) => {
      const teams: Team[] = [];
      snapshot.forEach((doc) => {
        teams.push({ id: doc.id, ...doc.data() } as Team);
      });
      teams.sort(compareTeams);
      onUpdate(teams);
    },
    (error) => {
      console.error('Erro ao sincronizar equipas em tempo real:', error);
    }
  );
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
export async function addTeam(
  name: string,
  membersCount: number,
  ageCategory: AgeCategory,
  extra?: { teacherName?: string; className?: string; memberNames?: string[]; castingWinnerName?: string }
) {
  const id = `team_${Date.now()}`;
  const teamRef = doc(db, 'teams', id);
  const newTeam: Team = {
    id,
    name,
    membersCount,
    ageCategory,
    score: 0,
    correct: 0,
    wrong: 0,
    totalAnswerTimeMs: 0,
    correctAnswerTimeMs: 0,
    membersAnswered: [],
    ...(extra?.teacherName ? { teacherName: extra.teacherName } : {}),
    ...(extra?.className ? { className: extra.className } : {}),
    ...(extra?.memberNames ? { memberNames: extra.memberNames } : {}),
    ...(extra?.castingWinnerName ? { castingWinnerName: extra.castingWinnerName } : {}),
    ...(extra ? { registeredAt: Timestamp.now() } : {})
  };
  await setDoc(teamRef, newTeam);
  return id;
}

// 19. Register a Casting Team (used by the teacher self-service Casting Panel).
// Wraps addTeam() with the exact shape the casting form collects: teacher name,
// class ("turma") name, age category and the 5 competitor names. The turma name
// is used as the team's display name everywhere else in the app (leaderboard,
// projector, judge panel). castingWinnerName is optional — filled in when the
// teacher ran the live casting mini-quiz before registering.
export async function registerCastingTeam(
  teacherName: string,
  className: string,
  ageCategory: AgeCategory,
  memberNames: string[],
  castingWinnerName?: string
) {
  return addTeam(className, memberNames.length, ageCategory, {
    teacherName,
    className,
    memberNames,
    ...(castingWinnerName ? { castingWinnerName } : {})
  });
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
    const currentCorrectTime = (team.correctAnswerTimeMs || 0) + (isCorrect ? (answerTimeMs || 0) : 0);

    await updateDoc(teamRef, {
      correct: currentCorrect,
      wrong: currentWrong,
      score: currentScore,
      totalAnswerTimeMs: currentTotalTime,
      correctAnswerTimeMs: currentCorrectTime,
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
      correctAnswerTimeMs: 0,
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
    gameMode: 'teams',
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

// 19. Sync Missing Default Questions — unlike seedQuestionsIfEmpty (which only
// runs once, on a totally empty bank), this adds any question from
// defaultQuestions.ts that isn't in the database yet (matched by id),
// without touching or duplicating questions that are already there. Useful
// after the default question bank is expanded (e.g. more Júnior/Sénior
// questions added) so an already-seeded event can catch up. Returns how
// many new questions were added.
export async function syncMissingDefaultQuestions(): Promise<number> {
  const qCol = collection(db, 'questions');
  const snapshot = await getDocs(qCol);
  const existingIds = new Set(snapshot.docs.map((d) => d.id));

  const missing = defaultQuestions.filter((q) => !existingIds.has(q.id));
  if (missing.length === 0) return 0;

  const batch = writeBatch(db);
  missing.forEach((q) => {
    batch.set(doc(qCol, q.id), q);
  });
  await batch.commit();
  return missing.length;
}

// 20. Standardize Points — sets the `points` field of every question in the
// bank to the same fixed value, so no student is favoured or disadvantaged
// just because they happened to draw a question worth more or less than a
// teammate's (important for casting, where each competitor gets a
// different question). Returns how many questions were changed.
export async function standardizeAllQuestionPoints(points: number = 10): Promise<number> {
  const qCol = collection(db, 'questions');
  const snapshot = await getDocs(qCol);
  const batch = writeBatch(db);
  let count = 0;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as Question;
    if (data.points !== points) {
      batch.update(docSnap.ref, { points });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
  }
  return count;
}

// 21. Migration helper — assigns an ageCategory to any question in the bank
// that doesn't have one yet (e.g. questions created before this feature),
// based on its difficulty: easy -> junior, medium -> pleno, hard/very_hard -> senior.
// Existing ageCategory values are never overwritten. Returns how many were updated.
export async function autoAssignAgeCategoriesByDifficulty(): Promise<number> {
  const difficultyToCategory: Record<Question['difficulty'], AgeCategory> = {
    easy: 'junior',
    medium: 'pleno',
    hard: 'senior',
    very_hard: 'senior'
  };

  const qCol = collection(db, 'questions');
  const snapshot = await getDocs(qCol);
  const batch = writeBatch(db);
  let count = 0;

  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as Question;
    if (!data.ageCategory) {
      batch.update(docSnap.ref, { ageCategory: difficultyToCategory[data.difficulty] || 'pleno' });
      count++;
    }
  });

  if (count > 0) {
    await batch.commit();
  }
  return count;
}
