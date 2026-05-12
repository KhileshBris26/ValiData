import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, { 
  MiniMap, 
  Controls, 
  Background, 
  useNodesState, 
  useEdgesState,
  MarkerType,
  Position
} from 'reactflow';
import type { Edge, Node } from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import axios from 'axios';
import { Loader2, Network, Table2, ZoomIn } from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import SearchableDropdown from '../components/SearchableDropdown';
import CustomTableNode from '../components/CustomTableNode';
import './LineageStudio.css';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000/api/v1';

const nodeTypes = {
  customTable: CustomTableNode,
};

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 200 });

  nodes.forEach((node) => {
    // Calculate initial height based on collapsed state (join columns only)
    const displayCount = node.data.joinColumns?.length || 1;
    const height = 50 + (displayCount * 24) + 30; // +30 for the footer toggle
    dagreGraph.setNode(node.id, { width: 250, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const newNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - 125,
        y: nodeWithPosition.y - (50 + (((node.data.joinColumns?.length || 1) * 24) + 30)) / 2,
      }
    };
  });

  return { nodes: newNodes, edges };
};

const LineageStudio: React.FC = () => {
  const { platform } = usePlatform();
  
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [table, setTable] = useState('');
  
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [loadingMeta, setLoadingMeta] = useState<'none' | 'db' | 'schema' | 'table'>('none');
  
  const [loadingInfer, setLoadingInfer] = useState(false);
  const [viewMode, setViewMode] = useState<'graph' | 'table'>('graph');

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId((prev) => (prev === node.id ? null : node.id));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Fetch Metadata Helpers
  const fetchMetadata = async (entityType: string, params: any) => {
    let credentials = null;
    const saved = localStorage.getItem('robin_credentials');
    if (saved) credentials = JSON.parse(saved)[platform];
    
    const res = await axios.post(`${API_BASE}/metadata/entities`, {
      platform,
      entity_type: entityType,
      credentials,
      ...params
    }, { timeout: 15000 });
    return res.data.entities || [];
  };

  useEffect(() => {
    setDatabase(''); setSchema(''); setDatabases([]); setSchemas([]);
    const loadDatabases = async () => {
      setLoadingMeta('db');
      try {
        const dbs = await fetchMetadata('databases', {});
        setDatabases(dbs);
      } catch (err) {}
      setLoadingMeta('none');
    };
    loadDatabases();
  }, [platform]);

  useEffect(() => {
    setSchema(''); setSchemas([]); setTable(''); setTables([]);
    if (!database) return;
    const loadSchemas = async () => {
      setLoadingMeta('schema');
      try {
        const schs = await fetchMetadata('schemas', { database_name: database });
        setSchemas(schs);
      } catch (err) {}
      setLoadingMeta('none');
    };
    loadSchemas();
  }, [database, platform]);

  useEffect(() => {
    setTable(''); setTables([]);
    if (!database || !schema) return;
    const loadTables = async () => {
      setLoadingMeta('table');
      try {
        const tbls = await fetchMetadata('tables', { database_name: database, schema_name: schema });
        setTables(tbls);
      } catch (err) {}
      setLoadingMeta('none');
    };
    loadTables();
  }, [database, schema, platform]);

  const handleInferLineage = async () => {
    if (!database || !schema) return alert("Select Database and Schema");
    
    setLoadingInfer(true);
    try {
      let credentials = null;
      const saved = localStorage.getItem('robin_credentials');
      if (saved) credentials = JSON.parse(saved)[platform];

      const res = await axios.post(`${API_BASE}/lineage/infer`, {
        platform,
        database_name: database,
        schema_name: schema,
        table_name: table || undefined,
        credentials
      }, { timeout: 60000 });

      const { nodes: rawNodes, edges: rawEdges } = res.data;
      
      // Calculate join columns for each node
      const joinColsMap: Record<string, Set<string>> = {};
      rawNodes.forEach((n: any) => { joinColsMap[n.id] = new Set(); });

      rawEdges.forEach((e: any) => {
        if (e.data?.col1 && joinColsMap[e.source]) joinColsMap[e.source].add(e.data.col1);
        if (e.data?.col2 && joinColsMap[e.target]) joinColsMap[e.target].add(e.data.col2);
      });

      const nodesWithJoinCols = rawNodes.map((n: any) => ({
        ...n,
        data: {
          ...n.data,
          joinColumns: Array.from(joinColsMap[n.id] || [])
        }
      }));

      // Add markers to edges
      const formattedEdges = rawEdges.map((e: any) => ({
        ...e,
        markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent-secondary)' },
        style: { stroke: 'var(--accent-secondary)', strokeWidth: 2 }
      }));

      const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        nodesWithJoinCols,
        formattedEdges
      );

      setNodes(layoutedNodes);
      setEdges(layoutedEdges);
    } catch (err) {
      console.error(err);
      alert("Failed to infer lineage");
    }
    setLoadingInfer(false);
  };

  return (
    <div className="lineage-studio">
      <h1 className="page-title">Lineage & Relationships</h1>
      
      <div className="lineage-header glass-panel">
        <div className="controls-row">
          <div className="control-group">
            <SearchableDropdown 
              label={platform === 'databricks' ? "Catalog" : "Database"}
              value={database}
              onChange={setDatabase}
              options={databases}
              placeholder="Select..."
              isLoading={loadingMeta === 'db'}
            />
          </div>
          <div className="control-group">
            <SearchableDropdown 
              label="Schema"
              value={schema}
              onChange={setSchema}
              options={schemas}
              placeholder="Select..."
              isLoading={loadingMeta === 'schema'}
              disabled={!database}
            />
          </div>
          <div className="control-group">
            <SearchableDropdown 
              label="Table (Optional)"
              value={table}
              onChange={setTable}
              options={tables}
              placeholder="All Tables"
              isLoading={loadingMeta === 'table'}
              disabled={!schema}
            />
          </div>
          <div className="control-group btn-group">
            <button className="btn btn-primary" onClick={handleInferLineage} disabled={loadingInfer || !schema}>
              {loadingInfer ? <Loader2 className="spinner" size={16} /> : <Network size={16} />}
              Infer Lineage
            </button>
          </div>
        </div>
      </div>

      <div className="view-toggle">
        <button className={`toggle-btn ${viewMode === 'graph' ? 'active' : ''}`} onClick={() => setViewMode('graph')}>
          <Network size={16}/> Visual Graph
        </button>
        <button className={`toggle-btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
          <Table2 size={16}/> Tabular Data
        </button>
      </div>

      <div className="lineage-content glass-panel">
        {viewMode === 'graph' ? (
          <div className="react-flow-wrapper">
            {nodes.length > 0 ? (
              <ReactFlow
                nodes={nodes.map((node) => {
                  if (!selectedNodeId) return { ...node, className: '' };
                  const isConnected = edges.some(
                    (e) => (e.source === selectedNodeId && e.target === node.id) || 
                           (e.target === selectedNodeId && e.source === node.id)
                  );
                  if (node.id === selectedNodeId) return { ...node, className: 'selected' };
                  if (isConnected) return { ...node, className: 'highlighted' };
                  return { ...node, className: 'dimmed' };
                })}
                edges={edges.map((edge) => {
                  if (!selectedNodeId) return { ...edge, className: '' };
                  if (edge.source === selectedNodeId || edge.target === selectedNodeId) return { ...edge, className: 'highlighted-edge' };
                  return { ...edge, className: 'dimmed-edge' };
                })}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                fitView
                attributionPosition="bottom-right"
              >
                <MiniMap style={{ height: 120, width: 150 }} zoomable pannable nodeColor="var(--accent-primary)" maskColor="rgba(0,0,0,0.2)" />
                <Controls />
                <Background color="var(--panel-border)" gap={20} size={1} />
              </ReactFlow>
            ) : (
              <div className="empty-state">
                <ZoomIn size={48} />
                <p>Select a database and schema to infer relationships.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="tabular-wrapper">
             {edges.length > 0 ? (
               <table className="lineage-table">
                 <thead>
                   <tr>
                     <th>Source Table</th>
                     <th>Target Table</th>
                     <th>Relationship (Match)</th>
                   </tr>
                 </thead>
                 <tbody>
                   {edges.map((e, idx) => (
                     <tr key={idx}>
                       <td>{e.source}</td>
                       <td>{e.target}</td>
                       <td><span className="badge">{e.label as string}</span></td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             ) : (
               <div className="empty-state">
                 <p>No relationships found or inferred yet.</p>
               </div>
             )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LineageStudio;
