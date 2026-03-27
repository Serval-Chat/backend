# Serchat backend
This is the Serchat backend. It handles everything. It's monolithic, uses NestJS and WebSockets for real-time communication. I use Redis for caching and pub/sub. MongoDB is the database. I use OpenAPI for API documentation.

There's no available WebSocket documentation. I will work on it some day.

Complementary frontend can be found [here](https://github.com/Serval-chat/frontend).

# How to get backend running
```sh
git clone https://github.com/Serval-chat/backend
cd backend
npm install
npm run build
# Fill out .env (look at .env.example)
npm run start
# or ./start-dev-cluster.sh

```

Features:
1. Sending and receiving messages.
2. Servers, channels, categories, roles, permissions, audit logs, settings.
3. Profile settings, user profiles, changing username, e-mail, password, avatar, banner, statuses, pronouns, username fonts.
4. Admin panel endpoints.
5. Handling of file uploads for server icons, server icons, emojis, user generated content (sent via uploads endpoint), user avatars, banners.
6. Ping management.
7. Push notifications.
8. Badges management via admin endpoints.
9. and much more that i dont remember

I am using OTel, Loki, Prometheus, Grafana, Redis and MongoDB.

Serchat is being developed by Catflare with help of contributors. Anyone who has ever reported a bug is a contributor also and I am deeply thankful for each and every report I receive. Your help makes me happier and Serchat better!