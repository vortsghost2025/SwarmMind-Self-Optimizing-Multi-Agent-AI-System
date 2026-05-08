class GraphViewer {
  constructor() {
    this.nodes = [];
    this.edges = [];
    this.filteredNodes = [];
    this.filteredEdges = [];
    this.repoFilter = null;
    this.meaningLayers = new Set(['verification', 'coordination', 'governance']);
    this.showCrossRepoEdges = true;
    this.nodeIdSet = new Set();
  }

  setNodes(nodes) {
    this.nodes = nodes;
    this.nodeIdSet = new Set(nodes.map(n => n.id));
    this.applyFilters();
    return this;
  }

  setEdges(edges) {
    this.edges = edges;
    this.applyFilters();
    return this;
  }

  setRepoFilter(repo) {
    this.repoFilter = repo;
    this.applyFilters();
    return this;
  }

  setMeaningLayers(layers) {
    this.meaningLayers = new Set(layers);
    this.applyFilters();
    return this;
  }

  setShowCrossRepoEdges(show) {
    this.showCrossRepoEdges = show;
    this.applyFilters();
    return this;
  }

  applyFilters() {
    this.filteredNodes = this.repoFilter
      ? this.nodes.filter(node => node.repo === this.repoFilter)
      : [...this.nodes];

    const visibleNodeIds = new Set(this.filteredNodes.map(n => n.id));

    this.filteredEdges = this.edges.filter(edge => {
      const edgeTypeAllowed = this.meaningLayers.size === 0 || 
        this.meaningLayers.has(edge.type) || 
        !edge.type;

      const sourceInFilter = visibleNodeIds.has(edge.source);
      const targetInFilter = visibleNodeIds.has(edge.target);

      if (!this.repoFilter || !this.showCrossRepoEdges) {
        return sourceInFilter && targetInFilter && edgeTypeAllowed;
      }

      const sourceNode = this.nodes.find(n => n.id === edge.source);
      const targetNode = this.nodes.find(n => n.id === edge.target);

      const sourceRepoMatch = sourceNode && sourceNode.repo === this.repoFilter;
      const targetRepoMatch = targetNode && targetNode.repo === this.repoFilter;

      return (sourceRepoMatch || targetRepoMatch) && edgeTypeAllowed;
    });

    return this;
  }

  getStats() {
    const stats = {
      totalNodes: this.nodes.length,
      totalEdges: this.edges.length,
      visibleNodes: this.filteredNodes.length,
      visibleEdges: this.filteredEdges.length,
      nodeCounter: this.filteredNodes.length,
      edgeCounter: this.filteredEdges.length
    };
    stats.nodeCounterLabel = 'verified_nodes';
    stats.edgeCounterLabel = 'verified_edges';
    stats.totalNodesLabel = 'total_nodes_available';
    stats.totalEdgesLabel = 'total_edges_available';
    stats.visibleNodesLabel = 'filtered_nodes';
    stats.visibleEdgesLabel = 'filtered_edges';
    return stats;
  }

  getNodeById(id) {
    return this.nodes.find(n => n.id === id);
  }

  getEdgesForNode(nodeId) {
    return this.filteredEdges.filter(e => e.source === nodeId || e.target === nodeId);
  }
}

module.exports = GraphViewer;