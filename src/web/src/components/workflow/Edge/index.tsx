/**
 * @fileoverview React component for rendering workflow edge connections with status-based styling
 * and animations. Provides visual feedback for workflow execution states and interactive features.
 * @version 1.0.0
 */

import React, { memo, useMemo, useCallback } from 'react';
import { getBezierPath, EdgeProps, Position } from 'reactflow'; // ^11.8.3
import styled, { keyframes } from 'styled-components'; // ^6.0.8
import { NodeConnection, NodeStatus } from '../../../types/node.types';

// Animation keyframes for running state
const flowAnimation = keyframes`
  from {
    stroke-dashoffset: 24;
  }
  to {
    stroke-dashoffset: 0;
  }
`;

// Styled path component with animation support
const StyledPath = styled.path<{ $isRunning: boolean; $selected: boolean }>`
  transition: all 0.3s ease;
  stroke-dasharray: ${props => props.$isRunning ? '12 12' : 'none'};
  animation: ${props => props.$isRunning ? `${flowAnimation} 1s linear infinite` : 'none'};
  cursor: pointer;
  filter: ${props => props.$selected ? 'drop-shadow(0 0 3px #2196F3)' : 'none'};

  &:hover {
    filter: drop-shadow(0 0 2px #666);
  }
`;

// Edge style configurations
const EDGE_STYLES = {
  default: {
    stroke: '#b1b1b7',
    strokeWidth: 2,
    fill: 'none',
  },
  success: {
    stroke: '#4CAF50',
    strokeWidth: 2,
    fill: 'none',
  },
  error: {
    stroke: '#F44336',
    strokeWidth: 2,
    fill: 'none',
  },
  running: {
    stroke: '#2196F3',
    strokeWidth: 2,
    fill: 'none',
  },
};

interface WorkflowEdgeProps extends EdgeProps {
  status?: NodeStatus;
  selected?: boolean;
  onClick?: (event: React.MouseEvent, edge: EdgeProps) => void;
}

/**
 * Gets the appropriate edge style based on connection type and status
 */
const getEdgeStyle = (type: string, status?: NodeStatus) => {
  if (status === 'running') return EDGE_STYLES.running;
  if (status === 'completed') return EDGE_STYLES.success;
  if (status === 'error') return EDGE_STYLES.error;
  return EDGE_STYLES.default;
};

/**
 * WorkflowEdge component for rendering workflow connections with status-based styling
 */
export const WorkflowEdge = memo(({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  status,
  selected = false,
  onClick,
  data,
}: WorkflowEdgeProps) => {
  // Calculate the path for the edge
  const [edgePath, labelX, labelY] = useMemo(() => {
    const path = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
    return path;
  }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  // Handle edge click events
  const handleEdgeClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (onClick) {
      onClick(event, {
        id,
        source,
        target,
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
        data,
      });
    }
  }, [id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, onClick]);

  // Calculate edge styles based on status
  const edgeStyle = useMemo(() => ({
    ...getEdgeStyle(data?.type || 'default', status),
    ...style,
  }), [data?.type, status, style]);

  return (
    <>
      <StyledPath
        id={id}
        d={edgePath}
        $isRunning={status === 'running'}
        $selected={selected}
        style={edgeStyle}
        className="workflow-edge"
        onClick={handleEdgeClick}
        aria-label={`Connection from ${source} to ${target}`}
        role="presentation"
        data-testid={`edge-${id}`}
      />
      {/* Optional label or marker could be added here */}
    </>
  );
});

// Display name for debugging
WorkflowEdge.displayName = 'WorkflowEdge';

// Default props
WorkflowEdge.defaultProps = {
  status: 'idle',
  selected: false,
};

export default WorkflowEdge;