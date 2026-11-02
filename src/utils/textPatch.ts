export interface TextPatch {
    start: number;
    removedText: string;
    insertedText: string;
}

export function createTextPatch(
    previousText: string,
    nextText: string,
): TextPatch {
    const previousCharacters = Array.from(previousText);
    const nextCharacters = Array.from(nextText);
    let prefixLength = 0;

    while (
        prefixLength < previousCharacters.length &&
        prefixLength < nextCharacters.length &&
        previousCharacters[prefixLength] === nextCharacters[prefixLength]
    ) {
        prefixLength += 1;
    }

    let suffixLength = 0;
    while (
        suffixLength < previousCharacters.length - prefixLength &&
        suffixLength < nextCharacters.length - prefixLength &&
        previousCharacters[previousCharacters.length - suffixLength - 1] ===
            nextCharacters[nextCharacters.length - suffixLength - 1]
    ) {
        suffixLength += 1;
    }

    return {
        start: prefixLength,
        removedText: previousCharacters
            .slice(prefixLength, previousCharacters.length - suffixLength)
            .join(''),
        insertedText: nextCharacters
            .slice(prefixLength, nextCharacters.length - suffixLength)
            .join(''),
    };
}
