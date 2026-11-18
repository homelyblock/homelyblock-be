# Backend Testing Reference

The workspace-level `TESTING.md` is canonical. Backend tests should prioritize:
- Token verification and auth guards.
- Role/membership/society authorization.
- Cross-society read/write denial.
- DTO validation and normalized errors.
- Prisma constraints and transaction behavior.
- Notice visibility.
- Visitor decision permissions and status transitions.
- Maintenance/unit-level visibility if the feature is approved.

Use synthetic test data and an isolated test database. Never run destructive test setup against production or shared environments. Document commands only after verifying actual package scripts.
