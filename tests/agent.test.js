'use strict';

const { Agent } = require('../src/core/agent');

// Concrete subclass for testing (processTask is abstract in Agent)
class TestAgent extends Agent {
  constructor(id, taskTimeoutMs) {
    super(id, 'Test', 'test', 1000, taskTimeoutMs);
  }

  async processTask() {
    return { result: 'done' };
  }
}

// Subclass that hangs forever — used to exercise the timeout path
class HangingAgent extends Agent {
  constructor(id) {
    super(id, 'Hanging', 'test', 1000, 200); // 200 ms timeout
  }

  async processTask() {
    await new Promise(() => {}); // never resolves
  }
}

describe('Agent.validateTask()', () => {
  let agent;

  beforeEach(() => {
    agent = new TestAgent('agent-001');
  });

  test('returns true for a valid task object', () => {
    expect(agent.validateTask({ goal: 'do something' })).toBe(true);
  });

  test('returns false for null', () => {
    expect(agent.validateTask(null)).toBe(false);
  });

  test('returns false for a non-object', () => {
    expect(agent.validateTask('string')).toBe(false);
    expect(agent.validateTask(42)).toBe(false);
  });

  test('returns false when goal exceeds 1000 characters', () => {
    expect(agent.validateTask({ goal: 'x'.repeat(1001) })).toBe(false);
  });

  test('returns false when description exceeds 1000 characters', () => {
    expect(agent.validateTask({ description: 'x'.repeat(1001) })).toBe(false);
  });

  test('accepts task without optional string fields', () => {
    expect(agent.validateTask({ type: 'coding' })).toBe(true);
  });

  test('rejects task with __proto__ key', () => {
    const task = Object.create(null);
    Object.defineProperty(task, '__proto__', { value: {}, enumerable: true, configurable: true });
    expect(agent.validateTask(task)).toBe(false);
  });

  test('rejects task with constructor key', () => {
    const task = Object.create(null);
    Object.defineProperty(task, 'constructor', { value: {}, enumerable: true, configurable: true });
    expect(agent.validateTask(task)).toBe(false);
  });

  test('rejects payload exceeding 1 MB', () => {
    const big = { data: 'x'.repeat(1024 * 1024 + 1) };
    expect(agent.validateTask(big)).toBe(false);
  });
});

describe('Agent.logTrace()', () => {
  let agent;

  beforeEach(() => {
    agent = new TestAgent('agent-002');
  });

  test('records a trace entry with correct shape', () => {
    const entry = agent.logTrace('test_action', { key: 'value' });
    expect(entry).toMatchObject({
      agentId: 'agent-002',
      agentName: 'Test',
      action: 'test_action',
      details: { key: 'value' },
    });
    expect(typeof entry.timestamp).toBe('string');
  });

  test('does not allow trace array to exceed maxTraceLength', () => {
    const maxLen = agent.maxTraceLength;
    for (let i = 0; i < maxLen + 10; i++) {
      agent.logTrace('event', { i });
    }
    expect(agent.trace.length).toBeLessThanOrEqual(maxLen);
  });

  test('getTrace() returns a copy, not the internal array', () => {
    agent.logTrace('ev', {});
    const copy = agent.getTrace();
    copy.push({ fake: true });
    expect(agent.trace.length).toBe(1); // internal array unchanged
  });
});

describe('Agent.execute()', () => {
  test('resolves and sets status to completed on success', async () => {
    const agent = new TestAgent('agent-003');
    const result = await agent.execute({ goal: 'ok' });
    expect(result).toEqual({ result: 'done' });
    expect(agent.status).toBe('completed');
  });

  test('throws and sets status to error for invalid task', async () => {
    const agent = new TestAgent('agent-004');
    await expect(agent.execute(null)).rejects.toThrow('Invalid task input');
    expect(agent.status).toBe('error');
  });

  test('rejects with a timeout error when task exceeds taskTimeoutMs', async () => {
    const agent = new HangingAgent('agent-timeout');
    await expect(agent.execute({ goal: 'hang' })).rejects.toThrow('timed out');
    expect(agent.status).toBe('error');
  }, 2000);
});
