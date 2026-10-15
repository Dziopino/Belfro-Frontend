import { decryptData } from '../services/cryptoService';
import type { Student } from '../types';

/**
 * Jak wygląda uczeń na ekranie — jednakowo w klasie z nazwiskami i w klasie numerowanej.
 *
 * Istnieje, bo deszyfracja była rozpisana po pięciu miejscach aplikacji i każde z nich dorabiało
 * własny znak braku (`'—'`, pusty string, `'${imie} ${nazwisko}'` z podwójną spacją). W trybie
 * numerowanym dochodzi drugi stan, którego żaden z tych sposobów nie opisuje: nazwiska nie ma,
 * bo nigdy ich nie zapisano, a nie dlatego, że klucz przepadł.
 */
export interface StudentIdentity {
  /** Kolumna „Uczeń": „Jan Kowalski" albo „Nr 12". Zawsze niepusta. */
  label: string;
  /** Numer z dziennika — jawny w klasie numerowanej, odszyfrowany w klasie z nazwiskami. Pusty, gdy nie ma go skąd wziąć. */
  number: string;
  firstName: string;
  lastName: string;
  /** Klasa numerowana. Komponenty używają tego, by nie stawiać obok siebie „12" i „Nr 12". */
  numbered: boolean;
  /** Wyłącznie awaria klucza. Klasa numerowana nigdy jej nie ma, bo nie ma czego odszyfrowywać. */
  decrypt_failed: boolean;
}

/** Znak braku danych — używany, gdy klucz zawiódł albo wiersz nie ma ucznia w ogóle. */
export const UNIDENTIFIED_LABEL = '—';

/**
 * null w kolumnie szyfrowanej znaczy „tu nic nie leży" (klasa numerowana), a nie „nie umiemy
 * odczytać". Bez tego `decryptData` dostałby null i zgłosił awarię klucza przy sprawnej liście.
 */
async function decryptOrEmpty(blob: string | null): Promise<string> {
  return blob === null ? '' : decryptData(blob);
}

/** Etykieta dla listy numerowanej: numer z dziennika jest całym uczniem. */
export function numberedLabel(journalNumber: number): string {
  return `Nr ${journalNumber}`;
}

/**
 * Tożsamość ucznia w jednym przebiegu. Klasa numerowana rozpoznaje się po jawnym `journal_number`,
 * więc nie dotyka deszyfratora; klasa z nazwiskami deszyfruje trzy bloby i przy braku kluczu
 * wraca do kreski z `decrypt_failed`, żeby strona mogła powiedzieć nauczycielowi, co zrobić.
 */
export async function studentIdentity(student: Student): Promise<StudentIdentity> {
  const journalNumber = student.journal_number;
  const numbered = journalNumber !== null;

  try {
    const firstName = await decryptOrEmpty(student.encrypted_first_name);
    const lastName = await decryptOrEmpty(student.encrypted_last_name);
    const number = numbered ? String(journalNumber) : await decryptOrEmpty(student.encrypted_number);

    const fullName = [firstName, lastName].filter(Boolean).join(' ');

    return {
      label: numbered ? numberedLabel(journalNumber) : fullName || UNIDENTIFIED_LABEL,
      number,
      firstName,
      lastName,
      numbered,
      decrypt_failed: false,
    };
  } catch (error) {
    console.error(`Nie udało się odszyfrować ucznia ${student.id}:`, error);

    return {
      label: UNIDENTIFIED_LABEL,
      number: '',
      firstName: '',
      lastName: '',
      numbered,
      decrypt_failed: true,
    };
  }
}

/**
 * Etykieta bez deszyfracji — dla miejsc, które pokazują listę po nazwach klas albo licznik, a nie
 * potrzebują imienia. Tam, gdzie nazwisko ma realnie stanąć, użyj `studentIdentity`.
 */
export function studentFallbackLabel(student: Student): string {
  return student.journal_number !== null ? numberedLabel(student.journal_number) : UNIDENTIFIED_LABEL;
}
