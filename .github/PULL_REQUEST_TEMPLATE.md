<!-- 
Pull Request Template
Please fill in all required sections below. PRs missing required information will not be reviewed.
-->

## Title
<!-- Follow conventional commits format: type(scope): description -->
<!-- Example: feat(workflow-engine): add parallel execution support -->

## Change Type
<!-- Select ONE most appropriate type for this change -->
- [ ] feat: New feature or enhancement
- [ ] fix: Bug fix or issue resolution
- [ ] docs: Documentation updates
- [ ] style: Code style/formatting changes
- [ ] refactor: Code refactoring
- [ ] perf: Performance improvements
- [ ] test: Test coverage improvements
- [ ] chore: Maintenance tasks

## Description
<!-- Provide a detailed description of the changes. Include context, motivation, and implementation details -->




## Affected Components
<!-- Check ALL components affected by this change -->
- [ ] Frontend - Flow Editor
- [ ] Frontend - Dashboard
- [ ] Frontend - Integration Hub
- [ ] Backend - API Gateway
- [ ] Backend - Auth Service
- [ ] Backend - Workflow Engine
- [ ] Backend - AI Service
- [ ] Backend - Integration Service
- [ ] Backend - Monitoring Service
- [ ] Infrastructure
- [ ] Documentation

## Testing Requirements
<!-- ALL applicable tests must be completed and verified -->
- [ ] Unit tests added/updated (>85% coverage)
- [ ] Integration tests verified
- [ ] E2E tests completed
- [ ] Performance impact assessed
- [ ] Security scan passed
- [ ] Manual testing verified

## Compliance Verification
<!-- ALL compliance requirements must be verified -->
- [ ] SOC2 compliance verified
- [ ] HIPAA requirements met
- [ ] Security review completed
- [ ] Data privacy impact assessed

## Additional Information
### Size
<!-- Delete non-applicable sizes -->
- XS (< 10 files)
- S (10-30 files)
- M (31-100 files)
- L (101-500 files)
- XL (> 500 files)

### Dependencies
<!-- List any dependencies added/updated/removed -->
```yaml
dependencies:
  added:
    - name:
      version:
  updated:
    - name:
      from:
      to:
  removed:
    - name:
      version:
```

### Breaking Changes
<!-- List any breaking changes and migration steps -->
- [ ] No breaking changes
- [ ] Breaking changes (detail below):


### Related Issues
<!-- Link related issues using GitHub keywords -->
- Closes #
- Related to #

### Documentation
<!-- Check documentation requirements -->
- [ ] README updates required
- [ ] API documentation updated
- [ ] Architecture diagrams modified
- [ ] User documentation revised

## Review Requirements
<!-- These checks are enforced automatically -->
- Minimum 2 reviewers required
- Required team reviews based on components:
  - Frontend changes: `frontend-team`
  - Backend changes: `backend-team`
  - Infrastructure: `platform-team`
  - Security-impacting: `security-team`
- Automated checks must pass:
  - CI build
  - Security scan
  - Coverage check (>85%)
  - Performance benchmark

## Pre-merge Checklist
<!-- Final verification before merge -->
- [ ] All discussions resolved
- [ ] Required reviews obtained
- [ ] All automated checks passing
- [ ] Up-to-date with main branch
- [ ] Compliance requirements satisfied
- [ ] Testing requirements completed

<!-- 
Note: This PR template enforces:
1. Conventional commit format
2. Comprehensive testing requirements
3. Security and compliance verification
4. Team-based review process
5. Documentation standards
-->