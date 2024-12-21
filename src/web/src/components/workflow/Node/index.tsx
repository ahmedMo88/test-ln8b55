/**
 * @fileoverview Enhanced workflow node component implementing Material Design 3.0 guidelines
 * with comprehensive accessibility features, touch support, and real-time status visualization.
 * @version 1.0.0
 */

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { IconButton, Typography, Tooltip, CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';
import { Settings, PlayArrow, Stop, Error, Warning } from '@mui/icons-material';

// Internal imports
import { Node, NodeType, NodeStatus, NodeConfig, NodePosition, NodeError } from '../../../types/node.types';
import CustomCard from '../../common/Card';
import useWorkflow from '../../../hooks/useWorkflow';

// Styled components with Material Design 3.0 specifications
const NodeContainer = styled('div')<{ isDragging?: boolean }>(({ theme, isDragging }) => ({
  position: 'absolute',
  userSelect: 'none',
  transition: 'all 0.2s ease-in-out',
  minWidth: '200px',
  cursor: isDragging ? 'grabbing' : 'grab',
  touchAction: 'none',
  outline: 'none',
  willChange: 'transform',
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: '2px'
  },
  '&:hover': {
    transform: 'translateY(-2px)'
  }
}));

const NodeContent = styled('div')(({ theme }) => ({
  padding: theme.spacing(2),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1)
}));

const NodeHeader = styled('div')({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
});

const NodeActions = styled('div')(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(1),
  opacity: 0.8,
  transition: 'opacity 0.2s ease-in-out',
  '&:hover': {
    opacity: 1
  }
}));

const StatusIndicator = styled('div')<{ status: NodeStatus }>(({ theme, status }) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  marginRight: theme.spacing(1),
  transition: 'background-color 0.2s ease-in-out',
  backgroundColor: getNodeStatusColor(status, theme)
}));

const ErrorOverlay = styled('div')(({ theme }) => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: `${theme.palette.error.main}10`,
  pointerEvents: 'none',
  borderRadius: theme.shape.borderRadius
}));

// Props interface
interface NodeProps {
  node: Node;
  onNodeClick: (nodeId: string) => void;
  onNodeDrag: (nodeId: string, position: NodePosition) => void;
  onNodeConfig: (nodeId: string) => void;
  onNodeError?: (nodeId: string, error: NodeError) => void;
  selected?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Enhanced workflow node component with comprehensive interaction support
 * and real-time status visualization.
 */
export const WorkflowNode: React.FC<NodeProps> = React.memo(({
  node,
  onNodeClick,
  onNodeDrag,
  onNodeConfig,
  onNodeError,
  selected = false,
  disabled = false,
  ariaLabel
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ isDragging: boolean; startX: number; startY: number }>({
    isDragging: false,
    startX: 0,
    startY: 0
  });

  // Get workflow context
  const { workflow, executionStatus } = useWorkflow();

  /**
   * Handles drag start with touch support
   */
  const handleDragStart = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;

    event.preventDefault();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    dragRef.current = {
      isDragging: true,
      startX: clientX - node.position.x,
      startY: clientY - node.position.y
    };

    document.addEventListener('mousemove', handleDrag as any);
    document.addEventListener('mouseup', handleDragEnd as any);
    document.addEventListener('touchmove', handleDrag as any);
    document.addEventListener('touchend', handleDragEnd as any);
  }, [disabled, node.position]);

  /**
   * Handles drag movement with boundary validation
   */
  const handleDrag = useCallback((event: MouseEvent | TouchEvent) => {
    if (!dragRef.current.isDragging) return;

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    const newX = Math.max(0, clientX - dragRef.current.startX);
    const newY = Math.max(0, clientY - dragRef.current.startY);

    onNodeDrag(node.id, { x: newX, y: newY, z: node.position.z });
  }, [node.id, onNodeDrag]);

