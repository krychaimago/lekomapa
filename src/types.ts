/**
 * Typy współdzielone: encje odpowiadające wierszom tabel i polecenia zapisu.
 *
 * Pisane ręcznie, bez generowania z bazy — dzięki temu `npm run typecheck`
 * nie wymaga uruchomionego Supabase. Źródłem prawdy o kolumnach pozostaje
 * migracja `supabase/migrations/20260922120000_medication_schema.sql`;
 * przy zmianie schematu poprawiamy oba pliki razem.
 *
 * Konwencja: kolumna dopuszczająca pustą wartość to `| null`, daty i znaczniki
 * czasu to `string` w zapisie ISO (`YYYY-MM-DD` dla `date`, pełny ISO 8601 dla
 * `timestamptz`) — tak zwraca je klient Supabase.
 */

/** Skąd pochodzi skład preparatu. Zgodne z kontrolą `medications_composition_source_check`. */
export type CompositionSource = "registry" | "leaflet";

/** Wiersz `public.medications` — preparat przyjmowany przez użytkowniczkę. */
export interface Medication {
  id: string;
  /** Właściciel wiersza; na nim stoi izolacja danych per-konto w politykach RLS. */
  user_id: string;
  product_name: string;
  composition_source: CompositionSource;
  /**
   * Pusta wartość, gdy skład pochodzi z ulotki, a nie z rejestru leków.
   * Bez klucza obcego — tabela rejestru powstaje dopiero w F-02.
   */
  registry_medication_id: string | null;
  /** Wypełniona data oznacza lek zakończony, nie usunięty — historia zostaje. */
  discontinued_on: string | null;
  created_at: string;
  updated_at: string;
}

/** Wiersz `public.medication_substances` — jedna substancja czynna preparatu. */
export interface MedicationSubstance {
  id: string;
  medication_id: string;
  substance_name: string;
  /**
   * Pełny kod ATC ze źródła, nigdy obcinany do grupy objętej regułami:
   * dopasowanie reguł idzie po przedrostku, a obcięcie przy zapisie
   * wyrzuciłoby dane, które produkt miał w ręku.
   */
  atc_code: string;
}

/** Wiersz `public.dosage_periods` — jeden okres dawkowania leku. */
export interface DosagePeriod {
  id: string;
  medication_id: string;
  dose_text: string;
  started_on: string;
  /** Pusta wartość oznacza okres trwający. */
  ended_on: string | null;
  /**
   * Kolumna wyliczana przez bazę (`daterange(started_on, ended_on, '[)')`),
   * dostępna wyłącznie przy odczycie. Obsługuje ograniczenie przeciw
   * nakładkom okresów.
   */
  period: string;
  created_at: string;
}

/**
 * Polecenie zapisu nowego leku.
 *
 * Bez `user_id`: wartość pochodzi z sesji (`context.locals.user`), a polityka
 * RLS i tak porównuje ją z `auth.uid()`. Przyjmowanie jej z wejścia dawałoby
 * pole, które wygląda na ustawialne przez wywołującego.
 */
export interface NewMedicationCommand {
  product_name: string;
  composition_source: CompositionSource;
  registry_medication_id?: string | null;
  discontinued_on?: string | null;
}

/** Polecenie zapisu jednej substancji czynnej preparatu. */
export interface NewMedicationSubstanceCommand {
  medication_id: string;
  substance_name: string;
  atc_code: string;
}

/**
 * Polecenie zapisu nowego okresu dawkowania.
 *
 * Bez `period`: to kolumna wyliczana przez bazę, więc podanie jej przy zapisie
 * kończy się błędem. Zmiana dawki dopisuje nowy okres i zamyka poprzedni
 * datą w `ended_on`, zamiast nadpisywać istniejący wiersz.
 */
export interface NewDosagePeriodCommand {
  medication_id: string;
  dose_text: string;
  started_on: string;
  ended_on?: string | null;
}
