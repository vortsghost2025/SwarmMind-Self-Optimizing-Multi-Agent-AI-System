#!/usr/bin/env node
/**
 * Load Context - Run at session start to load previous session memory
 * 
 * Usage: node load-context.js
 * 
 * Outputs a markdown summary that can be injected into agent context.
 */

const { getSessionMemory } = require('./src/memory/SessionMemory.js');

const memory = getSessionMemory();
const context = memory.generateContext();

console.log(context);
console.log('\n---\n');
console.log('Current session:', memory.getCurrentSession().id);
console.log('Started:', memory.getCurrentSession().started);