  /**
   * Handles drag end and cleanup
   */
  const handleDragEnd = useCallback(() => {
    dragRef.current.isDragging = false;
    document.removeEventListener('mousemove', handleDrag as any);
    document.removeEventListener('mouseup', handleDragEnd as any);
    document.removeEventListener('touchmove', handleDrag as any);
    document.removeEventListener('touchend', handleDragEnd as any);
  }, [handleDrag]);

  /**
   * Handles keyboard navigation
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (disabled) return;

    switch (event.key) {
      case 'Enter':
      case ' ':
        onNodeClick(node.id);
        break;
      case 'Delete':
      case 'Backspace':
        // Handle node deletion if implemented
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        // Handle node movement with keyboard
        event.preventDefault();
        const delta = 10;
        const direction = {
          ArrowUp: { x: 0, y: -delta },
          ArrowDown: { x: 0, y: delta },
          ArrowLeft: { x: -delta, y: 0 },
          ArrowRight: { x: delta, y: 0 }
        }[event.key];
        
        onNodeDrag(node.id, {
          x: node.position.x + direction.x,
          y: node.position.y + direction.y,
          z: node.position.z
        });
        break;
    }
  }, [disabled, node.id, node.position, onNodeClick, onNodeDrag]);

  /**
   * Memoized node actions based on status
   */
  const nodeActions = useMemo(() => {
    const actions = [];

    if (node.status === 'running') {
      actions.push(
        <Tooltip title="Stop Execution" key="stop">
          <IconButton size="small" onClick={() => onNodeClick(node.id)} disabled={disabled}>
            <Stop />
          </IconButton>
        </Tooltip>
      );
    } else {
      actions.push(
        <Tooltip title="Start Execution" key="start">
          <IconButton size="small" onClick={() => onNodeClick(node.id)} disabled={disabled}>
            <PlayArrow />
          </IconButton>
        </Tooltip>
      );
    }

    actions.push(
      <Tooltip title="Configure Node" key="config">
        <IconButton size="small" onClick={() => onNodeConfig(node.id)} disabled={disabled}>
          <Settings />
        </IconButton>
      </Tooltip>
    );

    return actions;
  }, [node.status, node.id, onNodeClick, onNodeConfig, disabled]);

  // Update error state when execution status changes
  useEffect(() => {
    if (executionStatus?.nodeStates?.[node.id]?.error && onNodeError) {
      onNodeError(node.id, executionStatus.nodeStates[node.id].error);
    }
  }, [executionStatus, node.id, onNodeError]);

  return (
    <NodeContainer
      ref={nodeRef}
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`
      }}
      onMouseDown={handleDragStart}
      onTouchStart={handleDragStart}
      onKeyDown={handleKeyDown}
      tabIndex={disabled ? -1 : 0}
      role="button"
      aria-label={ariaLabel || `${node.type} node: ${node.name}`}
      aria-disabled={disabled}
    >
      <CustomCard elevation={selected ? 8 : 1}>
        <NodeContent>
          <NodeHeader>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <StatusIndicator status={node.status} />
              <Typography variant="subtitle2">{node.name}</Typography>
            </div>
            <NodeActions>{nodeActions}</NodeActions>
          </NodeHeader>
          
          <Typography variant="body2" color="textSecondary">
            {node.description || `${node.type} node`}
          </Typography>

          {node.status === 'running' && (
            <CircularProgress size={16} thickness={4} />
          )}
        </NodeContent>
      </CustomCard>

      {node.status === 'error' && <ErrorOverlay />}
    </NodeContainer>
  );
});

// Helper function to get status color
const getNodeStatusColor = (status: NodeStatus, theme: any): string => {
  const colors = {
    idle: theme.palette.grey[400],
    running: theme.palette.primary.main,
    completed: theme.palette.success.main,
    error: theme.palette.error.main,
    warning: theme.palette.warning.main,
    disabled: theme.palette.action.disabled
  };
  return colors[status] || colors.idle;
};

// Display name for debugging
WorkflowNode.displayName = 'WorkflowNode';

export default WorkflowNode;