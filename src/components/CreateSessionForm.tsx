import { useNavigate } from 'react-router-dom';
import AnswerKeyPicker from './AnswerKeyPicker';
import type { AnswerKey, AnswerKeyGroupView } from '../types';
import { Layers, Lightbulb } from 'lucide-react';

interface CreateSessionFormProps {
  /** Grupy zwrócone razem z kluczem decydują o dalszych krokach kreatora: ich brak to sesja bez podziału */
  onSessionCreated: (answerKey: AnswerKey, answerKeyId: string | null, groups: AnswerKeyGroupView[]) => void;
}

export default function CreateSessionForm({ onSessionCreated }: CreateSessionFormProps) {
  const navigate = useNavigate();

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
      <AnswerKeyPicker
        confirmLabel="Kontynuuj"
        onBack={() => navigate(-1)}
        backLabel="Anuluj"
        onConfirm={onSessionCreated}
      />

      <div className="bg-[#131B2E] border border-slate-800/60 rounded-2xl p-4 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" aria-hidden="true" />
          </div>
          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Warianty arkusza (Grupa A, B, C) definiuje się w kluczu odpowiedzi. Wybierz klucz z grupami,
            a kreator dopisze krok, w którym przypiszesz do nich uczniów.
          </p>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-amber-950/40 border border-amber-800/50 rounded-xl p-3 sm:p-4">
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
          </div>
          <div>
            <h3 className="text-xs sm:text-sm font-semibold text-white mb-1">
              Wskazówka dla AI
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Im precyzyjniejsze wytyczne dla AI, tym lepsze wyniki sprawdzania.
              Możesz określić, czy akceptujesz warianty odpowiedzi lub czy przyznawać punkty za częściowo poprawne rozwiązania.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
