export const VALID_USERNAME_FONTS = [
    'default',
    'Audiowide',
    'Bebas Neue',
    'Betania Patmos',
    'Google Sans Code',
    'Noto Sans',
    'Pacifico',
    'Playpen Sans Deva',
    'Rampart One',
    'Roboto',
    'Workbench',
] as const;

export type UsernameFont = (typeof VALID_USERNAME_FONTS)[number];
