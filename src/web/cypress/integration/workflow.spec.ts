/**
 * @fileoverview End-to-end test suite for workflow management functionality
 * including workflow creation, editing, execution, and status monitoring.
 * @version 1.0.0
 */

import { Workflow } from '../../src/types/workflow.types';
import 'cypress-axe';

// Test data constants
const TEST_WORKFLOW: Workflow = {
  name: 'Test Workflow',
  description: 'Test workflow for e2e testing',
  status: 'draft',
  metadata: {
    tags: ['test', 'e2e'],
    category: 'testing',
    description: 'Test workflow description',
    version: 1,
    lastModifiedBy: 'test-user',
    isTemplate: false
  }
};

// Selector constants for better maintainability
const SELECTORS = {
  CANVAS: "[data-cy='workflow-canvas']",
  NODE_LIBRARY: "[data-cy='node-library']",
  PROPERTIES_PANEL: "[data-cy='properties-panel']",
  SAVE_BUTTON: "[data-cy='save-workflow']",
  DEPLOY_BUTTON: "[data-cy='deploy-workflow']",
  EXECUTION_STATUS: "[data-cy='execution-status']",
  ERROR_MESSAGE: "[data-cy='error-message']",
  NODE_ITEM: "[data-cy='node-item']",
  CONNECTION_LINE: "[data-cy='connection-line']"
};

describe('Workflow Management', () => {
  beforeEach(() => {
    // Reset database state
    cy.task('db:reset');
    
    // Login and navigate to workflow page
    cy.login('test-user', 'test-password');
    cy.visit('/workflows');
    
    // Initialize accessibility testing
    cy.injectAxe();
    
    // Set viewport for consistent testing
    cy.viewport(1920, 1080);
  });

  describe('Workflow Editor', () => {
    it('should create new workflow with proper validation', () => {
      // Check accessibility before interaction
      cy.checkA11y();

      // Create new workflow
      cy.get('[data-cy="create-workflow"]').click();
      cy.get('[data-cy="workflow-name"]').type(TEST_WORKFLOW.name);
      cy.get('[data-cy="workflow-description"]').type(TEST_WORKFLOW.description);

      // Verify form validation
      cy.get(SELECTORS.SAVE_BUTTON).should('be.enabled');
      
      // Save workflow
      cy.get(SELECTORS.SAVE_BUTTON).click();
      
      // Verify workflow creation
      cy.get('[data-cy="workflow-list"]')
        .should('contain', TEST_WORKFLOW.name);
        
      // Check accessibility after workflow creation
      cy.checkA11y();
    });

    it('should handle drag and drop node placement', () => {
      // Create workflow first
      cy.createTestWorkflow(TEST_WORKFLOW);

      // Drag trigger node
      cy.get(`${SELECTORS.NODE_LIBRARY} [data-node-type="trigger"]`)
        .drag(SELECTORS.CANVAS);

      // Verify node placement
      cy.get(`${SELECTORS.CANVAS} [data-node-type="trigger"]`)
        .should('exist');

      // Check node configuration panel
      cy.get(SELECTORS.PROPERTIES_PANEL)
        .should('be.visible')
        .and('contain', 'Trigger Configuration');
    });

    it('should validate node connections', () => {
      cy.createTestWorkflow(TEST_WORKFLOW);

      // Add nodes
      cy.addNode('trigger', { x: 100, y: 100 });
      cy.addNode('action', { x: 300, y: 100 });

      // Create connection
      cy.createConnection('trigger-1', 'action-1');

      // Verify connection
      cy.get(SELECTORS.CONNECTION_LINE)
        .should('exist')
        .and('have.attr', 'data-valid', 'true');
    });

    it('should handle invalid configurations', () => {
      cy.createTestWorkflow(TEST_WORKFLOW);

      // Add node with invalid config
      cy.addNode('action', { x: 100, y: 100 });
      cy.configureNode('action-1', { service: 'invalid' });

      // Verify validation error
      cy.get(SELECTORS.ERROR_MESSAGE)
        .should('be.visible')
        .and('contain', 'Invalid service configuration');

      // Verify save button is disabled
      cy.get(SELECTORS.SAVE_BUTTON).should('be.disabled');
    });
  });

  describe('Workflow Execution', () => {
    it('should execute workflow successfully', () => {
      // Create and configure valid workflow
      cy.createTestWorkflow(TEST_WORKFLOW);
      cy.configureWorkflowNodes();

      // Deploy workflow
      cy.get(SELECTORS.DEPLOY_BUTTON).click();
      cy.get('[data-cy="confirm-deploy"]').click();

      // Verify execution status
      cy.get(SELECTORS.EXECUTION_STATUS)
        .should('contain', 'running')
        .and('eventually.contain', 'completed', { timeout: 10000 });

      // Verify execution results
      cy.get('[data-cy="execution-results"]')
        .should('exist')
        .and('contain', 'Execution completed successfully');
    });

    it('should handle execution failures gracefully', () => {
      // Create workflow with invalid configuration
      cy.createTestWorkflow({
        ...TEST_WORKFLOW,
        nodes: [
          {
            type: 'action',
            config: { service: 'invalid' }
          }
        ]
      });

      // Attempt execution
      cy.get(SELECTORS.DEPLOY_BUTTON).click();

      // Verify error handling
      cy.get(SELECTORS.ERROR_MESSAGE)
        .should('be.visible')
        .and('contain', 'Execution failed');

      // Verify recovery options
      cy.get('[data-cy="retry-execution"]').should('be.visible');
      cy.get('[data-cy="edit-workflow"]').should('be.visible');
    });
  });

  describe('Accessibility Compliance', () => {
    it('should maintain accessibility standards throughout workflow operations', () => {
      // Test accessibility of main workflow list
      cy.checkA11y();

      // Create workflow and verify accessibility
      cy.createTestWorkflow(TEST_WORKFLOW);
      cy.checkA11y();

      // Test editor accessibility
      cy.get(SELECTORS.CANVAS).focus();
      cy.checkA11y();

      // Test node library accessibility
      cy.get(SELECTORS.NODE_LIBRARY).focus();
      cy.checkA11y();

      // Test properties panel accessibility
      cy.get(SELECTORS.PROPERTIES_PANEL).focus();
      cy.checkA11y();
    });
  });
});

