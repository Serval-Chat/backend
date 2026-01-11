export interface WsEvent<TType extends string = string, TPayload = unknown> {
    type: TType;
    payload: TPayload;
}
