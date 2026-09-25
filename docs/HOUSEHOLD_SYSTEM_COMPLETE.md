# Household System - Implementation Complete

**Task #78590**: Build core multi-user household system

### 1. Create & Join Households
- **Create household**: User becomes household owner/admin
- **Join via invite**: Accept invite code/link to join existing household
- **Max 4 members per household**: Enforced at API and DB level

### 2. Member Management
- **Owner controls**: Only owner can invite/remove members
- **Invite system**: Generate single-use or multi-use invite codes
- **Expiration**: Invites expire after 7 days by default
- **Member roles**: Owner and member roles with different permissions

### 3. Household Linking
- **Link households**: Connect up to 3 separate households together
- **Combined view**: View financial data across linked households
- **Owner control**: Only household owners can create/remove links
- **Bidirectional**: Both households must be members of the requester

### 4. Privacy & Permissions
- **Granular control**: Per-category, per-member permissions
- **Default private**: All data is private unless explicitly shared
- **View/edit permissions**: Control what each member can see and modify

## Database
- `households`
- `household_members`
- `household_links`
- `household_invites`
- `household_permissions`

## API Endpoints

### Households
- `POST /api/households/create` - Create new household
- `GET /api/households` - List user's households
- `GET /api/households/:id/members` - Get household members
- `POST /api/households/:id/invite` - Generate invite code
- `POST /api/households/join` - Join via invite code
- `DELETE /api/households/:id/members/:user_id` - Remove member

### Household Linking
- `POST /api/households/:id/link` - Link two households (max 3 total)
- `GET /api/households/:id/links` - List linked households
- `DELETE /api/households/:id/link/:target_id` - Remove link

### Permissions
- `GET /api/permissions/mine` - Get user's permission settings
- `GET /api/permissions/granted` - Get permissions granted to user
- `POST /api/permissions/grant` - Grant permission to member
- `DELETE /api/permissions/revoke` - Revoke permission
- `POST /api/permissions/grant-all` - Grant to all members at once
