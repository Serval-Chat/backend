declare const __brand: unique symbol;

export type Brand<K, T> = K & { readonly [__brand]: T };

export type NonEmptyString = Brand<string, 'NonEmpty'>;
