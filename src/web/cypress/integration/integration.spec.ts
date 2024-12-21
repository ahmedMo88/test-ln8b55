// External imports - versions specified in package.json
import 'cypress-axe'; // v1.4.0
import 'cypress-performance'; // v2.0.0

// Internal imports
import { ServiceType, ConnectionStatus } from '../../src/types/integration.types';

// Test constants
const TEST_USER = {
  id: 'test-user-id',
  email: 'test@example.com',
  permissions: ['manage_integrations']
};

const MOCK_INTEGRATIONS = [
  {
    id: 'email-1',
    serviceType: ServiceType.EMAIL,
    status: ConnectionStatus.CONNECTED,
    metadata: {
      version: '1.0.0',
      capabilities: ['send', 'receive'],
      healthStatus: {
        status: 'healthy',
        lastChecked: new Date(),
        uptime: 99.9
      }
    }
  },
  {
    id: 'storage-1',
    serviceType: ServiceType.CLOUD_STORAGE,
    status: ConnectionStatus.ERROR,
    metadata: {
      version: '2.0.0',
      capabilities: ['upload', 'download'],
      healthStatus: {
        status: 'unhealthy',
        lastChecked: new Date(),
        uptime: 95.5
      },
      lastError: {
        code: 'AUTH_ERROR',
        message: 'Token expired',
        timestamp: new Date()
      }
    }
  }
];

const PERFORMANCE_THRESHOLDS = {
  loadTime: 3000,
  responseTime: 1000,
  renderTime: 500
};

describe('Integration Management', () => {
  beforeEach(() => {
    // Reset database state
    cy.task('db:reset');

    // Mock authentication
    cy.window().then((win) => {
      win.localStorage.setItem('user', JSON.stringify(TEST_USER));
    });

    // Setup API interceptors
    cy.intercept('GET', '/api/v1/integrations', (req) => {
      req.reply({
        statusCode: 200,
        body: MOCK_INTEGRATIONS
      });
    }).as('getIntegrations');

    // Setup WebSocket mock
    cy.window().then((win) => {
      const mockWs = {
        send: cy.stub().as('wsSend'),
        close: cy.stub().as('wsClose')
      };
      win.WebSocket = class extends EventTarget {
        constructor() {
          super();
          return mockWs;
        }
      };
    });

    // Visit integrations page
    cy.visit('/integrations');

    // Initialize accessibility testing
    cy.injectAxe();

    // Start performance monitoring
    cy.window().then((win) => {
      win.performance.mark('visit-start');
    });
  });

  describe('Integration List View', () => {
    it('should display all configured integrations', () => {
      cy.wait('@getIntegrations');
      
      cy.get('[data-testid="integration-list"]')
        .should('be.visible')
        .within(() => {
          cy.get('[data-testid="integration-item"]')
            .should('have.length', MOCK_INTEGRATIONS.length);
        });

      // Verify integration details
      cy.get('[data-testid="integration-item"]').first()
        .should('contain.text', ServiceType.EMAIL)
        .and('have.attr', 'data-status', ConnectionStatus.CONNECTED);
    });

    it('should handle integration status updates in real-time', () => {
      const mockStatusUpdate = {
        serviceId: 'email-1',
        status: ConnectionStatus.RATE_LIMITED
      };

      // Trigger WebSocket status update
      cy.window().then((win) => {
        const wsEvent = new MessageEvent('message', {
          data: JSON.stringify(mockStatusUpdate)
        });
        win.dispatchEvent(wsEvent);
      });

      // Verify status update reflection
      cy.get('[data-testid="integration-item"][data-id="email-1"]')
        .should('have.attr', 'data-status', ConnectionStatus.RATE_LIMITED);
    });

    it('should filter integrations by service type', () => {
      cy.get('[data-testid="service-type-filter"]').click();
      cy.get('[data-value="EMAIL"]').click();

      cy.get('[data-testid="integration-item"]')
        .should('have.length', 1)
        .and('contain.text', ServiceType.EMAIL);
    });
  });

  describe('Integration Management', () => {
    it('should connect new integration successfully', () => {
      cy.intercept('POST', '/api/v1/integrations', {
        statusCode: 201,
        body: {
          id: 'new-integration',
          serviceType: ServiceType.PROJECT_MANAGEMENT,
          status: ConnectionStatus.CONNECTED
        }
      }).as('createIntegration');

      cy.get('[data-testid="add-integration"]').click();
      cy.get('[data-testid="service-type-select"]')
        .select(ServiceType.PROJECT_MANAGEMENT);
      cy.get('[data-testid="connect-button"]').click();

      cy.wait('@createIntegration');
      cy.get('[data-testid="success-message"]')
        .should('be.visible')
        .and('contain.text', 'Integration connected successfully');
    });

    it('should handle connection errors appropriately', () => {
      cy.intercept('POST', '/api/v1/integrations', {
        statusCode: 400,
        body: {
          error: 'Invalid credentials'
        }
      }).as('failedConnection');

      cy.get('[data-testid="add-integration"]').click();
      cy.get('[data-testid="service-type-select"]')
        .select(ServiceType.COMMUNICATION);
      cy.get('[data-testid="connect-button"]').click();

      cy.get('[data-testid="error-message"]')
        .should('be.visible')
        .and('contain.text', 'Invalid credentials');
    });

    it('should disconnect integration with confirmation', () => {
      cy.intercept('DELETE', '/api/v1/integrations/*', {
        statusCode: 200
      }).as('deleteIntegration');

      cy.get('[data-testid="integration-item"]').first()
        .find('[data-testid="disconnect-button"]').click();
      
      cy.get('[data-testid="confirm-dialog"]')
        .should('be.visible')
        .within(() => {
          cy.get('[data-testid="confirm-button"]').click();
        });

      cy.wait('@deleteIntegration');
      cy.get('[data-testid="success-message"]')
        .should('contain.text', 'Integration disconnected');
    });
  });

  describe('Accessibility', () => {
    it('should meet WCAG 2.1 Level AA standards', () => {
      cy.checkA11y();
    });

    it('should be keyboard navigable', () => {
      cy.get('body').tab();
      cy.focused().should('have.attr', 'data-testid', 'add-integration');
      
      cy.tab();
      cy.focused().should('have.attr', 'data-testid', 'service-type-filter');
    });
  });

  describe('Performance', () => {
    it('should load within performance thresholds', () => {
      cy.window().then((win) => {
        win.performance.mark('visit-end');
        win.performance.measure('page-load', 'visit-start', 'visit-end');
        
        const [measure] = win.performance.getEntriesByName('page-load');
        expect(measure.duration).to.be.below(PERFORMANCE_THRESHOLDS.loadTime);
      });
    });

    it('should handle rate limiting gracefully', () => {
      cy.intercept('GET', '/api/v1/integrations', {
        statusCode: 429,
        headers: {
          'Retry-After': '60'
        }
      }).as('rateLimited');

      cy.reload();
      
      cy.get('[data-testid="rate-limit-message"]')
        .should('be.visible')
        .and('contain.text', 'Rate limit exceeded');
    });
  });
});