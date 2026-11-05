import { describe, expect, it } from 'vitest';
import { countWords, detectDirection } from '../../src/domain/wordcount';

describe('countWords (documented rule in src/domain/wordcount.ts)', () => {
  it.each([
    ['', 0],
    ['   \n\t ', 0],
    ['hello world', 2],
    ["don't stop", 2],
    ['a well-known fact', 3],
    ['Hello, world! How are you?', 5],
    ['كتبت اليوم عن البحر', 4],
    ['والكتاب على الطاولة', 3], // attached prefixes stay one orthographic word
    ['كَتَبَ الوَلَدُ الدَّرْسَ', 3], // diacritics never split or add words
    ['قالَ: نعم، لا؛ ربما؟', 4], // Arabic punctuation separates
    ['جميـــل', 1], // tatweel is part of the word
    ['«مرحبا» يا صديقي', 3],
    ['في عام 2026 كتبت 3.5 صفحة', 6],
    ['١٬٠٠٠ كلمة و٣٫٥ ساعة', 4],
    ['mixed نص عربي and English', 5],
    ['— … !!! 🙂', 0],
    ['line1\nline2\n\nline3', 3],
  ])('%j → %i', (text, expected) => {
    expect(countWords(text)).toBe(expected);
  });
});

describe('detectDirection', () => {
  it('uses the first strong character', () => {
    expect(detectDirection('مرحبا hello')).toBe('rtl');
    expect(detectDirection('  hello مرحبا')).toBe('ltr');
    expect(detectDirection('123')).toBe('rtl');
  });
});
