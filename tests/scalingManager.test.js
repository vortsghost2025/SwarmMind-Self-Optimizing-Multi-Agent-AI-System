'use strict';

const ScalingManager = require('../src/core/scalingManager');

describe('ScalingManager.createAgent()', () => {
  let sm;

  beforeEach(() => {
    sm = new ScalingManager();
  });

  test('creates a planner agent and adds it to the pool and activeAgents map', () => {
    const agent = sm.createAgent('planner', 'planner-test-001');
    expect(agent.id).toBe('planner-test-001');
    expect(sm.getAgentPool('planner')).toHaveLength(1);
    expect(sm.activeAgents.has('planner-test-001')).toBe(true);
  });

  test('throws for an unknown role', () => {
    expect(() => sm.createAgent('wizard')).toThrow('Unknown agent role');
  });

  test('throws when the same ID is used twice (duplicate guard)', () => {
    sm.createAgent('coder', 'dup-id');
    expect(() => sm.createAgent('coder', 'dup-id')).toThrow(/already exists/);
  });

  test('auto-generates a unique ID when none is supplied', () => {
    const a = sm.createAgent('reviewer');
    const b = sm.createAgent('reviewer');
    expect(a.id).not.toBe(b.id);
  });

  test('creates all supported agent types without error', () => {
    ['planner', 'coder', 'reviewer', 'executor'].forEach(role => {
      expect(() => sm.createAgent(role, `${role}-unique`)).not.toThrow();
    });
  });
});

describe('ScalingManager.getSystemStatus()', () => {
  test('reflects the correct total agent count', () => {
    const sm = new ScalingManager();
    sm.createAgent('planner', 'p1');
    sm.createAgent('coder', 'c1');
    sm.createAgent('coder', 'c2');
    const status = sm.getSystemStatus();
    expect(status.totalAgents).toBe(3);
    expect(status.byRole.planner.total).toBe(1);
    expect(status.byRole.coder.total).toBe(2);
  });
});

describe('ScalingManager.enqueueTask()', () => {
  test('enqueues a task and returns the queue length', () => {
    const sm = new ScalingManager();
    const length = sm.enqueueTask({ goal: 'test' }, 'planner');
    expect(length).toBe(1);
  });
});
