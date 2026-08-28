// Simple-mode "Linked credentials": three equal columns — Group, Authenticator,
// Phone number — per the design.
//
// The Advanced General tab keeps its own stacked LinkedCredentials panel; that
// component is shaped for a different layout, so reshaping it would regress
// Advanced. This is the Simple presentation only.
//
// The Authenticator and Phone tiles own their own link/add popovers and talk to
// the existing features' data layers — nothing is reimplemented here.

import * as React from 'react'
import { GroupSelect } from './GroupSelect'
import { SimpleAuthField } from './SimpleAuthField'
import { SimplePhoneField } from './SimplePhoneField'

export function SimpleCredentials({
  profileId,
  workspaceId,
  groupId,
  onGroupChange,
  onToast,
  onOrderNumber
}: {
  profileId: string | null
  workspaceId: string | null
  groupId: string | null
  onGroupChange: (groupId: string | null) => void
  onToast?: (kind: 'error' | 'info', text: string) => void
  onOrderNumber: () => void
}): React.ReactElement {
  return (
    <div className="sa-cred">
      <div className="sa-cred-f">
        <label>Group</label>
        <GroupSelect
          workspaceId={workspaceId}
          value={groupId}
          onChange={onGroupChange}
          searchable
        />
      </div>
      <SimpleAuthField profileId={profileId} workspaceId={workspaceId} onToast={onToast} />
      <SimplePhoneField
        profileId={profileId}
        workspaceId={workspaceId}
        onToast={onToast}
        onOrderNumber={onOrderNumber}
      />
    </div>
  )
}
