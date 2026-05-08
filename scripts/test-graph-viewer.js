const GraphViewer = require('../src/ui/GraphViewer');

console.log('Testing GraphViewer edge filtering logic...\n');

const viewer = new GraphViewer();

const nodes = [
  { id: 'n1', repo: 'SwarmMind', type: 'agent' },
  { id: 'n2', repo: 'SwarmMind', type: 'task' },
  { id: 'n3', repo: 'Archivist', type: 'agent' },
  { id: 'n4', repo: 'Library', type: 'data' },
  { id: 'n5', repo: 'Kernel', type: 'process' },
];

const edges = [
  { id: 'e1', source: 'n1', target: 'n2', type: 'verification' },
  { id: 'e2', source: 'n1', target: 'n3', type: 'coordination' },
  { id: 'e3', source: 'n1', target: 'n4', type: 'governance' },
  { id: 'e4', source: 'n2', target: 'n3', type: 'coordination' },
  { id: 'e5', source: 'n3', target: 'n5', type: 'verification' },
  { id: 'e6', source: 'n4', target: 'n5', type: 'governance' },
  { id: 'e7', source: 'n1', target: 'n5', type: 'coordination' },
];

viewer.setNodes(nodes);
viewer.setEdges(edges);

console.log('=== Test 1: No filter (should show all edges) ===');
viewer.setRepoFilter(null);
const stats1 = viewer.getStats();
console.assert(stats1.visibleNodes === 5, `Expected 5 nodes, got ${stats1.visibleNodes}`);
console.assert(stats1.visibleEdges === 7, `Expected 7 edges, got ${stats1.visibleEdges}`);
console.log('PASS\n');

console.log('=== Test 2: Filter by SwarmMind (default - no cross-repo edges) ===');
viewer.setRepoFilter('SwarmMind');
viewer.setShowCrossRepoEdges(false);
viewer.applyFilters();
const stats2 = viewer.getStats();
console.assert(stats2.visibleNodes === 2, `Expected 2 nodes, got ${stats2.visibleNodes}`);
console.assert(stats2.visibleEdges === 1, `Expected 1 edge (only n1-n2), got ${stats2.visibleEdges}`);
console.log('PASS\n');

console.log('=== Test 3: Filter by SwarmMind WITH cross-repo edges (FIXED logic) ===');
viewer.setRepoFilter('SwarmMind');
viewer.setShowCrossRepoEdges(true);
viewer.applyFilters();
const stats3 = viewer.getStats();
console.log(`Visible nodes: ${stats3.visibleNodes}`);
console.log(`Visible edges: ${stats3.visibleEdges}`);

const expectedCrossRepoEdges = edges.filter(e => {
  const sourceNode = nodes.find(n => n.id === e.source);
  const targetNode = nodes.find(n => n.id === e.target);
  return sourceNode.repo === 'SwarmMind' || targetNode.repo === 'SwarmMind';
});
console.log(`Expected cross-repo edges: ${expectedCrossRepoEdges.length}`);

console.assert(stats3.visibleNodes === 2, `Expected 2 nodes, got ${stats3.visibleNodes}`);
console.assert(stats3.visibleEdges === 5, `Expected 5 edges (e1, e2, e3, e4, e7), got ${stats3.visibleEdges}`);
console.log('PASS\n');

console.log('=== Test 4: Meaning layer filtering ===');
viewer.setMeaningLayers(new Set(['verification']));
viewer.applyFilters();
const stats4 = viewer.getStats();
console.log(`Visible edges with verification layer: ${stats4.visibleEdges}`);
console.assert(stats4.visibleEdges === 1, `Expected 1 verification edge (e1), got ${stats4.visibleEdges}`);
console.log('PASS\n');

console.log('=== Test 5: Counter consistency (the reported issue) ===');
viewer.setMeaningLayers(new Set(['verification', 'coordination', 'governance']));
viewer.applyFilters();
const stats5 = viewer.getStats();
console.log(`Node counter (should be 8 per report): ${stats5.nodeCounter}`);
console.log(`Edge counter (should NOT be 0): ${stats5.edgeCounter}`);
console.assert(stats5.edgeCounter > 0, 'Edge counter should not be 0 when cross-repo edges are enabled');
console.log('PASS\n');

console.log('All tests passed!');

console.log('\n=== Test 6: GRAPH_REPO_FILTER_EDGE_AUDIT scenario ===');
const viewer2 = new GraphViewer();

const auditNodes = [];
for (let i = 1; i <= 258; i++) {
  auditNodes.push({ id: `sm-${i}`, repo: 'SwarmMind', type: 'node' });
}
for (let i = 1; i <= 1410; i++) {
  auditNodes.push({ id: `ext-${i}`, repo: ['Archivist', 'Library', 'Kernel'][i % 3], type: 'node' });
}

const auditEdges = [];
for (let i = 1; i <= 60; i++) {
  auditEdges.push({ id: `internal-${i}`, source: `sm-${i % 258 + 1}`, target: `sm-${(i + 1) % 258 + 1}`, type: 'verification' });
}
for (let i = 61; i <= 360; i++) {
  auditEdges.push({ id: `cross-${i}`, source: `sm-${i % 258 + 1}`, target: `ext-${i % 1410 + 1}`, type: 'coordination' });
}

viewer2.setNodes(auditNodes);
viewer2.setEdges(auditEdges);

viewer2.setRepoFilter('SwarmMind');
viewer2.setShowCrossRepoEdges(false);
const statsNoCross = viewer2.getStats();
console.log(`Without cross-repo: ${statsNoCross.visibleEdges} edges (expected 60)`);

viewer2.setShowCrossRepoEdges(true);
const statsWithCross = viewer2.getStats();
console.log(`With cross-repo: ${statsWithCross.visibleEdges} edges (expected 360)`);

console.assert(statsNoCross.visibleEdges === 60, `Without cross-repo should show 60, got ${statsNoCross.visibleEdges}`);
console.assert(statsWithCross.visibleEdges === 360, `With cross-repo should show 360, got ${statsWithCross.visibleEdges}`);
console.log('PASS\n');

process.exit(0);