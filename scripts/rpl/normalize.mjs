// Substance name normalization: different spellings of one substance ("Amlodipini besilas", "Amlodipinum")
// must meet under one key, so the code dictionary built from single-substance products reaches the same
// substance inside combination products. Consistency matters more than linguistic accuracy: the dictionary
// and the lookup run through the same function.

// Salt, ester and hydrate words. Removed only after the first word — the first word is the substance itself,
// even when it looks like a salt ("Argininum", "Lysinum"). Extended from the word frequencies measured on the
// RPL snapshot; add to it when the measurement report shows a split substance.
export const SALT_WORDS = new Set([
  // anions
  "acetas",
  "besilas",
  // English spelling found in RPL next to the Latin one ("Clopidogrelum besilate")
  "besilate",
  "bitartras",
  "bromidum",
  "carbonas",
  "chloridum",
  "citras",
  "dihydrochloridum",
  "dimesilas",
  "digluconas",
  "dipropionas",
  "fumaras",
  "furoas",
  "gluconas",
  "hemifumaras",
  "hemitartras",
  "hydrobromidum",
  "hydrofumaras",
  "hydrosulfas",
  "hydrochloridum",
  "hydrogenocarbonas",
  "hydrogenosulfas",
  "hyclas",
  "lactas",
  "maleas",
  "malas",
  "mesilas",
  "mesylas",
  "napadisilas",
  "nitras",
  "oxalas",
  "pamoas",
  "phosphas",
  "propionas",
  "succinas",
  "sulfas",
  "tartras",
  "tosilas",
  "valeras",
  "xinafoas",
  // cations and counter-ions written as adjectives or genitives after the substance
  "argininum",
  "calcicum",
  "calicum",
  "dikalicum",
  "calcii",
  "dinatricum",
  "erbuminum",
  "kalicum",
  "kalii",
  "lysinum",
  "magnesicum",
  "magnesii",
  "meglumini",
  "megluminum",
  "natricum",
  "natrii",
  "tert-butylamini",
  "tert-butylaminum",
  "trinatricum",
  "trometamoli",
  "trometamolum",
  "zincicum",
  // prodrug esters that share the ATC code of the parent substance
  "cilexetili",
  "cilexetilum",
  "etexilatum",
  "medoxomili",
  "medoxomilum",
  // hydrates and solvates
  "anhydricum",
  "dihydricum",
  "dihydricus",
  "hemihydricum",
  "hemipentahydricum",
  "heptahydricum",
  "hexahydricum",
  "monohydricum",
  "pentahydricum",
  "sesquihydricum",
  "tetrahydricum",
  "trihydricum",
]);

// Inorganic salts name the metal first ("Natrii chloridum", "Kalii chloridum"). Stripping the anion there
// would merge sodium chloride with every other sodium salt, so such names are kept whole.
export const CATION_FIRST_WORDS = new Set([
  "aluminii",
  "ammonii",
  "argenti",
  "bismuthi",
  "calcii",
  "cupri",
  "ferri",
  "ferrosi",
  "kalii",
  "lithii",
  "magnesii",
  "natrii",
  "zinci",
]);

function stripDiacritics(text) {
  // NFD separates most accents; ł has no decomposition and needs its own mapping.
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");
}

export function normalizeSubstanceName(name) {
  const cleaned = stripDiacritics(String(name ?? "").toLowerCase())
    .replace(/\([^()]*\)/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned === "") return "";

  const words = cleaned.split(" ");
  if (words.length === 1 || CATION_FIRST_WORDS.has(words[0])) return words.join(" ");

  const kept = [words[0], ...words.slice(1).filter((word) => !SALT_WORDS.has(word))];
  // A removed salt leaves the substance in the genitive ("amlodipini besilas"); bring it back to the
  // nominative the single-substance products use ("amlodipinum").
  if (kept.length < words.length && kept.length === 1 && kept[0].endsWith("i")) {
    kept[0] = kept[0].slice(0, -1) + "um";
  }
  return kept.join(" ");
}

// Normalized name after the correction aliases: `aliases` maps the normalized form of a source spelling to its
// normalized target (typos, Polish names, salt spellings the word list does not cover).
export function resolveSubstanceName(name, aliases) {
  const normalized = normalizeSubstanceName(name);
  return aliases?.get(normalized) ?? normalized;
}
