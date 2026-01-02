// Application entry point
//
// Initializes environment variables and starts the server
// 'reflect-metadata' must be the first import to support InversifyJS decorators
import 'reflect-metadata';
import dotenv from 'dotenv';

dotenv.config();

import { startServer } from '@/server';

startServer();
