import React, { useState, useEffect } from 'react';
import { AgeCategory, AGE_CATEGORIES, AGE_CATEGORY_LABELS, Team } from '../types';
import { subscribeToTeams, registerCastingTeam } from '../lib/gameService';
import { Users, GraduationCap, CheckCircle2, Lock, ClipboardList, Trophy, Sparkles } from 'lucide-react';

// Simple front-end gate so a stray link doesn't get spammed by strangers.
// Like the presenter/judge login, this is NOT a real security boundary —
// just a shared word the teachers are given verbally/on a poster on casting day.
const CASTING_ACCESS_CODE = 'elenco2026';
const CASTING_AUTH_KEY = 'bible_game_casting_auth';

const CATEGORY_INFO: Record<AgeCategory, { range: string; level: string; color: string; ring: string; bg: string }> = {
  junior: { range: '6 a 9 anos', level: 'Perguntas fáceis', color: 'text-sky-600', ring: 'ring-sky-400', bg: 'bg-sky-50 border-sky-200' },
  pleno: { range: '10 a 13 anos', level: 'Perguntas médias', color: 'text-emerald-600', ring: 'ring-emerald-400', bg: 'bg-emerald-50 border-emerald-200' },
  senior: { range: '14 a 20 anos', level: 'Perguntas avançadas', color: 'text-purple-600', ring: 'ring-purple-400', bg: 'bg-purple-50 border-purple-200' },
};

const COMPETITOR_COUNT = 5;

export default function CastingPanel() {
  const [authed, setAuthed] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  const [teams, setTeams] = useState<Team[]>([]);
  const [category, setCategory] = useState<AgeCategory | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [className, setClassName] = useState('');
  const [members, setMembers] = useState<string[]>(Array(COMPETITOR_COUNT).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStorage.getItem(CASTING_AUTH_KEY) === 'true') {
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToTeams(setTeams);
    return () => unsubscribe();
  }, []);

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
  };

  const handleMemberChange = (idx: number, value: string) => {
    const next = [...members];
    next[idx] = value;
    setMembers(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!category) {
      setError('Escolha a categoria/faixa etária da turma.');
      return;
    }
    if (!teacherName.trim()) {
      setError('Indique o nome do professor(a).');
      return;
    }
    if (!className.trim()) {
      setError('Indique o nome da turma.');
      return;
    }
    const cleanedMembers = members.map((m) => m.trim());
    if (cleanedMembers.some((m) => !m)) {
      setError(`Preencha o nome dos ${COMPETITOR_COUNT} concorrentes.`);
      return;
    }
    const duplicateInCategory = teams.some(
      (t) => t.ageCategory === category && t.className?.trim().toLowerCase() === className.trim().toLowerCase()
    );
    if (duplicateInCategory) {
      setError('Já existe uma turma com este nome inscrita nesta categoria. Use um nome diferente (ex: "Turma A - Manhã").');
      return;
    }

    setSubmitting(true);
    try {
      await registerCastingTeam(teacherName.trim(), className.trim(), category, cleanedMembers);
      setSuccess(`Turma "${className.trim()}" inscrita com sucesso na categoria ${AGE_CATEGORY_LABELS[category]}!`);
      resetForm();
    } catch (err) {
      console.error(err);
      setError('Ocorreu um erro ao gravar a inscrição. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
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
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-5">
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
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white rounded-xl font-bold shadow-md transition-all text-display flex items-center justify-center gap-2 text-sm cursor-pointer"
          >
            <GraduationCap className="w-4 h-4" />
            {submitting ? 'A inscrever...' : 'Inscrever Turma'}
          </button>
        </form>

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
