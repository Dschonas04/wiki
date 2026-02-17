import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, ZoomIn, ZoomOut, Maximize2, RefreshCw } from 'lucide-react';
import { api, type GraphData, type GraphNode, type GraphEdge } from '../api/client';

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

/**
 * Knowledge Graph – Logseq-inspired force-directed visualization
 * of all wiki pages and their connections (parent, tags).
 * Uses Canvas API for performance (no extra dependencies).
 */
export default function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);

  // Camera state
  const cameraRef = useRef({ x: 0, y: 0, zoom: 1 });
  const dragRef = useRef<{ active: boolean; dragging: boolean; startX: number; startY: number; lastX: number; lastY: number; node: SimNode | null }>({ active: false, dragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0, node: null });
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animRef = useRef<number>(0);

  // Load graph data
  const loadGraph = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getGraph();
      setGraphData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load graph data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGraph(); }, [loadGraph]);

  // Initialize simulation when data changes
  useEffect(() => {
    if (!graphData) return;
    const w = containerRef.current?.clientWidth || 800;
    const h = containerRef.current?.clientHeight || 600;

    nodesRef.current = graphData.nodes.map((n, i) => ({
      ...n,
      x: w / 2 + (Math.random() - 0.5) * Math.min(w, 400),
      y: h / 2 + (Math.random() - 0.5) * Math.min(h, 400),
      vx: 0,
      vy: 0,
      radius: n.type === 'tag' ? 6 : 10,
    }));
    edgesRef.current = graphData.edges;
    cameraRef.current = { x: 0, y: 0, zoom: 1 };
  }, [graphData]);

  // Color helpers
  const getNodeColor = (n: SimNode, hovered: boolean): string => {
    if (hovered) return '#f59e0b';
    if (n.type === 'tag') return n.color || '#6366f1';
    if (n.visibility === 'published') return 'var(--c-success, #10b981)';
    return 'var(--c-primary, #6366f1)';
  };

  const getEdgeColor = (e: GraphEdge): string =>
    e.type === 'parent' ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.12)';

  // Force simulation step
  const simulate = useCallback(() => {
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (nodes.length === 0) return;

    const alpha = 0.3;
    const repulsion = 1500;
    const attraction = 0.005;
    const centerForce = 0.01;

    const w = containerRef.current?.clientWidth || 800;
    const h = containerRef.current?.clientHeight || 600;
    const cx = w / 2;
    const cy = h / 2;

    // Center gravity
    for (const n of nodes) {
      n.vx += (cx - n.x) * centerForce;
      n.vy += (cy - n.y) * centerForce;
    }

    // Repulsion (Barnes-Hut would be better but n is small)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        let dx = nodes[j].x - nodes[i].x;
        let dy = nodes[j].y - nodes[i].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx;
        nodes[i].vy -= fy;
        nodes[j].vx += fx;
        nodes[j].vy += fy;
      }
    }

    // Build node index for O(1) lookup
    const nodeMap = new Map<string, SimNode>();
    for (const n of nodes) nodeMap.set(n.id, n);

    // Attraction along edges
    for (const e of edges) {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * attraction;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    }

    // Apply velocity with damping
    for (const n of nodes) {
      if (dragRef.current.node === n) continue;
      n.vx *= 0.6;
      n.vy *= 0.6;
      n.x += n.vx * alpha;
      n.y += n.vy * alpha;
    }
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const render = () => {
      if (!running) return;
      const container = containerRef.current;
      if (!container) { animRef.current = requestAnimationFrame(render); return; }

      const w = container.clientWidth;
      const h = container.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      simulate();

      const cam = cameraRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.scale(cam.zoom, cam.zoom);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const nodeMap = new Map<string, SimNode>();
      for (const n of nodes) nodeMap.set(n.id, n);

      // Draw edges
      for (const e of edges) {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) continue;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = getEdgeColor(e);
        ctx.lineWidth = e.type === 'parent' ? 1.5 : 0.8;
        ctx.stroke();
      }

      // Draw nodes
      const hovered = hoveredNode;
      for (const n of nodes) {
        const isHovered = hovered?.id === n.id;
        ctx.beginPath();
        ctx.arc(n.x, n.y, isHovered ? n.radius + 3 : n.radius, 0, Math.PI * 2);
        ctx.fillStyle = getNodeColor(n, isHovered);
        ctx.fill();
        if (isHovered) {
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      // Draw labels
      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (const n of nodes) {
        const isHovered = hovered?.id === n.id;
        ctx.fillStyle = isHovered ? '#f59e0b' : (getComputedStyle(document.documentElement).getPropertyValue('--c-text') || '#333');
        const label = n.label.length > 20 ? n.label.slice(0, 18) + '…' : n.label;
        ctx.fillText(n.type === 'tag' ? `#${label}` : label, n.x, n.y + n.radius + 4);
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [graphData, hoveredNode, simulate]);

  // Mouse interactions
  const screenToWorld = (sx: number, sy: number) => {
    const cam = cameraRef.current;
    return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
  };

  const findNodeAt = (wx: number, wy: number): SimNode | null => {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const dx = n.x - wx;
      const dy = n.y - wy;
      if (dx * dx + dy * dy <= (n.radius + 4) ** 2) return n;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = screenToWorld(sx, sy);
    const node = findNodeAt(x, y);
    dragRef.current = { active: true, dragging: false, startX: sx, startY: sy, lastX: sx, lastY: sy, node };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const { x, y } = screenToWorld(sx, sy);

    if (dragRef.current.active) {
      // Check if user has moved far enough to start a real drag
      const DRAG_THRESHOLD = 6;
      if (!dragRef.current.dragging) {
        const distX = Math.abs(sx - dragRef.current.startX);
        const distY = Math.abs(sy - dragRef.current.startY);
        if (distX < DRAG_THRESHOLD && distY < DRAG_THRESHOLD) return; // not dragging yet
        dragRef.current.dragging = true;
      }

      if (dragRef.current.node) {
        // Drag node
        dragRef.current.node.x = x;
        dragRef.current.node.y = y;
        dragRef.current.node.vx = 0;
        dragRef.current.node.vy = 0;
      } else {
        // Pan camera
        const dx = sx - dragRef.current.lastX;
        const dy = sy - dragRef.current.lastY;
        cameraRef.current.x += dx;
        cameraRef.current.y += dy;
        dragRef.current.lastX = sx;
        dragRef.current.lastY = sy;
      }
    } else {
      const node = findNodeAt(x, y);
      setHoveredNode(node);
      if (canvasRef.current) canvasRef.current.style.cursor = node ? 'pointer' : 'grab';
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // If we never started a real drag, treat it as a click
    if (dragRef.current.active && !dragRef.current.dragging && dragRef.current.node) {
      const n = dragRef.current.node;
      if (n.type === 'page') {
        navigate(`/pages/${n.id.replace('page-', '')}`);
      } else if (n.type === 'tag') {
        navigate(`/pages?tag=${encodeURIComponent(n.label)}`);
      }
    }
    dragRef.current = { active: false, dragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0, node: null };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const cam = cameraRef.current;
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    cam.x = mx - (mx - cam.x) * factor;
    cam.y = my - (my - cam.y) * factor;
    cam.zoom *= factor;
    cam.zoom = Math.max(0.1, Math.min(cam.zoom, 5));
  };

  const resetZoom = () => { cameraRef.current = { x: 0, y: 0, zoom: 1 }; };
  const zoomIn = () => { cameraRef.current.zoom = Math.min(cameraRef.current.zoom * 1.3, 5); };
  const zoomOut = () => { cameraRef.current.zoom = Math.max(cameraRef.current.zoom / 1.3, 0.1); };

  const pageCount = graphData?.nodes.filter(n => n.type === 'page').length ?? 0;
  const tagCount = graphData?.nodes.filter(n => n.type === 'tag').length ?? 0;

  return (
    <div className="content-body">
      <div className="content-header">
        <div className="content-header-left">
          <h1><Network size={24} style={{ verticalAlign: 'middle', marginRight: 8 }} />Knowledge Graph</h1>
          {graphData && (
            <span style={{ fontSize: '0.85rem', color: 'var(--c-text-muted)' }}>
              {pageCount} pages · {tagCount} tags · {graphData.edges.length} connections
            </span>
          )}
        </div>
        <div className="content-header-actions">
          <button className="btn btn-ghost" onClick={zoomIn} title="Zoom In"><ZoomIn size={18} /></button>
          <button className="btn btn-ghost" onClick={zoomOut} title="Zoom Out"><ZoomOut size={18} /></button>
          <button className="btn btn-ghost" onClick={resetZoom} title="Reset View"><Maximize2 size={18} /></button>
          <button className="btn btn-secondary" onClick={loadGraph}><RefreshCw size={16} /> Refresh</button>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400, color: 'var(--c-text-muted)' }}>
          Loading graph…
        </div>
      ) : (
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: 'calc(100vh - 180px)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--c-border)',
            background: 'var(--c-bg-page)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <canvas
            ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { dragRef.current = { active: false, dragging: false, startX: 0, startY: 0, lastX: 0, lastY: 0, node: null }; setHoveredNode(null); }}
            onWheel={handleWheel}
          />
          {/* Legend */}
          <div style={{
            position: 'absolute', bottom: 12, left: 12, background: 'var(--c-bg)', border: '1px solid var(--c-border)',
            borderRadius: 'var(--radius-sm)', padding: '8px 12px', fontSize: '0.78rem', color: 'var(--c-text-secondary)',
            display: 'flex', gap: 16, alignItems: 'center',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--c-success)', display: 'inline-block' }} /> Published
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--c-primary)', display: 'inline-block' }} /> Draft
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} /> Tag
            </span>
            <span style={{ opacity: 0.6 }}>Click to open · Scroll to zoom · Drag to pan</span>
          </div>
          {hoveredNode && (
            <div style={{
              position: 'absolute', top: 12, left: 12, background: 'var(--c-bg)', border: '1px solid var(--c-border)',
              borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: '0.85rem', color: 'var(--c-text)',
              pointerEvents: 'none', boxShadow: 'var(--shadow-sm)',
            }}>
              {hoveredNode.type === 'tag' ? `# ${hoveredNode.label}` : hoveredNode.label}
              {hoveredNode.visibility && <span style={{ marginLeft: 8, opacity: 0.6, fontSize: '0.75rem' }}>{hoveredNode.visibility}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
