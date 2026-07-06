import { useState, useEffect } from 'react';
import { GameState } from './types';
import { subscribeToGameState } from './lib/gameService';
import PresenterPanel from './components/PresenterPanel';
import ProjectorPanel from './components/ProjectorPanel';
import JudgePanel from './components/JudgePanel';
import { Tv, Gamepad2, Scale, BookOpen, Sparkles, ArrowRight, Lock, User, LogOut } from 'lucide-react';

type Role = 'presenter' | 'projector' | 'judge';

// Hardcoded access credentials for the protected panels.
// Note: this is a simple front-end gate for a live event, not a real security boundary.
const CREDENTIALS: Record<'presenter' | 'judge', { user: string; pass: string }> = {
  presenter: { user: 'apr', pass: 'apr123' },
  judge: { user: 'jur', pass: 'jur123' },
};

function isProtectedRole(r: Role): r is 'presenter' | 'judge' {
  return r === 'presenter' || r === 'judge';
}

function authKey(r: 'presenter' | 'judge') {
  return `bible_game_auth_${r}`;
}

function isAuthenticated(r: Role): boolean {
  if (r === 'projector') return true;
  return localStorage.getItem(authKey(r)) === 'true';
}

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  // Role currently being logged into (shows the credentials form)
  const [loginRole, setLoginRole] = useState<'presenter' | 'judge' | null>(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Check URL hash or localStorage for persisted role
  useEffect(() => {
    const applyRole = (r: Role) => {
      if (isAuthenticated(r)) {
        setRole(r);
      } else if (isProtectedRole(r)) {
        setLoginRole(r);
      }
    };

    const hash = window.location.hash.toLowerCase();
    if (hash === '#presenter') {
      applyRole('presenter');
    } else if (hash === '#projector') {
      applyRole('projector');
    } else if (hash === '#judge') {
      applyRole('judge');
    } else {
      const savedRole = localStorage.getItem('bible_game_role') as Role | null;
      if (savedRole && ['presenter', 'projector', 'judge'].includes(savedRole)) {
        applyRole(savedRole);
      }
    }

    // Monitor hash changes
    const handleHashChange = () => {
      const currentHash = window.location.hash.toLowerCase();
      if (currentHash === '#presenter') {
        applyRole('presenter');
      } else if (currentHash === '#projector') {
        applyRole('projector');
      } else if (currentHash === '#judge') {
        applyRole('judge');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Listen to live game state
  useEffect(() => {
    const unsubscribe = subscribeToGameState((state) => {
      setGameState(state);
    });
    return () => unsubscribe();
  }, []);

  const commitRole = (selectedRole: Role) => {
    setRole(selectedRole);
    localStorage.setItem('bible_game_role', selectedRole);
    window.location.hash = selectedRole;
  };

  const handleSelectRole = (selectedRole: Role) => {
    if (isProtectedRole(selectedRole) && !isAuthenticated(selectedRole)) {
      setLoginRole(selectedRole);
      setLoginUser('');
      setLoginPass('');
      setLoginError(null);
      return;
    }
    commitRole(selectedRole);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginRole) return;
    const expected = CREDENTIALS[loginRole];
    if (loginUser.trim() === expected.user && loginPass === expected.pass) {
      localStorage.setItem(authKey(loginRole), 'true');
      commitRole(loginRole);
      setLoginRole(null);
      setLoginError(null);
    } else {
      setLoginError('Utilizador ou senha incorretos.');
    }
  };

  const handleClearRole = () => {
    // Logging out of a protected panel revokes access, so credentials are required again next time.
    if (role && isProtectedRole(role)) {
      localStorage.removeItem(authKey(role));
    }
    setRole(null);
    setLoginRole(null);
    localStorage.removeItem('bible_game_role');
    window.location.hash = '';
  };

  // Login Screen for protected panels (Presenter / Judge)
  if (loginRole) {
    const roleLabel = loginRole === 'presenter' ? 'Apresentador' : 'Banca de Jurados';
    const isPresenter = loginRole === 'presenter';
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative font-sans overflow-hidden">
        <div className={`absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full blur-[150px] pointer-events-none ${isPresenter ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}></div>
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 space-y-6 relative z-10">
          <div className="text-center space-y-2">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-inner ${isPresenter ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <Lock className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800 text-display">Painel {roleLabel}</h2>
            <p className="text-sm text-slate-500">Insira as credenciais de acesso para continuar.</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Utilizador</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  autoFocus
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:bg-white focus:border-slate-400 transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Senha</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  className="w-full text-sm bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 outline-none focus:bg-white focus:border-slate-400 transition-all"
                  required
                />
              </div>
            </div>

            {loginError && (
              <p className="text-xs text-rose-600 font-semibold bg-rose-50 border border-rose-100 rounded-lg p-2.5 text-center">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-semibold shadow-md transition-all text-display"
            >
              Entrar
            </button>

            <button
              type="button"
              onClick={() => setLoginRole(null)}
              className="w-full text-xs text-slate-400 hover:text-slate-600 underline text-center"
            >
              Voltar à seleção de perfil
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (!gameState) {
    return (
      <div id="loading-screen" className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white relative font-sans">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-amber-500/10 blur-[120px]"></div>
        
        <div className="z-10 text-center space-y-6">
          <div className="relative inline-block">
            <div className="w-16 h-16 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin"></div>
            <BookOpen className="w-6 h-6 text-amber-400 absolute inset-0 m-auto animate-pulse" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-display uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-200">
              Desafio Bíblico
            </h2>
            <p className="text-xs text-slate-400">Conectando ao Firebase e lendo estado em tempo real...</p>
          </div>
        </div>
      </div>
    );
  }

  // Active Screen Selector
  const renderActivePanel = () => {
    switch (role) {
      case 'presenter':
        return <PresenterPanel gameState={gameState} />;
      case 'projector':
        return <ProjectorPanel gameState={gameState} />;
      case 'judge':
        return <JudgePanel />;
      default:
        // Selection Screen
        return (
          <div id="role-selection" className="min-h-screen bg-slate-950 text-white flex flex-col justify-center items-center p-6 relative font-sans overflow-hidden">
            {/* Ambient Background Lights */}
            <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-500/10 blur-[150px] pointer-events-none"></div>
            <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-amber-500/10 blur-[150px] pointer-events-none"></div>

            <div className="max-w-4xl w-full z-10 space-y-12">
              {/* Header */}
              <div className="text-center space-y-3">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs text-amber-400 font-semibold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  Sistema de Concurso Digital Sincronizado
                </div>
                <h1 className="text-4xl md:text-6xl font-black text-display uppercase tracking-tight leading-none bg-gradient-to-r from-amber-400 via-amber-200 to-yellow-500 bg-clip-text text-transparent">
                  Desafio Bíblico
                </h1>
                <p className="text-slate-400 max-w-lg mx-auto text-sm md:text-base">
                  Selecione o seu perfil de acesso para participar nas 23 lições sobre a <strong>Vida de Jesus</strong>. Cada dispositivo atualizará em tempo real!
                </p>
              </div>

              {/* Roles Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. Presenter Card */}
                <div 
                  id="role-presenter-btn"
                  onClick={() => handleSelectRole('presenter')}
                  className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-amber-500/50 rounded-3xl p-6 flex flex-col justify-between space-y-6 transition-all duration-300 shadow-xl cursor-pointer hover:shadow-amber-500/5"
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-amber-500/10 group-hover:bg-amber-500/20 text-amber-400 rounded-2xl flex items-center justify-center border border-amber-500/20 transition-all">
                      <Gamepad2 className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-xl font-bold text-display text-white group-hover:text-amber-400 transition-colors">
                        Apresentador
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Controlador principal do game show. Cadastre equipes, sorteie/selecione as perguntas, controle os timers e atribua pontos.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-400 group-hover:translate-x-1 transition-transform">
                    <span>Entrar no Painel</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>

                {/* 2. Projector Card */}
                <div 
                  id="role-projector-btn"
                  onClick={() => handleSelectRole('projector')}
                  className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-blue-500/50 rounded-3xl p-6 flex flex-col justify-between space-y-6 transition-all duration-300 shadow-xl cursor-pointer hover:shadow-blue-500/5"
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-blue-500/10 group-hover:bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center border border-blue-500/20 transition-all">
                      <Tv className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-xl font-bold text-display text-white group-hover:text-blue-400 transition-colors">
                        Projetor / Público
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Ecrã de exibição pública. Projetado para TVs ou projetores de igreja. Exibe perguntas gigantes, efeitos de buzzer, cronômetro e a tabela geral.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-400 group-hover:translate-x-1 transition-transform">
                    <span>Projetar Ecrã</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>

                {/* 3. Judge Card */}
                <div 
                  id="role-judge-btn"
                  onClick={() => handleSelectRole('judge')}
                  className="group bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 hover:border-emerald-500/50 rounded-3xl p-6 flex flex-col justify-between space-y-6 transition-all duration-300 shadow-xl cursor-pointer hover:shadow-emerald-500/5"
                >
                  <div className="space-y-4">
                    <div className="w-12 h-12 bg-emerald-500/10 group-hover:bg-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/20 transition-all">
                      <Scale className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-xl font-bold text-display text-white group-hover:text-emerald-400 transition-colors">
                        Banca de Jurados
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Interface para os juízes. Veja as respostas certas em segredo e ajude o apresentador avaliando se a resposta oral foi correta ou não.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition-transform">
                    <span>Iniciar Julgamento</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>

              </div>

              {/* Developer Tip */}
              <div className="text-center">
                <p className="text-xs text-slate-500 italic">
                  Dica de teste: Abra esta mesma aplicação noutras abas ou dispositivos para simular uma competição ao vivo em tempo real!
                </p>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <>
      {renderActivePanel()}
      
      {/* Floating Elegant Role Switcher for Multi-device Sandbox Simulation */}
      {role && (
        <button
          id="toggle-role-floating-btn"
          onClick={handleClearRole}
          className="fixed bottom-4 right-4 z-50 bg-slate-900/85 hover:bg-slate-900 text-slate-300 hover:text-white px-3.5 py-2 rounded-full text-xs font-semibold backdrop-blur-md border border-slate-700/50 shadow-lg flex items-center gap-1.5 transition-all duration-300 scale-90 hover:scale-100 cursor-pointer"
          title={isProtectedRole(role) ? 'Sair e voltar à seleção de perfil' : 'Alterar Painel / Perfil'}
        >
          {isProtectedRole(role) ? (
            <LogOut className="w-3.5 h-3.5 text-amber-400" />
          ) : (
            <Gamepad2 className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span>{isProtectedRole(role) ? 'Sair' : 'Mudar Função'}</span>
        </button>
      )}
    </>
  );
}
