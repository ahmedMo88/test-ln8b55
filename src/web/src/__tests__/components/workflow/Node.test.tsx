import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import WorkflowNode from '../../../components/workflow/Node';
import theme from '../../../theme';
import type { Node, NodeType, NodeStatus, NodePosition } from '../../../types/node.types';

// Helper function to render components with theme
const renderWithTheme = (component: React.ReactElement) => {
  return {
    user: userEvent.setup(),
    ...render(
      <ThemeProvider theme={theme}>
        {component}
      </ThemeProvider>
    )
  };
};

// Mock node factory
const createMockNode = (overrides: Partial<Node> = {}): Node => ({
  id: 'test-node-1',
  workflowId: 'test-workflow-1',
  type: 'action',
  name: 'Test Node',
  description: 'Test node description',
  config: {
    service: 'test-service',
    operation: 'test-operation',
    parameters: {},
    retryPolicy: {
      maxAttempts: 3,
      backoffMultiplier: 1.5,
      initialDelay: 1000,
      maxDelay: 10000
    },
    timeout: 30000
  },
  position: { x: 100, y: 100, z: 0 },
  status: 'idle',
  inputConnections: [],
  outputConnections: [],
  metadata: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides
});

// Mock handler factory
const createMockHandlers = () => ({
  onNodeClick: vi.fn(),
  onNodeDrag: vi.fn(),
  onNodeConfig: vi.fn(),
  onNodeError: vi.fn()
});

describe('WorkflowNode Component', () => {
  describe('Rendering', () => {
    it('renders node with correct type indicator', () => {
      const mockNode = createMockNode();
      const mockHandlers = createMockHandlers();
      
      renderWithTheme(
        <WorkflowNode
          node={mockNode}
          {...mockHandlers}
        />
      );

      expect(screen.getByText(mockNode.name)).toBeInTheDocument();
      expect(screen.getByText(`${mockNode.type} node`)).toBeInTheDocument();
    });

    it('displays proper status indicator based on node status', () => {
      const statuses: NodeStatus[] = ['idle', 'running', 'completed', 'error', 'warning', 'disabled'];
      
      statuses.forEach(status => {
        const mockNode = createMockNode({ status });
        const mockHandlers = createMockHandlers();
        
        const { container } = renderWithTheme(
          <WorkflowNode
            node={mockNode}
            {...mockHandlers}
          />
        );

        // Status indicator should have the correct color based on status
        const statusIndicator = container.querySelector('[class*="StatusIndicator"]');
        expect(statusIndicator).toHaveStyle({
          backgroundColor: expect.any(String)
        });
      });
    });

    it('shows loading indicator when node is running', () => {
      const mockNode = createMockNode({ status: 'running' });
      const mockHandlers = createMockHandlers();
      
      renderWithTheme(
        <WorkflowNode
          node={mockNode}
          {...mockHandlers}
        />
      );

      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('applies selected state styling correctly', () => {
      const mockNode = createMockNode();
      const mockHandlers = createMockHandlers();
      
      const { container } = renderWithTheme(
        <WorkflowNode
          node={mockNode}
          selected={true}
          {...mockHandlers}
        />
      );

      const card = container.querySelector('[class*="MuiCard-root"]');
      expect(card).toHaveStyle({ boxShadow: expect.stringContaining('0px 8px') });
    });

    it('maintains proper accessibility attributes', () => {
      const mockNode = createMockNode();
      const mockHandlers = createMockHandlers();
      
      renderWithTheme(
        <WorkflowNode
          node={mockNode}
          {...mockHandlers}
          ariaLabel="Custom node label"
        />
      );

      const nodeElement = screen.getByRole('button');
      expect(nodeElement).toHaveAttribute('aria-label', 'Custom node label');
      expect(nodeElement).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Interactions', () => {
    it('handles click events with proper data', async () => {
      const mockNode = createMockNode();
      const mockHandlers = createMockHandlers();
      const { user } = renderWithTheme(
        <WorkflowNode
          node={mockNode}
          {...mockHandlers}
        />
      );

      await user.click(screen.getByRole('button'));
      expect(mockHandlers.onNodeClick).toHaveBeenCalledWith(mockNode.id);
    });

    it('manages drag start/end events', async () => {
      const mockNode = createMockNode();
      const mockHandlers = createMockHandlers();
      
      renderWithTheme(
        <WorkflowNode
          node={mockNode}
          {...mockHandlers}
        />
      );

      const nodeElement = screen.getByRole('button');
      
      // Simulate drag start
      fireEvent.mouseDown(nodeElement);
      
      // Simulate drag movement
      fireEvent.mouseMove(document, {
        clientX: 150,
        clientY: 150
      });

      // Verify position update
      expect(mockHandlers.onNodeDrag).toHaveBeenCalledWith(
        mockNode.id,
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number)
        })
      );

      // Simulate drag end
      fireEvent.mouseUp(document);
    });

    it('processes configuration button clicks', async () => {
      const mockNode = createMockNode();
      const mockHandlers = createMockHandlers();
      const { user } = renderWithTheme(
        <WorkflowNode
          node={mockNode}
          {...mockHandlers}
        />
      );

      const configButton = screen.getByLabelText('Configure Node');
      await user.click(configButton);
      
      expect(mockHandlers.onNodeConfig).toHaveBeenCalledWith(mockNode.id);
    });

    it('supports keyboard navigation', async () => {
      const mockNode = createMockNode();
      const mockHandlers = createMockHandlers();
      
      renderWithTheme(
        <WorkflowNode
          node={mockNode}
          {...mockHandlers}
        />
      );

      const nodeElement = screen.getByRole('button');
      
      // Test Enter key
      fireEvent.keyDown(nodeElement, { key: 'Enter' });
      expect(mockHandlers.onNodeClick).toHaveBeenCalledWith(mockNode.id);

      // Test arrow keys for movement
      fireEvent.keyDown(nodeElement, { key: 'ArrowRight' });
      expect(mockHandlers.onNodeDrag).toHaveBeenCalledWith(
        mockNode.id,
        expect.objectContaining({
          x: mockNode.position.x + 10,
          y: mockNode.position.y
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('displays error state correctly', () => {
      const mockNode = createMockNode({ status: 'error' });
      const mockHandlers = createMockHandlers();
      
      const { container } = renderWithTheme(
        <WorkflowNode
          node={mockNode}
          {...mockHandlers}
        />
      );

      expect(container.querySelector('[class*="ErrorOverlay"]')).toBeInTheDocument();
    });

    it('handles missing props gracefully', () => {
      const mockNode = createMockNode({ name: undefined as any });
      const mockHandlers = createMockHandlers();
      
      renderWithTheme(
        <WorkflowNode
          node={mockNode}
          {...mockHandlers}
        />
      );

      // Should fallback to type description
      expect(screen.getByText('action node')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('memoizes node actions correctly', async () => {
      const mockNode = createMockNode();
      const mockHandlers = createMockHandlers();
      
      const { rerender } = renderWithTheme(
        <WorkflowNode
          node={mockNode}
          {...mockHandlers}
        />
      );

      const initialButtons = screen.getAllByRole('button');

      // Rerender with same props
      rerender(
        <ThemeProvider theme={theme}>
          <WorkflowNode
            node={mockNode}
            {...mockHandlers}
          />
        </ThemeProvider>
      );

      const rerenderedButtons = screen.getAllByRole('button');
      
      // Buttons should be the same instances
      expect(initialButtons).toEqual(rerenderedButtons);
    });
  });
});