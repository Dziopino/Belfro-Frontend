import { useEffect, useState } from 'react';
import { pluralPolish } from '../utils/polish';
import { studentIdentity, type StudentIdentity } from '../utils/studentIdentity';
import type { Student } from '../types';

/** Wiersz ucznia z już policzoną etykietą — nazwisko odszyfrowane albo numer z dziennika. */
export interface DecryptedStudent extends Student, StudentIdentity {}

/**
 * Zdanie o nieodszyfrowanych uczniach. Wyeksportowane, bo `StudentsPage` dokłada do niego nazwę
 * klasy i bez niego stałaby tam sucha lista myślników.
 */
export function decryptionErrorSentence(failed: number, total: number): string {
  const people = (count: number) => `${count} ${pluralPolish(count, 'ucznia', 'uczniów', 'uczniów')}`;
  return (
    `Nie udało się odszyfrować danych ${people(failed)} z ${people(total)}. Klucz deszyfrujący ` +
    'istnieje tylko w tej przeglądarce, więc wyloguj się i zaloguj ponownie — bez niego nazwiska pozostaną nieczytelne.'
  );
}

/**
 * Uczniowie z tożsamością gotową do wyświetlenia. Klucz istnieje tylko w przeglądarce, więc
 * deszyfrowanie jest jedyną drogą do jakiejkolwiek nazwy na ekranie; klasa numerowana w ogóle jej
 * nie potrzebuje. Błąd pod jednego ucznia nie może wyrzucić z kolejki całej klasy — taki wiersz
 * dostaje `decrypt_failed` i idziemy dalej.
 */
export function useDecryptedStudents(students: Student[]) {
  const [decryptedStudents, setDecryptedStudents] = useState<DecryptedStudent[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    if (students.length === 0) {
      setDecryptedStudents([]);
      setIsDecrypting(false);
      return;
    }

    setIsDecrypting(true);

    const decryptAll = async () => {
      const rows: DecryptedStudent[] = [];

      for (const student of students) {
        rows.push({ ...student, ...(await studentIdentity(student)) });
      }

      if (cancelled) return;

      setDecryptedStudents(rows);
      setIsDecrypting(false);

      const failed = rows.filter((row) => row.decrypt_failed).length;
      setError(failed > 0 ? decryptionErrorSentence(failed, rows.length) : '');
    };

    decryptAll();

    return () => {
      cancelled = true;
    };
  }, [students]);

  return { decryptedStudents, isDecrypting, error };
}
