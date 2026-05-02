export type EmbedType =
    | 'rich'
    | 'image'
    | 'video'
    | 'gifv'
    | 'article'
    | 'link';

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
