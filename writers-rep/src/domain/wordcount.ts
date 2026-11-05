/**
 * Word counting rule (PRD §4.2). Deterministic and identical for Arabic and English.
 *
 * A word is a maximal run of "word characters": letters (\p{L}, which includes the Arabic
 * tatweel U+0640), combining marks (\p{M}, e.g. Arabic harakat/tashkeel), and digits (\p{N}).
 * Inside a run these connectors do not split the word:
 *   - apostrophes ' ’ and hyphens - ‐ between word characters ("don't", "well-known")
 *   - ZWNJ U+200C / ZWJ U+200D
 *   - . , ٫ ٬ between two digits ("3.5", "1,000", "٣٫٥")
 * Everything else (whitespace, punctuation such as ، ؛ ؟ . , ! « », symbols, emoji) separates words.
 *
 * Consequences, intentionally:
 *   - Arabic is counted orthographically: "والكتاب" (and-the-book) is ONE word, as a reader sees it.
 *   - Diacritics never change the count: "كَتَبَ" == "كتب" == 1.
 *   - Numbers count as words; standalone punctuation and emoji do not.
 *
 * Word count is activity data only. It never decides whether a session is complete.
 */

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;
const DIGIT = /\p{N}/u;
const JOINERS = new Set(["'", '’', '-', '‐', '\u200C', '\u200D']);
const NUMERIC_JOINERS = new Set(['.', ',', '٫', '٬']);

export function countWords(text: string): number {
  const chars = Array.from(text);
  let count = 0;
  let inWord = false;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (WORD_CHAR.test(c)) {
      if (!inWord) {
        count++;
        inWord = true;
      }
      continue;
    }
    if (inWord) {
      const prev = chars[i - 1] ?? '';
      const next = chars[i + 1] ?? '';
      const joinsWords = JOINERS.has(c) && WORD_CHAR.test(next);
      const joinsDigits = NUMERIC_JOINERS.has(c) && DIGIT.test(prev) && DIGIT.test(next);
      if (joinsWords || joinsDigits) continue;
    }
    inWord = false;
  }
  return count;
}

/** Best-guess direction of a text by its first strong character; used for previews. */
export function detectDirection(text: string): 'rtl' | 'ltr' {
  for (const c of text) {
    if (/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u.test(c)) return 'rtl';
    if (/\p{L}/u.test(c)) return 'ltr';
  }
  return 'rtl';
}
