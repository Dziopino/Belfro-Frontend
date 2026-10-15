/**
 * Moduł Kryptograficzny Zero-Knowledge
 *
 * Zarządza kluczem AES-GCM (256-bit) w pamięci RAM przeglądarki.
 * Klucz jest generowany z hasła użytkownika i encryption_salt z backendu przy użyciu PBKDF2.
 *
 * KRYTYCZNE: Klucz nigdy nie jest zapisywany w localStorage ani cookies!
 * Żyje wyłącznie w pamięci RAM sesji przeglądarki.
 */

// Prywatna zmienna modułu - klucz AES-GCM przechowywany TYLKO w RAM
let encryptionKey: CryptoKey | null = null;

const PBKDF2_ITERATIONS = 100000;
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // 12 bajtów dla AES-GCM

/**
 * Inicjalizuje klucz szyfrujący w pamięci RAM
 * Wywołaj to przy logowaniu, przekazując hasło użytkownika i salt z backendu
 *
 * @param password - Czyste hasło użytkownika z formularza logowania
 * @param saltHex - Hex string encryption_salt pobrany z backendu (64 znaki hex = 256 bitów)
 */
export async function initializeKey(password: string, saltHex: string): Promise<void> {
  try {
    // Konwertuj hex salt na ArrayBuffer
    const saltBuffer = hexToArrayBuffer(saltHex);

    // Przekształć hasło na klucz bazowy dla PBKDF2
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    // Wyprowadź klucz AES-GCM z hasła i salt używając PBKDF2
    encryptionKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBuffer,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: AES_KEY_LENGTH },
      false, // Klucz nie może być eksportowany (dodatkowe bezpieczeństwo)
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.error('Nie udało się wygenerować klucza szyfrowania z hasła:', error);
    throw new Error('Nie udało się wygenerować klucza szyfrowania');
  }
}

/**
 * Szyfruje tekst przy użyciu klucza z pamięci RAM
 * Generuje unikalny losowy IV (12 bajtów) przy każdym wywołaniu
 *
 * @param plainText - Tekst do zaszyfrowania (np. imię ucznia)
 * @returns Base64 string zawierający IV + zaszyfrowane dane
 */
export async function encryptData(plainText: string): Promise<string> {
  if (!encryptionKey) {
    throw new Error('Klucz szyfrujący nie jest ustawiony. Zaloguj się ponownie.');
  }

  try {
    // Wygeneruj losowy IV (Initialization Vector) - 12 bajtów dla AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Zakoduj tekst na bajty
    const encodedText = new TextEncoder().encode(plainText);

    // Zaszyfruj
    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      encryptionKey,
      encodedText
    );

    // Połącz IV + zaszyfrowane dane (IV jest potrzebne do odszyfrowania)
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);

    // Zakoduj jako Base64
    return arrayBufferToBase64(combined);
  } catch (error) {
    console.error('Nie udało się zaszyfrować danych:', error);
    throw new Error('Nie udało się zaszyfrować danych');
  }
}

/**
 * Odszyfrowuje dane używając klucza z pamięci RAM
 *
 * @param base64Data - Base64 string zawierający IV + zaszyfrowane dane
 * @returns Odszyfrowany tekst
 */
export async function decryptData(base64Data: string): Promise<string> {
  if (!encryptionKey) {
    throw new Error('Klucz szyfrujący nie jest ustawiony. Zaloguj się ponownie.');
  }

  try {
    // Dekoduj Base64 do ArrayBuffer
    const combined = base64ToArrayBuffer(base64Data);

    // Wyciągnij IV (pierwsze 12 bajtów)
    const iv = combined.slice(0, IV_LENGTH);

    // Wyciągnij zaszyfrowane dane (reszta)
    const encryptedData = combined.slice(IV_LENGTH);

    // Odszyfruj
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      encryptionKey,
      encryptedData
    );

    // Dekoduj bajty na tekst
    return new TextDecoder().decode(decryptedBuffer);
  } catch (error) {
    console.error('Nie udało się odszyfrować danych:', error);
    throw new Error('Nie udało się odszyfrować danych. Klucz szyfrujący może nie pasować — wyloguj się i zaloguj ponownie.');
  }
}

/**
 * Czyści klucz z pamięci RAM
 * Wywołaj to przy wylogowaniu użytkownika
 */
export function clearKey(): void {
  encryptionKey = null;
}

/**
 * Sprawdza czy klucz jest zainicjalizowany
 */
export function isKeyInitialized(): boolean {
  return encryptionKey !== null;
}

// ============================================
// Helper Functions - Konwersje
// ============================================

/**
 * Konwertuje hex string na ArrayBuffer
 */
function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Konwertuje ArrayBuffer na Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Konwertuje Base64 string na ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
