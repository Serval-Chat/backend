import {
    ALWAYS_FALSE,
    collectTagNames,
    compileTagExpression,
    GifTagExpressionError,
    parseTagExpression,
    type TagExprNode,
} from './gifTagExpression';
import {
    MAX_EXPRESSION_LENGTH,
    MAX_EXPRESSION_NESTING_DEPTH,
    MAX_EXPRESSION_TAG_TERMS,
} from '@/constants/gifTags';

const tag = (name: string): TagExprNode => ({ type: 'tag', name });

describe('parseTagExpression', () => {
    it('parses a single tag', () => {
        expect(parseTagExpression('funny')).toEqual(tag('funny'));
    });

    it('parses AND', () => {
        expect(parseTagExpression('funny && silly')).toEqual({
            type: 'and',
            left: tag('funny'),
            right: tag('silly'),
        });
    });

    it('parses OR', () => {
        expect(parseTagExpression('cats || servals')).toEqual({
            type: 'or',
            left: tag('cats'),
            right: tag('servals'),
        });
    });

    it('gives && higher precedence than ||', () => {
        expect(parseTagExpression('a && b || c')).toEqual({
            type: 'or',
            left: { type: 'and', left: tag('a'), right: tag('b') },
            right: tag('c'),
        });
    });

    it('respects parentheses', () => {
        expect(
            parseTagExpression('(funny && silly) || (cats || servals)'),
        ).toEqual({
            type: 'or',
            left: { type: 'and', left: tag('funny'), right: tag('silly') },
            right: { type: 'or', left: tag('cats'), right: tag('servals') },
        });
    });

    it('handles deep-but-legal nesting', () => {
        const depth = MAX_EXPRESSION_NESTING_DEPTH;
        const expr = `${'('.repeat(depth)}a${')'.repeat(depth)}`;
        expect(parseTagExpression(expr)).toEqual(tag('a'));
    });

    it('allows underscores, hyphens, and digits in tag names', () => {
        expect(parseTagExpression('my_tag-2')).toEqual(tag('my_tag-2'));
    });

    it('is tolerant of surrounding and internal whitespace', () => {
        expect(parseTagExpression('  a   &&    b  ')).toEqual({
            type: 'and',
            left: tag('a'),
            right: tag('b'),
        });
    });

    it.each([
        ['', 'empty expression'],
        ['   ', 'blank expression'],
        ['funny &&', 'dangling operator'],
        ['&& funny', 'leading operator'],
        ['funny || || silly', 'double operator'],
        ['(funny', 'unbalanced open paren'],
        ['funny)', 'unbalanced close paren'],
        ['()', 'empty group'],
        ['(funny && )', 'empty group with operator'],
        ['funny & silly', 'single ampersand'],
        ['funny | silly', 'single pipe'],
        ['funny AND silly', 'word operators not supported'],
        ['funny && silly extra', 'trailing garbage'],
        ['funny$where', 'dollar sign'],
        [
            'tag with spaces',
            'unquoted spaces mid-identifier are two terms with no operator',
        ],
        ["funny' || 'x'=='x", 'quote characters'],
        ['{"$ne": null}', 'raw JSON operator injection'],
        ['funny; DROP TABLE tags;', 'semicolon injection attempt'],
    ])('rejects malformed expression: %s (%s)', (expr) => {
        expect(() => parseTagExpression(expr)).toThrow(GifTagExpressionError);
    });

    it('rejects expressions over the max length', () => {
        const expr = 'a'.repeat(MAX_EXPRESSION_LENGTH + 1);
        expect(() => parseTagExpression(expr)).toThrow(GifTagExpressionError);
    });

    it('rejects nesting deeper than the max depth', () => {
        const depth = MAX_EXPRESSION_NESTING_DEPTH + 1;
        const expr = `${'('.repeat(depth)}a${')'.repeat(depth)}`;
        expect(() => parseTagExpression(expr)).toThrow(GifTagExpressionError);
    });

    it('rejects more tag terms than the max', () => {
        const expr = Array.from(
            { length: MAX_EXPRESSION_TAG_TERMS + 1 },
            (_, i) => `t${i}`,
        ).join(' && ');
        expect(() => parseTagExpression(expr)).toThrow(GifTagExpressionError);
    });

    it('rejects a tag name that is too long', () => {
        expect(() => parseTagExpression('a'.repeat(33))).toThrow(
            GifTagExpressionError,
        );
    });
});

describe('collectTagNames', () => {
    it('collects unique lowercased tag names from the AST', () => {
        const ast = parseTagExpression('Funny && (funny || Cats)');
        expect(collectTagNames(ast)).toEqual(new Set(['funny', 'cats']));
    });
});

describe('compileTagExpression', () => {
    it('compiles a single known tag to an equality filter', () => {
        const ast = tag('funny');
        const map = new Map([['funny', 'tag-id-1']]);
        expect(compileTagExpression(ast, map)).toEqual({ tagIds: 'tag-id-1' });
    });

    it('resolves tag names case-insensitively', () => {
        const ast = tag('Funny');
        const map = new Map([['funny', 'tag-id-1']]);
        expect(compileTagExpression(ast, map)).toEqual({ tagIds: 'tag-id-1' });
    });

    it('compiles AND into $and', () => {
        const ast = parseTagExpression('a && b');
        const map = new Map([
            ['a', 'id-a'],
            ['b', 'id-b'],
        ]);
        expect(compileTagExpression(ast, map)).toEqual({
            $and: [{ tagIds: 'id-a' }, { tagIds: 'id-b' }],
        });
    });

    it('compiles OR into $or', () => {
        const ast = parseTagExpression('a || b');
        const map = new Map([
            ['a', 'id-a'],
            ['b', 'id-b'],
        ]);
        expect(compileTagExpression(ast, map)).toEqual({
            $or: [{ tagIds: 'id-a' }, { tagIds: 'id-b' }],
        });
    });

    it('short-circuits AND to ALWAYS_FALSE when a branch is unknown', () => {
        const ast = parseTagExpression('a && unknown');
        const map = new Map([['a', 'id-a']]);
        expect(compileTagExpression(ast, map)).toBe(ALWAYS_FALSE);
    });

    it('drops unknown branches from OR instead of failing the whole expression', () => {
        const ast = parseTagExpression('a || unknown');
        const map = new Map([['a', 'id-a']]);
        expect(compileTagExpression(ast, map)).toEqual({ tagIds: 'id-a' });
    });

    it('is ALWAYS_FALSE when every referenced tag is unknown', () => {
        const ast = parseTagExpression('unknown1 || unknown2');
        const map = new Map<string, string>();
        expect(compileTagExpression(ast, map)).toBe(ALWAYS_FALSE);
    });

    it('never uses a tag name as an object key, only as a scalar value', () => {
        const ast = tag('$where');
        const map = new Map([['$where', 'id-1']]);
        const compiled = compileTagExpression(ast, map);
        expect(compiled).toEqual({ tagIds: 'id-1' });
        expect(Object.keys(compiled as Record<string, unknown>)).toEqual([
            'tagIds',
        ]);
    });
});
