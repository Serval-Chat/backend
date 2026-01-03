# Events sent from client to server:

Alright so listen. Four events below this huge heading does NOT mean you're joining a server like clicking "Join /cats server!" no no no. It's called subscribing on to the events in the given server/channel! You send event `join_server` and you begin listening on server updates like `role_update` or `member_join`. Gotcha?

## join_server
Listen on server events

## leave_server
Stop listening on server events

## join_channel
Listen on channel events (like messages)

## leave_channel
Stop listening on channel events

## send_server_message
Send a message to the server

# Events sent from server to client:

## server_update
```json
{ 
    serverId: string;
    server: IServer
}
```

hold on backend is on fire rn ill finish it after i FIX invites issues as fucking always :trademark:
