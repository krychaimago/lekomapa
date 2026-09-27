-- Migration: symptom catalog seed (F-03)
--
-- Source: issue #3 (krychaimago/lekomapa), section "Treść listy", open question Q-2 settled 2026-09-21.
-- Copied 1:1 from context/changes/symptom-catalog-seed/symptom-list.md, approved by the author 2026-09-26:
-- keys, Polish names, categories, positions and search terms exactly as in that file.
--
-- Symptoms: 34 (digestive 8, nervous 7, mental 3, skin 3, circulatory 3, general 3, muscular 2, other 5).
-- Search terms: 82.
--
-- An applied migration is never edited. Any later change to the list (a new symptom, a renamed symptom, a new
-- search term, a new position) is a new migration. Such a migration finds a symptom by key, never by name;
-- keys are never changed (symptoms_guard_key).
-- symptoms_guard_key covers only a key change: an update or delete by a mistyped key changes 0 rows without an
-- error, and nothing blocks a delete until diary entries reference symptoms (S-05). So after every update or
-- delete by key, check the row count and stop the migration when it is not the expected one:
--   get diagnostics v_rows = row_count;
--   if v_rows <> 1 then raise exception 'symptom % not found', '<key>'; end if;
--
-- source_vocabulary and source_code are not set: they stay empty until version 2.
--
-- Idempotent: running it again adds no rows (on conflict ... do nothing). Search terms are bound to their
-- symptom by key, so the result does not depend on generated ids.

insert into public.symptoms (key, name, category, sort_order)
values
  ('nausea', 'mdłości', 'digestive', 1),
  ('vomiting', 'wymioty', 'digestive', 2),
  ('diarrhea', 'biegunka', 'digestive', 3),
  ('constipation', 'zaparcia', 'digestive', 4),
  ('abdominal_pain', 'ból brzucha', 'digestive', 5),
  ('loss_of_appetite', 'brak apetytu', 'digestive', 6),
  ('dry_mouth', 'suchość w ustach', 'digestive', 7),
  ('taste_change', 'zmiana smaku', 'digestive', 8),
  ('headache', 'ból głowy', 'nervous', 1),
  ('dizziness', 'zawroty głowy', 'nervous', 2),
  ('drowsiness', 'senność', 'nervous', 3),
  ('insomnia', 'bezsenność', 'nervous', 4),
  ('tremor', 'drżenie', 'nervous', 5),
  ('tingling_numbness', 'mrowienie i drętwienie', 'nervous', 6),
  ('concentration_problems', 'kłopoty z koncentracją', 'nervous', 7),
  ('anxiety', 'niepokój', 'mental', 1),
  ('low_mood', 'obniżony nastrój', 'mental', 2),
  ('irritability', 'drażliwość', 'mental', 3),
  ('rash', 'wysypka', 'skin', 1),
  ('itching', 'świąd', 'skin', 2),
  ('excessive_sweating', 'nadmierne pocenie', 'skin', 3),
  ('palpitations', 'kołatanie serca', 'circulatory', 1),
  ('orthostatic_hypotension', 'spadek ciśnienia przy wstawaniu', 'circulatory', 2),
  ('edema', 'obrzęki', 'circulatory', 3),
  ('fatigue', 'zmęczenie', 'general', 1),
  ('weight_change', 'zmiana masy ciała', 'general', 2),
  ('fever', 'gorączka', 'general', 3),
  ('muscle_pain', 'bóle mięśni', 'muscular', 1),
  ('muscle_cramps', 'skurcze mięśni', 'muscular', 2),
  ('cough', 'kaszel', 'other', 1),
  ('dyspnea', 'duszność', 'other', 2),
  ('vision_disturbance', 'zaburzenia widzenia', 'other', 3),
  ('frequent_urination', 'częstsze oddawanie moczu', 'other', 4),
  ('decreased_libido', 'spadek libido', 'other', 5)
on conflict (key) do nothing;

