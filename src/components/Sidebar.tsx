import {
  LayoutDashboard,
  Users,
  History,
  Plus,
  FileText,
  Percent,
  Wallet,
  Settings,
  Menu,
  X
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import ClassSelectionModal from './ClassSelectionModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import markUrl from '../assets/belfero-mark.svg';

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  // Granica `lg:` mieszka w arkuszu, a panel musi ją znać także w JS: bez tego zamknięta
  // szuflada na telefonie zostaje w kolejce fokusu, choć jej nie widać.
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const isHiddenPanel = isMobile && !isOpen;

  useEffect(() => {
    if (wasOpenRef.current && !isOpen) menuButtonRef.current?.focus();
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  const isActive = (path: string) => location.pathname === path;

  const navItems = [
    { icon: LayoutDashboard, label: 'Pulpit', path: '/dashboard', section: 'main' },
    { icon: Users, label: 'Moje klasy', path: '/classes', section: 'main' },
    { icon: FileText, label: 'Klucze odpowiedzi', path: '/answer-keys', section: 'main' },
    { icon: Percent, label: 'Progi ocen', path: '/grade-thresholds', section: 'main' },
    { icon: Plus, label: 'Sprawdź prace', path: 'modal', section: 'grading' },
    { icon: History, label: 'Historia sprawdzania', path: '/history', section: 'grading' },
    { icon: Wallet, label: 'Doładuj konto', path: '/wallet', section: 'account' },
    { icon: Settings, label: 'Ustawienia konta', path: '/settings', section: 'account' },
  ];

  const sections = {
    main: 'Podstawowe',
    grading: 'Sprawdzanie',
    account: 'Konto',
  };

  return (
    <>
      {/* Hamburger znika po otwarciu, bo przycisk zamknięcia stoi w nagłówku panelu */}
      {!isOpen && (
        <button
          ref={menuButtonRef}
          onClick={() => setIsOpen(true)}
          className="lg:hidden fixed top-3 left-4 z-50 w-9 h-9 bg-[#131B2E] border border-slate-800/60 rounded-xl text-slate-100 hover:bg-slate-800/50 transition-colors shadow-lg flex items-center justify-center cursor-pointer"
          aria-label="Otwórz menu"
          aria-expanded={isOpen}
          aria-controls="sidebar-panel"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>
      )}

      {/* Zaciemnienie tapety: klik poza panelem go zamyka */}
      {isOpen && isMobile && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/50 z-40"
          aria-hidden="true"
        />
      )}

      {/* Skip link: pierwszy fokus klawiatury ma wybijać nawigację, a nie zaczynać od „Pulpit”. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-16 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2.5 focus:rounded-xl focus:min-h-11"
      >
        Przejdź do treści
      </a>

      {/* Panel nawigacji */}
      <div
        id="sidebar-panel"
        inert={isHiddenPanel}
        className={`
          fixed left-0 top-0 h-screen bg-[#0B0F19] border-r border-slate-800/60 flex flex-col z-50
          transition-transform duration-300 ease-in-out motion-reduce:transition-none
          w-64
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}
      >
        {/* Znak firmowy i zamknięcie panelu */}
        <div className="p-4 lg:p-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <img
                src={markUrl}
                alt=""
                width={141}
                height={96}
                className="h-9 w-auto flex-shrink-0"
              />
              <div>
                <p className="text-lg lg:text-xl font-bold text-white">BELFRO.PL</p>
                <p className="text-xs text-slate-400">AI sprawdza za Ciebie</p>
              </div>
            </div>
            {/* Zamknięcie panelu jest tylko na telefonie, gdy szuflada jest otwarta */}
            <button
              onClick={() => setIsOpen(false)}
              className="lg:hidden p-2 hover:bg-slate-800/50 rounded-lg text-slate-400 hover:text-slate-100 transition-colors cursor-pointer"
              aria-label="Zamknij menu"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Trzy sekcje nawigacji, kolejność z tablicy sections */}
        <nav className="flex-1 px-3 space-y-6 overflow-y-auto">
          {Object.entries(sections).map(([key, label]) => (
            <div key={key}>
              <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {label}
              </p>
              <div className="space-y-1">
                {navItems
                  .filter((item) => item.section === key)
                  .map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);

                    return (
                      <button
                        key={item.path + item.label}
                        onClick={() => {
                          if (item.path === 'modal') {
                            setShowClassModal(true);
                          } else {
                            navigate(item.path);
                          }
                          setIsOpen(false);
                        }}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors duration-200 motion-reduce:transition-none cursor-pointer ${
                          active
                            ? 'bg-blue-500/20 text-white'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                        }`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                        <span className="text-sm font-medium">{item.label}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>

      </div>

      {/* Okno wyboru klasy do sprawdzenia */}
      <ClassSelectionModal isOpen={showClassModal} onClose={() => setShowClassModal(false)} />
    </>
  );
}
