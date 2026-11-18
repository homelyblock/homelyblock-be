# Backend API Reference

The workspace-level `API.md` is the canonical API contract. The implemented NestJS controllers and DTOs must match it.

## Implemented routes

| Method | Path | Purpose | Access |
| --- | --- | --- | --- |
| GET | `/` | Starter greeting (`Hello World!`) | Public |
| GET | `/api/v1/health` | Process is running. No database or secret fields | Public |
| GET | `/api/v1/me` | Current verified user profile and memberships | Bearer access token |
| GET | `/api/v1/rbac/platform-owners` | RBAC probe | Bearer + `PLATFORM_OWNER` |
| GET | `/api/v1/rbac/societies/:societyId/admins` | RBAC probe | Bearer + ACTIVE `SOCIETY_ADMIN` in society |
| GET | `/api/v1/rbac/societies/:societyId/members` | RBAC probe | Bearer + ACTIVE society member |
| POST | `/api/v1/societies` | Create society + initial admin | Bearer + `PLATFORM_OWNER` |
| GET | `/api/v1/societies` | List visible societies (paginated) | Bearer + scoped |
| GET | `/api/v1/societies/:societyId` | Society detail (role-scoped fields) | Bearer + owner/member |
| PATCH | `/api/v1/societies/:societyId` | Partial society update | Bearer + owner or society admin |
| GET | `/api/v1/users/search` | Search profiles for assignment. Society admins see their society, plus one unaffiliated account only by full email | Bearer + owner or ACTIVE society admin |
| GET | `/api/v1/societies/:societyId/buildings` | List buildings | Bearer + owner or ACTIVE member |
| POST | `/api/v1/societies/:societyId/buildings` | Create building | Bearer + owner or society admin |
| GET | `/api/v1/societies/:societyId/buildings/:buildingId` | Building detail | Bearer + owner or ACTIVE member |
| PATCH | `/api/v1/societies/:societyId/buildings/:buildingId` | Update building | Bearer + owner or society admin |
| GET | `/api/v1/societies/:societyId/units` | List units (`buildingId` optional) | Bearer + owner or ACTIVE member |
| POST | `/api/v1/societies/:societyId/units` | Create unit | Bearer + owner or society admin |
| GET | `/api/v1/societies/:societyId/units/:unitId` | Unit detail | Bearer + owner or ACTIVE member |
| PATCH | `/api/v1/societies/:societyId/units/:unitId` | Update unit | Bearer + owner or society admin |
| GET | `/api/v1/societies/:societyId/members` | List memberships | Bearer + owner or ACTIVE member |
| POST | `/api/v1/societies/:societyId/members` | Invite an existing account as `INVITED`. Does not grant access | Bearer + owner or society admin |
| PATCH | `/api/v1/memberships/:membershipId` | Update membership | Bearer + admin of membership society |
| GET | `/api/v1/societies/:societyId/notices` | List notices (role-scoped) | Bearer + owner or ACTIVE member |
| POST | `/api/v1/societies/:societyId/notices` | Create draft notice | Bearer + owner or society admin |
| GET | `/api/v1/notices/:noticeId` | Notice detail | Bearer + visibility rules |
| PATCH | `/api/v1/notices/:noticeId` | Update draft notice | Bearer + owner or society admin |
| POST | `/api/v1/notices/:noticeId/publish` | Publish draft | Bearer + owner or society admin |
| POST | `/api/v1/notices/:noticeId/archive` | Archive published notice | Bearer + owner or society admin |
| POST | `/api/v1/notices/:noticeId/read` | Mark notice read | Bearer + eligible viewer |
| GET | `/api/v1/notices/:noticeId/readership` | Readership aggregates | Bearer + owner or society admin |
| GET | `/api/v1/societies/:societyId/visitors` | List visitors (scoped) | Bearer + owner or ACTIVE member |
| POST | `/api/v1/societies/:societyId/visitors/expected` | Register expected visitor | Bearer + ACTIVE resident with unit |
| POST | `/api/v1/societies/:societyId/visitors/walk-ins` | Register walk-in visitor | Bearer + owner or society admin |
| GET | `/api/v1/visitors/:visitorId` | Visitor detail | Bearer + unit resident or society admin |
| POST | `/api/v1/visitors/:visitorId/approve` | Approve pending visitor | Bearer + unit resident |
| POST | `/api/v1/visitors/:visitorId/reject` | Reject pending visitor | Bearer + unit resident |
| POST | `/api/v1/visitors/:visitorId/cancel` | Cancel upcoming visitor | Bearer + creator or society admin |
| POST | `/api/v1/visitors/:visitorId/check-in` | Check in approved visitor | Bearer + owner or society admin |
| POST | `/api/v1/visitors/:visitorId/check-out` | Check out checked-in visitor | Bearer + owner or society admin |

`/rbac/*` routes remain authorization examples only.

`API_PREFIX` defaults to `api/v1`. The starter `GET /` is excluded from that prefix. Swagger is at `/api/docs` and is not under `/api/v1`.

Error responses use:

```json
{
  "statusCode": 404,
  "code": "NOT_FOUND",
  "message": "Cannot GET /api/v1/does-not-exist",
  "details": []
}
```

For every newly implemented endpoint, document:
- Method and versioned path.
- Authentication and role requirements.
- Society/resource scope.
- Request DTO and response shape.
- Validation and error statuses.
- Pagination/filter behavior where applicable.
- Related PRD feature and database entity.

Use Swagger/OpenAPI and integration tests. Any intentional contract change must update the canonical `API.md` and be coordinated with the frontend.
