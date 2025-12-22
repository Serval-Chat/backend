# Serchat backend
This piece of code controls everything that backend has. It's a monolithic architecture using TypeScript as the main programming language and MongoDB as the database. I use Zod for request data validation and Socket.io for real-time communication. For now we use tokens.txt file to invite users to use the app but in the future I will cook something better (but I can promise anything!).

I'm using TSOA and OpenAPI to document the API. Current documention should be available [here](https://catfla.re/docs).

Socket.io isn't yet documented but I am currently working on it and I am pretty sure I will be using AsyncAPI for this one.

Y no frontend? I will put it in separate repository and I need to work on frontend a bit still.

# How to get backend running
```sh
git clone https://github.com/Serval-chat/backend
cd backend
npm install
npm run build
# Get yo self .env twin (look at .env.example)
npm run start

```