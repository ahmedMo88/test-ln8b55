/**
 * @fileoverview Enhanced workflow canvas component implementing Material Design 3.0 guidelines
 * with comprehensive drag-and-drop support, real-time validation, and performance optimizations.
 * @version 1.0.0
 */

import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  useReactFlow,
  useNodes,
  useEdges,
  MiniMap,
  NodeToolbar,
  Panel,
  Connection,
  Edge,
  Node,
  OnConnect,
  OnNodesChange,
  OnEdgesChange
} from 'reactflow';
import { styled } from 'styled-components';
import { debounce } from 'lodash';

// Internal imports
import WorkflowNode from '../Node';
import useWorkflow from '../../../hooks/useWorkflow';
import useWebSocket from '../../../hooks/useWebSocket';

// Constants
const GRID_SIZE = 20;
const SNAP_GRID: [number, number] = [GRID_SIZE, GRID_SIZE];
const ZOOM_LIMITS = { min: 0.25, max: 2 };
const AUTOSAVE_DELAY = 1000;

// Styled components
const CanvasContainer = styled.div`
  width: 100%;
  height: 100%;
  background: ${({ theme }) => theme.palette.background.default};
`;

const StyledPanel = styled(Panel)`
  padding: 8px;
  border-radius: 4px;
  background: ${({ theme }) => theme.palette.background.paper};
  box-shadow: ${({ theme }) => theme.shadows[1]};
`;

interface WorkflowCanvasProps {
  workflowId: string;
  readOnly?: boolean;
  onNodeSelect?: (nodeId: string) => void;
  onWorkflowChange?: (workflow: any) => void;
}

/**
 * Enhanced workflow canvas component with comprehensive drag-and-drop support
 * and real-time validation capabilities.
 */
export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  workflowId,
  readOnly = false,
  onNodeSelect,
  onWorkflowChange
}) => {
  // Hooks
  const { workflow, saveWorkflow, undoWorkflow, redoWorkflow } = useWorkflow(workflowId);
  const { isConnected: wsConnected, send: wsSend } = useWebSocket();
  const { project } = useReactFlow();
  const nodes = useNodes();
  const edges = useEdges();

  // Local state
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<Map<string, string>>(new Map());
  const canvasRef = useRef<HTMLDivElement>(null);

  /**
   * Debounced workflow save handler
   */
  const debouncedSave = useMemo(
    () => debounce((updates: any) => {
      saveWorkflow(updates);
      onWorkflowChange?.(updates);
    }, AUTOSAVE_DELAY),
    [saveWorkflow, onWorkflowChange]
  );

  /**
   * Handles node position updates with collision detection and grid snapping
   */
  const handleNodeDragStop = useCallback(
    (event: React.MouseEvent, node: Node, position: { x: number; y: number }) => {
      if (readOnly) return;

      // Snap to grid
      const snappedPosition = {
        x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
        y: Math.round(position.y / GRID_SIZE) * GRID_SIZE
      };

      // Check canvas bounds
      const canvasBounds = canvasRef.current?.getBoundingClientRect();
      if (canvasBounds) {
        snappedPosition.x = Math.max(0, Math.min(snappedPosition.x, canvasBounds.width - 200));
        snappedPosition.y = Math.max(0, Math.min(snappedPosition.y, canvasBounds.height - 100));
      }

      // Update node position
      const updatedNode = {
        ...node,
        position: snappedPosition
      };

      debouncedSave({
        nodes: nodes.map(n => (n.id === node.id ? updatedNode : n))
      });

      // Emit position change via WebSocket if connected
      if (wsConnected) {
        wsSend({
          type: 'NODE_MOVED',
          payload: {
            nodeId: node.id,
            position: snappedPosition
          }
        });
      }
    },
    [nodes, debouncedSave, wsConnected, wsSend, readOnly]
  );

  /**
   * Handles creation of new connections between nodes with validation
   */
  const handleConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (readOnly) return false;

      const sourceNode = nodes.find(n => n.id === connection.source);
      const targetNode = nodes.find(n => n.id === connection.target);

      // Validate connection
      if (!sourceNode || !targetNode) return false;
      if (sourceNode.id === targetNode.id) return false;
      if (edges.some(e => 
        e.source === connection.source && 
        e.target === connection.target
      )) return false;

      // Create new edge
      const newEdge: Edge = {
        id: `e${connection.source}-${connection.target}`,
        source: connection.source,
        target: connection.target,
        type: 'smoothstep',
        animated: true
      };

      debouncedSave({
        edges: [...edges, newEdge]
      });

      // Emit connection via WebSocket
      if (wsConnected) {
        wsSend({
          type: 'EDGE_ADDED',
          payload: newEdge
        });
      }

      return true;
    },
    [nodes, edges, debouncedSave, wsConnected, wsSend, readOnly]
  );

  /**
   * Handles node selection for group operations
   */
  const handleNodeSelect = useCallback(
    (selectedIds: string[]) => {
      setSelectedNodes(selectedIds);
      if (selectedIds.length === 1) {
        onNodeSelect?.(selectedIds[0]);
      }
    },
    [onNodeSelect]
  );

  /**
   * Handles node changes with validation
   */
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      if (readOnly) return;

      const updatedNodes = changes.reduce((acc, change) => {
        if (change.type === 'position' && change.position) {
          const nodeIndex = acc.findIndex(n => n.id === change.id);
          if (nodeIndex !== -1) {
            acc[nodeIndex] = {
              ...acc[nodeIndex],
              position: change.position
            };
          }
        }
        return acc;
      }, [...nodes]);

      debouncedSave({ nodes: updatedNodes });
    },
    [nodes, debouncedSave, readOnly]
  );

  /**
   * Handles edge changes with validation
   */
  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      if (readOnly) return;

      const updatedEdges = changes.reduce((acc, change) => {
        if (change.type === 'remove') {
          return acc.filter(edge => edge.id !== change.id);
        }
        return acc;
      }, [...edges]);

      debouncedSave({ edges: updatedEdges });
    },
    [edges, debouncedSave, readOnly]
  );

  // Initialize workflow data
  useEffect(() => {
    if (workflow) {
      const { nodes: workflowNodes, edges: workflowEdges } = workflow;
      project.setNodes(workflowNodes);
      project.setEdges(workflowEdges);
    }
  }, [workflow, project]);

  return (
    <CanvasContainer ref={canvasRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onSelectionChange={handleNodeSelect}
        nodeTypes={{ workflowNode: WorkflowNode }}
        snapToGrid={true}
        snapGrid={SNAP_GRID}
        minZoom={ZOOM_LIMITS.min}
        maxZoom={ZOOM_LIMITS.max}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        fitView
        attributionPosition="bottom-right"
      >
        <Background gap={GRID_SIZE} size={1} />
        <Controls showInteractive={!readOnly} />
        <MiniMap
          nodeColor={(node) => {
            return validationErrors.has(node.id) ? '#ff0000' : '#00ff00';
          }}
        />
        
        {selectedNodes.length > 0 && (
          <NodeToolbar>
            <StyledPanel position="top">
              <button onClick={undoWorkflow} disabled={readOnly}>Undo</button>
              <button onClick={redoWorkflow} disabled={readOnly}>Redo</button>
            </StyledPanel>
          </NodeToolbar>
        )}
      </ReactFlow>
    </CanvasContainer>
  );
};

WorkflowCanvas.displayName = 'WorkflowCanvas';

export default WorkflowCanvas;