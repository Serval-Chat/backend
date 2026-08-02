import {
    MAX_EXPRESSION_LENGTH,
    MAX_EXPRESSION_NESTING_DEPTH,
    MAX_EXPRESSION_TAG_TERMS,
    TAG_NAME_MAX_LENGTH,
    TAG_NAME_REGEX,
} from '@/constants/gifTags';

export class GifTagExpressionError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = 'GifTagExpressionError';
        Object.setPrototypeOf(this, GifTagExpressionError.prototype);
    }
}

export type TagExprNode =
    | { type: 'tag'; name: string }
    | { type: 'and'; left: TagExprNode; right: TagExprNode }
    | { type: 'or'; left: TagExprNode; right: TagExprNode };

type TokenType = 'AND' | 'OR' | 'LPAREN' | 'RPAREN' | 'IDENT' | 'EOF';

interface Token {
    type: TokenType;
    value?: string;
    pos: number;
}

const IDENT_CHAR = /[a-zA-Z0-9_-]/;

function tokenize(expression: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const n = expression.length;

    while (i < n) {
        const ch = expression.charAt(i);

        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
            i++;
            continue;
        }

        if (ch === '(') {
            tokens.push({ type: 'LPAREN', pos: i });
            i++;
            continue;
        }

        if (ch === ')') {
            tokens.push({ type: 'RPAREN', pos: i });
            i++;
            continue;
        }

        if (ch === '&') {
            if (expression.charAt(i + 1) === '&') {
                tokens.push({ type: 'AND', pos: i });
                i += 2;
                continue;
            }
            throw new GifTagExpressionError(
                `Unexpected character '&' at position ${i}; did you mean '&&'?`,
            );
        }

        if (ch === '|') {
            if (expression.charAt(i + 1) === '|') {
                tokens.push({ type: 'OR', pos: i });
                i += 2;
                continue;
            }
            throw new GifTagExpressionError(
                `Unexpected character '|' at position ${i}; did you mean '||'?`,
            );
        }

        if (IDENT_CHAR.test(ch)) {
            const start = i;
            while (i < n && IDENT_CHAR.test(expression.charAt(i))) i++;
            const value = expression.slice(start, i);
            if (value.length > TAG_NAME_MAX_LENGTH) {
                throw new GifTagExpressionError(
                    `Tag name at position ${start} exceeds maximum length of ${TAG_NAME_MAX_LENGTH}`,
                );
            }
            tokens.push({ type: 'IDENT', value, pos: start });
            continue;
        }

        throw new GifTagExpressionError(
            `Unexpected character '${ch}' at position ${i}`,
        );
    }

    tokens.push({ type: 'EOF', pos: n });
    return tokens;
}

// recursive descent: orExpr := andExpr ('||' andExpr)*
//                     andExpr := primary ('&&' primary)*
//                     primary := IDENT | '(' orExpr ')'
class Parser {
    private pos = 0;
    private termCount = 0;

    public constructor(private readonly tokens: Token[]) {}

    public parse(): TagExprNode {
        const node = this.parseOr(0);
        const trailing = this.peek();
        if (trailing.type !== 'EOF') {
            throw new GifTagExpressionError(
                `Unexpected token at position ${trailing.pos}`,
            );
        }
        return node;
    }

    private peek(): Token {
        const token = this.tokens[this.pos];
        if (token === undefined) {
            throw new GifTagExpressionError('Unexpected end of expression');
        }
        return token;
    }

    private advance(): Token {
        const token = this.peek();
        this.pos++;
        return token;
    }

    private parseOr(depth: number): TagExprNode {
        let left = this.parseAnd(depth);
        while (this.peek().type === 'OR') {
            this.advance();
            const right = this.parseAnd(depth);
            left = { type: 'or', left, right };
        }
        return left;
    }

    private parseAnd(depth: number): TagExprNode {
        let left = this.parsePrimary(depth);
        while (this.peek().type === 'AND') {
            this.advance();
            const right = this.parsePrimary(depth);
            left = { type: 'and', left, right };
        }
        return left;
    }

    private parsePrimary(depth: number): TagExprNode {
        const token = this.peek();

        if (token.type === 'LPAREN') {
            if (depth + 1 > MAX_EXPRESSION_NESTING_DEPTH) {
                throw new GifTagExpressionError(
                    `Expression exceeds maximum nesting depth of ${MAX_EXPRESSION_NESTING_DEPTH}`,
                );
            }
            this.advance();
            if (this.peek().type === 'RPAREN') {
                throw new GifTagExpressionError(
                    `Empty group at position ${token.pos}`,
                );
            }
            const node = this.parseOr(depth + 1);
            const closing = this.peek();
            if (closing.type !== 'RPAREN') {
                throw new GifTagExpressionError(
                    `Expected ')' at position ${closing.pos}`,
                );
            }
            this.advance();
            return node;
        }

        if (token.type === 'IDENT') {
            this.advance();
            this.termCount++;
            if (this.termCount > MAX_EXPRESSION_TAG_TERMS) {
                throw new GifTagExpressionError(
                    `Expression exceeds maximum of ${MAX_EXPRESSION_TAG_TERMS} tag terms`,
                );
            }
            const name = token.value as string;
            if (!TAG_NAME_REGEX.test(name)) {
                throw new GifTagExpressionError(
                    `Invalid tag name '${name}' at position ${token.pos}`,
                );
            }
            return { type: 'tag', name };
        }

        if (token.type === 'RPAREN') {
            throw new GifTagExpressionError(
                `Unexpected ')' at position ${token.pos}`,
            );
        }

        throw new GifTagExpressionError(
            `Expected a tag name or '(' at position ${token.pos}`,
        );
    }
}

export function parseTagExpression(expression: string): TagExprNode {
    if (typeof expression !== 'string' || expression.trim() === '') {
        throw new GifTagExpressionError('Expression must not be empty');
    }
    if (expression.length > MAX_EXPRESSION_LENGTH) {
        throw new GifTagExpressionError(
            `Expression exceeds maximum length of ${MAX_EXPRESSION_LENGTH} characters`,
        );
    }

    const tokens = tokenize(expression);
    return new Parser(tokens).parse();
}

export function collectTagNames(node: TagExprNode): Set<string> {
    const names = new Set<string>();
    const visit = (n: TagExprNode): void => {
        if (n.type === 'tag') {
            names.add(n.name.toLowerCase());
            return;
        }
        visit(n.left);
        visit(n.right);
    };
    visit(node);
    return names;
}

export const ALWAYS_FALSE = Symbol('GifTagExpression.ALWAYS_FALSE');

export type CompiledTagFilter = Record<string, unknown> | typeof ALWAYS_FALSE;

export function compileTagExpression(
    node: TagExprNode,
    nameToId: ReadonlyMap<string, string>,
): CompiledTagFilter {
    if (node.type === 'tag') {
        const id = nameToId.get(node.name.toLowerCase());
        if (id === undefined) return ALWAYS_FALSE;
        return { tagIds: id };
    }

    if (node.type === 'and') {
        const left = compileTagExpression(node.left, nameToId);
        if (left === ALWAYS_FALSE) return ALWAYS_FALSE;
        const right = compileTagExpression(node.right, nameToId);
        if (right === ALWAYS_FALSE) return ALWAYS_FALSE;
        return { $and: [left, right] };
    }

    const left = compileTagExpression(node.left, nameToId);
    const right = compileTagExpression(node.right, nameToId);
    if (left === ALWAYS_FALSE) return right;
    if (right === ALWAYS_FALSE) return left;
    return { $or: [left, right] };
}
