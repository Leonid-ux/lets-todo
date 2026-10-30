const PROTOCOL_VERSION = 1;

const COLLECTION_KEYS = Object.freeze({
  tasks: 'lets-todo.tasks.v1',
  habits: 'lets-todo.habits.v1',
  events: 'lets-todo.events.v1',
  timers: 'lets-todo.timers.v1',
  habitHistory: 'lets-todo.habit-history.v1',
  timerSessions: 'lets-todo.timer-sessions.v1',
});

const MESSAGE_TYPES = Object.freeze({
  PULL: 'sync.pull',
  PUSH: 'sync.push',
  RESULT: 'sync.result',
});

function isSyncMessage(value) {
  return Boolean(value && typeof value === 'object' && Object.values(MESSAGE_TYPES).includes(value.type));
}

module.exports = { PROTOCOL_VERSION, COLLECTION_KEYS, MESSAGE_TYPES, isSyncMessage };
