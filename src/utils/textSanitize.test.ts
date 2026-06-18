import { sanitizeDisplayName, stripInvisibleCharacters } from './textSanitize';

describe('stripInvisibleCharacters', () => {
    test('removes zero width space (U+200B)', () => {
        expect(stripInvisibleCharacters('John​Doe')).toBe('JohnDoe');
    });

    test('removes zero width joiner and non-joiner', () => {
        expect(stripInvisibleCharacters('a‌b‍c')).toBe('abc');
    });

    test('removes byte order mark / zero width no-break space (U+FEFF)', () => {
        expect(stripInvisibleCharacters('﻿Cat')).toBe('Cat');
    });

    test('removes word joiner (U+2060)', () => {
        expect(stripInvisibleCharacters('Cat⁠Flare')).toBe('CatFlare');
    });

    test('removes bidi control characters (e.g. RTL override)', () => {
        expect(stripInvisibleCharacters('a‮b')).toBe('ab');
    });

    test('removes left-to-right and right-to-left marks', () => {
        expect(stripInvisibleCharacters('a‎b‏c')).toBe('abc');
    });

    test('reduces a name made entirely of invisible characters to an empty string', () => {
        expect(stripInvisibleCharacters('​‌‍﻿')).toBe('');
    });

    test('does not remove visible characters, including emoji and non-Latin scripts', () => {
        expect(stripInvisibleCharacters('Néko 猫 😀')).toBe('Néko 猫 😀');
    });

    test('does not remove regular spaces', () => {
        expect(stripInvisibleCharacters('John Doe')).toBe('John Doe');
    });
});

describe('sanitizeDisplayName', () => {
    test('strips invisible characters and trims surrounding whitespace', () => {
        expect(sanitizeDisplayName('  John​Doe  ')).toBe('JohnDoe');
    });

    test('returns an empty string for a name made only of invisible characters', () => {
        expect(sanitizeDisplayName('​​​')).toBe('');
    });

    test('leaves a normal display name untouched', () => {
        expect(sanitizeDisplayName('Catflare')).toBe('Catflare');
    });
});
