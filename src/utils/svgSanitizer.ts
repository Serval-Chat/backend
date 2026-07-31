import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const purify = createDOMPurify(new JSDOM('').window);

export function sanitizeSvg(content: string): string {
    return purify.sanitize(content, {
        USE_PROFILES: { svg: true, svgFilters: true },
    });
}
