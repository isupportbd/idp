import { EventEmitter } from 'events';

// Create a global event emitter for real-time SSE updates
class AppEventEmitter extends EventEmitter {}

export const appEvents = new AppEventEmitter();

// To prevent memory leak warnings if many users are connected
appEvents.setMaxListeners(1000);
