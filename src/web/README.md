# Workflow Automation Platform - Web Frontend

[![Build Status](https://github.com/workflow-automation/web/actions/workflows/ci.yml/badge.svg)](https://github.com/workflow-automation/web/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)
[![Material UI](https://img.shields.io/badge/Material%20UI-5.14.0-blue.svg)](https://mui.com/)
[![Code Style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://prettier.io/)

Enterprise-grade web frontend for the no-code workflow automation platform, enabling business users to create, deploy, and manage automated processes through an intuitive visual interface.

## Technology Stack

### Core Technologies
- **React** (v18.2.0) - Modern UI development with concurrent rendering support
- **TypeScript** (v5.0) - Type-safe development with enhanced IDE support
- **Redux Toolkit** (v1.9.7) - Predictable state management with DevTools integration
- **Material UI** (v5.14.0) - Enterprise-ready component library with Material Design 3.0

### Development Tools
- **Vite** - Next-generation frontend tooling
- **ESLint** - Code quality and style enforcement
- **Prettier** - Consistent code formatting
- **Jest** - Unit testing framework
- **Cypress** - End-to-end testing
- **GitHub Actions** - CI/CD automation

## Getting Started

### Prerequisites
- Node.js (v20 LTS)
- npm (v9+)
- Git

### Installation
```bash
# Clone the repository
git clone https://github.com/workflow-automation/web.git

# Navigate to project directory
cd web

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Setup
1. Create `.env.local` file in project root
2. Copy environment variables from `.env.example`
3. Configure required values for local development

## Development Guidelines

### Code Style
- Follow TypeScript strict mode guidelines
- Use functional components with hooks
- Implement error boundaries for component isolation
- Follow Material Design 3.0 specifications
- Maintain accessibility standards (WCAG 2.1 Level AA)

### Git Workflow
1. Create feature branch from `main`
2. Follow conventional commits specification
3. Submit PR with required reviewers
4. Ensure CI checks pass
5. Squash merge to main

### Project Structure
```
src/
├── components/     # Reusable UI components
├── features/       # Feature-specific modules
├── hooks/         # Custom React hooks
├── services/      # API and external service integrations
├── store/         # Redux state management
├── styles/        # Global styles and themes
├── types/         # TypeScript type definitions
└── utils/         # Utility functions
```

## Testing Strategy

### Unit Testing
```bash
# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### End-to-End Testing
```bash
# Open Cypress test runner
npm run cypress:open

# Run Cypress tests headlessly
npm run cypress:run
```

### Code Quality
```bash
# Run linting
npm run lint

# Format code
npm run format

# Type checking
npm run typecheck
```

## Deployment Process

### Build
```bash
# Create production build
npm run build

# Preview production build locally
npm run preview
```

### CI/CD Pipeline
1. Automated tests on PR
2. Build verification
3. Code quality checks
4. Staging deployment
5. Production deployment with approval

## Browser Support

### Production Environment
- Chrome (90+)
- Firefox (88+)
- Safari (14+)
- Edge (90+)
- Modern mobile browsers

### Development Environment
- Latest Chrome
- Latest Firefox
- Latest Safari

## Contributing

### Pull Request Process
1. Update documentation
2. Add/update tests
3. Ensure all checks pass
4. Request review from team leads
5. Address review feedback

### Code Review Requirements
- No TypeScript errors/warnings
- Test coverage maintained
- Accessibility standards met
- Performance impact considered
- Security implications reviewed

### Documentation Standards
- Update README for new features
- Include JSDoc comments
- Document breaking changes
- Maintain changelog

## License

Copyright © 2023 Workflow Automation Platform. All rights reserved.

## Support

For technical support or questions:
- Create an issue in GitHub
- Contact development team
- Consult internal documentation