// Custom command definitions
Cypress.Commands.add('createTestWorkflow', (workflow: Workflow) => {
  cy.get('[data-cy="create-workflow"]').click();
  cy.get('[data-cy="workflow-name"]').type(workflow.name);
  cy.get('[data-cy="workflow-description"]').type(workflow.description);
  cy.get(SELECTORS.SAVE_BUTTON).click();
  cy.get('[data-cy="workflow-list"]').should('contain', workflow.name);
});

Cypress.Commands.add('addNode', (type: string, position: { x: number, y: number }) => {
  cy.get(`${SELECTORS.NODE_LIBRARY} [data-node-type="${type}"]`)
    .drag(SELECTORS.CANVAS, {
      target: position
    });
});

Cypress.Commands.add('configureNode', (nodeId: string, config: Record<string, unknown>) => {
  cy.get(`[data-node-id="${nodeId}"]`).click();
  cy.get(SELECTORS.PROPERTIES_PANEL).within(() => {
    Object.entries(config).forEach(([key, value]) => {
      cy.get(`[data-config-key="${key}"]`).type(String(value));
    });
  });
});

Cypress.Commands.add('createConnection', (sourceId: string, targetId: string) => {
  cy.get(`[data-node-id="${sourceId}"] [data-port="output"]`)
    .drag(`[data-node-id="${targetId}"] [data-port="input"]`);
});

Cypress.Commands.add('configureWorkflowNodes', () => {
  // Add and configure required nodes for a valid workflow
  cy.addNode('trigger', { x: 100, y: 100 });
  cy.addNode('action', { x: 300, y: 100 });
  cy.createConnection('trigger-1', 'action-1');
  
  // Configure nodes with valid settings
  cy.configureNode('trigger-1', {
    service: 'email',
    operation: 'on_receive'
  });
  cy.configureNode('action-1', {
    service: 'slack',
    operation: 'send_message'
  });
});