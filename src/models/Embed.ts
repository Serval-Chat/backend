export type EmbedType =
    | 'rich'
    | 'image'
    | 'video'
    | 'gifv'
    | 'article'
    | 'link'
    | 'youtube';

export interface IEmbedField {
    name: string;
    value: string;
    inline?: boolean;
}

export interface IEmbedAuthor {
    name: string;
    url?: string;
    icon_url?: string;
}

export interface IEmbedFooter {
    text: string;
    icon_url?: string;
}

export interface IEmbedMedia {
    url: string;
    width?: number;
    height?: number;
}

export interface IEmbedProvider {
    name?: string;
    url?: string;
}

export type EmbedButtonStyle =
    | 'primary'
    | 'secondary'
    | 'success'
    | 'danger'
    | 'link';

export interface IEmbedButtonEmoji {
    id?: string;
    name?: string;
    animated?: boolean;
}

export interface IEmbedButton {
    type: 'button';
    style: EmbedButtonStyle;
    label?: string;
    emoji?: IEmbedButtonEmoji;
    custom_id?: string;
    url?: string;
    disabled?: boolean;
}

export interface IEmbed {
    type?: EmbedType;
    color?: number;
    title?: string;
    url?: string;
    description?: string;
    timestamp?: string;
    author?: IEmbedAuthor;
    footer?: IEmbedFooter;
    thumbnail?: IEmbedMedia;
    image?: IEmbedMedia;
    video?: IEmbedMedia;
    provider?: IEmbedProvider;
    fields?: IEmbedField[];
}
