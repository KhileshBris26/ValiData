import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { TableProperties, ChevronDown, ChevronUp } from 'lucide-react';
import './CustomTableNode.css';

interface NodeData {
  label: string;
  columns: { name: string; type: string }[];
  joinColumns?: string[];
}

const CustomTableNode = ({ data }: { data: NodeData }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const displayColumns = isExpanded 
    ? data.columns 
    : data.columns.filter(c => data.joinColumns?.includes(c.name));

  const hasHiddenColumns = data.columns.length > displayColumns.length;

  return (
    <div className="custom-table-node glass-panel">
      <Handle type="target" position={Position.Top} className="handle" />
      <Handle type="target" position={Position.Left} className="handle" id="left" />
      
      <div className="node-header">
        <TableProperties size={16} />
        <strong>{data.label}</strong>
      </div>
      
      <div className="node-columns">
        {displayColumns.length > 0 ? displayColumns.map((col, idx) => (
          <div key={idx} className={`node-column ${data.joinColumns?.includes(col.name) ? 'join-key' : ''}`}>
            <span className="col-name">{col.name}</span>
            <span className="col-type">{col.type}</span>
          </div>
        )) : (
          <div className="node-column empty-cols">
            <span className="col-name">No active joins</span>
          </div>
        )}
      </div>

      {(hasHiddenColumns || isExpanded) && (
        <div className="node-footer" onClick={() => setIsExpanded(!isExpanded)}>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          <span>{isExpanded ? 'Hide non-join columns' : `${data.columns.length - displayColumns.length} more columns`}</span>
        </div>
      )}

      <Handle type="source" position={Position.Right} className="handle" id="right" />
      <Handle type="source" position={Position.Bottom} className="handle" />
    </div>
  );
};

export default CustomTableNode;
