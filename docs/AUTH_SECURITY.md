# Backend Authentication and Security Reference

The workspace-level `AUTH_SECURITY.md` is canonical.

## Implemented

### Authentication
- `SupabaseTokenVerifier` verifies access tokens with `jose` (JWKS preferred; optional `SUPABASE_JWT_SECRET` for HS256).
- `AuthGuard` requires `Authorization: Bearer <access_token>` and attaches `request.user`.
- `@CurrentUser()` reads the guard-populated identity.
- `UsersService.ensureProfile` upserts `user_profiles` using the verified Supabase user UUID. It does not accept client role elevation.
- `GET /api/v1/me` is authenticated and returns the local profile plus memberships.

### Authorization (RBAC)
Module: `src/authorization/`

| Piece | Purpose |
| --- | --- |
| `roles.ts` | Re-exports Prisma `PlatformRole` / `MembershipRole` as the type-safe source of truth |
| `RequirePlatformRoles` | Decorator for platform-scoped routes |
| `RequireSocietyRoles` | Decorator for society-scoped routes (`societyId` param by default) |
| `AuthorizationService` | Loads ACTIVE memberships from Prisma; asserts roles |
| `AuthorizationGuard` | Reads decorator metadata; returns 401 if unauthenticated, 403 if forbidden |
| `CurrentSocietyMembership` | Reads membership attached after a successful society check |
| `RbacProbeController` | Non-product examples under `/api/v1/rbac/*` |

#### Protect a controller method

```ts
@UseGuards(AuthGuard, AuthorizationGuard)
@RequirePlatformRoles(PlatformRole.PLATFORM_OWNER)
@Get('example')
platformOnly(@CurrentUser() user: AuthenticatedUser) {
  return { data: { userId: user.id } };
}
```

#### Protect a society-scoped route

```ts
@UseGuards(AuthGuard, AuthorizationGuard)
@RequireSocietyRoles([MembershipRole.SOCIETY_ADMIN])
@Get('societies/:societyId/settings')
updateSettings(
  @Param('societyId') societyId: string,
  @CurrentSocietyMembership() membership: AuthorizedSocietyMembership,
) {
  return { data: { societyId, role: membership.role } };
}
```

Rules:
- Never trust client-supplied roles, society IDs, or unit IDs for authorization decisions beyond reading the route/resource id and verifying it server-side.
- Platform owner ≠ automatic access to every society.
- Society admin of A ≠ access to society B.
- Only `ACTIVE` memberships authorize society actions.

## Not yet implemented

- Building/unit Nest APIs and PATCH UI (Prisma models exist; HTTP layer deferred).
- Notice/visitor product endpoints and their resource-level policies.
- Rate limiting specific to authentication-adjacent routes.
- Live end-to-end tests against a real Supabase project (auth e2e remains mocked). Society PostgreSQL integration tests require `DATABASE_URL_TEST` and fail if it is missing.

## Rules

- Never decode-and-trust JWTs.
- Never trust client-supplied user, role, society, or unit IDs.
- Keep authentication verification separate from role-based authorization.
- Do not log secrets or unnecessary personal data.