insert into public.symptom_search_terms (symptom_id, term)
select s.id, t.term
from (
  values
    ('nausea', 'nudności'),
    ('nausea', 'niedobrze mi'),
    ('nausea', 'zbiera się na wymioty'),
    ('vomiting', 'zwracanie'),
    ('vomiting', 'rzyganie'),
    ('diarrhea', 'sraczka'),
    ('diarrhea', 'rozwolnienie'),
    ('diarrhea', 'luźne stolce'),
    ('constipation', 'twardy stolec'),
    ('constipation', 'nie mogę się wypróżnić'),
    ('abdominal_pain', 'ból żołądka'),
    ('abdominal_pain', 'skurcze brzucha'),
    ('abdominal_pain', 'kolka'),
    ('loss_of_appetite', 'nie chce mi się jeść'),
    ('loss_of_appetite', 'wstręt do jedzenia'),
    ('dry_mouth', 'zaschnięte usta'),
    ('dry_mouth', 'brak śliny'),
    ('taste_change', 'metaliczny posmak'),
    ('taste_change', 'dziwny smak w ustach'),
    ('headache', 'migrena'),
    ('headache', 'łupanie w głowie'),
    ('dizziness', 'kręci mi się w głowie'),
    ('dizziness', 'chwieje mnie'),
    ('drowsiness', 'ospałość'),
    ('drowsiness', 'ciągle chce mi się spać'),
    ('insomnia', 'nie mogę zasnąć'),
    ('insomnia', 'budzę się w nocy'),
    ('tremor', 'trzęsące się ręce'),
    ('tremor', 'trzęsiączka'),
    ('tingling_numbness', 'ścierpnięte ręce'),
    ('tingling_numbness', 'kłucie igiełkami'),
    ('concentration_problems', 'mgła w głowie'),
    ('concentration_problems', 'rozkojarzenie'),
    ('concentration_problems', 'zapominanie'),
    ('anxiety', 'lęk'),
    ('anxiety', 'nerwowość'),
    ('anxiety', 'napięcie'),
    ('low_mood', 'przygnębienie'),
    ('low_mood', 'smutek'),
    ('low_mood', 'chandra'),
    ('irritability', 'rozdrażnienie'),
    ('irritability', 'wybuchowość'),
    ('irritability', 'irytacja'),
    ('rash', 'krostki'),
    ('rash', 'pokrzywka'),
    ('rash', 'plamy na skórze'),
    ('itching', 'swędzenie'),
    ('itching', 'drapanie'),
    ('excessive_sweating', 'zlewne poty'),
    ('excessive_sweating', 'nocne poty'),
    ('palpitations', 'serce wali'),
    ('palpitations', 'szybkie bicie serca'),
    ('palpitations', 'palpitacje'),
    ('orthostatic_hypotension', 'ciemno przed oczami'),
    ('orthostatic_hypotension', 'zasłabnięcie przy wstawaniu'),
    ('edema', 'opuchnięte nogi'),
    ('edema', 'opuchlizna'),
    ('edema', 'puchnięcie'),
    ('fatigue', 'osłabienie'),
    ('fatigue', 'brak siły'),
    ('fatigue', 'wyczerpanie'),
    ('weight_change', 'tycie'),
    ('weight_change', 'chudnięcie'),
    ('weight_change', 'spadek wagi'),
    ('fever', 'podwyższona temperatura'),
    ('fever', 'stan podgorączkowy'),
    ('muscle_pain', 'łamanie w mięśniach'),
    ('muscle_pain', 'zakwasy bez wysiłku'),
    ('muscle_cramps', 'kurcze'),
    ('muscle_cramps', 'łapie mnie w łydce'),
    ('cough', 'suchy kaszel'),
    ('cough', 'pokasływanie'),
    ('dyspnea', 'brak powietrza'),
    ('dyspnea', 'zadyszka'),
    ('dyspnea', 'nie mogę złapać oddechu'),
    ('vision_disturbance', 'zamazane widzenie'),
    ('vision_disturbance', 'podwójne widzenie'),
    ('vision_disturbance', 'mroczki'),
    ('frequent_urination', 'częste siusianie'),
    ('frequent_urination', 'częste chodzenie do toalety'),
    ('decreased_libido', 'brak ochoty na seks'),
    ('decreased_libido', 'obniżony popęd')
) as t (key, term)
join public.symptoms s on s.key = t.key
on conflict (symptom_id, term) do nothing;
