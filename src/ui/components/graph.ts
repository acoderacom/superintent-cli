// Knowledge Graph visualization component using vis-network

export function renderGraphView(): string {
  return `
    <div>
      <h1 class="text-xl font-bold text-gray-800 mb-4">Knowledge Graph</h1>
      <div id="graph-container" class="relative bg-white border border-gray-200 shadow-2xs rounded-md">
        <div id="graph-canvas" style="height: calc(100dvh - 160px); width: 100%;"></div>

        <!-- Legend -->
        <div class="absolute bottom-3 left-3 right-3 md:right-auto md:max-w-fit bg-white/90 border border-gray-200 rounded-lg px-3 py-2 text-xs">
          <div class="font-medium text-gray-700 mb-1.5">Categories</div>
          <div class="flex flex-wrap gap-x-3 gap-y-1">
            <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-full" style="background:#3B82F6"></span> architecture</span>
            <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-full" style="background:#22C55E"></span> pattern</span>
            <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-full" style="background:#F59E0B"></span> truth</span>
            <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-full" style="background:#8B5CF6"></span> principle</span>
            <span class="flex items-center gap-1"><span class="inline-block w-2.5 h-2.5 rounded-full" style="background:#EF4444"></span> gotcha</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Client-side JS for graph init — loaded once in the main page, not in HTMX partials
export function getGraphScript(): string {
  return `
    (function() {
      var graphNetwork = null;
      var visLoaded = false;

      function loadVisNetwork(cb) {
        if (visLoaded) { cb(); return; }
        var script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/vis-network@9/standalone/umd/vis-network.min.js';
        script.onload = function() { visLoaded = true; cb(); };
        script.onerror = function() {
          var c = document.getElementById('graph-canvas');
          if (c) c.innerHTML = '<p class="text-red-500 text-center py-16">Failed to load graph visualization library.</p>';
        };
        document.head.appendChild(script);
      }

      function loadGraphData() {
        var container = document.getElementById('graph-canvas');
        if (!container) return;

        fetch('/api/graph-data')
          .then(function(r) { return r.json(); })
          .then(function(data) {
            if (!data.nodes || data.nodes.length === 0) {
              container.innerHTML = '<p class="text-gray-500 text-center py-16">No knowledge entries yet. Create some knowledge to see the graph.</p>';
              return;
            }

            var categoryColors = {
              architecture: { background: '#3B82F6', border: '#2563EB', highlight: { background: '#60A5FA', border: '#1D4ED8' } },
              pattern:      { background: '#22C55E', border: '#16A34A', highlight: { background: '#4ADE80', border: '#15803D' } },
              truth:        { background: '#F59E0B', border: '#D97706', highlight: { background: '#FBBF24', border: '#B45309' } },
              principle:    { background: '#8B5CF6', border: '#7C3AED', highlight: { background: '#A78BFA', border: '#6D28D9' } },
              gotcha:       { background: '#EF4444', border: '#DC2626', highlight: { background: '#F87171', border: '#B91C1C' } }
            };

            var nodes = new vis.DataSet(data.nodes.map(function(n) {
              var colors = categoryColors[n.category] || categoryColors.architecture;
              var confidence = n.confidence || 0.5;
              var size = 10 + confidence * 30;
              return {
                id: n.id,
                label: n.label,
                color: colors,
                size: size,
                title: Math.round(confidence * 100) + '%',
                font: { color: '#374151', size: 11, face: 'system-ui' },
                shape: 'dot'
              };
            }));

            var edges = new vis.DataSet(data.edges.map(function(e, i) {
              return {
                id: i,
                from: e.from,
                to: e.to,
                width: Math.min(e.sharedCount, 4),
                color: { color: '#CBD5E1', highlight: '#64748B', hover: '#94A3B8' },
                title: 'Shared: ' + e.sharedTags.join(', '),
                smooth: { type: 'continuous' }
              };
            }));

            var options = {
              physics: {
                solver: 'forceAtlas2Based',
                forceAtlas2Based: {
                  gravitationalConstant: -30,
                  centralGravity: 0.005,
                  springLength: 150,
                  springConstant: 0.02,
                  damping: 0.4
                },
                stabilization: { enabled: true, iterations: 200, fit: true }
              },
              interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true },
              nodes: { borderWidth: 2, borderWidthSelected: 3 },
              edges: { selectionWidth: 2 }
            };

            graphNetwork = new vis.Network(container, { nodes: nodes, edges: edges }, options);

            graphNetwork.once('stabilizationIterationsDone', function() {
              graphNetwork.redraw();
              graphNetwork.fit();
            });

            graphNetwork.on('click', function(params) {
              if (params.nodes.length > 0) {
                var nodeId = params.nodes[0];
                showModal();
                htmx.ajax('GET', '/partials/knowledge-modal/' + encodeURIComponent(nodeId), { target: '#modal-content' });
              }
            });
          })
          .catch(function() {
            container.innerHTML = '<p class="text-red-500 text-center py-16">Failed to load graph data.</p>';
          });
      }

      function initGraph() {
        var canvas = document.getElementById('graph-canvas');
        if (!canvas) return;
        if (graphNetwork) {
          // Redraw and fit when tab becomes visible again (may have had 0 dimensions)
          graphNetwork.redraw();
          graphNetwork.fit();
          return;
        }
        // Defer until browser has computed container dimensions
        requestAnimationFrame(function() {
          loadVisNetwork(function() { loadGraphData(); });
        });
      }

      window._refreshGraph = function() {
        if (document.getElementById('graph-canvas')) {
          graphNetwork = null;
          loadGraphData();
        }
      };
      window._initGraph = initGraph;
    })();
  `;
}
