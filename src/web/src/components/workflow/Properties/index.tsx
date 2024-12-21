/**
 * @fileoverview Properties panel component for workflow node configuration
 * Implements Material Design 3.0 with comprehensive validation and real-time updates
 * @version 1.0.0
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Box, Card, Typography, Divider, Alert, CircularProgress } from '@mui/material';
import { styled, useTheme } from '@mui/material/styles';
import debounce from 'lodash/debounce';

// Internal imports
import Input from '../../common/Input';
import { 
  Workflow, 
  Node, 
  WorkflowValidationError, 
  NodeConfig 
} from '../../../types/workflow.types';
import { updateWorkflow, validateNode } from '../../../store/slices/workflowSlice';

// Styled components with Material Design 3.0 specifications
const PropertiesContainer = styled(Box)(({ theme }) => ({
  width: {
    xs: '100%',
    sm: '320px'
  },
  height: '100%',
  borderLeft: `1px solid ${theme.palette.divider}`,
  overflow: 'auto',
  transition: 'width 0.3s ease',
  backgroundColor: theme.palette.background.paper,
  display: 'flex',
  flexDirection: 'column'
}));

const PropertiesCard = styled(Card)(({ theme }) => ({
  margin: theme.spacing(2),
  padding: theme.spacing(2),
  boxShadow: 'none',
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius * 1.5,
  '&:hover': {
    borderColor: theme.palette.primary.main,
    transition: 'border-color 0.2s ease-in-out'
  }
}));

const PropertySection = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  '&:last-child': {
    marginBottom: 0
  }
}));

// Props interface
interface PropertiesProps {
  selectedNodeId: string | null;
  workflowId: string;
  onValidationChange: (isValid: boolean) => void;
}

/**
 * Properties panel component for configuring workflow nodes
 * Implements real-time validation and updates
 */
export const Properties: React.FC<PropertiesProps> = React.memo(({ 
  selectedNodeId, 
  workflowId, 
  onValidationChange 
}) => {
  const dispatch = useDispatch();
  const theme = useTheme();

  // Redux selectors
  const workflow = useSelector((state: any) => 
    state.workflow.workflows.find((w: Workflow) => w.id === workflowId)
  );
  const selectedNode = useMemo(() => 
    workflow?.nodes.find((n: Node) => n.id === selectedNodeId),
    [workflow, selectedNodeId]
  );

  // Local state
  const [config, setConfig] = useState<NodeConfig | null>(null);
  const [validationErrors, setValidationErrors] = useState<WorkflowValidationError[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Initialize config when node changes
  useEffect(() => {
    if (selectedNode) {
      setConfig(selectedNode.config);
      validateNodeConfig(selectedNode.config);
    } else {
      setConfig(null);
      setValidationErrors([]);
    }
  }, [selectedNode]);

  // Debounced validation handler
  const validateNodeConfig = useCallback(
    debounce(async (nodeConfig: NodeConfig) => {
      if (!selectedNodeId) return;

      setIsLoading(true);
      try {
        const result = await dispatch(validateNode({ 
          workflowId, 
          nodeId: selectedNodeId, 
          config: nodeConfig 
        })).unwrap();

        setValidationErrors(result);
        onValidationChange(result.length === 0);
      } catch (error) {
        console.error('Validation error:', error);
        setValidationErrors([{
          field: 'general',
          message: 'Failed to validate configuration',
          code: 'VALIDATION_ERROR',
          severity: 'error',
          nodeErrors: [],
          suggestions: ['Check your connection and try again']
        }]);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    [dispatch, workflowId, selectedNodeId, onValidationChange]
  );

  // Handle configuration changes
  const handleConfigChange = useCallback(async (
    field: string, 
    value: any
  ) => {
    if (!selectedNodeId || !config) return;

    const newConfig = {
      ...config,
      parameters: {
        ...config.parameters,
        [field]: value
      }
    };

    setConfig(newConfig);
    validateNodeConfig(newConfig);

    try {
      await dispatch(updateWorkflow({
        id: workflowId,
        updates: {
          nodes: workflow.nodes.map((node: Node) =>
            node.id === selectedNodeId
              ? { ...node, config: newConfig }
              : node
          )
        }
      })).unwrap();
    } catch (error) {
      console.error('Update error:', error);
    }
  }, [dispatch, workflowId, workflow, selectedNodeId, config]);

  if (!selectedNodeId || !selectedNode) {
    return (
      <PropertiesContainer>
        <Typography variant="body1" sx={{ p: 2, color: 'text.secondary' }}>
          Select a node to configure its properties
        </Typography>
      </PropertiesContainer>
    );
  }

  return (
    <PropertiesContainer>
      <PropertiesCard>
        <PropertySection>
          <Typography variant="h6" gutterBottom>
            {selectedNode.name || 'Node Properties'}
          </Typography>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {selectedNode.type} configuration
          </Typography>
        </PropertySection>

        <Divider sx={{ my: 2 }} />

        {isLoading && (
          <Box display="flex" justifyContent="center" my={2}>
            <CircularProgress size={24} />
          </Box>
        )}

        {validationErrors.length > 0 && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            role="alert"
            aria-live="polite"
          >
            {validationErrors[0].message}
          </Alert>
        )}

        <PropertySection>
          {config && Object.entries(config.parameters).map(([key, value]) => (
            <Input
              key={key}
              name={key}
              label={key.charAt(0).toUpperCase() + key.slice(1)}
              value={String(value)}
              onChange={(e) => handleConfigChange(key, e.target.value)}
              error={validationErrors.some(err => err.field === key)}
              helperText={validationErrors.find(err => err.field === key)?.message}
              fullWidth
              margin="normal"
              size="small"
            />
          ))}
        </PropertySection>
      </PropertiesCard>
    </PropertiesContainer>
  );
});

// Display name for debugging
Properties.displayName = 'Properties';

export default Properties;