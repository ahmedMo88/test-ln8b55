import React, { useEffect, useCallback, useMemo } from 'react';
import { MiniMap, useReactFlow, useViewport } from 'reactflow'; // v11.8.3
import styled from 'styled-components'; // v6.0.8
import debounce from 'lodash/debounce'; // v4.17.21

import { useWorkflow } from '../../../hooks/useWorkflow';
import type { Node, NodeStatus } from '../../../types/node.types';

// Constants for minimap configuration
const MINIMAP_WIDTH = 240;
const MINIMAP_HEIGHT = 160;
const VIEWPORT_CONSTRAINTS = {
  minZoom: 0.5,
  maxZoom: 2,
  padding: 0.1
};

// Styled components for enhanced minimap appearance
const MinimapContainer = styled.div`
  position: absolute;
  bottom: 20px;
  right: 20px;
  background: ${({ theme }) => theme.colors.background.secondary};
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border: 1px solid ${({ theme }) => theme.colors.border.light};
  overflow: hidden;
  transition: opacity 0.2s ease-in-out;

  &:hover {
    opacity: 1;
  }

  /* Reduce opacity when not hovered */
  opacity: 0.8;
`;

// Node color mapping based on status
const getNodeColor = (type: string, status: NodeStatus): string => {
  switch (status) {
    case 'running':
      return '#3498db';
    case 'completed':
      return '#2ecc71';
    case 'error':
      return '#e74c3c';
    case 'warning':
      return '#f1c40f';
    case 'disabled':
      return '#95a5a6';
    default:
      // Default colors based on node type
      switch (type) {
        case 'trigger':
          return '#9b59b6';
        case 'action':
          return '#2980b9';
        case 'condition':
          return '#f39c12';
        case 'ai_task':
          return '#16a085';
        default:
          return '#bdc3c7';
      }
  }
};

interface WorkflowMinimapProps {
  height?: number;
  width?: number;
  zoomable?: boolean;
  nodeColor?: (node: Node) => string;
  viewportBounds?: typeof VIEWPORT_CONSTRAINTS;
}

/**
 * Enhanced Workflow Minimap component providing real-time navigation and node status indication
 */
export const WorkflowMinimap: React.FC<WorkflowMinimapProps> = ({
  height = MINIMAP_HEIGHT,
  width = MINIMAP_WIDTH,
  zoomable = true,
  nodeColor,
  viewportBounds = VIEWPORT_CONSTRAINTS
}) => {
  const { workflow, nodePositions, nodeStatuses } = useWorkflow();
  const { setViewport, fitView } = useReactFlow();
  const { x, y, zoom } = useViewport();

  // Memoized node styling based on status
  const getNodeStyle = useMemo(() => {
    return (node: Node) => {
      const status = nodeStatuses?.find(s => s.nodeId === node.id)?.status || 'idle';
      return {
        backgroundColor: nodeColor?.(node) || getNodeColor(node.type, status),
        borderColor: status === 'error' ? '#e74c3c' : 'transparent',
        borderWidth: status === 'error' ? 2 : 0
      };
    };
  }, [nodeColor, nodeStatuses]);

  // Debounced viewport change handler
  const handleViewportChange = useCallback(
    debounce((event: { x: number; y: number; zoom: number }) => {
      // Validate viewport bounds
      const newZoom = Math.min(
        Math.max(event.zoom, viewportBounds.minZoom),
        viewportBounds.maxZoom
      );

      // Apply viewport change with smooth transition
      setViewport(
        {
          x: event.x,
          y: event.y,
          zoom: newZoom
        },
        { duration: 300 }
      );
    }, 16),
    [setViewport, viewportBounds]
  );

  // Update minimap when node positions change
  useEffect(() => {
    if (workflow?.nodes && nodePositions) {
      // Ensure all nodes are visible in the minimap
      fitView({
        padding: viewportBounds.padding,
        duration: 200
      });
    }
  }, [workflow?.nodes, nodePositions, fitView, viewportBounds.padding]);

  // Don't render if no workflow is loaded
  if (!workflow?.nodes) {
    return null;
  }

  return (
    <MinimapContainer>
      <MiniMap
        nodeColor={getNodeStyle}
        nodeStrokeWidth={3}
        nodeStrokeColor="#fff"
        nodeBorderRadius={2}
        maskColor="rgba(0, 0, 0, 0.1)"
        maskStrokeWidth={1}
        maskStrokeColor="rgba(0, 0, 0, 0.2)"
        position="top-right"
        pannable={true}
        zoomable={zoomable}
        width={width}
        height={height}
        onClick={handleViewportChange}
        // Current viewport state
        x={x}
        y={y}
        zoom={zoom}
      />
    </MinimapContainer>
  );
};

export default WorkflowMinimap;