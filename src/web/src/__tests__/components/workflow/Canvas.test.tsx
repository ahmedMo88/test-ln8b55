import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { vi } from 'vitest';
import { WorkflowCanvas } from '../../../components/workflow/Canvas';
import { configureStore } from '@reduxjs/toolkit';
import workflowReducer from '../../../store/slices/workflowSlice';

// Mock dependencies
vi.mock('../../../hooks/useWorkflow', () => ({
  useWorkflow: () => ({
    workflow: mockWorkflow,
    saveWorkflow: vi.fn(),
    updateNode: vi.fn(),
    addConnection: vi.fn(),
    undoWorkflow: vi.fn(),
    redoWorkflow: vi.fn()
  })
}));

vi.mock('../../../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    isConnected: true,
    send: vi.fn()
  })
}));

// Test constants
const GRID_SIZE = 20;
const mockWorkflow = {
  id: 'test-workflow-1',
  name: 'Test Workflow',
  nodes: [],
  connections: [],
  status: 'draft',
  version: 1
};

const mockNode = {
  id: 'node-1',
  type: 'action',
  position: { x: 100, y: 100 },
  data: { type: 'email', config: {} }
};

// Helper function to render with providers
const renderWithProviders = (
  ui: React.ReactElement,
  {
    preloadedState = {},
    store = configureStore({
      reducer: { workflow: workflowReducer },
      preloadedState
    }),
    ...renderOptions
  } = {}
) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return { store, ...render(ui, { wrapper: Wrapper, ...renderOptions }) };
};

// Helper function to simulate drag and drop
const simulateDragDrop = async (
  element: HTMLElement,
  coordinates: { x: number; y: number }
) => {
  fireEvent.mouseDown(element);
  fireEvent.mouseMove(element, { clientX: coordinates.x, clientY: coordinates.y });
  fireEvent.mouseUp(element);
  await waitFor(() => {});
};

describe('WorkflowCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty canvas correctly', () => {
    renderWithProviders(
      <WorkflowCanvas workflowId="test-workflow-1" />
    );

    // Verify canvas elements
    expect(screen.getByRole('presentation')).toBeInTheDocument();
    expect(screen.getByTestId('react-flow-wrapper')).toHaveStyle({
      width: '100%',
      height: '100%'
    });
    expect(screen.getByTestId('react-flow-background')).toBeInTheDocument();
  });

  it('handles node drag and drop operations', async () => {
    const onNodeAdd = vi.fn();
    const { container } = renderWithProviders(
      <WorkflowCanvas 
        workflowId="test-workflow-1"
        onNodeAdd={onNodeAdd}
      />
    );

    // Add a node to the canvas
    const node = screen.getByTestId('node-1');
    await simulateDragDrop(node, { x: 200, y: 200 });

    // Verify node position is snapped to grid
    const expectedX = Math.round(200 / GRID_SIZE) * GRID_SIZE;
    const expectedY = Math.round(200 / GRID_SIZE) * GRID_SIZE;
    expect(node).toHaveStyle({
      transform: `translate(${expectedX}px, ${expectedY}px)`
    });

    // Verify callback was called
    expect(onNodeAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        position: { x: expectedX, y: expectedY }
      })
    );
  });

  it('manages node connections correctly', async () => {
    const onNodeConnect = vi.fn();
    renderWithProviders(
      <WorkflowCanvas 
        workflowId="test-workflow-1"
        onNodeConnect={onNodeConnect}
      />
    );

    // Setup source and target nodes
    const sourceNode = screen.getByTestId('node-1');
    const targetNode = screen.getByTestId('node-2');

    // Simulate connection creation
    fireEvent.mouseDown(sourceNode.querySelector('.source-handle')!);
    fireEvent.mouseMove(targetNode.querySelector('.target-handle')!, {
      clientX: 300,
      clientY: 300
    });
    fireEvent.mouseUp(targetNode.querySelector('.target-handle')!);

    // Verify connection was created
    await waitFor(() => {
      expect(onNodeConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'node-1',
          target: 'node-2'
        })
      );
    });

    // Verify connection is rendered
    expect(screen.getByTestId('edge-node-1-node-2')).toBeInTheDocument();
  });

  it('enforces read-only mode correctly', async () => {
    const onNodeAdd = vi.fn();
    const onNodeConnect = vi.fn();
    
    renderWithProviders(
      <WorkflowCanvas 
        workflowId="test-workflow-1"
        readOnly={true}
        onNodeAdd={onNodeAdd}
        onNodeConnect={onNodeConnect}
      />
    );

    // Attempt to add node in read-only mode
    const node = screen.getByTestId('node-1');
    await simulateDragDrop(node, { x: 200, y: 200 });

    // Verify operations are blocked
    expect(onNodeAdd).not.toHaveBeenCalled();
    expect(onNodeConnect).not.toHaveBeenCalled();

    // Verify controls are disabled
    expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();
  });

  it('handles keyboard navigation correctly', async () => {
    const onNodeAdd = vi.fn();
    renderWithProviders(
      <WorkflowCanvas 
        workflowId="test-workflow-1"
        onNodeAdd={onNodeAdd}
      />
    );

    const node = screen.getByTestId('node-1');
    node.focus();

    // Test arrow key navigation
    fireEvent.keyDown(node, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(node).toHaveStyle({
        transform: `translate(${120}px, ${100}px)`
      });
    });

    fireEvent.keyDown(node, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(node).toHaveStyle({
        transform: `translate(${120}px, ${120}px)`
      });
    });
  });

  it('validates node connections', async () => {
    const onNodeConnect = vi.fn();
    renderWithProviders(
      <WorkflowCanvas 
        workflowId="test-workflow-1"
        onNodeConnect={onNodeConnect}
      />
    );

    // Attempt self-connection
    const node = screen.getByTestId('node-1');
    fireEvent.mouseDown(node.querySelector('.source-handle')!);
    fireEvent.mouseMove(node.querySelector('.target-handle')!, {
      clientX: 100,
      clientY: 100
    });
    fireEvent.mouseUp(node.querySelector('.target-handle')!);

    // Verify invalid connection was prevented
    expect(onNodeConnect).not.toHaveBeenCalled();
  });

  it('handles real-time updates via WebSocket', async () => {
    const { container } = renderWithProviders(
      <WorkflowCanvas workflowId="test-workflow-1" />
    );

    // Simulate WebSocket node update
    const wsUpdate = {
      type: 'NODE_MOVED',
      payload: {
        nodeId: 'node-1',
        position: { x: 200, y: 200 }
      }
    };

    // Verify node position is updated
    await waitFor(() => {
      const updatedNode = screen.getByTestId('node-1');
      expect(updatedNode).toHaveStyle({
        transform: `translate(200px, 200px)`
      });
    });
  });
});