'use strict';

const CognitiveTraceViewer = require('../src/ui/traceViewer');
const { Agent } = require('../src/core/agent');

// Minimal concrete agent for testing
class SimpleAgent extends Agent {
  constructor(id) {
    super(id, 'Simple', 'simple');
  }
  async processTask() {
    return { ok: true };
  }
}

describe('CognitiveTraceViewer.registerAgent()', () => {
  test('replaces logTrace so entries appear in viewer traces', () => {
    const viewer = new CognitiveTraceViewer();
    const agent = new SimpleAgent('a1');
    viewer.registerAgent(agent);

    agent.logTrace('custom_event', { x: 1 });

    const traces = viewer.getAllTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].action).toBe('custom_event');
  });

  test('agent-own trace array is still populated', () => {
    const viewer = new CognitiveTraceViewer();
    const agent = new SimpleAgent('a2');
    viewer.registerAgent(agent);
    agent.logTrace('ev', {});
    expect(agent.getTrace()).toHaveLength(1);
  });
});

describe('CognitiveTraceViewer.clearTraces() — idempotency', () => {
  test('viewer trace list is empty after clearing', () => {
    const viewer = new CognitiveTraceViewer();
    const agent = new SimpleAgent('a3');
    viewer.registerAgent(agent);
    agent.logTrace('e1', {});
    viewer.clearTraces();
    expect(viewer.getAllTraces()).toHaveLength(0);
  });

  test('traces are captured correctly after a single clearTraces() call', () => {
    const viewer = new CognitiveTraceViewer();
    const agent = new SimpleAgent('a4');
    viewer.registerAgent(agent);

    agent.logTrace('before', {});
    viewer.clearTraces();
    agent.logTrace('after', {});

    const traces = viewer.getAllTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].action).toBe('after');
  });

  test('traces are captured exactly once after multiple clearTraces() calls (no closure stacking)', () => {
    const viewer = new CognitiveTraceViewer();
    const agent = new SimpleAgent('a5');
    viewer.registerAgent(agent);

    // Call clearTraces twice to reproduce the bug that would stack closures
    agent.logTrace('first', {});
    viewer.clearTraces();
    viewer.clearTraces();

    // Each logTrace call should add exactly ONE entry to viewer.traces
    agent.logTrace('second', {});
    const traces = viewer.getAllTraces();
    expect(traces).toHaveLength(1);
    expect(traces[0].action).toBe('second');
  });
});

describe('CognitiveTraceViewer.getTraceSummary()', () => {
  test('returns correct counts for agents and actions', () => {
    const viewer = new CognitiveTraceViewer();
    const agent = new SimpleAgent('a6');
    viewer.registerAgent(agent);
    agent.logTrace('task_start', {});
    agent.logTrace('task_complete', {});

    const summary = viewer.getTraceSummary();
    expect(summary.totalTraces).toBe(2);
    expect(summary.agents['Simple']).toBe(2);
    expect(summary.actions['task_start']).toBe(1);
    expect(summary.actions['task_complete']).toBe(1);
  });
});
